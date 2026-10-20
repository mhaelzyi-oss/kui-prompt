import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pairs = [
  ["src/main/preload.cjs", "dist/main/preload.cjs"],
  ["src/fixture/hang-worker.mjs", "dist/fixture/hang-worker.mjs"],
  ["src/fixture/hang-host.mjs", "dist/fixture/hang-host.mjs"],
];
for (const [from, to] of pairs) {
  const dest = join(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(root, from), dest);
}
