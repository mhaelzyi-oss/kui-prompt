import { readFileSync } from "node:fs";

const MDMP = 0x504d444d;
const ThreadListStream = 3;
const ModuleListStream = 4;
const ExceptionStream = 6;
const SystemInfoStream = 7;

export type DumpInfo = {
  path: string;
  streams: string[];
  exception?: string;
  exceptionTid?: number;
  threads: number;
  modules: Array<{ name: string; base: bigint }>;
  wow64?: boolean;
};

function u32(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

function u16(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

function rvaSlice(buf: Buffer, rva: number, size: number): Buffer {
  if (rva <= 0 || rva + size > buf.length) return Buffer.alloc(0);
  return buf.subarray(rva, rva + size);
}

function readWString(buf: Buffer, rva: number): string {
  if (rva <= 0 || rva + 4 > buf.length) return "";
  const bytes = u32(buf, rva);
  const slice = rvaSlice(buf, rva + 4, bytes);
  return slice.toString("utf16le").replace(/\0+$/, "");
}

const STREAM_NAMES: Record<number, string> = {
  [ThreadListStream]: "ThreadList",
  [ModuleListStream]: "ModuleList",
  [ExceptionStream]: "Exception",
  [SystemInfoStream]: "SystemInfo",
};

export function readMinidump(path: string): DumpInfo {
  const buf = readFileSync(path);
  if (buf.length < 32 || u32(buf, 0) !== MDMP) {
    throw new Error("Not a minidump.");
  }
  const streamCount = u32(buf, 8);
  const dirRva = u32(buf, 12);
  const streams: string[] = [];
  let exception: string | undefined;
  let exceptionTid: number | undefined;
  let threads = 0;
  const modules: DumpInfo["modules"] = [];
  let wow64 = false;

  for (let i = 0; i < streamCount; i++) {
    const off = dirRva + i * 12;
    if (off + 12 > buf.length) break;
    const type = u32(buf, off);
    const size = u32(buf, off + 4);
    const rva = u32(buf, off + 8);
    const name = STREAM_NAMES[type];
    if (name) streams.push(name);
    const data = rvaSlice(buf, rva, size);
    if (!data.length) continue;
    if (type === ThreadListStream) threads = u32(data, 0);
    if (type === SystemInfoStream && data.length >= 4) {
      const arch = u16(data, 0);
      wow64 = arch === 0; // IMAGE_FILE_MACHINE_I386
    }
    if (type === ExceptionStream && data.length >= 12) {
      const tid = u32(data, 0);
      const code = u32(data, 8);
      exception = `0x${code.toString(16)}`;
      if (tid) exceptionTid = tid;
    }
    if (type === ModuleListStream && data.length >= 4) {
      const count = Math.min(u32(data, 0), 256);
      let cursor = 4;
      for (let m = 0; m < count && cursor + 108 <= data.length; m++) {
        const base = data.readBigUInt64LE(cursor);
        const nameRva = u32(data, cursor + 24);
        const file = readWString(buf, nameRva);
        const baseName = file.split("\\").pop() ?? file;
        modules.push({ name: baseName, base });
        cursor += 108;
      }
    }
  }

  return { path, streams: [...new Set(streams)], exception, exceptionTid, threads, modules, wow64 };
}
