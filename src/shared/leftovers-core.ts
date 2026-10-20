export const EMULATED = "/storage/emulated/0";

export const SCAN_BUCKETS = ["data", "obb", "media"] as const;
export type ScanBucket = (typeof SCAN_BUCKETS)[number];
export type RootKind = ScanBucket | "SetAside" | "Copies";
export type HitKind = "leftover" | "still" | "unknown";
export type ItemKind = HitKind | "set-aside" | "copy";

export type PhoneChip = {
  serial: string;
  state: string;
  model?: string;
  product?: string;
};

export type PhoneItem = {
  serial: string;
  path: string;
  name: string;
  packageName?: string;
  root: RootKind;
  kind: ItemKind;
  hidden: boolean;
  directory: boolean;
  reason: string;
};

export type Guarded = { path: string; root: RootKind };

export function androidRoot(kind: RootKind): string {
  if (kind === "SetAside") return `${EMULATED}/KUIResiduals/SetAside`;
  if (kind === "Copies") return `${EMULATED}/KUIResiduals/Copies`;
  return `${EMULATED}/Android/${kind}`;
}

export function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

export function collapse(raw: string): string {
  const unix = posix(raw.trim());
  if (!unix.startsWith("/")) throw new Error("That path must be absolute.");
  const parts: string[] = [];
  for (const seg of unix.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) throw new Error("That path is not allowed.");
      parts.pop();
      continue;
    }
    if (seg.includes("\0")) throw new Error("That path is not allowed.");
    parts.push(seg);
  }
  if (!parts.length) throw new Error("That path is not allowed.");
  return `/${parts.join("/")}`;
}

export function admit(raw: string): Guarded {
  const path = collapse(raw);
  const kinds: RootKind[] = ["data", "obb", "media", "SetAside", "Copies"];
  for (const root of kinds) {
    const base = androidRoot(root);
    if (path === base || path.startsWith(`${base}/`)) return { path, root };
  }
  throw new Error("Only leftover app folders, set aside, and copies on this phone.");
}

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

export function looksLikePackageName(name: string): boolean {
  return PACKAGE.test(name);
}

export function packageNameOf(name: string): string | null {
  const core = name.replace(/^\.+/, "");
  return looksLikePackageName(core) ? core : null;
}

export function classifyName(
  name: string,
  installed: ReadonlySet<string>,
): { kind: HitKind; reason: string; packageName?: string; hidden: boolean } {
  const hidden = name.startsWith(".");
  const packageName = packageNameOf(name);
  if (!packageName) return { kind: "unknown", reason: "Not an app name.", hidden };
  if (installed.has(packageName)) return { kind: "still", reason: "Still on the phone.", packageName, hidden };
  return {
    kind: "leftover",
    reason: hidden ? "Hidden leftover. The app is gone." : "The app is gone.",
    packageName,
    hidden,
  };
}

export function parsePackages(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^package:(.+)$/);
    if (m?.[1]) out.push(m[1].trim());
  }
  return out;
}

export function parseLs(text: string): { name: string; directory: boolean }[] {
  const out: { name: string; directory: boolean }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let name = raw.trim();
    if (!name || name.startsWith("ls:")) continue;
    const directory = name.endsWith("/");
    if (directory) name = name.slice(0, -1);
    if (!name || name === "." || name === "..") continue;
    out.push({ name, directory });
  }
  return out;
}

export function isTextFile(name: string): boolean {
  return /\.(txt|md|json|xml|log|csv|ini|properties|conf|cfg|html|css|js|kt|java)$/i.test(name);
}

export function phoneWhy(row: PhoneChip): string | null {
  if (row.state === "device") return null;
  if (row.state === "unauthorized" || row.state === "no permissions") {
    return "Accept the RSA prompt on the phone.";
  }
  if (row.state === "offline") return "That phone is offline.";
  return `Phone is ${row.state}.`;
}

export function setAsideDest(pkg: string, bucket: ScanBucket): string {
  return `${androidRoot("SetAside")}/${pkg}/${bucket}`;
}

export function bucketOf(root: RootKind): ScanBucket | null {
  if (root === "data" || root === "obb" || root === "media") return root;
  return null;
}

export function topName(path: string, root: RootKind): string {
  const base = androidRoot(root);
  const rel = path === base ? "" : path.slice(base.length + 1);
  return rel.split("/")[0] ?? "";
}

export function canSetAside(item: PhoneItem): { ok: boolean; why?: string } {
  if (item.kind !== "leftover") {
    if (item.kind === "still") return { ok: false, why: "Still on the phone." };
    if (item.kind === "unknown") return { ok: false, why: "Unknown names are never leftover." };
    if (item.kind === "set-aside") return { ok: false, why: "Already set aside." };
    return { ok: false, why: "Set aside is for leftover folders still on the phone." };
  }
  if (!item.directory) return { ok: false, why: "Set aside the leftover folder, not a file inside it." };
  if (!bucketOf(item.root) || topName(item.path, item.root) !== item.name) {
    return { ok: false, why: "Set aside the leftover folder, not a file inside it." };
  }
  return { ok: true };
}

export function canDeleteForever(item: PhoneItem): { ok: boolean; why?: string } {
  if (item.root !== "SetAside") {
    return { ok: false, why: "Set aside first. Delete forever is only for folders already set aside." };
  }
  if (item.path === androidRoot("SetAside")) {
    return { ok: false, why: "Pick a set-aside leftover, not the whole folder." };
  }
  return { ok: true };
}

export function canSaveCopy(item: PhoneItem): { ok: boolean; why?: string } {
  if (item.kind === "still") {
    return { ok: false, why: "Still on the phone. Save a copy is for leftovers and set-aside files." };
  }
  if (item.kind === "unknown") return { ok: false, why: "Unknown names are never leftover." };
  if (item.kind === "leftover" || item.kind === "set-aside" || item.kind === "copy") return { ok: true };
  return { ok: false, why: "Save a copy is for leftovers and set-aside files." };
}

export function canEdit(item: PhoneItem): { ok: boolean; why?: string } {
  if (item.directory) return { ok: false, why: "Pick a text file, not a folder." };
  if (item.kind === "still") return { ok: false, why: "Still on the phone. KUI Desk will not edit an installed app." };
  if (item.kind === "unknown") return { ok: false, why: "Not leftover. Unknown names are never leftover." };
  if (item.kind !== "leftover" && item.kind !== "set-aside" && item.kind !== "copy") {
    return { ok: false, why: "Only leftover, set-aside, or copies can be edited." };
  }
  if (!isTextFile(item.name)) return { ok: false, why: "Only a small text file can be edited." };
  return { ok: true };
}

export const TEXT_LIMIT = 256 * 1024;
