export const VERBS = [
  "help",
  "list",
  "focus",
  "status",
  "handles",
  "who-has",
  "stacks",
  "dump",
  "hang",
  "report",
  "save",
  "quit",
] as const;

export type Verb = (typeof VERBS)[number];

export const VERB_HELP: Record<Verb, string> = {
  help: "Print these twelve verbs.",
  list: "PC processes and authorized phones.",
  focus: "focus <pid|name|file.dmp|serial|phone>",
  status: "Alive, dump, or phone facts.",
  handles: "Named handles, or phone files under /sdcard.",
  "who-has": "who-has <name> — who holds that object, or a phone file.",
  stacks: "Per-thread wait reason, or phone crash frames.",
  dump: "dump [path] | dump open <path> | dump <phone-path>",
  hang: "Wait-chain or phone ANR in English.",
  report: "Twelve-line story. On a phone, writes the agent packet.",
  save: "save <path> — write the transcript.",
  quit: "Exit cleanly.",
};
