export type PhoneErrorKind = "crash" | "anr" | "tombstone" | "none";

export type PhoneError = {
  kind: PhoneErrorKind;
  process?: string;
  thread?: string;
  signal?: string;
  exception?: string;
  reason?: string;
  frames: string[];
  evidence: string;
};

const FATAL = /FATAL EXCEPTION:\s*(\S+)/i;
const PROCESS = /Process:\s*(\S+)/i;
const ANR = /ANR in\s+(\S+)/i;
const ANR_REASON = /Reason:\s*(.+)/i;
const TOMB = />>> (\S+) <<</;
const SIGNAL = /signal \d+ \(([^)]+)\)/i;
const FRAME = /^\s*at\s+.+/;
const NATIVE = /^#\d+\s+pc\s+\S+/;

export function parsePhoneLog(text: string): PhoneError {
  const lines = text.split(/\r?\n/);
  const crashAt = lines.findIndex((l) => FATAL.test(l));
  if (crashAt >= 0) {
    const slice = lines.slice(crashAt, crashAt + 24);
    const blob = slice.join("\n");
    const frames = slice.filter((l) => FRAME.test(l)).slice(0, 8);
    return {
      kind: "crash",
      thread: slice[0]?.match(FATAL)?.[1],
      process: blob.match(PROCESS)?.[1],
      exception: slice.find((l) => /[\w.]+(?:Exception|Error)\b/.test(l))?.match(/([\w.]+(?:Exception|Error)\b.*)$/)?.[1]?.trim(),
      frames,
      evidence: slice.slice(0, 16).join("\n"),
    };
  }
  const anrAt = lines.findIndex((l) => ANR.test(l));
  if (anrAt >= 0) {
    const slice = lines.slice(anrAt, anrAt + 20);
    const blob = slice.join("\n");
    return {
      kind: "anr",
      process: blob.match(ANR)?.[1],
      reason: blob.match(ANR_REASON)?.[1]?.trim(),
      frames: slice.filter((l) => FRAME.test(l) || NATIVE.test(l)).slice(0, 8),
      evidence: slice.slice(0, 16).join("\n"),
    };
  }
  const tombAt = lines.findIndex((l) => TOMB.test(l) || SIGNAL.test(l));
  if (tombAt >= 0) {
    const slice = lines.slice(Math.max(0, tombAt - 2), tombAt + 24);
    const blob = slice.join("\n");
    return {
      kind: "tombstone",
      process: blob.match(TOMB)?.[1],
      signal: blob.match(SIGNAL)?.[1],
      frames: slice.filter((l) => NATIVE.test(l)).slice(0, 8),
      evidence: slice.slice(0, 16).join("\n"),
    };
  }
  return { kind: "none", frames: [], evidence: "" };
}

export function formatPhoneError(err: PhoneError, serial: string, model?: string): string {
  const who = [model, serial].filter(Boolean).join(" ");
  if (err.kind === "none") {
    return [
      `PHONE ${who}`,
      "No crash or ANR in the recent log.",
      "The phone is authorized. Nothing failed in view.",
      "Nothing was uploaded.",
    ].join("\n");
  }
  const lines = [`PHONE ${who}`];
  if (err.kind === "crash") {
    lines.push(`${err.process ?? "app"} crashed${err.exception ? `: ${err.exception}` : "."}`);
    if (err.thread) lines.push(`Thread ${err.thread}.`);
  } else if (err.kind === "anr") {
    lines.push(`${err.process ?? "app"} is not responding.`);
    if (err.reason) lines.push(err.reason);
  } else {
    lines.push(`${err.process ?? "native"} died${err.signal ? ` (${err.signal})` : "."}`);
  }
  if (err.frames[0]) lines.push(err.frames[0].trim());
  lines.push("Evidence: logcat on an authorized phone.");
  lines.push("Nothing was uploaded.");
  return lines.slice(0, 12).join("\n");
}
