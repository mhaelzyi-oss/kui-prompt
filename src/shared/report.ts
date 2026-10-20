import type { HangStory, StatusInfo, Subject } from "./types.js";

export function formatHang(story: HangStory): string {
  const image = story.image ?? "process";
  const pid = story.pid != null ? `pid ${story.pid}` : story.live ? "phone" : "dump";
  const lines = [`HANG ${pid} ${image}`];
  if (story.waiterTid != null && (story.objectName || story.objectType)) {
    const kind = story.objectType ?? "object";
    const name = story.objectName ? ` ${story.objectName}` : "";
    lines.push(`Waiter tid ${story.waiterTid} waits on ${kind}${name}`);
  } else if (story.waiterTid != null && story.notes[0]) {
    lines.push(`Waiter tid ${story.waiterTid}. ${story.notes[0]}`);
  } else if (story.notes[0]) {
    lines.push(story.notes[0]);
  }
  if (story.holderTid != null) {
    const where = story.holderEnglish ? `; stack ${story.holderEnglish}` : "";
    const obj = story.objectName ? ` owns that ${story.objectType ?? "object"}` : "";
    lines.push(`Holder tid ${story.holderTid}${obj}${where}`);
  }
  if (story.threadCount != null) {
    const blocked = story.blockedCount ?? 0;
    const idle = story.idleCount ?? Math.max(0, story.threadCount - blocked);
    lines.push(`${story.threadCount} threads; ${blocked} blocked; ${idle} idle`);
  }
  const ev = [
    story.nodes.length ? "WCT" : null,
    story.handles[0] ? `handle ${story.handles[0].value ?? story.handles[0].name}` : null,
    story.live ? "live process" : "dump",
  ]
    .filter(Boolean)
    .join(" + ");
  if (ev) lines.push(`Evidence: ${ev}`);
  return lines.join("\n");
}

export function formatReport(story: HangStory, subject: Subject, status: StatusInfo | null): string {
  const lines: string[] = [];
  if (subject.type === "process") lines.push(`${subject.name} (${subject.pid}) is the subject.`);
  else if (subject.type === "dump") lines.push(`Dump ${subject.path} is the subject.`);
  else if (subject.type === "phone") lines.push(`Phone ${subject.model ?? subject.serial} is the subject.`);
  else lines.push("No subject. Use list, then focus.");

  if (story.waiterTid != null && (story.objectName || story.objectType)) {
    const name = story.objectName ? ` ${story.objectName}` : "";
    lines.push(`Thread ${story.waiterTid} waits on ${story.objectType ?? "object"}${name}.`);
  } else if (story.waiterTid != null && story.notes[0]) {
    lines.push(`Thread ${story.waiterTid}. ${story.notes[0]}`);
  }
  if (story.holderTid != null) {
    lines.push(
      `Thread ${story.holderTid} holds it${story.holderEnglish ? ` (${story.holderEnglish})` : ""}.`,
    );
  }
  if (status?.exception) lines.push(`Exception: ${status.exception}.`);
  if (story.threadCount != null) lines.push(`${story.threadCount} threads in view.`);
  if (story.notes.length) lines.push(...story.notes.slice(0, 3));
  const cite = [
    story.waiterTid != null ? `tid ${story.waiterTid}` : null,
    story.handles[0]?.value ? `handle ${story.handles[0].value}` : null,
    story.live ? "live" : "dump stream",
  ]
    .filter(Boolean)
    .join(", ");
  if (cite) lines.push(`Evidence: ${cite}.`);
  lines.push("Nothing was uploaded.");
  return lines.slice(0, 12).join("\n");
}

export function formatHelp(): string {
  return [
    "help      Print these twelve verbs.",
    "list      PC processes and authorized phones.",
    "focus     focus <pid|name|file.dmp|serial|phone>",
    "status    Facts for the subject.",
    "handles   Named handles or phone files.",
    "who-has   who-has <name>",
    "stacks    Thread stacks.",
    "dump      dump [path] | dump open <path> | dump <phone-path>",
    "hang      Wait-chain or phone ANR.",
    "report    Twelve-line story; phone writes the agent packet.",
    "save      save <path>",
    "quit      Exit.",
  ].join("\n");
}
