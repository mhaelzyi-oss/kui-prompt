import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const workerPath = fileURLToPath(new URL("./hang-worker.mjs", import.meta.url));
const MUTEX_A = "Local\\KuiPromptHangA";
const MUTEX_B = "Local\\KuiPromptHangB";

new Worker(workerPath, { workerData: { first: MUTEX_A, second: MUTEX_B } });
new Worker(workerPath, { workerData: { first: MUTEX_B, second: MUTEX_A } });
process.stdout.write(`KUI_PROMPT_HANG_PID=${process.pid}\n`);
setInterval(() => undefined, 60_000);
