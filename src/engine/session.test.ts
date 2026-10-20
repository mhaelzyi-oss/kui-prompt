import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERBS } from "../shared/verbs.js";
import { Session } from "./session.js";

describe("session", () => {
  it("help lists every verb and quit exits", () => {
    const session = new Session();
    const help = session.run("help");
    for (const verb of VERBS) expect(help.text).toContain(verb);
    expect(help.text.split("\n")).toHaveLength(12);
    expect(session.run("quit").quit).toBe(true);
  });

  it("save writes the transcript", () => {
    const session = new Session();
    session.run("help");
    const dest = join(mkdtempSync(join(tmpdir(), "kui-prompt-")), "session.txt");
    const saved = session.run(`save ${dest}`);
    expect(saved.ok).toBe(true);
    expect(readFileSync(dest, "utf8")).toMatch(/> help/);
  });

  it("opens a dump with no live process", () => {
    const dir = mkdtempSync(join(tmpdir(), "kui-prompt-"));
    const path = join(dir, "sample.dmp");
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0x504d444d, 0);
    header.writeUInt32LE(0xa793, 4);
    header.writeUInt32LE(2, 8);
    header.writeUInt32LE(32, 12);
    const directory = Buffer.alloc(24);
    directory.writeUInt32LE(3, 0);
    directory.writeUInt32LE(8, 4);
    directory.writeUInt32LE(56, 8);
    directory.writeUInt32LE(6, 12);
    directory.writeUInt32LE(16, 16);
    directory.writeUInt32LE(64, 20);
    const threads = Buffer.alloc(8);
    threads.writeUInt32LE(2, 0);
    const exception = Buffer.alloc(16);
    exception.writeUInt32LE(21004, 0);
    exception.writeUInt32LE(0xc0000005, 8);
    writeFileSync(path, Buffer.concat([header, directory, threads, exception]));
    const session = new Session();
    expect(session.run(`dump open ${path}`).ok).toBe(true);
    const status = session.run("status");
    expect(status.ok).toBe(true);
    expect(status.text).toMatch(/Threads 2/);
    expect(status.text).toMatch(/Exception 0xc0000005/);
    const hang = session.run("hang");
    expect(hang.ok).toBe(true);
    expect(hang.text).toMatch(/Waiter tid 21004/);
    expect(hang.text).toMatch(/Exception 0xc0000005/);
    expect(session.run("report").ok).toBe(true);
  });
});
