export type Refusal = { reason: string };

const RULES: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(kernel(-mode)?|live\s+kernel|kd\b|windbg\s+kernel)\b/i,
    reason: "KUI Desk stays in user mode. It will not debug the kernel.",
  },
  {
    re: /\b(ttd|time[\s-]?travel)\b/i,
    reason: "Time travel is WinDbg's job. KUI Desk will not record or replay TTD.",
  },
  {
    re: /\b(decompile|decompiler|ghidra|ida(?:\s+pro)?)\b/i,
    reason: "KUI Desk does not decompile. Own dumps and attachable processes only.",
  },
  {
    re: /\b(reverse|reversing|disassembl)\b/i,
    reason: "It will not reverse an unknown binary. Open a dump you own, or focus a process Windows will open.",
  },
  {
    re: /\b(cheat|aimbot|trainer|wallhack)\b/i,
    reason: "No. This is not a cheat tool.",
  },
  {
    re: /\b(drm|bypass\s+license|crack\s+license)\b/i,
    reason: "No. It will not hunt DRM or bypass a license.",
  },
  {
    re: /\b(ppl|protected\s+process|csrss|lsass|smss|wininit|services\.exe)\b/i,
    reason: "It will not attach to protected or system-critical processes.",
  },
  {
    re: /\b(teach me windbg|windbg encyclopedia|win\s*dbg tutorial)\b|!analyze\b/i,
    reason: "Use help. This is not a WinDbg tutorial.",
  },
  {
    re: /\b(magisk|unlock\s+bootloader|bypass\s+frp|frp\s+bypass|factory\s+reset\s+bypass)\b/i,
    reason: "It will not root a phone or bypass a lock.",
  },
  {
    re: /\b(steal\s+(photos|files|phone)|other\s+people'?s\s+phone)\b/i,
    reason: "Authorized USB or wireless debugging on a phone you own. Nothing else.",
  },
];

export const FORBIDDEN_IMAGES = ["csrss.exe", "smss.exe", "wininit.exe", "services.exe", "lsass.exe"];

export function refuseLine(line: string): Refusal | null {
  const text = line.trim();
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.re.test(text)) return { reason: rule.reason };
  }
  return null;
}

export function isForbiddenImage(name: string): boolean {
  return FORBIDDEN_IMAGES.includes(name.toLowerCase());
}
