import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type ClassType = "THEORY" | "LAB";

type SlotDef = {
  id: string;       // stable id (π.χ. "09-11" ή random)
  start: string;    // "09:00"
  end: string;      // "11:00"
  label: string;    // "09:00–11:00"
};

type Entry = {
  id: string;
  title: string;
  day: Day;
  slotId: string;   // αντί για παλιό Slot union
  classType: ClassType; // Θ ή Ε
  room: string;
  professors: string;
  courseUrl: string;
  createdAt: number;
};

type CourseGroup = {
  title: string;
  professors: string;
  courseUrl: string;
  sessions: Entry[];
};

const DAYS: { key: Day; label: string }[] = [
  { key: "Mon", label: "Δευτέρα" },
  { key: "Tue", label: "Τρίτη" },
  { key: "Wed", label: "Τετάρτη" },
  { key: "Thu", label: "Πέμπτη" },
  { key: "Fri", label: "Παρασκευή" },
];

const DEFAULT_SLOTS: SlotDef[] = [
  { id: "09-11", start: "09:00", end: "11:00", label: "09:00–11:00" },
  { id: "11-13", start: "11:00", end: "13:00", label: "11:00–13:00" },
  { id: "14-16", start: "14:00", end: "16:00", label: "14:00–16:00" },
  { id: "16-18", start: "16:00", end: "18:00", label: "16:00–18:00" },
];

const ENTRIES_KEY = "uni-schedule:v2";
const SLOTS_KEY = "uni-schedule:slots:v1";

function uid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function dayLabel(d: Day) {
  return DAYS.find(x => x.key === d)?.label ?? d;
}

function typeShort(t: ClassType) {
  return t === "THEORY" ? "Θ" : "Ε";
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isHHMM(x: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
}

function normalizeSlots(raw: any): SlotDef[] {
  if (!Array.isArray(raw)) return [];
  const out: SlotDef[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const id = typeof x.id === "string" ? x.id : "";
    const start = typeof x.start === "string" ? x.start : "";
    const end = typeof x.end === "string" ? x.end : "";
    const label = typeof x.label === "string" ? x.label : "";
    if (!id || !isHHMM(start) || !isHHMM(end)) continue;
    out.push({ id, start, end, label: label || `${start}–${end}` });
  }
  return out;
}

function loadSlotsFromStorage(): { slots: SlotDef[]; isFirstTime: boolean } {
  const raw = localStorage.getItem(SLOTS_KEY);
  if (!raw) return { slots: DEFAULT_SLOTS, isFirstTime: true };

  try {
    const parsed = JSON.parse(raw);
    const slots = normalizeSlots(parsed);
    if (slots.length === 0) return { slots: DEFAULT_SLOTS, isFirstTime: true };
    return { slots, isFirstTime: false };
  } catch {
    return { slots: DEFAULT_SLOTS, isFirstTime: true };
  }
}

/**
 * Backward compatibility:
 * - παλιές εκδόσεις μπορεί να είχαν key ENTRIES_KEY = "uni-schedule:v1" ή slot πεδίο "slot"
 */
function loadEntriesFromStorage(): Entry[] {
  const candidates = [ENTRIES_KEY, "uni-schedule:v1"];
  for (const key of candidates) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) continue;

      const entries: Entry[] = [];
      for (const x of data) {
        if (!x || typeof x !== "object") continue;

        const id = typeof x.id === "string" ? x.id : "";
        const title = typeof x.title === "string" ? x.title : "";
        const day = typeof x.day === "string" ? (x.day as Day) : "";
        const classType = typeof x.classType === "string" ? (x.classType as ClassType) : "THEORY";

        // old: x.slot , new: x.slotId
        const slotId =
          typeof (x as any).slotId === "string"
            ? (x as any).slotId
            : (typeof (x as any).slot === "string" ? (x as any).slot : "");

        const room = typeof x.room === "string" ? x.room : "";
        const professors = typeof x.professors === "string" ? x.professors : "";
        const courseUrl = typeof x.courseUrl === "string" ? x.courseUrl : "";
        const createdAt = typeof x.createdAt === "number" ? x.createdAt : Date.now();

        if (!id || !title || !slotId) continue;
        if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day)) continue;
        if (!["THEORY", "LAB"].includes(classType)) continue;

        entries.push({ id, title, day, slotId, classType, room, professors, courseUrl, createdAt });
      }

      // migrate to v2
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
      return entries;
    } catch {
      // try next key
    }
  }
  return [];
}

function slotLabel(slotId: string, slots: SlotDef[]) {
  return slots.find(s => s.id === slotId)?.label ?? slotId;
}

function buildSlotIndex(slots: SlotDef[]) {
  const idx = new Map<string, number>();
  slots.forEach((s, i) => idx.set(s.id, i));
  return idx;
}

function groupEntries(entries: Entry[], slots: SlotDef[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();
  const slotIdx = buildSlotIndex(slots);
  const dayOrder = (d: Day) => DAYS.findIndex(x => x.key === d);
  const slotOrder = (slotId: string) => slotIdx.get(slotId) ?? 9999;

  for (const e of entries) {
    const key = e.title.trim();
    if (!key) continue;

    if (!map.has(key)) map.set(key, { title: key, professors: "", courseUrl: "", sessions: [] });

    const g = map.get(key)!;
    g.sessions.push(e);

    if (!g.professors && e.professors?.trim()) g.professors = e.professors.trim();
    if (!g.courseUrl && e.courseUrl?.trim()) g.courseUrl = e.courseUrl.trim();
  }

  for (const g of map.values()) {
    g.sessions.sort((a, b) => {
      const dd = dayOrder(a.day) - dayOrder(b.day);
      if (dd !== 0) return dd;
      return slotOrder(a.slotId) - slotOrder(b.slotId);
    });
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

function buildExportHtml(entries: Entry[], slots: SlotDef[]) {
  const byKey = new Map<string, Entry>();
  for (const e of entries) byKey.set(`${e.day}__${e.slotId}`, e);

  const tableRows = slots.map(slot => {
    const cells = DAYS.map(day => {
      const e = byKey.get(`${day.key}__${slot.id}`);
      if (!e) return `<td class="cell empty"></td>`;
      return `
        <td class="cell">
          <div class="cellTitle">${escapeHtml(e.title)}</div>
          <div class="cellMeta">
            <span class="badge">${typeShort(e.classType)}</span>
            <span class="room">${escapeHtml(e.room || "-")}</span>
          </div>
        </td>
      `;
    }).join("");

    return `
      <tr>
        <th class="rowHead">${escapeHtml(slot.label)}</th>
        ${cells}
      </tr>
    `;
  }).join("");

  const groups = groupEntries(entries, slots);

  const listItems = groups.map(g => {
    const urlPart = g.courseUrl
      ? `<a href="${escapeHtml(g.courseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(g.courseUrl)}</a>`
      : `<span class="muted">—</span>`;

    const profPart = g.professors?.trim() ? escapeHtml(g.professors) : "—";

    const sessionsHtml = g.sessions.map(s => `
      <div class="sessionRow">
        <span>${escapeHtml(dayLabel(s.day))} — ${escapeHtml(slotLabel(s.slotId, slots))}</span>
        <span class="badge">${typeShort(s.classType)}</span>
        <span class="room">${escapeHtml(s.room || "—")}</span>
      </div>
    `).join("");

    return `
      <li class="li">
        <div class="liTitle">${escapeHtml(g.title)}</div>
        <div class="liMeta"><b>Καθηγητές:</b> ${profPart}</div>
        <div class="liMeta"><b>Σελίδα μαθήματος:</b> ${urlPart}</div>
        <div class="liMeta"><b>Ώρες/slots:</b></div>
        ${sessionsHtml}
      </li>
    `;
  }).join("");

  const now = new Date().toLocaleString("el-GR");

  // Rock/dark export (με καθαρό print)
  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Εβδομαδιαίο Πρόγραμμα</title>
  <style>
    :root{
      color-scheme: dark;
      --bg0:#05070b;
      --bg1:#0b1020;
      --text:#e5e7eb;
      --muted:#94a3b8;
      --border: rgba(255,255,255,.10);
      --blue:#22d3ee;
      --shadow: 0 14px 42px rgba(0,0,0,.60);
    }
    body{
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
      margin:24px;
      color:var(--text);
      background:
        radial-gradient(900px 520px at 10% 0%, rgba(124,58,237,.22), transparent 58%),
        radial-gradient(780px 480px at 90% 10%, rgba(255,45,85,.18), transparent 58%),
        radial-gradient(920px 640px at 50% 120%, rgba(34,211,238,.10), transparent 58%),
        linear-gradient(180deg, var(--bg0), var(--bg1));
    }
    .wrap{max-width:1100px; margin:0 auto;}
    h1{margin:0 0 6px; font-size:22px; letter-spacing:.3px;}
    .sub{color:var(--muted); margin-bottom:14px; font-size:13px;}
    table{width:100%; border-collapse:separate; border-spacing:10px; table-layout:fixed;}
    th, td{vertical-align:top;}
    .colHead{font-size:12.5px; color:var(--muted); text-align:left; padding-left:4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .rowHead{font-size:12px; color:var(--muted); text-align:right; padding-right:6px; width:140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .cell{background: rgba(8,12,22,.78); border:1px solid var(--border); border-radius:16px; padding:10px; min-height:68px; box-shadow: var(--shadow);}
    .empty{background: rgba(8,12,22,.35); border:1px dashed rgba(148,163,184,.25); box-shadow:none;}
    .cellTitle{font-weight:900; font-size:13px; margin-bottom:6px; letter-spacing:.2px;}
    .cellMeta{display:flex; gap:8px; align-items:center; font-size:12px; color:#cbd5e1;}
    .badge{display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(15,23,42,.75); font-weight:950; font-size:12px;}
    .room{opacity:.9;}
    hr{border:none; border-top:1px solid rgba(255,255,255,.10); margin:18px 0;}
    ul{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;}
    .li{background: rgba(8,12,22,.68); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow: var(--shadow);}
    .liTitle{font-weight:950; margin-bottom:6px; letter-spacing:.2px;}
    .liMeta{font-size:13px; color:#cbd5e1; margin-top:6px;}
    .muted{color:var(--muted);}
    a{color: var(--blue); text-decoration:none;}
    a:hover{text-decoration:underline;}
    .sessionRow{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06);}
    .footer{margin-top:16px; color:var(--muted); font-size:12px;}

    @media print{
      :root{ color-scheme: light; }
      body{ background:#fff !important; color:#111 !important; margin:10mm; }
      .cell, .li{ background:#fff !important; box-shadow:none !important; border:1px solid #e5e7eb !important; color:#111 !important; }
      .empty{ background:#fff !important; border:1px dashed #e5e7eb !important; }
      .colHead, .rowHead, .sub, .footer, .liMeta{ color:#374151 !important; }
      a{ color:#111 !important; text-decoration:underline; }
      hr{ border-top:1px solid #e5e7eb !important; }
      .badge{ background:#f3f4f6 !important; border:1px solid #e5e7eb !important; color:#111 !important; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Εβδομαδιαίο Πρόγραμμα</h1>
    <div class="sub">Παραγωγή: ${escapeHtml(now)}</div>

    <table>
      <thead>
        <tr>
          <th></th>
          ${DAYS.map(d => `<th class="colHead">${escapeHtml(d.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <hr />

    <h1>Λίστα μαθημάτων</h1>
    <div class="sub">Ομαδοποιημένα ανά μάθημα</div>

    <ul>
      ${listItems || `<li class="li"><span class="muted">Δεν υπάρχουν καταχωρήσεις.</span></li>`}
    </ul>

    <div class="footer">Φτιάχτηκε από την εφαρμογή προγράμματος.</div>
  </div>
</body>
</html>`;
}

export default function App() {
  const [{ slots: initialSlots, isFirstTime }, setInit] = useState(() => ({ slots: DEFAULT_SLOTS, isFirstTime: true }));
  const [slots, setSlots] = useState<SlotDef[]>(initialSlots);
  const [showSlotsSetup, setShowSlotsSetup] = useState<boolean>(isFirstTime);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({
    title: "",
    day: "Mon" as Day,
    slotId: DEFAULT_SLOTS[0].id,
    classType: "THEORY" as ClassType,
    room: "",
    professors: "",
    courseUrl: "",
  });

  // Load once
  useEffect(() => {
    const s = loadSlotsFromStorage();
    setSlots(s.slots);
    setShowSlotsSetup(s.isFirstTime);

    const e = loadEntriesFromStorage();
    setEntries(e);

    setInit(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist slots
  useEffect(() => {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }, [slots]);

  // Persist entries
  useEffect(() => {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }, [entries]);

  // Ensure form slotId exists
  useEffect(() => {
    if (slots.length === 0) return;
    const exists = slots.some(s => s.id === form.slotId);
    if (!exists) setForm(p => ({ ...p, slotId: slots[0].id }));
  }, [slots, form.slotId]);

  const slotMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.day}__${e.slotId}`, e);
    return m;
  }, [entries]);

  const courseGroups = useMemo(() => groupEntries(entries, slots), [entries, slots]);

  function setDaySlot(day: Day, slotId: string) {
    setForm(prev => ({ ...prev, day, slotId }));
  }

  function addOrReplace() {
    const title = form.title.trim();
    if (!title) return alert("Γράψε τίτλο μαθήματος.");
    if (slots.length === 0) return alert("Πρόσθεσε πρώτα sessions/ώρες.");

    const key = `${form.day}__${form.slotId}`;
    const existing = slotMap.get(key);

    if (existing) {
      const ok = confirm(
        `Το slot ${dayLabel(form.day)} ${slotLabel(form.slotId, slots)} είναι ήδη πιασμένο από "${existing.title}".\n\nΘες αντικατάσταση;`
      );
      if (!ok) return;

      setEntries(prev =>
        prev.map(e => (e.id === existing.id ? {
          ...e,
          title,
          day: form.day,
          slotId: form.slotId,
          classType: form.classType,
          room: form.room.trim(),
          professors: form.professors.trim(),
          courseUrl: form.courseUrl.trim(),
        } : e))
      );
      return;
    }

    const newEntry: Entry = {
      id: uid(),
      title,
      day: form.day,
      slotId: form.slotId,
      classType: form.classType,
      room: form.room.trim(),
      professors: form.professors.trim(),
      courseUrl: form.courseUrl.trim(),
      createdAt: Date.now(),
    };

    setEntries(prev => [...prev, newEntry]);
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function clearAll() {
    const ok = confirm("Σίγουρα θες να διαγράψεις όλες τις καταχωρήσεις;");
    if (!ok) return;
    setEntries([]);
  }

  function openExportPage() {
    const html = buildExportHtml(entries, slots);
    const w = window.open("", "_blank");
    if (!w) return alert("Ο browser μπλόκαρε το νέο tab. Δοκίμασε ξανά ή επιτρέψ’ το.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function downloadExportHtml() {
    const html = buildExportHtml(entries, slots);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "programma.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function recomputeLabel(start: string, end: string) {
    return `${start}–${end}`;
  }

  function addSlot() {
    const id = uid();
    setSlots(prev => [...prev, { id, start: "09:00", end: "10:00", label: "09:00–10:00" }]);
  }

  function updateSlot(id: string, patch: Partial<SlotDef>) {
    setSlots(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }

  function moveSlot(id: string, dir: -1 | 1) {
    setSlots(prev => {
      const i = prev.findIndex(s => s.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  }

  function deleteSlot(id: string) {
    const slotUsed = entries.some(e => e.slotId === id);
    const msg = slotUsed
      ? "Αυτό το session χρησιμοποιείται σε καταχωρήσεις. Αν το σβήσεις, θα σβηστούν και οι αντίστοιχες καταχωρήσεις.\n\nΣυνέχεια;"
      : "Σίγουρα θες να διαγράψεις αυτό το session;";
    const ok = confirm(msg);
    if (!ok) return;

    setSlots(prev => prev.filter(s => s.id !== id));
    setEntries(prev => prev.filter(e => e.slotId !== id));
  }

  function resetToDefaults() {
    const ok = confirm("Να γυρίσουμε στις προεπιλεγμένες ώρες (09–11, 11–13, 14–16, 16–18);");
    if (!ok) return;

    // Σημ.: τα ids των default είναι ίδια με τα παλιά ("09-11" κλπ), οπότε οι παλιές καταχωρήσεις ταιριάζουν.
    setSlots(DEFAULT_SLOTS);
  }

  // Αν είναι “setup mode”, δείχνουμε πρώτα ρύθμιση ωρών
  if (showSlotsSetup) {
    return (
      <div className="page">
        <header className="header">
          <h1>Ρύθμιση Sessions (Ωρών)</h1>
          <div className="sub">
            Πριν βάλεις μαθήματα, όρισε τα sessions/ώρες που θα έχει ο εβδομαδιαίος πίνακας.
          </div>
        </header>

        <div className="layout">
          <section className="panel" style={{ gridColumn: "1 / -1" }}>
            <h2>Sessions</h2>

            {slots.length === 0 ? (
              <div className="sub">Δεν υπάρχουν sessions. Πρόσθεσε τουλάχιστον ένα.</div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slots.map(s => (
                <div key={s.id} className="li">
                  <div className="liTitle">Session: {s.label}</div>

                  <div className="formGrid">
                    <label>
                      Έναρξη (HH:MM)
                      <input
                        value={s.start}
                        onChange={e => {
                          const v = e.target.value;
                          updateSlot(s.id, { start: v, label: isHHMM(v) && isHHMM(s.end) ? recomputeLabel(v, s.end) : s.label });
                        }}
                        placeholder="09:00"
                      />
                    </label>

                    <label>
                      Λήξη (HH:MM)
                      <input
                        value={s.end}
                        onChange={e => {
                          const v = e.target.value;
                          updateSlot(s.id, { end: v, label: isHHMM(s.start) && isHHMM(v) ? recomputeLabel(s.start, v) : s.label });
                        }}
                        placeholder="11:00"
                      />
                    </label>
                  </div>

                  <div className="btnRow">
                    <button className="btn" onClick={() => moveSlot(s.id, -1)}>▲ Πάνω</button>
                    <button className="btn" onClick={() => moveSlot(s.id, 1)}>▼ Κάτω</button>
                    <button className="btn danger" onClick={() => deleteSlot(s.id)}>Διαγραφή</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="btnRow" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={addSlot}>+ Προσθήκη session</button>
              <button className="btn" onClick={resetToDefaults}>Χρήση προεπιλογών</button>
              <button
                className="btn"
                onClick={() => {
                  // validate slots
                  if (slots.length === 0) return alert("Βάλε τουλάχιστον ένα session.");
                  for (const s of slots) {
                    if (!isHHMM(s.start) || !isHHMM(s.end)) return alert("Διόρθωσε ώρες σε μορφή HH:MM (π.χ. 09:00).");
                  }
                  setShowSlotsSetup(false);
                }}
              >
                Έτοιμο — Πάμε στα μαθήματα
              </button>
            </div>

            <div className="sub" style={{ marginTop: 10 }}>
              Μπορείς να αλλάξεις sessions αργότερα από το κουμπί «Ρύθμιση ωρών» μέσα στην εφαρμογή.
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Εβδομαδιαίο Πρόγραμμα Μαθημάτων</h1>
        <div className="sub">
          Κλικ σε κελί για επιλογή ημέρας/ώρας. Τα sessions/ώρες είναι παραμετροποιήσιμα.
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Καταχώρηση μαθήματος</h2>

          <div className="btnRow" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => setShowSlotsSetup(true)}>Ρύθμιση ωρών (Sessions)</button>
          </div>

          <div className="formGrid">
            <label>
              Τίτλος μαθήματος *
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="π.χ. Σήματα & Συστήματα"
              />
            </label>

            <label>
              Τύπος (Θ/Ε) *
              <select
                value={form.classType}
                onChange={e => setForm(p => ({ ...p, classType: e.target.value as ClassType }))}
              >
                <option value="THEORY">Θεωρία (Θ)</option>
                <option value="LAB">Εργαστήριο (Ε)</option>
              </select>
            </label>

            <label>
              Ημέρα *
              <select value={form.day} onChange={e => setForm(p => ({ ...p, day: e.target.value as Day }))}>
                {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>

            <label>
              Session (Ώρα) *
              <select value={form.slotId} onChange={e => setForm(p => ({ ...p, slotId: e.target.value }))}>
                {slots.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>

            <label>
              Αίθουσα
              <input value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} placeholder="π.χ. Αμφ. Α1 / Lab 2" />
            </label>

            <label>
              Καθηγητές
              <input value={form.professors} onChange={e => setForm(p => ({ ...p, professors: e.target.value }))} placeholder="π.χ. Παπαδόπουλος, Γεωργίου" />
            </label>

            <label className="span2">
              Σελίδα μαθήματος (URL)
              <input value={form.courseUrl} onChange={e => setForm(p => ({ ...p, courseUrl: e.target.value }))} placeholder="https://..." />
            </label>
          </div>

          <div className="btnRow">
            <button className="btn primary" onClick={addOrReplace}>Καταχώρηση στο slot</button>
            <button
              className="btn"
              onClick={() => setForm(p => ({
                ...p,
                title: "",
                classType: "THEORY",
                room: "",
                professors: "",
                courseUrl: "",
              }))}
            >
              Καθαρισμός (εκτός ημέρας/ώρας)
            </button>
            <button className="btn danger" onClick={clearAll}>Διαγραφή όλων</button>
          </div>

          <div className="exportRow">
            <button className="btn" onClick={openExportPage}>Άνοιγμα νέας HTML σελίδας</button>
            <button className="btn" onClick={downloadExportHtml}>Λήψη HTML αρχείου</button>
          </div>
        </section>

        <section className="panel">
          <h2>Πίνακας</h2>

          <div className="tableWrap">
            <table className="timetable">
              <thead>
                <tr>
                  <th className="corner"></th>
                  {DAYS.map(d => <th key={d.key} className="colHead">{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {slots.map(s => (
                  <tr key={s.id}>
                    <th className="rowHead">{s.label}</th>
                    {DAYS.map(d => {
                      const e = slotMap.get(`${d.key}__${s.id}`);
                      const selected = form.day === d.key && form.slotId === s.id;

                      return (
                        <td
                          key={`${d.key}-${s.id}`}
                          className={`cell ${e ? "filled" : "empty"} ${selected ? "selected" : ""}`}
                          onClick={() => setDaySlot(d.key, s.id)}
                          title="Κλικ για επιλογή ημέρας/ώρας στη φόρμα"
                        >
                          {e ? (
                            <>
                              <div className="cellTitle">{e.title}</div>
                              <div className="cellMeta">
                                <span className="badge">{typeShort(e.classType)}</span>
                                <span className="room">{e.room || "—"}</span>
                              </div>
                            </>
                          ) : (
                            <div className="hint">Κλικ για επιλογή slot</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 16 }}>Λίστα μαθημάτων (ανά μάθημα)</h2>

          {courseGroups.length === 0 ? (
            <div className="muted">Δεν υπάρχουν καταχωρήσεις ακόμα.</div>
          ) : (
            <ul className="list">
              {courseGroups.map(g => (
                <li key={g.title} className="li">
                  <div className="liTitle">{g.title}</div>

                  <div className="liMeta"><b>Καθηγητές:</b> {g.professors || "—"}</div>
                  <div className="liMeta">
                    <b>Σελίδα:</b>{" "}
                    {g.courseUrl ? (
                      <a href={g.courseUrl} target="_blank" rel="noreferrer">{g.courseUrl}</a>
                    ) : (
                      "—"
                    )}
                  </div>

                  <div className="liMeta"><b>Ώρες/slots:</b></div>

                  {g.sessions.map(s => (
                    <div key={s.id} className="sessionRow">
                      <span>{dayLabel(s.day)} — {slotLabel(s.slotId, slots)}</span>
                      <span className="badge">{typeShort(s.classType)}</span>
                      <span className="room">{s.room || "—"}</span>
                      <button className="mini danger" onClick={() => removeEntry(s.id)}>Διαγραφή slot</button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
