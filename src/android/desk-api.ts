import { listPhones, adbBridge, type PhoneRow } from "./adb.js";
import { asPhone, phoneHang, writeAgentPacket } from "./phone.js";
import {
  deleteForever,
  filesFor,
  leftoversFor,
  listInside,
  readTextFile,
  saveCopy,
  setAside,
  writeTextFile,
} from "./leftovers.js";
import { SAMPLE_HANG, SAMPLE_ITEMS, SAMPLE_NOTE, SAMPLE_PHONES } from "../shared/sample.js";
import {
  canDeleteForever,
  canEdit,
  canSaveCopy,
  canSetAside,
  setAsideDest,
  bucketOf,
  type PhoneItem,
} from "../shared/leftovers-core.js";

export type DeskOk<T> = { ok: true } & T;
export type DeskErr = { ok: false; text: string };
export type DeskResult<T> = DeskOk<T> | DeskErr;

function fail(err: unknown): DeskErr {
  return { ok: false, text: err instanceof Error ? err.message : String(err) };
}

let previewItems: PhoneItem[] | null = null;
let previewFiles: Record<string, string> = {};

function usingPreview(serials: string[], live: PhoneRow[]): boolean {
  if (live.length) return false;
  return serials.some((s) => SAMPLE_PHONES.some((p) => p.serial === s));
}

function ensurePreview(): PhoneItem[] {
  if (!previewItems) previewItems = SAMPLE_ITEMS.map((item) => ({ ...item }));
  return previewItems;
}

export function deskListPhones(sampleIfEmpty = false): DeskResult<{ phones: PhoneRow[]; note?: string; preview?: boolean }> {
  try {
    const phones = listPhones();
    if (phones.length) return { ok: true, phones };
    const bridge = adbBridge();
    if (sampleIfEmpty) {
      return { ok: true, phones: SAMPLE_PHONES as PhoneRow[], preview: true, note: "Preview phones. Plug in a real phone to use adb." };
    }
    return {
      ok: true,
      phones: [],
      note: bridge.ok ? "Phones: none authorized. Plug the cable and accept the RSA prompt." : bridge.note,
    };
  } catch (err) {
    return fail(err);
  }
}

export function deskLeftovers(serials: string[], sampleIfEmpty = false): DeskResult<{ items: PhoneItem[] }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview(serials, live)) {
      const items = ensurePreview().filter((item) => serials.includes(item.serial) && (item.kind === "leftover" || item.kind === "set-aside"));
      return { ok: true, items };
    }
    return { ok: true, items: leftoversFor(serials) };
  } catch (err) {
    return fail(err);
  }
}

export function deskFiles(serials: string[], sampleIfEmpty = false): DeskResult<{ items: PhoneItem[] }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview(serials, live)) {
      const items = ensurePreview().filter((item) => serials.includes(item.serial));
      return { ok: true, items };
    }
    return { ok: true, items: filesFor(serials) };
  } catch (err) {
    return fail(err);
  }
}

export function deskInside(serial: string, path: string, sampleIfEmpty = false): DeskResult<{ items: PhoneItem[] }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview().filter((item) => item.serial === serial && item.path.startsWith(`${path}/`));
      return { ok: true, items };
    }
    return { ok: true, items: listInside(serial, path) };
  } catch (err) {
    return fail(err);
  }
}

export function deskSetAside(serial: string, path: string, sampleIfEmpty = false): DeskResult<{ path: string; text: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview();
      const item = items.find((row) => row.serial === serial && row.path === path);
      if (!item) throw new Error("Pick a leftover first.");
      const allowed = canSetAside(item);
      if (!allowed.ok) throw new Error(allowed.why);
      const bucket = bucketOf(item.root);
      if (!bucket || !item.packageName) throw new Error("Set aside is for leftover folders still on the phone.");
      const dest = setAsideDest(item.packageName, bucket);
      item.path = dest;
      item.root = "SetAside";
      item.kind = "set-aside";
      item.name = bucket;
      item.reason = "Set aside.";
      return { ok: true, path: dest, text: `Set aside ${dest}` };
    }
    const dest = setAside(serial, path);
    return { ok: true, path: dest, text: `Set aside ${dest}` };
  } catch (err) {
    return fail(err);
  }
}

export function deskDeleteForever(serial: string, path: string, sampleIfEmpty = false): DeskResult<{ text: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview();
      const item = items.find((row) => row.serial === serial && row.path === path);
      if (!item) throw new Error("Pick a set-aside leftover first.");
      const allowed = canDeleteForever(item);
      if (!allowed.ok) throw new Error(allowed.why);
      previewItems = items.filter((row) => row.serial !== serial || (row.path !== path && !row.path.startsWith(`${path}/`)));
      return { ok: true, text: `Deleted forever ${path}` };
    }
    deleteForever(serial, path);
    return { ok: true, text: `Deleted forever ${path}` };
  } catch (err) {
    return fail(err);
  }
}

export function deskSaveCopy(serial: string, path: string, destDir: string, sampleIfEmpty = false): DeskResult<{ path: string; text: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview();
      const item = items.find((row) => row.serial === serial && row.path === path);
      if (!item) throw new Error("Pick a leftover or set-aside item first.");
      const allowed = canSaveCopy(item);
      if (!allowed.ok) throw new Error(allowed.why);
      const leaf = item.name;
      const out = `${destDir.replace(/[\\/]$/, "")}\\${leaf}`;
      return { ok: true, path: out, text: `Saved a copy on this PC: ${out}` };
    }
    const out = saveCopy(serial, path, destDir);
    return { ok: true, path: out, text: `Saved a copy on this PC: ${out}` };
  } catch (err) {
    return fail(err);
  }
}

export function deskReadFile(serial: string, path: string, sampleIfEmpty = false): DeskResult<{ text: string; path: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview();
      const item = items.find((row) => row.serial === serial && row.path === path);
      if (!item) throw new Error("Pick a text file first.");
      const allowed = canEdit(item);
      if (!allowed.ok) throw new Error(allowed.why);
      const text = previewFiles[`${serial}:${path}`] ?? SAMPLE_NOTE;
      return { ok: true, text, path };
    }
    return { ok: true, text: readTextFile(serial, path), path };
  } catch (err) {
    return fail(err);
  }
}

export function deskWriteFile(serial: string, path: string, text: string, sampleIfEmpty = false): DeskResult<{ text: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      const items = ensurePreview();
      const item = items.find((row) => row.serial === serial && row.path === path);
      if (!item) throw new Error("Pick a text file first.");
      const allowed = canEdit(item);
      if (!allowed.ok) throw new Error(allowed.why);
      previewFiles[`${serial}:${path}`] = text;
      return { ok: true, text: `Wrote ${path}` };
    }
    writeTextFile(serial, path, text);
    return { ok: true, text: `Wrote ${path}` };
  } catch (err) {
    return fail(err);
  }
}

export function deskHang(serial: string, sampleIfEmpty = false): DeskResult<{ text: string; evidence?: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      return { ok: true, text: SAMPLE_HANG, evidence: "logcat on an authorized phone (preview)" };
    }
    const row = live.find((p) => p.serial === serial);
    if (!row) throw new Error("That phone is not on the list. Plug the cable and accept the RSA prompt.");
    const story = phoneHang(asPhone(row));
    return {
      ok: true,
      text: [
        `HANG phone ${story.image ?? serial}`,
        ...story.notes,
        story.holderEnglish,
        "Nothing was uploaded.",
      ]
        .filter(Boolean)
        .join("\n"),
      evidence: story.stacks.flatMap((s) => s.frames.map((f) => f.english ?? f.module)).join("\n"),
    };
  } catch (err) {
    return fail(err);
  }
}

export function deskReport(serial: string, sampleIfEmpty = false): DeskResult<{ text: string; evidence?: string }> {
  try {
    const live = listPhones();
    if (sampleIfEmpty && usingPreview([serial], live)) {
      return {
        ok: true,
        text: `# KUI Desk agent packet\n\n${SAMPLE_HANG}\n\nAuthorized phone only. Nothing was uploaded.`,
        evidence: "preview",
      };
    }
    const row = live.find((p) => p.serial === serial);
    if (!row) throw new Error("That phone is not on the list. Plug the cable and accept the RSA prompt.");
    const packet = writeAgentPacket(asPhone(row));
    return { ok: true, text: packet.text, evidence: packet.path };
  } catch (err) {
    return fail(err);
  }
}

export function resetPreviewDesk(): void {
  previewItems = null;
  previewFiles = {};
}
