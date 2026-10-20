import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type AdbResult = { code: number; stdout: string; stderr: string };
export type AdbRun = (args: string[], timeoutMs?: number) => AdbResult;

export type PhoneRow = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
};

let injected: AdbRun | null = null;

export function setAdbRunner(fn: AdbRun | null): void {
  injected = fn;
}

export function findAdb(): string | null {
  const exe = process.platform === "win32" ? "adb.exe" : "adb";
  const hits = [
    process.env.KUI_PROMPT_ADB,
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, "platform-tools", exe),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, "platform-tools", exe),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", exe),
    join(process.cwd(), "tools", "platform-tools", exe),
  ];
  for (const path of hits) {
    if (path && existsSync(path)) return path;
  }
  const look = spawnSync(process.platform === "win32" ? "where" : "which", [process.platform === "win32" ? "adb.exe" : "adb"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 3000,
  });
  const first = (look.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first && existsSync(first) ? first : null;
}

export function runAdb(args: string[], timeoutMs = 8000): AdbResult {
  if (injected) return injected(args, timeoutMs);
  const bin = findAdb();
  if (!bin) return { code: 127, stdout: "", stderr: "no adb" };
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

export function parseDevices(text: string): PhoneRow[] {
  const rows: PhoneRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^list of devices/i.test(line)) continue;
    const m = line.match(/^(\S+)\s+(\S+)(.*)$/);
    if (!m) continue;
    const extra = m[3] ?? "";
    rows.push({
      serial: m[1]!,
      state: m[2]!,
      model: extra.match(/model:(\S+)/)?.[1]?.replace(/_/g, " "),
      product: extra.match(/product:(\S+)/)?.[1],
    });
  }
  return rows;
}

export function listPhones(): PhoneRow[] {
  const result = runAdb(["devices", "-l"]);
  if (result.code === 127) return [];
  return parseDevices(result.stdout);
}

export function adbBridge(): { ok: boolean; path?: string; note: string } {
  if (injected) return { ok: true, note: "adb fixture" };
  const path = findAdb();
  if (!path) {
    return {
      ok: false,
      note: "This PC has no adb. Authorized USB debugging only. Drop platform-tools here or set ANDROID_HOME.",
    };
  }
  return { ok: true, path, note: path };
}
