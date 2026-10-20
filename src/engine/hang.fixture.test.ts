import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withHangFixture } from "../fixture/hang.js";
import { Session } from "./session.js";

describe("hang fixture", () => {
  it("focuses the fixture process and writes a hang report", async () => {
    await withHangFixture(async (pid) => {
      const session = new Session();
      const listed = session.run("list");
      expect(listed.ok).toBe(true);
      expect(listed.text).toMatch(String(pid));
      expect(session.run(`focus ${pid}`).ok).toBe(true);
      const hang = session.run("hang");
      expect(hang.ok).toBe(true);
      expect(hang.text).toMatch(/HANG pid /);
      expect(hang.text).toMatch(/\d+ threads/);
      const report = session.run("report");
      expect(report.ok).toBe(true);
      expect(report.text.split("\n").length).toBeLessThanOrEqual(12);
      const dest = join(mkdtempSync(join(tmpdir(), "kui-prompt-")), "hang.txt");
      expect(session.run(`save ${dest}`).ok).toBe(true);
      const saved = readFileSync(dest, "utf8");
      expect(saved).toMatch(/focus/);
      expect(saved).toMatch(/hang/);
    });
  });
});
