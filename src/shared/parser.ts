import { refuseLine } from "./refusals.js";
import { VERBS, type Verb } from "./verbs.js";

export type Parsed =
  | { kind: "empty" }
  | { kind: "refuse"; reason: string }
  | { kind: "unknown"; text: string }
  | { kind: "verb"; verb: Verb; args: string[] };

function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

export function parseLine(line: string): Parsed {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "empty" };
  const refused = refuseLine(trimmed);
  if (refused) return { kind: "refuse", reason: refused.reason };
  const [head, ...args] = tokenize(trimmed);
  const verb = (head ?? "").toLowerCase();
  if ((VERBS as readonly string[]).includes(verb)) return { kind: "verb", verb: verb as Verb, args };
  return { kind: "unknown", text: trimmed };
}
