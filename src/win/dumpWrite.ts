import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { koffi } from "./load.js";
import { closeHandle, openProcess } from "./processes.js";

const GENERIC_WRITE = 0x40000000;
const CREATE_ALWAYS = 2;
const FILE_ATTRIBUTE_NORMAL = 0x80;
const MiniDumpWithHandleData = 0x00000004;
const MiniDumpWithUnloadedModules = 0x00000020;
const MiniDumpWithThreadInfo = 0x00001000;
const DUMP_TYPE = MiniDumpWithHandleData | MiniDumpWithUnloadedModules | MiniDumpWithThreadInfo;
const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;
const PROCESS_DUP_HANDLE = 0x0040;

type Api = {
  CreateFileW: (
    path: string,
    access: number,
    share: number,
    sa: unknown,
    disp: number,
    flags: number,
    template: unknown,
  ) => unknown;
  MiniDumpWriteDump: (
    process: unknown,
    pid: number,
    file: unknown,
    type: number,
    ex: unknown,
    user: unknown,
    cb: unknown,
  ) => number;
  CloseHandle: (h: unknown) => number;
};

function api(): Api | null {
  const k = koffi();
  if (!k) return null;
  try {
    const kernel32 = k.load("kernel32.dll");
    const dbghelp = k.load("dbghelp.dll");
    return {
      CreateFileW: kernel32.func(
        "void * __stdcall CreateFileW(str16 path, uint32 access, uint32 share, void *sa, uint32 disp, uint32 flags, void *tmpl)",
      ) as Api["CreateFileW"],
      CloseHandle: kernel32.func("int __stdcall CloseHandle(void *h)") as Api["CloseHandle"],
      MiniDumpWriteDump: dbghelp.func(
        "int __stdcall MiniDumpWriteDump(void *proc, uint32 pid, void *file, uint32 type, void *ex, void *user, void *cb)",
      ) as Api["MiniDumpWriteDump"],
    };
  } catch {
    return null;
  }
}

function isBad(h: unknown): boolean {
  if (h == null) return true;
  if (typeof h === "number") return h === 0 || h === -1;
  if (typeof h === "bigint") return h === 0n || h === -1n;
  return false;
}

export function writeMinidump(pid: number, dest: string): string {
  const a = api();
  if (!a) throw new Error("dbghelp is not available.");
  const path = resolve(dest);
  mkdirSync(dirname(path), { recursive: true });
  const proc = openProcess(pid, PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_DUP_HANDLE);
  if (!proc) throw new Error(`Windows would not open pid ${pid} for a dump.`);
  const file = a.CreateFileW(path, GENERIC_WRITE, 0, null, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, null);
  if (isBad(file)) {
    closeHandle(proc);
    throw new Error(`Could not create ${path}.`);
  }
  try {
    const ok = a.MiniDumpWriteDump(proc, pid, file, DUMP_TYPE, null, null, null);
    if (!ok) throw new Error("MiniDumpWriteDump refused.");
    return path;
  } finally {
    a.CloseHandle(file);
    closeHandle(proc);
  }
}
