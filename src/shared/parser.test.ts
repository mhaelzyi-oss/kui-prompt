import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLine } from "./parser.js";
import { VERBS } from "./verbs.js";

describe("parser", () => {
  it("parses the twelve verbs and no others", () => {
    for (const verb of VERBS) {
      expect(parseLine(verb)).toEqual({ kind: "verb", verb, args: [] });
    }
    expect(parseLine("focus 18432")).toEqual({ kind: "verb", verb: "focus", args: ["18432"] });
    expect(parseLine("dump open memory.dmp")).toEqual({
      kind: "verb",
      verb: "dump",
      args: ["open", "memory.dmp"],
    });
    expect(parseLine("who-has Local\\Foo")).toEqual({ kind: "verb", verb: "who-has", args: ["Local\\Foo"] });
    expect(parseLine("xyzzy")).toEqual({ kind: "unknown", text: "xyzzy" });
    expect(parseLine("")).toEqual({ kind: "empty" });
  });

  it("keeps help output to those twelve verbs", () => {
    const src = readFileSync(new URL("./verbs.ts", import.meta.url), "utf8");
    expect(VERBS).toHaveLength(12);
    expect(src).not.toMatch(/\bbp\b|\b!analyze\b/);
  });
});
