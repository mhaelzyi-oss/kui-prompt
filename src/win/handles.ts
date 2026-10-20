import type { HandleRow } from "../shared/types.js";
import { koffi } from "./load.js";
import { closeHandle, listOpenable, openProcess } from "./processes.js";

const PROCESS_DUP_HANDLE = 0x0040;
const DUPLICATE_SAME_ACCESS = 0x2;
const SystemExtendedHandleInformation = 64;
const ObjectNameInformation = 1;
const ObjectTypeInformation = 2;

type Api = {
  NtQuerySystemInformation: (cls: number, buf: Buffer, len: number, ret: Buffer) => number;
  NtQueryObject: (h: unknown, cls: number, buf: Buffer, len: number, ret: Buffer) => number;
  DuplicateHandle: (
    srcProc: unknown,
    src: unknown,
    dstProc: unknown,
    out: Buffer,
    access: number,
    inherit: number,
    options: number,
  ) => number;
  GetCurrentProcess: () => unknown;
};

function api(): Api | null {
  const k = koffi();
  if (!k) return null;
  try {
    const ntdll = k.load("ntdll.dll");
    const kernel32 = k.load("kernel32.dll");
    return {
      NtQuerySystemInformation: ntdll.func(
        "int32 __stdcall NtQuerySystemInformation(uint32 cls, void *buf, uint32 len, void *ret)",
      ) as Api["NtQuerySystemInformation"],
      NtQueryObject: ntdll.func(
        "int32 __stdcall NtQueryObject(void *h, uint32 cls, void *buf, uint32 len, void *ret)",
      ) as Api["NtQueryObject"],
      DuplicateHandle: kernel32.func(
        "int __stdcall DuplicateHandle(void *srcP, void *src, void *dstP, void *out, uint32 access, int inherit, uint32 opt)",
      ) as Api["DuplicateHandle"],
      GetCurrentProcess: kernel32.func("void * __stdcall GetCurrentProcess()") as Api["GetCurrentProcess"],
    };
  } catch {
    return null;
  }
}

function readUnicode(buf: Buffer, off: number): string {
  if (off + 8 > buf.length) return "";
  const length = buf.readUInt16LE(off);
  const ptrOff = off + 8;
  // Buffer is the name blob when Name.Buffer points inside the same allocation.
  // NtQueryObject ObjectNameInformation: UNICODE_STRING at 0, then usually the chars follow.
  const chars = buf.subarray(16, 16 + length);
  if (chars.length === length) return chars.toString("utf16le");
  void ptrOff;
  return "";
}

function queryName(a: Api, handle: unknown): { type: string; name: string } | null {
  const buf = Buffer.alloc(4096);
  const ret = Buffer.alloc(4);
  if (a.NtQueryObject(handle, ObjectNameInformation, buf, buf.length, ret) !== 0) return null;
  const name = readUnicode(buf, 0);
  const typeBuf = Buffer.alloc(1024);
  let type = "Handle";
  if (a.NtQueryObject(handle, ObjectTypeInformation, typeBuf, typeBuf.length, ret) === 0) {
    type = readUnicode(typeBuf, 0) || type;
  }
  if (!name) return null;
  return { type, name };
}

export function handlesForPid(pid: number, budgetMs = 2000): HandleRow[] {
  const a = api();
  if (!a) return [];
  let size = 1 << 22;
  let sys = Buffer.alloc(size);
  const ret = Buffer.alloc(4);
  let status = a.NtQuerySystemInformation(SystemExtendedHandleInformation, sys, size, ret);
  if (status !== 0) {
    size = Math.min(ret.readUInt32LE(0) + 4096, 1 << 26);
    sys = Buffer.alloc(size);
    status = a.NtQuerySystemInformation(SystemExtendedHandleInformation, sys, size, ret);
    if (status !== 0) return [];
  }
  const count = Number(sys.readBigUInt64LE(0));
  const self = a.GetCurrentProcess();
  const proc = openProcess(pid, PROCESS_DUP_HANDLE);
  if (!proc) return [];
  const rows: HandleRow[] = [];
  const deadline = Date.now() + Math.max(50, budgetMs);
  try {
    // Layout: Object (8) UniqueProcessId (8) HandleValue (8) GrantedAccess (4) ...
    let off = 16;
    for (let i = 0; i < count && off + 24 <= sys.length && rows.length < 400; i++) {
      if (Date.now() > deadline) break;
      const owner = Number(sys.readBigUInt64LE(off + 8));
      const value = Number(sys.readBigUInt64LE(off + 16));
      off += 40;
      if (owner !== pid) continue;
      const out = Buffer.alloc(8);
      if (!a.DuplicateHandle(proc, value as unknown, self, out, 0, 0, DUPLICATE_SAME_ACCESS)) continue;
      const dup = out.readBigUInt64LE(0);
      const named = queryName(a, dup);
      closeHandle(dup);
      if (named) rows.push({ pid, type: named.type, name: named.name, value: `0x${value.toString(16)}` });
    }
  } finally {
    closeHandle(proc);
  }
  return rows;
}

export function whoHas(needle: string): HandleRow[] {
  const q = needle.toLowerCase();
  const hits: HandleRow[] = [];
  const deadline = Date.now() + 5000;
  for (const proc of listOpenable()) {
    const left = deadline - Date.now();
    if (left <= 0 || hits.length > 80) break;
    for (const h of handlesForPid(proc.pid, Math.min(400, left))) {
      if (h.name.toLowerCase().includes(q)) hits.push({ ...h, type: `${proc.name}:${h.type}` });
    }
  }
  return hits;
}
