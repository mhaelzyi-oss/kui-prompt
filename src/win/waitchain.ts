import type { HangNode } from "../shared/types.js";
import { koffi } from "./load.js";
import { listThreads } from "./processes.js";

const WCT_OUT_OF_PROC_FLAG = 0x1;
const WCT_MAX_NODE_COUNT = 16;
const NODE = 280;

const TYPES: Record<number, string> = {
  1: "CriticalSection",
  2: "SendMessage",
  3: "Mutex",
  4: "ALPC",
  5: "COM",
  6: "ThreadWait",
  7: "ProcessWait",
  8: "Thread",
  9: "COMActivation",
  10: "Unknown",
};

type Api = {
  OpenThreadWaitChainSession: (flags: number, callback: unknown) => unknown;
  GetThreadWaitChain: (
    wct: unknown,
    ctx: bigint,
    flags: number,
    tid: number,
    count: Buffer,
    nodes: Buffer,
    cycle: Buffer,
  ) => number;
  CloseThreadWaitChainSession: (wct: unknown) => void;
};

function api(): Api | null {
  const k = koffi();
  if (!k) return null;
  try {
    const dll = k.load("advapi32.dll");
    return {
      OpenThreadWaitChainSession: dll.func(
        "void * __stdcall OpenThreadWaitChainSession(uint32 flags, void *cb)",
      ) as Api["OpenThreadWaitChainSession"],
      GetThreadWaitChain: dll.func(
        "int __stdcall GetThreadWaitChain(void *wct, uint64 ctx, uint32 flags, uint32 tid, void *count, void *nodes, void *cycle)",
      ) as Api["GetThreadWaitChain"],
      CloseThreadWaitChainSession: dll.func(
        "void __stdcall CloseThreadWaitChainSession(void *wct)",
      ) as Api["CloseThreadWaitChainSession"],
    };
  } catch {
    return null;
  }
}

function parseNodes(buf: Buffer, count: number): HangNode[] {
  const nodes: HangNode[] = [];
  for (let i = 0; i < count; i++) {
    const off = i * NODE;
    if (off + 16 > buf.length) break;
    const type = buf.readUInt32LE(off);
    const status = buf.readUInt32LE(off + 4);
    if (TYPES[type] === "Thread") {
      nodes.push({
        kind: "thread",
        pid: buf.readUInt32LE(off + 8),
        tid: buf.readUInt32LE(off + 12),
        status: String(status),
      });
    } else {
      const name = buf
        .subarray(off + 8, off + 8 + 256)
        .toString("utf16le")
        .replace(/\0+$/, "");
      nodes.push({
        kind: "object",
        objectType: TYPES[type] ?? `type${type}`,
        objectName: name || undefined,
        status: String(status),
      });
    }
  }
  return nodes;
}

let cachedTid: number | undefined;

function currentTid(): number {
  if (cachedTid != null) return cachedTid;
  const k = koffi();
  if (!k) return 0;
  try {
    const kernel32 = k.load("kernel32.dll");
    const GetCurrentThreadId = kernel32.func("uint32 __stdcall GetCurrentThreadId()") as () => number;
    cachedTid = GetCurrentThreadId();
    return cachedTid;
  } catch {
    cachedTid = 0;
    return 0;
  }
}

export function waitChain(tid: number): { nodes: HangNode[]; cycle: boolean } {
  if (tid && tid === currentTid()) return { nodes: [], cycle: false };
  const a = api();
  if (!a) return { nodes: [], cycle: false };
  const wct = a.OpenThreadWaitChainSession(0, null);
  if (!wct) return { nodes: [], cycle: false };
  try {
    const count = Buffer.alloc(4);
    count.writeUInt32LE(WCT_MAX_NODE_COUNT, 0);
    const nodes = Buffer.alloc(NODE * WCT_MAX_NODE_COUNT);
    const cycle = Buffer.alloc(4);
    const ok = a.GetThreadWaitChain(wct, 0n, WCT_OUT_OF_PROC_FLAG, tid, count, nodes, cycle);
    if (!ok) return { nodes: [], cycle: false };
    return { nodes: parseNodes(nodes, count.readUInt32LE(0)), cycle: cycle.readInt32LE(0) !== 0 };
  } finally {
    a.CloseThreadWaitChainSession(wct);
  }
}

export function waitChainsForPid(pid: number): HangNode[][] {
  return listThreads(pid)
    .map((t) => waitChain(t.tid).nodes)
    .filter((n) => n.length > 1);
}
