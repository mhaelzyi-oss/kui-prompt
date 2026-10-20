import { createRequire } from "node:module";

export type KoffiLib = {
  load: (name: string) => {
    func: (...args: unknown[]) => (...args: unknown[]) => unknown;
  };
  struct: (name: string, fields: Record<string, string>) => unknown;
  pointer: (name?: string, type?: unknown) => unknown;
  proto: (definition: string) => unknown;
  register: (callback: (...args: unknown[]) => unknown, type: unknown) => unknown;
  unregister: (callback: unknown) => void;
};

let cached: KoffiLib | null | undefined;

export function koffi(): KoffiLib | null {
  if (cached !== undefined) return cached;
  if (process.platform !== "win32") {
    cached = null;
    return cached;
  }
  try {
    cached = createRequire(import.meta.url)("koffi") as KoffiLib;
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}
