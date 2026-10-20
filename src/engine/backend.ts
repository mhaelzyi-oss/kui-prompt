import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { matchPhone, phoneFind, phoneHang, phoneLs, phonePull, phoneStacks, phoneStatus } from "../android/phone.js";
import { readMinidump, type DumpInfo } from "../dump/minidump.js";
import { isForbiddenImage } from "../shared/refusals.js";
import type { HandleRow, HangStory, ProcessRow, StatusInfo, Subject, ThreadStack, WhoHasRow } from "../shared/types.js";
import { writeMinidump } from "../win/dumpWrite.js";
import { handlesForPid, whoHas as scanWhoHas } from "../win/handles.js";
import { isHungProcess, listOpenable, listThreads } from "../win/processes.js";
import { waitChain, waitChainsForPid } from "../win/waitchain.js";

function englishWait(type?: string): string {
  if (!type) return "wait";
  if (type === "SendMessage") return "in user32 message loop";
  if (type === "Mutex") return "on a mutex";
  if (type === "CriticalSection") return "on a critical section";
  if (type === "ThreadWait" || type === "Thread") return "in an ntdll wait";
  return `on ${type}`;
}

export function listProcesses(): ProcessRow[] {
  return listOpenable();
}

export function focusTarget(token: string, listed: ProcessRow[]): Subject {
  const raw = token.replace(/^["']|["']$/g, "");
  if (/\.dmp$/i.test(raw)) {
    const path = resolve(raw);
    if (!existsSync(path)) throw new Error(`No dump at ${path}.`);
    return { type: "dump", path };
  }
  const phone = matchPhone(raw);
  if (phone) {
    if (phone.type === "phone" && phone.state === "unauthorized") {
      throw new Error("That phone is unauthorized. Accept the RSA prompt on the phone.");
    }
    if (phone.type === "phone" && phone.state && phone.state !== "device") {
      throw new Error(`Phone ${phone.serial} is ${phone.state}.`);
    }
    return phone;
  }
  if (raw.toLowerCase() === "phone") {
    throw new Error("No authorized phone. Plug the USB cable, accept the RSA prompt, or this PC has no adb.");
  }
  const asPid = Number(raw);
  if (Number.isInteger(asPid) && asPid > 0) {
    const row = listed.find((p) => p.pid === asPid) ?? listOpenable().find((p) => p.pid === asPid);
    if (!row) throw new Error(`pid ${asPid} is not a process this session can open.`);
    if (isForbiddenImage(row.name)) throw new Error("It will not attach to protected or system-critical processes.");
    return { type: "process", pid: row.pid, name: row.name, path: row.path };
  }
  const match = listed.filter((p) => p.name.toLowerCase() === raw.toLowerCase() || p.name.toLowerCase().startsWith(raw.toLowerCase()));
  if (match.length === 0) throw new Error(`No openable process named ${raw}.`);
  const row = match[0]!;
  return { type: "process", pid: row.pid, name: row.name, path: row.path };
}

export function statusOf(subject: Subject): StatusInfo {
  if (subject.type === "none") return { kind: "none" };
  if (subject.type === "phone") return phoneStatus(subject);
  if (subject.type === "dump") {
    const dump = readMinidump(subject.path);
    return {
      kind: "dump",
      path: subject.path,
      image: dump.modules[0]?.name,
      threads: dump.threads,
      exception: dump.exception,
      streams: dump.streams,
      wow64: dump.wow64,
    };
  }
  const live = listOpenable().find((p) => p.pid === subject.pid);
  const threads = listThreads(subject.pid).length;
  return {
    kind: "process",
    pid: subject.pid,
    image: subject.name,
    path: subject.path ?? live?.path,
    alive: Boolean(live),
    threads,
    notResponding: live ? isHungProcess(subject.pid) : undefined,
  };
}

export function handlesOf(subject: Subject, remote?: string): HandleRow[] {
  if (subject.type === "phone") return phoneLs(subject, remote);
  if (subject.type !== "process") return [];
  return handlesForPid(subject.pid);
}

export function whoHas(name: string, subject?: Subject): WhoHasRow[] {
  if (subject?.type === "phone") return phoneFind(subject, name);
  return scanWhoHas(name).map((h) => ({
    pid: h.pid,
    name: h.type.split(":")[0] ?? "process",
    type: h.type.split(":")[1] ?? h.type,
    object: h.name,
  }));
}

export function stacksOf(subject: Subject): ThreadStack[] {
  if (subject.type === "phone") return phoneStacks(subject);
  if (subject.type === "dump") {
    const dump = readMinidump(subject.path);
    return dump.modules.slice(0, 8).map((m, i) => ({
      tid: i + 1,
      wait: dump.exception,
      frames: [{ module: m.name, offset: `0x${m.base.toString(16)}`, english: m.name }],
    }));
  }
  if (subject.type !== "process") return [];
  const stacks: ThreadStack[] = [];
  for (const t of listThreads(subject.pid).slice(0, 24)) {
    const { nodes } = waitChain(t.tid);
    const obj = nodes.find((n) => n.kind === "object");
    stacks.push({
      tid: t.tid,
      wait: obj?.objectType,
      frames: obj
        ? [{ module: obj.objectType ?? "wait", offset: "0", english: englishWait(obj.objectType) }]
        : [{ module: subject.name, offset: "0", english: "running or not visible to WCT" }],
    });
  }
  return stacks;
}

export function dumpOpen(path: string): DumpInfo {
  return readMinidump(resolve(path));
}

export function dumpWrite(pid: number, path: string): string {
  return writeMinidump(pid, path);
}

export function dumpPull(subject: Subject, remote: string, dest?: string): string {
  return phonePull(subject, remote, dest);
}

export function hangOf(subject: Subject): HangStory {
  if (subject.type === "phone") return phoneHang(subject);
  if (subject.type === "dump") {
    const dump = readMinidump(subject.path);
    return {
      image: dump.modules[0]?.name,
      waiterTid: dump.exceptionTid,
      live: false,
      nodes: [],
      handles: [],
      stacks: stacksOf(subject),
      threadCount: dump.threads,
      notes: [
        dump.exception ? `Exception ${dump.exception} in the dump.` : "Dump has no exception stream.",
        dump.streams.length ? `Streams: ${dump.streams.join(", ")}.` : "No known streams.",
      ],
    };
  }
  if (subject.type !== "process") {
    return { live: false, nodes: [], handles: [], stacks: [], notes: ["No subject. Use list, then focus."] };
  }
  const chains = waitChainsForPid(subject.pid);
  const nodes = chains[0] ?? [];
  const threads = nodes.filter((n) => n.kind === "thread");
  const objects = nodes.filter((n) => n.kind === "object");
  const waiter = threads[0];
  const holder = threads[1] ?? threads[0];
  const obj = objects[0];
  const allThreads = listThreads(subject.pid);
  const handles = objects
    .filter((n) => n.objectName)
    .slice(0, 20)
    .map((n) => ({
      pid: subject.pid,
      type: n.objectType ?? "object",
      name: n.objectName ?? "",
    }));
  const stacks = stacksOf(subject);
  const holderEnglish = obj ? englishWait(obj.objectType) : stacks.find((s) => s.tid === holder?.tid)?.frames[0]?.english;
  return {
    pid: subject.pid,
    image: subject.name,
    waiterTid: waiter?.tid,
    holderTid: holder?.tid !== waiter?.tid ? holder?.tid : undefined,
    objectName: obj?.objectName,
    objectType: obj?.objectType,
    holderEnglish,
    threadCount: allThreads.length,
    blockedCount: chains.length,
    idleCount: Math.max(0, allThreads.length - chains.length),
    live: true,
    nodes,
    handles,
    stacks,
    notes: nodes.length
      ? []
      : ["Wait chain was empty. The process may not be waiting, or Windows refused the walk."],
  };
}
