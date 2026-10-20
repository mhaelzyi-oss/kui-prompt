import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { phoneNote, writeAgentPacket } from "../android/phone.js";
import { formatHang, formatHelp, formatReport } from "../shared/report.js";
import { parseLine } from "../shared/parser.js";
import type { CommandResult, HangStory, StatusInfo, Subject } from "../shared/types.js";
import { VERB_HELP, VERBS } from "../shared/verbs.js";
import * as backend from "./backend.js";

export class Session {
  subject: Subject = { type: "none" };
  lastRefusal = "";
  lastHang: HangStory | null = null;
  lastStatus: StatusInfo | null = null;
  transcript: string[] = [];

  note(line: string): void {
    this.transcript.push(line);
  }

  run(line: string): CommandResult {
    this.note(`> ${line}`);
    const parsed = parseLine(line);
    if (parsed.kind === "empty") return { ok: true, text: "" };
    if (parsed.kind === "refuse") {
      this.lastRefusal = parsed.reason;
      this.note(parsed.reason);
      return { ok: false, refuse: true, text: parsed.reason };
    }
    if (parsed.kind === "unknown") {
      const text = `Unknown verb. Use help.`;
      this.note(text);
      return { ok: false, text };
    }
    try {
      const result = this.dispatch(parsed.verb, parsed.args);
      if (result.text) this.note(result.text);
      return result;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      this.note(text);
      return { ok: false, text };
    }
  }

  private dispatch(verb: (typeof VERBS)[number], args: string[]): CommandResult {
    switch (verb) {
      case "help":
        return { ok: true, text: formatHelp() };
      case "list": {
        const phones = phoneNote();
        const rows = backend.listProcesses();
        const procs = rows.length
          ? clip(
              rows.map((r) => `${r.pid.toString().padStart(6)}  ${r.name}${r.path ? `  ${r.path}` : ""}`).join("\n"),
              200,
            )
          : "No processes this session can open.";
        const text = `${phones}\n\n${procs}`;
        return { ok: true, text, evidence: `${rows.length} processes` };
      }
      case "focus": {
        const token = args[0];
        if (!token) return { ok: false, text: "focus <pid|name|file.dmp|serial|phone>" };
        const listed = backend.listProcesses();
        this.subject = backend.focusTarget(token, listed);
        const text =
          this.subject.type === "dump"
            ? `Focused dump ${this.subject.path}`
            : this.subject.type === "process"
              ? `Focused ${this.subject.name} (${this.subject.pid})`
              : this.subject.type === "phone"
                ? `Focused phone ${this.subject.model ?? this.subject.serial} (${this.subject.serial})`
                : "No subject.";
        return { ok: true, text };
      }
      case "status": {
        this.lastStatus = backend.statusOf(this.subject);
        this.lastStatus.lastRefusal = this.lastRefusal || undefined;
        return { ok: true, text: formatStatus(this.lastStatus), evidence: JSON.stringify(this.lastStatus, null, 2) };
      }
      case "handles": {
        if (this.subject.type !== "process" && this.subject.type !== "phone") {
          return { ok: false, text: "handles needs a live process or phone. focus first." };
        }
        const rows = backend.handlesOf(this.subject, args[0]);
        const evidence = rows.map((h) => `${h.value ?? ""}  ${h.type}  ${h.name}`.trim()).join("\n");
        const summary = rows.length
          ? this.subject.type === "phone"
            ? `${rows.length} files.`
            : `${rows.length} named handles.`
          : this.subject.type === "phone"
            ? "No files visible under that path."
            : "No named handles visible, or Windows refused the table.";
        return { ok: true, text: evidence ? `${summary}\n${clip(evidence)}` : summary, evidence };
      }
      case "who-has": {
        const name = args.join(" ");
        if (!name) return { ok: false, text: "who-has <name>" };
        const rows = backend.whoHas(name, this.subject);
        const evidence = rows.map((r) => `${r.pid} ${r.name} ${r.type} ${r.object}`).join("\n");
        const summary = rows.length
          ? this.subject.type === "phone"
            ? `${rows.length} files.`
            : `${rows.length} holders among openable processes.`
          : this.subject.type === "phone"
            ? `No file on the phone matches ${name}.`
            : `No openable process holds ${name}.`;
        return { ok: true, text: evidence ? `${summary}\n${clip(evidence)}` : summary, evidence };
      }
      case "stacks": {
        const stacks = backend.stacksOf(this.subject);
        const evidence = stacks
          .map((s) => `tid ${s.tid} ${s.wait ?? ""}\n` + s.frames.map((f) => `  ${f.english ?? f.module} ${f.offset}`).join("\n"))
          .join("\n");
        const summary = stacks.length ? `${stacks.length} threads.` : "No stacks.";
        return { ok: true, text: evidence ? `${summary}\n${clip(evidence)}` : summary, evidence };
      }
      case "dump": {
        if (args[0]?.toLowerCase() === "open") {
          const path = args.slice(1).join(" ");
          if (!path) return { ok: false, text: "dump open <path>" };
          this.subject = backend.focusTarget(path, []);
          const info = backend.dumpOpen(path);
          return { ok: true, text: `Opened dump. Streams: ${info.streams.join(", ") || "none"}.` };
        }
        if (this.subject.type === "phone") {
          const remote = args[0];
          if (!remote) return { ok: false, text: "dump <phone-path> pulls a file under /sdcard. Use report for the agent packet." };
          const path = backend.dumpPull(this.subject, remote, args[1]);
          return { ok: true, text: `Pulled ${path}` };
        }
        if (this.subject.type !== "process") return { ok: false, text: "dump needs a live process, or use dump open <path>." };
        const dest = args[0] ? resolve(args[0]) : resolve(`kui-prompt-${this.subject.pid}.dmp`);
        const path = backend.dumpWrite(this.subject.pid, dest);
        return { ok: true, text: `Wrote ${path}` };
      }
      case "hang": {
        this.lastHang = backend.hangOf(this.subject);
        this.lastStatus = backend.statusOf(this.subject);
        const text = formatHang(this.lastHang);
        const evidence = [
          this.lastHang.nodes.map((n) => (n.kind === "thread" ? `thread ${n.tid}` : `${n.objectType} ${n.objectName ?? ""}`)).join(" -> "),
          this.lastHang.handles
            .slice(0, 8)
            .map((h) => `${h.type} ${h.name}`)
            .join("\n"),
        ]
          .filter(Boolean)
          .join("\n");
        return { ok: true, text, evidence };
      }
      case "report": {
        if (this.subject.type === "phone") {
          const packet = writeAgentPacket(this.subject);
          this.lastHang = backend.hangOf(this.subject);
          this.lastStatus = backend.statusOf(this.subject);
          return { ok: true, text: packet.text, evidence: packet.path };
        }
        if (!this.lastHang) this.lastHang = backend.hangOf(this.subject);
        if (!this.lastStatus) this.lastStatus = backend.statusOf(this.subject);
        return { ok: true, text: formatReport(this.lastHang, this.subject, this.lastStatus) };
      }
      case "save": {
        const dest = args[0];
        if (!dest) return { ok: false, text: "save <path>" };
        const path = resolve(dest);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, this.transcript.join("\n") + "\n", "utf8");
        return { ok: true, text: `Saved ${path}` };
      }
      case "quit":
        return { ok: true, quit: true, text: "quit" };
      default:
        return { ok: false, text: VERB_HELP.help };
    }
  }
}

function clip(text: string, max = 40): string {
  const lines = text.split("\n");
  if (lines.length <= max) return text;
  return `${lines.slice(0, max).join("\n")}\n… ${lines.length - max} more`;
}

function formatStatus(s: StatusInfo): string {
  if (s.kind === "none") return "No subject. Use list, then focus.";
  if (s.kind === "phone") {
    return [
      `Phone ${s.image ?? "android"} ${s.alive ? "authorized" : "gone"}`,
      s.path ? `Serial ${s.path}` : null,
      s.user,
      s.lastRefusal ? `Last refusal: ${s.lastRefusal}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (s.kind === "dump") {
    return [
      `Dump ${s.path}`,
      s.image ? `Image ${s.image}` : null,
      s.threads != null ? `Threads ${s.threads}` : null,
      s.exception ? `Exception ${s.exception}` : "No exception stream",
      s.streams?.length ? `Streams ${s.streams.join(", ")}` : null,
      s.lastRefusal ? `Last refusal: ${s.lastRefusal}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `${s.image} (${s.pid}) ${s.alive ? "alive" : "gone"}`,
    s.path,
    s.threads != null ? `Threads ${s.threads}` : null,
    s.notResponding ? "Not responding" : null,
    s.lastRefusal ? `Last refusal: ${s.lastRefusal}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function appendTranscript(path: string, text: string): void {
  appendFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}
