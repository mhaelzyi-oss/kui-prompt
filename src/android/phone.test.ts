import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Session } from "../engine/session.js";
import { setAdbRunner } from "./adb.js";

const DEVICES = `List of devices attached
R58M36ABC              device product:oriole model:Pixel_6 transport_id:2
34120D7A8B9C           device product:panther model:Pixel_7 transport_id:3
UNAUTHORIZED99         unauthorized usb:1-2
`;

const CRASH = `E AndroidRuntime: FATAL EXCEPTION: main
E AndroidRuntime: Process: com.example.camera
E AndroidRuntime: java.lang.NullPointerException: view was null
E AndroidRuntime: \tat com.example.camera.MainActivity.onCreate(MainActivity.java:40)
`;

afterEach(() => setAdbRunner(null));

describe("phone session", () => {
  it("lists, focuses, browses, and writes an agent packet without a live cable", () => {
    setAdbRunner((args) => {
      const key = args.join(" ");
      if (key === "devices -l") return { code: 0, stdout: DEVICES, stderr: "" };
      if (key.includes("getprop ro.product.model")) return { code: 0, stdout: "Pixel 6\n", stderr: "" };
      if (key.includes("getprop ro.build.version.release")) return { code: 0, stdout: "14\n", stderr: "" };
      if (key.includes("ls -1")) return { code: 0, stdout: "DCIM\nDownload\nPictures\n", stderr: "" };
      if (key.includes("logcat")) return { code: 0, stdout: CRASH, stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    });

    const session = new Session();
    const listed = session.run("list");
    expect(listed.ok).toBe(true);
    expect(listed.text).toMatch(/R58M36ABC/);
    expect(listed.text).toMatch(/Pixel 6/);
    expect(listed.text).toMatch(/34120D7A8B9C/);
    expect(listed.text).toMatch(/Pixel 7/);
    expect(listed.text).toMatch(/UNAUTHORIZED99/);

    expect(session.run("focus R58M36ABC").ok).toBe(true);
    const status = session.run("status");
    expect(status.ok).toBe(true);
    expect(status.text).toMatch(/Phone Pixel 6 authorized/);
    expect(status.text).toMatch(/Android 14/);

    const files = session.run("handles /sdcard");
    expect(files.ok).toBe(true);
    expect(files.text).toMatch(/3 files/);
    expect(files.evidence).toMatch(/DCIM/);

    const hang = session.run("hang");
    expect(hang.ok).toBe(true);
    expect(hang.text).toMatch(/HANG phone/);
    expect(hang.text).toMatch(/com\.example\.camera/);

    const dest = join(mkdtempSync(join(tmpdir(), "kui-phone-")), "kui-prompt-error.md");
    const report = session.run("report");
    expect(report.ok).toBe(true);
    expect(report.text).toMatch(/Agent packet:/);
    expect(report.text).toMatch(/Nothing was uploaded/);
    const packet = readFileSync(report.evidence ?? dest, "utf8");
    expect(packet).toMatch(/KUI Desk agent packet/);
    expect(packet).toMatch(/NullPointerException/);
  });

  it("does not crash when this PC has no adb", () => {
    setAdbRunner(() => ({ code: 127, stdout: "", stderr: "no adb" }));
    const session = new Session();
    const listed = session.run("list");
    expect(listed.ok).toBe(true);
    expect(listed.text).toMatch(/no adb|none authorized|This PC has no adb/i);
    const focus = session.run("focus phone");
    expect(focus.ok).toBe(false);
    expect(focus.text).toMatch(/No authorized phone/);
    expect(focus.text).not.toMatch(/ECONNRESET|spawn/i);
  });
});
