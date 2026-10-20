import { isForbiddenImage } from "../shared/refusals.js";
import type { ProcessRow } from "../shared/types.js";
import { koffi } from "./load.js";

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TH32CS_SNAPPROCESS = 0x00000002;
const TH32CS_SNAPTHREAD = 0x00000004;
const INVALID = -1;

export type ThreadRow = { tid: number; pid: number };

type Api = {
  CreateToolhelp32Snapshot: (flags: number, pid: number) => unknown;
  Process32FirstW: (snap: unknown, entry: Buffer) => number;
  Process32NextW: (snap: unknown, entry: Buffer) => number;
  Thread32First: (snap: unknown, entry: Buffer) => number;
  Thread32Next: (snap: unknown, entry: Buffer) => number;
  OpenProcess: (access: number, inherit: number, pid: number) => unknown;
  CloseHandle: (h: unknown) => number;
  QueryFullProcessImageNameW: (h: unknown, flags: number, buf: Buffer, size: Buffer) => number;
  IsHungAppWindow?: (hwnd: unknown) => number;
};

function api(): Api | null {
  const k = koffi();
  if (!k) return null;
  try {
    const kernel32 = k.load("kernel32.dll");
    return {
      CreateToolhelp32Snapshot: kernel32.func(
        "void * __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)",
      ) as Api["CreateToolhelp32Snapshot"],
      Process32FirstW: kernel32.func("int __stdcall Process32FirstW(void *snap, void *entry)") as Api["Process32FirstW"],
      Process32NextW: kernel32.func("int __stdcall Process32NextW(void *snap, void *entry)") as Api["Process32NextW"],
      Thread32First: kernel32.func("int __stdcall Thread32First(void *snap, void *entry)") as Api["Thread32First"],
      Thread32Next: kernel32.func("int __stdcall Thread32Next(void *snap, void *entry)") as Api["Thread32Next"],
      OpenProcess: kernel32.func("void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)") as Api["OpenProcess"],
      CloseHandle: kernel32.func("int __stdcall CloseHandle(void *h)") as Api["CloseHandle"],
      QueryFullProcessImageNameW: kernel32.func(
        "int __stdcall QueryFullProcessImageNameW(void *h, uint32 flags, void *buf, void *size)",
      ) as Api["QueryFullProcessImageNameW"],
    };
  } catch {
    return null;
  }
}

function isNull(h: unknown): boolean {
  if (h == null) return true;
  if (typeof h === "number") return h === 0 || h === INVALID;
  if (typeof h === "bigint") return h === 0n;
  return false;
}

export function openProcess(pid: number, access = PROCESS_QUERY_LIMITED_INFORMATION): unknown | null {
  const a = api();
  if (!a) return null;
  const h = a.OpenProcess(access, 0, pid);
  return isNull(h) ? null : h;
}

export function closeHandle(h: unknown): void {
  const a = api();
  if (a && h) a.CloseHandle(h);
}

export function imagePath(handle: unknown): string | undefined {
  const a = api();
  if (!a) return undefined;
  const buf = Buffer.alloc(1040);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(520, 0);
  if (!a.QueryFullProcessImageNameW(handle, 0, buf, size)) return undefined;
  return buf.toString("utf16le").replace(/\0+$/, "") || undefined;
}

export function listOpenable(): ProcessRow[] {
  const a = api();
  if (!a) return [];
  const snap = a.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (isNull(snap)) return [];
  const entry = Buffer.alloc(568);
  entry.writeUInt32LE(568, 0);
  const rows: ProcessRow[] = [];
  let ok = a.Process32FirstW(snap, entry);
  while (ok) {
    const pid = entry.readUInt32LE(8);
    const name = entry.subarray(44, 44 + 520).toString("utf16le").replace(/\0+$/, "") || "unknown";
    if (pid && !isForbiddenImage(name)) {
      const h = openProcess(pid);
      if (h) {
        const path = imagePath(h);
        closeHandle(h);
        rows.push({ pid, name, path });
      }
    }
    ok = a.Process32NextW(snap, entry);
  }
  closeHandle(snap);
  return rows.sort((x, y) => x.name.localeCompare(y.name) || x.pid - y.pid);
}

export function listThreads(pid?: number): ThreadRow[] {
  const a = api();
  if (!a) return [];
  const snap = a.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
  if (isNull(snap)) return [];
  const entry = Buffer.alloc(28);
  entry.writeUInt32LE(28, 0);
  const rows: ThreadRow[] = [];
  let ok = a.Thread32First(snap, entry);
  while (ok) {
    const tid = entry.readUInt32LE(8);
    const owner = entry.readUInt32LE(12);
    if (!pid || owner === pid) rows.push({ tid, pid: owner });
    ok = a.Thread32Next(snap, entry);
  }
  closeHandle(snap);
  return rows;
}

export function isHungProcess(pid: number): boolean {
  const k = koffi();
  if (!k) return false;
  try {
    const user32 = k.load("user32.dll");
    const proto = k.proto("int __stdcall EnumHung(void *hwnd, int64 lp)");
    const EnumWindows = user32.func("int __stdcall EnumWindows(void *cb, int64 lp)") as (cb: unknown, lp: number) => number;
    const GetWindowThreadProcessId = user32.func(
      "uint32 __stdcall GetWindowThreadProcessId(void *hwnd, void *pid)",
    ) as (hwnd: unknown, pid: Buffer) => number;
    const IsHungAppWindow = user32.func("int __stdcall IsHungAppWindow(void *hwnd)") as (hwnd: unknown) => number;
    const IsWindowVisible = user32.func("int __stdcall IsWindowVisible(void *hwnd)") as (hwnd: unknown) => number;
    let hung = false;
    const cb = k.register((hwnd: unknown) => {
      if (hung) return 0;
      if (!IsWindowVisible(hwnd)) return 1;
      const out = Buffer.alloc(4);
      GetWindowThreadProcessId(hwnd, out);
      if (out.readUInt32LE(0) === pid && IsHungAppWindow(hwnd)) hung = true;
      return hung ? 0 : 1;
    }, proto);
    try {
      EnumWindows(cb, 0);
    } finally {
      k.unregister(cb);
    }
    return hung;
  } catch {
    return false;
  }
}
