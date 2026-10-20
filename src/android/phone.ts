import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { HandleRow, HangStory, StatusInfo, Subject, ThreadStack, WhoHasRow } from "../shared/types.js";
import { adbBridge, listPhones, runAdb, type PhoneRow } from "./adb.js";
import { formatPhoneError, parsePhoneLog, type PhoneError } from "./errors.js";

const DEFAULT_DIR = "/sdcard";

export function phoneNote(): string {
  const bridge = adbBridge();
  if (!bridge.ok) return `Phones: ${bridge.note}`;
  const rows = listPhones();
  if (!rows.length) return "Phones: none authorized. Plug the cable and accept the RSA prompt.";
  return rows
    .map((p) => {
      const name = p.model ?? p.product ?? "phone";
      return `${p.serial.padEnd(22)}  ${p.state}  ${name}`;
    })
    .join("\n");
}

export function asPhone(row: PhoneRow): Subject {
  return { type: "phone", serial: row.serial, model: row.model, state: row.state };
}

export function matchPhone(token: string): Subject | null {
  const raw = token.replace(/^["']|["']$/g, "");
  const rows = listPhones();
  if (raw.toLowerCase() === "phone") {
    const ready = rows.filter((p) => p.state === "device");
    if (ready.length === 1) return asPhone(ready[0]!);
    return null;
  }
  const hit = rows.find(
    (p) => p.serial === raw || p.model?.toLowerCase() === raw.toLowerCase() || p.product?.toLowerCase() === raw.toLowerCase(),
  );
  return hit ? asPhone(hit) : null;
}

function phoneOf(subject: Subject): Extract<Subject, { type: "phone" }> {
  if (subject.type !== "phone") throw new Error("focus a phone first.");
  if (subject.state && subject.state !== "device") {
    throw new Error(
      subject.state === "unauthorized"
        ? "That phone is unauthorized. Accept the RSA prompt on the phone."
        : `Phone ${subject.serial} is ${subject.state}.`,
    );
  }
  return subject;
}

function serialOf(subject: Subject): string {
  return phoneOf(subject).serial;
}

function shell(serial: string, command: string, timeoutMs = 8000): string {
  const result = runAdb(["-s", serial, "shell", command], timeoutMs);
  if (result.code === 127) throw new Error(adbBridge().note);
  return `${result.stdout}${result.stderr}`.trim();
}

export function phoneStatus(subject: Subject): StatusInfo {
  const serial = serialOf(subject);
  const model = shell(serial, "getprop ro.product.model") || phoneOf(subject).model;
  const release = shell(serial, "getprop ro.build.version.release");
  const alive = listPhones().some((p) => p.serial === serial && p.state === "device");
  return {
    kind: "phone",
    image: model || "phone",
    path: serial,
    pid: undefined,
    alive,
    user: release ? `Android ${release}` : undefined,
  };
}

export function phoneLs(subject: Subject, remote = DEFAULT_DIR): HandleRow[] {
  const serial = serialOf(subject);
  const text = shell(serial, `ls -1ap "${remote}"`);
  if (/permission denied|no such file|not found/i.test(text)) {
    throw new Error(`Phone refused ${remote}. Own files under /sdcard only.`);
  }
  return text
    .split(/\r?\n/)
    .map((name) => name.trim().replace(/\/$/, ""))
    .filter((name) => name && name !== "." && name !== ".." && !name.startsWith("ls:"))
    .slice(0, 80)
    .map((name) => ({
      pid: 0,
      type: "file",
      name: remote.endsWith("/") ? `${remote}${name}` : `${remote}/${name}`,
    }));
}

export function phoneFind(subject: Subject, needle: string): WhoHasRow[] {
  const serial = serialOf(subject);
  const q = needle.replace(/["\\]/g, "");
  if (!q) return [];
  const text = shell(serial, `find /sdcard -iname '*${q}*' 2>/dev/null | head -n 40`, 12000);
  return text
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((object) => ({
      pid: 0,
      name: phoneOf(subject).model ?? phoneOf(subject).serial,
      type: "file",
      object,
    }));
}

export function phonePull(subject: Subject, remote: string, dest?: string): string {
  const serial = serialOf(subject);
  if (!remote.startsWith("/sdcard") && !remote.startsWith("/storage/emulated")) {
    throw new Error("pull stays under /sdcard on a phone you own.");
  }
  const out = resolve(dest || remote.split("/").filter(Boolean).pop() || "phone.bin");
  mkdirSync(dirname(out), { recursive: true });
  const result = runAdb(["-s", serial, "pull", remote, out], 20000);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Could not pull ${remote}.`);
  return out;
}

export function scanPhoneError(subject: Subject): PhoneError {
  const serial = serialOf(subject);
  const crash = runAdb(["-s", serial, "logcat", "-d", "-b", "crash", "-t", "80"], 12000);
  const main = runAdb(["-s", serial, "logcat", "-d", "-b", "main", "-t", "200"], 12000);
  if (crash.code === 127 && main.code === 127) throw new Error(adbBridge().note);
  return parsePhoneLog(`${crash.stdout}\n${main.stdout}`);
}

export function phoneStacks(subject: Subject): ThreadStack[] {
  const err = scanPhoneError(subject);
  if (err.kind === "none") return [];
  return [
    {
      tid: 1,
      wait: err.kind,
      frames: err.frames.slice(0, 8).map((f, i) => ({
        module: err.process ?? "app",
        offset: String(i),
        english: f.trim(),
      })),
    },
  ];
}

export function phoneHang(subject: Subject): HangStory {
  const err = scanPhoneError(subject);
  const stacks = phoneStacks(subject);
  const notes =
    err.kind === "none"
      ? ["No crash or ANR in the recent log. The phone is authorized; nothing failed in view."]
      : [
          formatPhoneError(err, subject.type === "phone" ? subject.serial : "", subject.type === "phone" ? subject.model : undefined)
            .split("\n")
            .slice(1, 4)
            .join(" "),
        ];
  return {
    image: subject.type === "phone" ? subject.model ?? subject.serial : "phone",
    live: true,
    nodes: [],
    handles: [],
    stacks,
    notes,
    objectName: err.process,
    objectType: err.kind === "none" ? undefined : err.kind,
    holderEnglish: err.exception ?? err.reason ?? err.signal,
  };
}

export function writeAgentPacket(subject: Subject, dest = join(process.cwd(), "kui-desk-error.md")): { path: string; text: string } {
  const err = scanPhoneError(subject);
  const serial = subject.type === "phone" ? subject.serial : "phone";
  const model = subject.type === "phone" ? subject.model : undefined;
  const story = formatPhoneError(err, serial, model);
  const body = [
    "# KUI Desk agent packet",
    "",
    story,
    "",
    "## Evidence",
    "",
    "```",
    err.evidence || "No crash buffer.",
    "```",
    "",
    "Authorized phone only. Nothing was uploaded.",
    "",
  ].join("\n");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body, "utf8");
  return { path: dest, text: `${story}\n\nAgent packet: ${dest}` };
}
