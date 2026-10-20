import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export const MUTEX_A = "Local\\KuiPromptHangA";
export const MUTEX_B = "Local\\KuiPromptHangB";

const workerPath = fileURLToPath(new URL("./hang-worker.mjs", import.meta.url));
const hostPath = fileURLToPath(new URL("./hang-host.mjs", import.meta.url));

export function startHangFixture(): Worker[] {
  return [
    new Worker(workerPath, { workerData: { first: MUTEX_A, second: MUTEX_B } }),
    new Worker(workerPath, { workerData: { first: MUTEX_B, second: MUTEX_A } }),
  ];
}

function waitForHangPid(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = "";
    const finish = (err: Error | null, pid?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(pid!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Hang fixture did not start."));
    }, 8000);
    child.stdout?.on("data", (chunk) => {
      buf += String(chunk);
      const m = buf.match(/KUI_PROMPT_HANG_PID=(\d+)/);
      if (m) finish(null, Number(m[1]));
    });
    child.stderr?.on("data", (chunk) => {
      buf += String(chunk);
    });
    child.on("error", (err) => finish(err));
    child.on("exit", (code) => {
      finish(new Error(`Hang fixture exited ${code ?? "?"}: ${buf}`));
    });
  });
}

export async function withHangFixture<T>(fn: (pid: number) => Promise<T>): Promise<T> {
  const child = spawn(process.execPath, [hostPath], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const pid = await waitForHangPid(child);
  try {
    return await fn(pid);
  } finally {
    child.kill();
  }
}

if (process.argv[1] && /hang\.(ts|js)$/.test(process.argv[1])) {
  startHangFixture();
  process.stdout.write(`KUI_PROMPT_HANG_PID=${process.pid}\n`);
  setInterval(() => undefined, 60_000);
}
