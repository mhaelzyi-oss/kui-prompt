export type ProcessRow = {
  pid: number;
  name: string;
  path?: string;
  notResponding?: boolean;
};

export type HandleRow = {
  pid: number;
  type: string;
  name: string;
  value?: string;
};

export type WhoHasRow = {
  pid: number;
  name: string;
  type: string;
  object: string;
};

export type StackFrame = {
  module: string;
  symbol?: string;
  offset: string;
  english?: string;
};

export type ThreadStack = {
  tid: number;
  wait?: string;
  frames: StackFrame[];
};

export type HangNode = {
  kind: "thread" | "object";
  pid?: number;
  tid?: number;
  objectType?: string;
  objectName?: string;
  status?: string;
};

export type HangStory = {
  pid?: number;
  image?: string;
  waiterTid?: number;
  holderTid?: number;
  objectName?: string;
  objectType?: string;
  holderEnglish?: string;
  threadCount?: number;
  blockedCount?: number;
  idleCount?: number;
  live: boolean;
  nodes: HangNode[];
  handles: HandleRow[];
  stacks: ThreadStack[];
  notes: string[];
};

export type StatusInfo = {
  kind: "process" | "dump" | "phone" | "none";
  pid?: number;
  image?: string;
  path?: string;
  alive?: boolean;
  wow64?: boolean;
  threads?: number;
  notResponding?: boolean;
  user?: string;
  exception?: string;
  streams?: string[];
  lastRefusal?: string;
};

export type Subject =
  | { type: "none" }
  | { type: "process"; pid: number; name: string; path?: string }
  | { type: "dump"; path: string }
  | { type: "phone"; serial: string; model?: string; state?: string };

export type CommandResult = {
  ok: boolean;
  quit?: boolean;
  text: string;
  evidence?: string;
  refuse?: boolean;
};
