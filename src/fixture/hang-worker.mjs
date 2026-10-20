import { createRequire } from "node:module";
import { workerData } from "node:worker_threads";

const koffi = createRequire(import.meta.url)("koffi");
const k = koffi.load("kernel32.dll");
const CreateMutexW = k.func("void * __stdcall CreateMutexW(void *sa, int owned, str16 name)");
const WaitForSingleObject = k.func("uint32 __stdcall WaitForSingleObject(void *h, uint32 ms)");
const Sleep = k.func("void __stdcall Sleep(uint32 ms)");

CreateMutexW(null, 1, workerData.first);
Sleep(400);
WaitForSingleObject(CreateMutexW(null, 0, workerData.second), 0xffffffff);
