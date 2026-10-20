import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMinidump } from "./minidump.js";

function fakeDump(): Buffer {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0x504d444d, 0);
  header.writeUInt32LE(0xa793, 4);
  header.writeUInt32LE(2, 8);
  header.writeUInt32LE(32, 12);
  const dir = Buffer.alloc(24);
  dir.writeUInt32LE(3, 0); // threads
  dir.writeUInt32LE(8, 4);
  dir.writeUInt32LE(56, 8);
  dir.writeUInt32LE(6, 12); // exception
  dir.writeUInt32LE(16, 16);
  dir.writeUInt32LE(64, 20);
  const threads = Buffer.alloc(8);
  threads.writeUInt32LE(3, 0);
  const exception = Buffer.alloc(16);
  exception.writeUInt32LE(21004, 0);
  exception.writeUInt32LE(0xc0000005, 8);
  return Buffer.concat([header, dir, threads, exception]);
}

describe("minidump", () => {
  it("reads thread and exception streams without a live process", () => {
    const dir = mkdtempSync(join(tmpdir(), "kui-prompt-"));
    const path = join(dir, "sample.dmp");
    writeFileSync(path, fakeDump());
    const info = readMinidump(path);
    expect(info.threads).toBe(3);
    expect(info.exception).toBe("0xc0000005");
    expect(info.exceptionTid).toBe(21004);
    expect(info.streams).toContain("ThreadList");
    expect(info.streams).toContain("Exception");
  });
});
