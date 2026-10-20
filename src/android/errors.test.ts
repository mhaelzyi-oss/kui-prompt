import { describe, expect, it } from "vitest";
import { formatPhoneError, parsePhoneLog } from "./errors.js";

const CRASH = `
01-01 12:00:00.000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main
01-01 12:00:00.000  1234  1234 E AndroidRuntime: Process: com.example.camera
01-01 12:00:00.000  1234  1234 E AndroidRuntime: java.lang.NullPointerException: view was null
01-01 12:00:00.000  1234  1234 E AndroidRuntime: \tat com.example.camera.MainActivity.onCreate(MainActivity.java:40)
`;

const ANR = `
ANR in com.example.maps
PID: 2211
Reason: Input dispatching timed out (Waiting to send non-key event)
`;

describe("phone errors", () => {
  it("reads a Java crash and an ANR from log text", () => {
    const crash = parsePhoneLog(CRASH);
    expect(crash.kind).toBe("crash");
    expect(crash.process).toBe("com.example.camera");
    expect(crash.exception).toMatch(/NullPointerException/);
    expect(formatPhoneError(crash, "R58M", "Pixel 6")).toMatch(/PHONE Pixel 6 R58M/);
    expect(formatPhoneError(crash, "R58M", "Pixel 6")).toMatch(/Nothing was uploaded/);

    const anr = parsePhoneLog(ANR);
    expect(anr.kind).toBe("anr");
    expect(anr.process).toBe("com.example.maps");
    expect(anr.reason).toMatch(/Input dispatching timed out/);
  });

  it("says none when the log is quiet", () => {
    const none = parsePhoneLog("--------- beginning of main\n");
    expect(none.kind).toBe("none");
    expect(formatPhoneError(none, "emu").split("\n").length).toBeLessThanOrEqual(12);
  });
});
