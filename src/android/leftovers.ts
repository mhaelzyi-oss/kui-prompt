import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adbBridge, listPhones, runAdb } from "./adb.js";
import {
  TEXT_LIMIT,
  admit,
  androidRoot,
  bucketOf,
  canDeleteForever,
  canEdit,
  canSaveCopy,
  canSetAside,
  classifyName,
  isTextFile,
  parseLs,
  parsePackages,
  setAsideDest,
  topName,
  type PhoneItem,
  type RootKind,
  type ScanBucket,
} from "../shared/leftovers-core.js";

function shQuote(path: string): string {
  const guarded = admit(path);
  if (guarded.path.includes("'")) throw new Error("That path is not allowed.");
  return `'${guarded.path}'`;
}

function shell(serial: string, command: string, timeoutMs = 12000): { code: number; text: string } {
  const result = runAdb(["-s", serial, "shell", command], timeoutMs);
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.code === 127) throw new Error(adbBridge().note);
  return { code: result.code, text };
}

function requireReady(serial: string): void {
  const row = listPhones().find((p) => p.serial === serial);
  if (!row) throw new Error("That phone is not on the list. Plug the cable and accept the RSA prompt.");
  if (row.state === "unauthorized" || row.state === "no permissions") {
    throw new Error("Accept the RSA prompt on the phone.");
  }
  if (row.state !== "device") throw new Error(`Phone is ${row.state}.`);
}

export function listInstalled(serial: string): Set<string> {
  requireReady(serial);
  const result = shell(serial, "pm list packages");
  return new Set(parsePackages(result.text));
}

function lsStdout(serial: string, path: string): { name: string; directory: boolean }[] {
  const quoted = shQuote(path);
  const result = runAdb(["-s", serial, "shell", `ls -1ap ${quoted}`], 12000);
  if (result.code === 127) throw new Error(adbBridge().note);
  const blob = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/permission denied/i.test(blob)) return [];
  if (/no such file|not found/i.test(blob)) return [];
  return parseLs(result.stdout || blob);
}

export function listHits(serial: string): PhoneItem[] {
  requireReady(serial);
  const installed = listInstalled(serial);
  const items: PhoneItem[] = [];
  for (const bucket of ["data", "obb", "media"] as ScanBucket[]) {
    const root = androidRoot(bucket);
    for (const entry of lsStdout(serial, root)) {
      const mark = classifyName(entry.name, installed);
      items.push({
        serial,
        path: `${root}/${entry.name}`,
        name: entry.name,
        packageName: mark.packageName,
        root: bucket,
        kind: mark.kind,
        hidden: mark.hidden,
        directory: entry.directory,
        reason: mark.reason,
      });
    }
  }
  return items;
}

export function listLeftovers(serial: string): PhoneItem[] {
  return listHits(serial).filter((item) => item.kind === "leftover");
}

function walkSetAside(serial: string): PhoneItem[] {
  const root = androidRoot("SetAside");
  const items: PhoneItem[] = [];
  for (const pkg of lsStdout(serial, root)) {
    if (!pkg.directory) continue;
    const pkgPath = `${root}/${pkg.name}`;
    for (const bucket of lsStdout(serial, pkgPath)) {
      const bucketPath = `${pkgPath}/${bucket.name}`;
      items.push({
        serial,
        path: bucketPath,
        name: bucket.name,
        packageName: pkg.name,
        root: "SetAside",
        kind: "set-aside",
        hidden: bucket.name.startsWith("."),
        directory: bucket.directory,
        reason: "Set aside.",
      });
      if (!bucket.directory) continue;
      for (const child of lsStdout(serial, bucketPath)) {
        items.push({
          serial,
          path: `${bucketPath}/${child.name}`,
          name: child.name,
          packageName: pkg.name,
          root: "SetAside",
          kind: "set-aside",
          hidden: child.name.startsWith("."),
          directory: child.directory,
          reason: "Set aside.",
        });
      }
    }
  }
  return items;
}

function walkCopies(serial: string): PhoneItem[] {
  const root = androidRoot("Copies");
  return lsStdout(serial, root).map((entry) => ({
    serial,
    path: `${root}/${entry.name}`,
    name: entry.name,
    packageName: packageNameGuess(entry.name),
    root: "Copies" as const,
    kind: "copy" as const,
    hidden: entry.name.startsWith("."),
    directory: entry.directory,
    reason: "A copy on the phone.",
  }));
}

function packageNameGuess(name: string): string | undefined {
  const { packageName } = classifyName(name, new Set());
  return packageName;
}

export function listSetAside(serial: string): PhoneItem[] {
  requireReady(serial);
  return walkSetAside(serial);
}

export function listPhoneFiles(serial: string): PhoneItem[] {
  requireReady(serial);
  return [...listHits(serial), ...walkSetAside(serial), ...walkCopies(serial)];
}

export function listInside(serial: string, remote: string): PhoneItem[] {
  requireReady(serial);
  const guarded = admit(remote);
  const parent = asItem(serial, guarded.path, guarded.root);
  return lsStdout(serial, guarded.path).map((entry) => {
    const path = `${guarded.path}/${entry.name}`;
    const mark = classifyName(entry.name, new Set());
    return {
      serial,
      path,
      name: entry.name,
      packageName: parent.packageName ?? mark.packageName,
      root: guarded.root,
      kind: parent.kind,
      hidden: entry.name.startsWith("."),
      directory: entry.directory,
      reason: parent.reason,
    };
  });
}

function asItem(serial: string, path: string, root: RootKind): PhoneItem {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const kind =
    root === "SetAside" ? "set-aside" : root === "Copies" ? "copy" : classifyName(name, new Set()).kind;
  return {
    serial,
    path,
    name,
    packageName: classifyName(name, new Set()).packageName,
    root,
    kind,
    hidden: name.startsWith("."),
    directory: true,
    reason: kind === "set-aside" ? "Set aside." : kind === "copy" ? "A copy on the phone." : classifyName(name, new Set()).reason,
  };
}

function itemFor(serial: string, remote: string): PhoneItem {
  const guarded = admit(remote);
  const name = guarded.path.split("/").filter(Boolean).pop() ?? guarded.path;
  if (guarded.root === "SetAside") {
    const rel = guarded.path.slice(androidRoot("SetAside").length + 1);
    const pkg = rel.split("/")[0];
    return {
      serial,
      path: guarded.path,
      name,
      packageName: pkg,
      root: "SetAside",
      kind: "set-aside",
      hidden: name.startsWith("."),
      directory: !isTextFile(name),
      reason: "Set aside.",
    };
  }
  if (guarded.root === "Copies") {
    return {
      serial,
      path: guarded.path,
      name,
      packageName: packageNameGuess(name),
      root: "Copies",
      kind: "copy",
      hidden: name.startsWith("."),
      directory: !isTextFile(name),
      reason: "A copy on the phone.",
    };
  }
  const top = topName(guarded.path, guarded.root);
  const installed = listInstalled(serial);
  const mark = classifyName(top, installed);
  return {
    serial,
    path: guarded.path,
    name,
    packageName: mark.packageName,
    root: guarded.root,
    kind: mark.kind,
    hidden: mark.hidden,
    directory: guarded.path === `${androidRoot(guarded.root)}/${top}` ? true : !isTextFile(name),
    reason: mark.reason,
  };
}

export function setAside(serial: string, remote: string): string {
  requireReady(serial);
  const item = itemFor(serial, remote);
  const allowed = canSetAside(item);
  if (!allowed.ok) throw new Error(allowed.why);
  const bucket = bucketOf(item.root);
  if (!bucket || !item.packageName) throw new Error("Set aside is for leftover folders still on the phone.");
  const from = `${androidRoot(bucket)}/${topName(item.path, item.root)}`;
  admit(from);
  const dest = setAsideDest(item.packageName, bucket);
  const parent = `${androidRoot("SetAside")}/${item.packageName}`;
  admit(parent);
  admit(dest);
  const made = shell(serial, `mkdir -p ${shQuote(parent)}`);
  if (made.code !== 0 && !/file exists/i.test(made.text)) {
    throw new Error(made.text.trim() || "Could not set aside.");
  }
  const moved = shell(serial, `mv ${shQuote(from)} ${shQuote(dest)}`);
  if (moved.code !== 0) throw new Error(moved.text.trim() || "Could not set aside.");
  return dest;
}

export function deleteForever(serial: string, remote: string): void {
  requireReady(serial);
  const item = itemFor(serial, remote);
  const allowed = canDeleteForever(item);
  if (!allowed.ok) throw new Error(allowed.why);
  const removed = shell(serial, `rm -rf ${shQuote(item.path)}`);
  if (removed.code !== 0) throw new Error(removed.text.trim() || "Could not delete.");
}

export function saveCopy(serial: string, remote: string, destDir: string): string {
  requireReady(serial);
  const item = itemFor(serial, remote);
  const allowed = canSaveCopy({ ...item, kind: item.kind });
  if (!allowed.ok) throw new Error(allowed.why);
  const result = runAdb(["-s", serial, "pull", item.path, destDir], 30000);
  if (result.code === 127) throw new Error(adbBridge().note);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim() || "Could not save a copy.");
  const leaf = item.path.split("/").filter(Boolean).pop() ?? "copy";
  return join(destDir, leaf);
}

export function readTextFile(serial: string, remote: string): string {
  requireReady(serial);
  const item = itemFor(serial, remote);
  const allowed = canEdit({ ...item, directory: false });
  if (item.directory && !isTextFile(item.name)) throw new Error("Pick a text file, not a folder.");
  if (!allowed.ok && item.kind === "still") throw new Error(allowed.why);
  if (item.kind === "unknown") throw new Error("Not leftover. Unknown names are never leftover.");
  if (item.kind !== "leftover" && item.kind !== "set-aside" && item.kind !== "copy") {
    throw new Error("Only leftover, set-aside, or copies can be edited.");
  }
  const dir = mkdtempSync(join(tmpdir(), "kui-desk-"));
  const local = join(dir, item.name);
  try {
    const pulled = runAdb(["-s", serial, "pull", item.path, local], 20000);
    if (pulled.code === 127) throw new Error(adbBridge().note);
    if (pulled.code !== 0) throw new Error((pulled.stderr || pulled.stdout).trim() || "Could not read.");
    const buf = readFileSync(local);
    if (buf.length > TEXT_LIMIT) throw new Error("That file is too large to edit here.");
    return buf.toString("utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeTextFile(serial: string, remote: string, text: string): void {
  requireReady(serial);
  const item = itemFor(serial, remote);
  const allowed = canEdit({ ...item, directory: false });
  if (!allowed.ok) throw new Error(allowed.why);
  if (Buffer.byteLength(text, "utf8") > TEXT_LIMIT) throw new Error("That file is too large to edit here.");
  const dir = mkdtempSync(join(tmpdir(), "kui-desk-"));
  const local = join(dir, item.name);
  try {
    writeFileSync(local, text, "utf8");
    const pushed = runAdb(["-s", serial, "push", local, item.path], 20000);
    if (pushed.code === 127) throw new Error(adbBridge().note);
    if (pushed.code !== 0) throw new Error((pushed.stderr || pushed.stdout).trim() || "Could not write.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readySerials(serials: string[]): string[] {
  const rows = listPhones();
  return serials.filter((serial) => rows.some((row) => row.serial === serial && row.state === "device"));
}

export function leftoversFor(serials: string[]): PhoneItem[] {
  const out: PhoneItem[] = [];
  for (const serial of readySerials(serials)) {
    out.push(...listLeftovers(serial), ...listSetAside(serial));
  }
  return out;
}

export function filesFor(serials: string[]): PhoneItem[] {
  const out: PhoneItem[] = [];
  for (const serial of readySerials(serials)) out.push(...listPhoneFiles(serial));
  return out;
}
