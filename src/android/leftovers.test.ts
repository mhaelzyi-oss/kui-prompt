import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setAdbRunner } from "./adb.js";
import {
  deleteForever,
  listHits,
  listLeftovers,
  leftoversFor,
  readTextFile,
  saveCopy,
  setAside,
  writeTextFile,
} from "./leftovers.js";
import {
  admit,
  classifyName,
  collapse,
  looksLikePackageName,
  packageNameOf,
  parseLs,
  parsePackages,
} from "../shared/leftovers-core.js";

const DEVICES = `List of devices attached
R58M36ABC              device product:oriole model:Pixel_6 transport_id:2
34120D7A8B9C           device product:panther model:Pixel_7 transport_id:3
UNAUTHORIZED99         unauthorized usb:1-2
`;

const DATA_LS = `./
../
com.example.old/
com.maps.live/
Cache/
.com.example.old/
.thumbnails/
`;

afterEach(() => setAdbRunner(null));

function fixture(extra?: (args: string[]) => { code: number; stdout: string; stderr: string } | null) {
  const log: string[] = [];
  setAdbRunner((args) => {
    log.push(args.join(" "));
    const hit = extra?.(args);
    if (hit) return hit;
    const key = args.join(" ");
    if (key === "devices -l") return { code: 0, stdout: DEVICES, stderr: "" };
    if (key.includes("pm list packages")) {
      const serial = args[1];
      const pkgs = serial === "34120D7A8B9C" ? "package:com.other.live\n" : "package:com.maps.live\npackage:com.android.systemui\n";
      return { code: 0, stdout: pkgs, stderr: "" };
    }
    if (key.includes("ls -1ap") && key.includes("Android/data")) return { code: 0, stdout: DATA_LS, stderr: "" };
    if (key.includes("ls -1ap") && key.includes("Android/obb")) {
      return { code: 0, stdout: args[1] === "34120D7A8B9C" ? "./\n../\ncom.old.game/\n" : "./\n../\n", stderr: "" };
    }
    if (key.includes("ls -1ap") && key.includes("Android/media")) {
      return { code: 0, stdout: "./\n../\n.com.example.old/\n", stderr: "" };
    }
    if (key.includes("ls -1ap") && key.includes("SetAside")) return { code: 0, stdout: "", stderr: "No such file or directory\n" };
    if (key.includes("ls -1ap") && key.includes("Copies")) return { code: 0, stdout: "", stderr: "No such file or directory\n" };
    if (key.includes("mkdir") || key.includes("mv ") || key.includes("rm -rf")) return { code: 0, stdout: "", stderr: "" };
    if (args.includes("pull") || args.includes("push")) return { code: 0, stdout: "1 file pulled", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  });
  return log;
}

describe("leftover names", () => {
  it("treats package ids and hidden .<package> as leftover when the app is gone", () => {
    expect(looksLikePackageName("com.example.old")).toBe(true);
    expect(looksLikePackageName("Cache")).toBe(false);
    expect(looksLikePackageName(".thumbnails")).toBe(false);
    expect(packageNameOf(".com.example.old")).toBe("com.example.old");
    const gone = new Set<string>();
    expect(classifyName("com.example.old", gone).kind).toBe("leftover");
    expect(classifyName(".com.example.old", gone).kind).toBe("leftover");
    expect(classifyName(".com.example.old", gone).reason).toMatch(/Hidden leftover/);
    expect(classifyName("com.maps.live", new Set(["com.maps.live"])).kind).toBe("still");
    expect(classifyName("Cache", gone).kind).toBe("unknown");
    expect(classifyName(".thumbnails", gone).kind).toBe("unknown");
  });

  it("parses hidden ls -1ap rows and pm packages", () => {
    const rows = parseLs(DATA_LS);
    expect(rows.map((r) => r.name)).toEqual([
      "com.example.old",
      "com.maps.live",
      "Cache",
      ".com.example.old",
      ".thumbnails",
    ]);
    expect(rows.find((r) => r.name === "com.example.old")?.directory).toBe(true);
    expect(parsePackages("package:com.maps.live\npackage:com.android.systemui\n")).toEqual([
      "com.maps.live",
      "com.android.systemui",
    ]);
  });
});

describe("path safety", () => {
  it("only admits leftover roots, set aside, and copies", () => {
    expect(admit("/storage/emulated/0/Android/data/com.example.old").root).toBe("data");
    expect(admit("/storage/emulated/0/KUIResiduals/SetAside/com.example.old/data").root).toBe("SetAside");
    expect(admit("/storage/emulated/0/KUIResiduals/Copies/note.txt").root).toBe("Copies");
    expect(() => admit("/data/data/com.example.old")).toThrow(/leftover|set aside|copies/i);
    expect(() => admit("/sdcard/DCIM")).toThrow(/leftover|set aside|copies/i);
    expect(() => admit("/storage/emulated/0/Android/data/../obb")).not.toThrow();
    expect(collapse("/storage/emulated/0/Android/data/foo/../com.example.old")).toBe(
      "/storage/emulated/0/Android/data/com.example.old",
    );
    expect(() => admit("/storage/emulated/0/Android/data/../../etc/passwd")).toThrow();
  });
});

describe("leftover actions", () => {
  it("lists leftovers on every ready phone and never marks Cache leftover", () => {
    fixture();
    const pixel = listHits("R58M36ABC");
    expect(pixel.find((i) => i.name === "com.example.old")?.kind).toBe("leftover");
    expect(pixel.find((i) => i.name === ".com.example.old")?.kind).toBe("leftover");
    expect(pixel.find((i) => i.name === "com.maps.live")?.kind).toBe("still");
    expect(pixel.find((i) => i.name === "Cache")?.kind).toBe("unknown");
    expect(pixel.find((i) => i.name === ".thumbnails")?.kind).toBe("unknown");
    expect(listLeftovers("R58M36ABC").every((i) => i.kind === "leftover")).toBe(true);
    const both = leftoversFor(["R58M36ABC", "34120D7A8B9C"]);
    expect(both.some((i) => i.serial === "R58M36ABC" && i.name === "com.example.old")).toBe(true);
    expect(both.some((i) => i.serial === "34120D7A8B9C")).toBe(true);
  });

  it("sets aside with mv, pulls a copy, and refuses delete until set aside", () => {
    const log = fixture();
    expect(listLeftovers("R58M36ABC").some((i) => i.name === "com.example.old")).toBe(true);
    const dest = setAside("R58M36ABC", "/storage/emulated/0/Android/data/com.example.old");
    expect(dest).toBe("/storage/emulated/0/KUIResiduals/SetAside/com.example.old/data");
    expect(log.some((line) => line.includes("ls -1ap"))).toBe(true);
    expect(log.some((line) => /mv '/.test(line) && line.includes("SetAside/com.example.old/data"))).toBe(true);
    expect(() => deleteForever("R58M36ABC", "/storage/emulated/0/Android/data/com.example.old")).toThrow(/set aside first/i);
    deleteForever("R58M36ABC", dest);
    expect(log.some((line) => line.includes("rm -rf") && line.includes("SetAside"))).toBe(true);
    const folder = mkdtempSync(join(tmpdir(), "kui-desk-copy-"));
    const copied = saveCopy("R58M36ABC", dest, folder);
    expect(copied).toMatch(/data/);
    expect(log.some((line) => line.includes("pull"))).toBe(true);
  });

  it("will not edit a folder still on the phone", () => {
    fixture((args) => {
      if (args.includes("pull") || args.includes("push")) return { code: 0, stdout: "", stderr: "" };
      return null;
    });
    expect(() => writeTextFile("R58M36ABC", "/storage/emulated/0/Android/data/com.maps.live/note.txt", "x")).toThrow(
      /still on the phone/i,
    );
    expect(() => readTextFile("R58M36ABC", "/storage/emulated/0/Android/data/Cache/notes.txt")).toThrow(/never leftover|not leftover/i);
  });
});
