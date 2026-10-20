import { describe, expect, it } from "vitest";
import { formatHang, formatHelp, formatReport } from "./report.js";
import type { HangStory } from "./types.js";

const story: HangStory = {
  pid: 18432,
  image: "ContosoApp.exe",
  waiterTid: 21004,
  holderTid: 18812,
  objectName: "\\Sessions\\1\\BaseNamedObjects\\Foo",
  objectType: "Mutex",
  holderEnglish: "in user32 message loop",
  threadCount: 12,
  blockedCount: 1,
  idleCount: 11,
  live: true,
  nodes: [{ kind: "thread", tid: 21004 }],
  handles: [{ pid: 18432, type: "Mutant", name: "Foo", value: "0x1a4" }],
  stacks: [],
  notes: [],
};

describe("report", () => {
  it("prints the hang story density from the build command", () => {
    const text = formatHang(story);
    expect(text).toMatch(/HANG pid 18432 ContosoApp\.exe/);
    expect(text).toMatch(/Waiter tid 21004 waits on Mutex/);
    expect(text).toMatch(/Holder tid 18812/);
    expect(text).toMatch(/12 threads; 1 blocked; 11 idle/);
    expect(text).toMatch(/Evidence:.*0x1a4/);
    const unnamed = formatHang({ ...story, objectName: undefined, notes: [] });
    expect(unnamed).toMatch(/Waiter tid 21004 waits on Mutex$/m);
  });

  it("keeps report to twelve English lines", () => {
    const text = formatReport(story, { type: "process", pid: 18432, name: "ContosoApp.exe" }, null);
    expect(text.split("\n").length).toBeLessThanOrEqual(12);
    expect(text).not.toMatch(/0xdeadbeef{4}/);
    expect(formatHelp().split("\n")).toHaveLength(12);
  });
});
