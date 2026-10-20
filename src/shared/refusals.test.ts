import { describe, expect, it } from "vitest";
import { Session } from "../engine/session.js";
import { parseLine } from "./parser.js";

const LINES = [
  "kernel",
  "live kernel",
  "ttd",
  "time travel",
  "decompile this",
  "ghidra",
  "IDA Pro",
  "reverse this unknown binary",
  "cheat",
  "aimbot",
  "drm",
  "bypass license",
  "attach to lsass",
  "csrss",
  "teach me windbg",
  "!analyze -v",
  "magisk",
  "bypass frp",
  "steal photos",
];

describe("refusals", () => {
  it("refuses dangerous lines without treating them as verbs", () => {
    const session = new Session();
    for (const line of LINES) {
      const parsed = parseLine(line);
      expect(parsed.kind, line).toBe("refuse");
      const result = session.run(line);
      expect(result.refuse, line).toBe(true);
      expect(result.ok).toBe(false);
      expect(result.text.length).toBeGreaterThan(8);
      expect(result.text).not.toMatch(/OpenProcess|SeDebugPrivilege|step 1/i);
    }
  });
});
