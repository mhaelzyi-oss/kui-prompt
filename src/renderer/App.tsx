import { useEffect, useMemo, useRef, useState } from "react";
import {
  canDeleteForever,
  canEdit,
  canSaveCopy,
  canSetAside,
  phoneWhy,
  setAsideDest,
  bucketOf,
  type PhoneChip,
  type PhoneItem,
} from "../shared/leftovers-core";
import { SAMPLE_HANG, SAMPLE_ITEMS, SAMPLE_NOTE, SAMPLE_PHONES } from "../shared/sample";
import { SPONSORS_URL, TIPS } from "../shared/tips";

type Result = { ok: boolean; quit?: boolean; text: string; evidence?: string; refuse?: boolean };
type View = "pc" | "phones" | "wall";
type PhoneTab = "leftovers" | "files" | "debug";
type DeskList = { ok: boolean; phones?: PhoneChip[]; note?: string; text?: string; preview?: boolean };
type DeskItems = { ok: boolean; items?: PhoneItem[]; text?: string };
type DeskText = { ok: boolean; text?: string; path?: string; evidence?: string };

declare global {
  interface Window {
    kui?: {
      run: (line: string) => Promise<Result>;
      open?: (url: string) => Promise<void> | void;
      listPhones?: () => Promise<DeskList>;
      leftovers?: (serials: string[]) => Promise<DeskItems>;
      files?: (serials: string[]) => Promise<DeskItems>;
      inside?: (serial: string, path: string) => Promise<DeskItems>;
      setAside?: (serial: string, path: string) => Promise<DeskText>;
      deleteForever?: (serial: string, path: string) => Promise<DeskText>;
      saveCopy?: (serial: string, path: string) => Promise<DeskText>;
      readFile?: (serial: string, path: string) => Promise<DeskText>;
      writeFile?: (serial: string, path: string, text: string) => Promise<DeskText>;
      hangPhone?: (serial: string) => Promise<DeskText>;
      reportPhone?: (serial: string) => Promise<DeskText>;
    };
  }
}

const INTRO = "Your app is stuck. list, then focus the name, then hang.";
const SAMPLE_PC_HANG = [
  "HANG pid 18432 ContosoApp.exe",
  "Waiter tid 21004 waits on Mutex \\Sessions\\1\\BaseNamedObjects\\Foo",
  "Holder tid 18812 owns that Mutex; stack in user32 message loop",
  "12 threads; 1 blocked; 11 idle",
  "Evidence: WCT + handle 0x1a4 + live process",
].join("\n");
const SAMPLE_EVIDENCE = ["thread 21004 -> Mutex Foo -> thread 18812", "Mutant  Foo"].join("\n");
const CHIPS = ["list", "focus", "hang", "dump open", "report", "help"] as const;
const TERMS_KEY = "kui-desk-terms";
const TERMS_TEXT = [
  "You own this PC and the phones you plug in. Leftover folders can be set aside, then deleted forever after two confirms.",
  "Save a copy puts files on this PC. Nothing is uploaded. Root is not required. No warranty (MIT).",
].join(" ");

function termsAccepted(): boolean {
  try {
    return localStorage.getItem(TERMS_KEY) === "1";
  } catch {
    return false;
  }
}

function livePhones(): boolean {
  return typeof window !== "undefined" && typeof window.kui?.listPhones === "function";
}

function openSponsors(): void {
  const open = window.kui?.open;
  if (open) {
    void open(SPONSORS_URL);
    return;
  }
  window.open(SPONSORS_URL, "_blank", "noopener");
}

function phoneLabel(row: PhoneChip): string {
  return row.model ?? row.product ?? row.serial;
}

function cloneItems(): PhoneItem[] {
  return SAMPLE_ITEMS.map((item) => ({ ...item }));
}

export function App() {
  const [hash, setHash] = useState(() => (typeof location === "undefined" ? "" : `${location.hash}${location.search}`));
  const [accepted, setAccepted] = useState(() => {
    if (typeof location !== "undefined" && /both/.test(`${location.hash}${location.search}`)) return true;
    return termsAccepted();
  });

  useEffect(() => {
    const sync = () => setHash(`${location.hash}${location.search}`);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const gallery = /both/.test(hash);
  const view: View = /tips|wall/.test(hash) ? "wall" : /phones/.test(hash) ? "phones" : "pc";

  function show(next: View) {
    location.hash = next === "wall" ? "tips" : next === "phones" ? "phones" : "prompt";
    setHash(location.hash);
  }

  if (gallery) {
    return (
      <div className="gallery">
        <figure>
          <figcaption>User viewpoint</figcaption>
          <div className="frame">
            <div className="shell">
              <Header view="pc" />
              <Desk sample />
            </div>
          </div>
        </figure>
        <figure>
          <figcaption>Payment wall</figcaption>
          <div className="frame">
            <div className="shell">
              <Header view="wall" />
              <Wall />
            </div>
          </div>
        </figure>
      </div>
    );
  }

  return (
    <div className="shell">
      <Header view={view} onView={show} />
      {view === "wall" ? <Wall /> : view === "phones" ? <PhonesDesk /> : <Desk />}
      {!accepted && (
        <Terms
          onAccept={() => {
            try {
              localStorage.setItem(TERMS_KEY, "1");
            } catch {
              /* preview without storage still continues */
            }
            setAccepted(true);
          }}
        />
      )}
    </div>
  );
}

function Terms({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="terms" role="dialog" aria-labelledby="terms-title" aria-modal="true">
      <article>
        <h1 id="terms-title">Before you start</h1>
        <p>{TERMS_TEXT}</p>
        <button type="button" onClick={onAccept}>
          I understand
        </button>
      </article>
    </div>
  );
}

function Header({ view, onView }: { view: View; onView?: (view: View) => void }) {
  return (
    <header>
      <strong>KUI Desk</strong>
      <nav>
        <button type="button" className={view === "pc" ? "on" : undefined} onClick={() => onView?.("pc")}>
          This PC
        </button>
        <button type="button" className={view === "phones" ? "on" : undefined} onClick={() => onView?.("phones")}>
          Phones
        </button>
        <button type="button" className={view === "wall" ? "on" : undefined} onClick={() => onView?.("wall")}>
          Tips
        </button>
      </nav>
      <span>Krypton Ultimate Inc II</span>
    </header>
  );
}

function Desk({ sample = false }: { sample?: boolean }) {
  const [line, setLine] = useState("");
  const [log, setLog] = useState<string[]>(sample ? [INTRO, SAMPLE_PC_HANG] : [INTRO]);
  const [evidence, setEvidence] = useState(sample ? SAMPLE_EVIDENCE : "Evidence appears here.");
  const [transcript, setTranscript] = useState<string[]>(sample ? ["> hang", SAMPLE_PC_HANG] : []);
  const input = useRef<HTMLInputElement>(null);
  const logEl = useRef<HTMLPreElement>(null);
  const evidenceEl = useRef<HTMLPreElement>(null);
  const transcriptEl = useRef<HTMLPreElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    logEl.current?.scrollTo(0, logEl.current.scrollHeight);
  }, [log]);
  useEffect(() => {
    evidenceEl.current?.scrollTo(0, evidenceEl.current.scrollHeight);
  }, [evidence]);
  useEffect(() => {
    transcriptEl.current?.scrollTo(0, transcriptEl.current.scrollHeight);
  }, [transcript]);

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text) return;
    setLine("");
    setTranscript((t) => [...t, `> ${text}`]);
    const run = window.kui?.run;
    if (!run) {
      if (text === "hang" || text === "report") {
        setLog((l) => [...l, SAMPLE_PC_HANG]);
        setEvidence(SAMPLE_EVIDENCE);
        setTranscript((t) => [...t, SAMPLE_PC_HANG]);
        return;
      }
      if (text === "help") {
        const help = "help, list, focus, hang, dump, report. Tips is the wall, not a verb. Phones is the other tab.";
        setLog((l) => [...l, help]);
        setTranscript((t) => [...t, help]);
        return;
      }
      setLog((l) => [...l, "This preview has no live process. Use npm start, or npm run preview."]);
      return;
    }
    const result = await run(text);
    if (result.text) {
      setLog((l) => [...l, result.text]);
      setTranscript((t) => [...t, result.text]);
    }
    if (result.evidence) setEvidence(result.evidence);
    if (result.quit) window.close();
  }

  return (
    <main>
      <section className="repl">
        <p className="lede">A hang or crash dump on this PC. English plus evidence. Nothing is uploaded.</p>
        <div className="chips">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="chip"
              onClick={() => {
                if (chip === "focus" || chip === "dump open") {
                  setLine(`${chip} `);
                  input.current?.focus();
                  return;
                }
                void submit(chip);
              }}
            >
              {chip}
            </button>
          ))}
        </div>
        <pre ref={logEl}>{log.join("\n\n")}</pre>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(line);
          }}
        >
          <label>
            <span>&gt;</span>
            <input
              ref={input}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Command"
              placeholder="list"
            />
          </label>
        </form>
      </section>
      <section className="side">
        <article>
          <h2>Evidence</h2>
          <pre ref={evidenceEl}>{evidence}</pre>
        </article>
        <article>
          <h2>Transcript</h2>
          <pre ref={transcriptEl}>{transcript.join("\n")}</pre>
        </article>
      </section>
    </main>
  );
}

function PhonesDesk() {
  const [phones, setPhones] = useState<PhoneChip[]>(() => (livePhones() ? [] : SAMPLE_PHONES));
  const [selected, setSelected] = useState<string[]>(() =>
    livePhones() ? [] : SAMPLE_PHONES.filter((p) => p.state === "device").map((p) => p.serial),
  );
  const [items, setItems] = useState<PhoneItem[]>(() => (livePhones() ? [] : cloneItems()));
  const [localItems, setLocalItems] = useState<PhoneItem[]>(cloneItems());
  const [localFiles, setLocalFiles] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<PhoneTab>("leftovers");
  const [note, setNote] = useState("Plug in phones you own. Actions apply to each selected ready phone.");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PhoneItem | null>(null);
  const [confirm, setConfirm] = useState<PhoneItem | null>(null);
  const [confirmStep, setConfirmStep] = useState(0);
  const [editor, setEditor] = useState<{ item: PhoneItem; text: string } | null>(null);
  const [debugText, setDebugText] = useState("Crashes and freezes on the phones you select.");

  const ready = useMemo(() => phones.filter((p) => p.state === "device"), [phones]);
  const chosen = useMemo(() => selected.filter((serial) => ready.some((p) => p.serial === serial)), [selected, ready]);

  const shown = useMemo(() => {
    const pool = livePhones() ? items : localItems;
    const scoped = pool.filter((item) => chosen.includes(item.serial));
    if (tab === "leftovers") return scoped.filter((item) => item.kind === "leftover" || item.kind === "set-aside");
    return scoped;
  }, [items, localItems, chosen, tab]);

  async function refreshPhones() {
    setBusy(true);
    try {
      if (!livePhones()) {
        setPhones(SAMPLE_PHONES);
        setSelected(SAMPLE_PHONES.filter((p) => p.state === "device").map((p) => p.serial));
        setNote("Preview phones (Pixel 6 and Pixel 7). Plug in a real phone after USB debugging to use adb.");
        return;
      }
      const result = await window.kui!.listPhones!();
      if (!result.ok) {
        setNote(result.text || "Could not list phones.");
        return;
      }
      const rows = result.phones ?? [];
      setPhones(rows);
      setSelected((cur) => {
        const keep = cur.filter((serial) => rows.some((p) => p.serial === serial && p.state === "device"));
        if (keep.length) return keep;
        return rows.filter((p) => p.state === "device").map((p) => p.serial);
      });
      setNote(result.note || (rows.length ? `${rows.length} phone(s) on the cable.` : "None authorized. Plug the cable and accept the RSA prompt."));
    } finally {
      setBusy(false);
    }
  }

  async function refreshItems(serials = chosen) {
    if (!serials.length) {
      setItems([]);
      return;
    }
    if (!livePhones()) return;
    setBusy(true);
    try {
      const call = tab === "files" ? window.kui!.files! : window.kui!.leftovers!;
      const result = await call(serials);
      if (!result.ok) {
        setNote(result.text || "Could not look on those phones.");
        return;
      }
      setItems(result.items ?? []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshPhones();
    // first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.join(","), tab]);

  function togglePhone(row: PhoneChip) {
    const why = phoneWhy(row);
    if (why) {
      setNote(why);
      return;
    }
    setSelected((cur) => (cur.includes(row.serial) ? cur.filter((s) => s !== row.serial) : [...cur, row.serial]));
  }

  function noReadyWhy(): string {
    if (!phones.length) return "Plug the cable and accept the RSA prompt.";
    if (!ready.length) return "No ready phone. Accept the RSA prompt on the phone.";
    if (!chosen.length) return "Select a ready phone first.";
    return "";
  }

  async function act(label: string, item: PhoneItem, fn: () => Promise<DeskText | void> | DeskText | void) {
    setBusy(true);
    try {
      const result = await fn();
      if (result && "ok" in result && result.ok === false) {
        setNote(result.text || `Could not ${label}.`);
        return;
      }
      if (result && "text" in result && result.text) setNote(result.text);
      else setNote(`${label} on ${phoneLabel(phones.find((p) => p.serial === item.serial) ?? { serial: item.serial, state: "device" })}.`);
      setPicked(item);
      await refreshItems();
    } finally {
      setBusy(false);
    }
  }

  function localSetAside(item: PhoneItem): DeskText {
    const allowed = canSetAside(item);
    if (!allowed.ok) return { ok: false, text: allowed.why };
    const bucket = bucketOf(item.root);
    if (!bucket || !item.packageName) return { ok: false, text: "Set aside is for leftover folders still on the phone." };
    const dest = setAsideDest(item.packageName, bucket);
    setLocalItems((cur) =>
      cur.map((row) =>
        row.serial === item.serial && row.path === item.path
          ? { ...row, path: dest, root: "SetAside", kind: "set-aside", name: bucket, reason: "Set aside." }
          : row,
      ),
    );
    return { ok: true, text: `Set aside ${dest}`, path: dest };
  }

  function localDelete(item: PhoneItem): DeskText {
    const allowed = canDeleteForever(item);
    if (!allowed.ok) return { ok: false, text: allowed.why };
    setLocalItems((cur) => cur.filter((row) => row.serial !== item.serial || (row.path !== item.path && !row.path.startsWith(`${item.path}/`))));
    return { ok: true, text: `Deleted forever ${item.path}` };
  }

  function localSave(item: PhoneItem): DeskText {
    const allowed = canSaveCopy(item);
    if (!allowed.ok) return { ok: false, text: allowed.why };
    const dest = `kui-desk-copies\\${item.name}`;
    setLocalItems((cur) => [
      ...cur,
      {
        ...item,
        path: `/storage/emulated/0/KUIResiduals/Copies/${item.name}`,
        root: "Copies",
        kind: "copy",
        reason: "A copy on the phone.",
      },
    ]);
    return { ok: true, text: `Saved a copy on this PC: ${dest}`, path: dest };
  }

  async function onSetAside(item: PhoneItem) {
    await act("Set aside", item, () => (livePhones() ? window.kui!.setAside!(item.serial, item.path) : localSetAside(item)));
  }

  async function onSaveCopy(item: PhoneItem) {
    await act("Save a copy", item, () => (livePhones() ? window.kui!.saveCopy!(item.serial, item.path) : localSave(item)));
  }

  async function onLookInside(item: PhoneItem) {
    if (!item.directory) {
      setNote("Pick a folder to look inside.");
      return;
    }
    if (livePhones() && window.kui?.inside) {
      setBusy(true);
      try {
        const result = await window.kui.inside(item.serial, item.path);
        if (!result.ok) {
          setNote(result.text || "Could not look inside.");
          return;
        }
        const kids = result.items ?? [];
        setItems((cur) => [...cur.filter((row) => !row.path.startsWith(`${item.path}/`)), ...kids]);
        setNote(kids.length ? `${kids.length} inside ${item.name}.` : "Nothing inside.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const kids = localItems.filter((row) => row.serial === item.serial && row.path.startsWith(`${item.path}/`));
    setNote(kids.length ? `${kids.length} inside ${item.name}.` : "Nothing inside.");
  }

  async function onEdit(item: PhoneItem) {
    const allowed = canEdit(item);
    if (!allowed.ok) {
      setNote(allowed.why || "Cannot edit.");
      return;
    }
    if (livePhones() && window.kui?.readFile) {
      setBusy(true);
      try {
        const result = await window.kui.readFile(item.serial, item.path);
        if (!result.ok) {
          setNote(result.text || "Could not read.");
          return;
        }
        setEditor({ item, text: result.text ?? "" });
      } finally {
        setBusy(false);
      }
      return;
    }
    setEditor({ item, text: localFiles[`${item.serial}:${item.path}`] ?? SAMPLE_NOTE });
  }

  async function saveEditor() {
    if (!editor) return;
    if (livePhones() && window.kui?.writeFile) {
      const result = await window.kui.writeFile(editor.item.serial, editor.item.path, editor.text);
      setNote(result.text || (result.ok ? `Wrote ${editor.item.path}` : "Could not write."));
    } else {
      setLocalFiles((cur) => ({ ...cur, [`${editor.item.serial}:${editor.item.path}`]: editor.text }));
      setNote(`Wrote ${editor.item.path}`);
    }
    setEditor(null);
  }

  async function onHang() {
    const why = noReadyWhy();
    if (why) {
      setNote(why);
      return;
    }
    const lines: string[] = [];
    for (const serial of chosen) {
      if (livePhones() && window.kui?.hangPhone) {
        const result = await window.kui.hangPhone(serial);
        lines.push(result.text || result.evidence || "No crash in view.");
      } else {
        const row = phones.find((p) => p.serial === serial);
        lines.push(SAMPLE_HANG.replace("Pixel 6", phoneLabel(row ?? { serial, state: "device" })));
      }
    }
    setDebugText(lines.join("\n\n"));
    setNote("Hang on each selected ready phone. Nothing was uploaded.");
  }

  async function onReport() {
    const why = noReadyWhy();
    if (why) {
      setNote(why);
      return;
    }
    const lines: string[] = [];
    for (const serial of chosen) {
      if (livePhones() && window.kui?.reportPhone) {
        const result = await window.kui.reportPhone(serial);
        lines.push(result.text || "Agent packet written.");
      } else {
        lines.push(`# KUI Desk agent packet\n\n${SAMPLE_HANG}\n\nAuthorized phone only. Nothing was uploaded.`);
      }
    }
    setDebugText(lines.join("\n\n"));
    setNote("Agent packet for each selected ready phone. Nothing was uploaded.");
  }

  const blocked = noReadyWhy();

  return (
    <section className="phones">
      <p className="lede">This computer and the phones you plug in. Leftovers first. Nothing is uploaded.</p>
      <div className="phone-chips">
        {phones.length ? (
          phones.map((row) => {
            const why = phoneWhy(row);
            const on = chosen.includes(row.serial);
            return (
              <button
                key={row.serial}
                type="button"
                className={`chip phone-chip${on ? " on" : ""}`}
                onClick={() => togglePhone(row)}
                title={why ?? row.serial}
              >
                {phoneLabel(row)}
                <small>{why ?? row.serial}</small>
              </button>
            );
          })
        ) : (
          <button type="button" className="chip" onClick={() => void refreshPhones()}>
            No phones yet
            <small>Plug the cable and accept the RSA prompt.</small>
          </button>
        )}
        <button type="button" className="chip" onClick={() => void refreshPhones()} disabled={busy} title={busy ? "Looking…" : "Look again"}>
          Look again
        </button>
      </div>
      <p className="status-line">{note}</p>
      <div className="subtabs">
        <button type="button" className={tab === "leftovers" ? "on" : undefined} onClick={() => setTab("leftovers")}>
          Leftovers
        </button>
        <button type="button" className={tab === "files" ? "on" : undefined} onClick={() => setTab("files")}>
          Files
        </button>
        <button type="button" className={tab === "debug" ? "on" : undefined} onClick={() => setTab("debug")}>
          Debug
        </button>
      </div>
      {tab === "debug" ? (
        <div className="debug-pane">
          <div className="item-actions">
            <ActionButton label="Hang" why={blocked} disabled={Boolean(blocked) || busy} onClick={() => void onHang()} />
            <ActionButton label="Report" why={blocked} disabled={Boolean(blocked) || busy} onClick={() => void onReport()} />
          </div>
          <pre>{debugText}</pre>
        </div>
      ) : (
        <div className="items">
          {blocked ? <p className="empty">{blocked}</p> : null}
          {!blocked && !shown.length ? (
            <p className="empty">{tab === "leftovers" ? "No leftover folders on the selected phones." : "No files in view on the selected phones."}</p>
          ) : null}
          {shown.map((item) => {
            const aside = canSetAside(item);
            const copy = canSaveCopy(item);
            const forever = canDeleteForever(item);
            const edit = canEdit(item);
            return (
              <article
                key={`${item.serial}:${item.path}`}
                className={`item${picked?.path === item.path && picked.serial === item.serial ? " picked" : ""}`}
              >
                <p className="kicker">
                  {phoneLabel(phones.find((p) => p.serial === item.serial) ?? { serial: item.serial, state: "device" })} · {item.root}
                  {item.hidden ? " · hidden leftover" : item.kind === "leftover" ? " · leftover" : item.kind === "still" ? " · still on the phone" : item.kind === "set-aside" ? " · set aside" : item.kind === "copy" ? " · copy" : " · not an app"}
                </p>
                <b>{item.name}</b>
                <span>{item.reason}</span>
                <code>{item.path}</code>
                <div className="item-actions">
                  <ActionButton label="Set aside" why={aside.why} disabled={!aside.ok || busy} onClick={() => void onSetAside(item)} />
                  <ActionButton
                    label="Save a copy"
                    why={copy.why}
                    disabled={!copy.ok || busy}
                    caution
                    onClick={() => void onSaveCopy(item)}
                  />
                  <ActionButton
                    label="Delete forever"
                    why={forever.why}
                    disabled={!forever.ok || busy}
                    caution
                    onClick={() => {
                      setConfirm(item);
                      setConfirmStep(0);
                    }}
                  />
                  <ActionButton label="Edit" why={edit.why} disabled={!edit.ok || busy} onClick={() => void onEdit(item)} />
                  <ActionButton
                    label="Look inside"
                    why={item.directory ? undefined : "Pick a folder to look inside."}
                    disabled={!item.directory || busy}
                    onClick={() => void onLookInside(item)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
      {confirm && (
        <div className="terms" role="dialog" aria-labelledby="delete-title" aria-modal="true">
          <article>
            <h1 id="delete-title">Delete forever</h1>
            <p>Two confirms. This cannot be undone. {confirm.path} will be removed from the phone.</p>
            <div className="item-actions">
              <button
                type="button"
                className="caution"
                onClick={() => {
                  if (confirmStep < 1) {
                    setConfirmStep(1);
                    return;
                  }
                  const item = confirm;
                  setConfirm(null);
                  setConfirmStep(0);
                  void act("Delete forever", item, () =>
                    livePhones() ? window.kui!.deleteForever!(item.serial, item.path) : localDelete(item),
                  );
                }}
              >
                {confirmStep < 1 ? "Delete forever" : "Yes, delete forever"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  setConfirmStep(0);
                }}
              >
                Keep it
              </button>
            </div>
          </article>
        </div>
      )}
      {editor && (
        <div className="terms" role="dialog" aria-labelledby="edit-title" aria-modal="true">
          <article className="editor">
            <h1 id="edit-title">Edit</h1>
            <p>{editor.item.path}</p>
            <textarea value={editor.text} onChange={(e) => setEditor({ ...editor, text: e.target.value })} spellCheck={false} />
            <div className="item-actions">
              <button type="button" onClick={() => void saveEditor()}>
                Write back
              </button>
              <button type="button" onClick={() => setEditor(null)}>
                Keep original
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  label,
  why,
  disabled,
  caution,
  onClick,
}: {
  label: string;
  why?: string;
  disabled?: boolean;
  caution?: boolean;
  onClick: () => void;
}) {
  return (
    <span className="action">
      <button type="button" className={caution ? "caution" : undefined} disabled={disabled} title={disabled ? why : label} onClick={onClick}>
        {label}
      </button>
      {disabled && why ? <small className="why">{why}</small> : null}
    </span>
  );
}

function Wall() {
  return (
    <section className="wall" aria-label="Payment wall">
      <p className="lede">Hang, leftovers, and report stay free. A thank-you is optional.</p>
      <h1>Tips</h1>
      <p>GitHub Sponsors. There is no cart, no card form, and no paid debugger SKU.</p>
      <div className="amounts">
        {TIPS.map((tip) => (
          <a
            key={tip.amount}
            className="amount"
            href={SPONSORS_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (window.kui?.open) {
                e.preventDefault();
                openSponsors();
              }
            }}
          >
            <strong>{`$${tip.amount}`}</strong>
            <span>{tip.label}</span>
          </a>
        ))}
      </div>
      <article className="sku">
        <h2>Paid debugger</h2>
        <p>Not for sale. Kernel, time travel, and decompilers stay refused even if someone tips.</p>
      </article>
    </section>
  );
}
