#!/usr/bin/env node
import { createInterface } from "node:readline";
import { Session } from "../engine/session.js";

if (process.platform !== "win32") {
  process.stderr.write("KUI Desk runs on Windows.\n");
  process.exit(1);
}

function print(result: { text: string; evidence?: string }): void {
  if (result.text) process.stdout.write(`${result.text}\n`);
}

async function oneshot(args: string[]): Promise<number> {
  const session = new Session();
  const result = session.run(args.join(" "));
  print(result);
  return result.ok || result.quit ? 0 : 1;
}

async function repl(): Promise<number> {
  const session = new Session();
  process.stdout.write("KUI Desk\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();
  for await (const line of rl) {
    const result = session.run(line);
    print(result);
    if (result.quit) {
      rl.close();
      return 0;
    }
    rl.prompt();
  }
  return 0;
}

const args = process.argv.slice(2);
if (args[0] === "--window") {
  const { spawn } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const electron = createRequire(import.meta.url)("electron") as string;
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const child = spawn(electron, ["."], { stdio: "inherit", cwd: root, shell: false });
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (args.length) {
  process.exit(await oneshot(args));
} else {
  process.exit(await repl());
}
