import { useEffect, useMemo, useState } from "react";
import "./App.css";

/** ===== Types ===== */
type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type ClassType = "THEORY" | "LAB";

type SlotDef = {
  id: string;
  start: string; // "09:00"
  end: string; // "11:00"
  label: string; // "09:00–11:00"
};

type Entry = {
  id: string;
  title: string;
  day: Day;
  slotId: string;
  classType: ClassType;
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

/** ===== Constants ===== */
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

/** ===== Helpers ===== */
function uid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function isHHMM(x: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
}

function isDay(x: any): x is Day {
  return x === "Mon" || x === "Tue" || x === "Wed" || x === "Thu" || x === "Fri";
}

function isClassType(x: any): x is ClassType {
  return x === "THEORY" || x === "LAB";
}

function dayLabel(d: Day) {
  return DAYS.find((x) => x.key === d)?.label ?? d;
}

function typeShort(t: ClassType) {
  return t === "THEORY" ? "Θ" : "Ε";
}

function slotLabel(slotId: string, slots: SlotDef[]) {
  return slots.find((s) => s.id === slotId)?.label ?? slotId;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return { slots: DEFAULT_SLOTS, isFirstTime: true };
    const parsed = JSON.parse(raw);
    const slots = normalizeSlots(parsed);
    if (slots.length === 0) return { slots: DEFAULT_SLOTS, isFirstTime: true };
    return { slots, isFirstTime: false };
  } catch {
    return { slots: DEFAULT_SLOTS, isFirstTime: true };
  }
}

/** Backward compatibility (v1 keys) */
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

        const id = typeof (x as any).id === "string" ? (x as any).id : "";
        const title = typeof (x as any).title === "string" ? (x as any).title : "";
        const room = typeof (x as any).room === "string" ? (x as any).room : "";
        const professors = typeof (x as any).professors === "string" ? (x as any).professors : "";
        const courseUrl = typeof (x as any).courseUrl === "string" ? (x as any).courseUrl : "";
        const createdAt = typeof (x as any).createdAt === "number" ? (x as any).createdAt : Date.now();

        const dayRaw = (x as any).day;
        if (!isDay(dayRaw)) continue;

        const classTypeRaw = (x as any).classType;
        const classType: ClassType = isClassType(classTypeRaw) ? classTypeRaw : "THEORY";

        const slotId =
          typeof (x as any).slotId === "string"
            ? (x as any).slotId
            : typeof (x as any).slot === "string"
              ? (x as any).slot
              : "";

        if (!id || !title || !slotId) continue;

        entries.push({
          id,
          title,
          day: dayRaw,
          slotId,
          classType,
          room,
          professors,
          courseUrl,
          createdAt,
        });
      }

      localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
      return entries;
    } catch {
      // try next
    }
  }

  return [];
}

function buildSlotIndex(slots: SlotDef[]) {
  const idx = new Map<string, number>();
  slots.forEach((s, i) => idx.set(s.id, i));
  return idx;
}

function groupEntries(entries: Entry[], slots: SlotDef[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();
  const slotIdx = buildSlotIndex(slots);
  const dayOrder = (d: Day) => DAYS.findIndex((x) => x.key === d);
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

/** ===== Export HTML (responsive + PDF print) ===== */
function buildExportHtml(entries: Entry[], slots: SlotDef[]) {
  const byKey = new Map<string, Entry>();
  for (const e of entries) byKey.set(`${e.day}__${e.slotId}`, e);

  const tableRows = slots
    .map((slot) => {
      const cells = DAYS.map((day) => {
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
    })
    .join("");

  const groups = groupEntries(entries, slots);

  const listItems = groups
    .map((g) => {
      const urlPart = g.courseUrl
        ? `<a href="${escapeHtml(g.courseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(g.courseUrl)}</a>`
        : `<span class="muted">—</span>`;

      const profPart = g.professors?.trim() ? escapeHtml(g.professors) : "—";

      const sessionsHtml = g.sessions
        .map(
          (s) => `
          <div class="sessionRow">
            <span>${escapeHtml(dayLabel(s.day))} — ${escapeHtml(slotLabel(s.slotId, slots))}</span>
            <span class="badge">${typeShort(s.classType)}</span>
            <span class="room">${escapeHtml(s.room || "—")}</span>
          </div>
        `
        )
        .join("");

      return `
        <li class="li">
          <div class="liTitle">${escapeHtml(g.title)}</div>
          <div class="liMeta"><b>Καθηγητές:</b> ${profPart}</div>
          <div class="liMeta"><b>Σελίδα μαθήματος:</b> ${urlPart}</div>
          <div class="liMeta"><b>Ώρες/slots:</b></div>
          ${sessionsHtml}
        </li>
      `;
    })
    .join("");

  // Mobile sections (ανά ημέρα)
  const mobileDays = DAYS.map((d) => {
    const cards = slots
      .map((s) => {
        const e = byKey.get(`${d.key}__${s.id}`);
        if (!e) {
          return `
            <div class="mCard empty">
              <div class="mSlot">${escapeHtml(s.label)}</div>
              <div class="mMuted">—</div>
            </div>
          `;
        }
        return `
          <div class="mCard">
            <div class="mSlot">${escapeHtml(s.label)}</div>
            <div class="mTitle">${escapeHtml(e.title)}</div>
            <div class="mMeta">
              <span class="badge">${typeShort(e.classType)}</span>
              <span class="room">${escapeHtml(e.room || "—")}</span>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <section class="mDay">
        <h2 class="mDayTitle">${escapeHtml(d.label)}</h2>
        <div class="mGrid">${cards}</div>
      </section>
    `;
  }).join("");

  const now = new Date().toLocaleString("el-GR");

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
      margin:20px;
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

    /* Desktop table */
    .desktopOnly{display:block;}
    .mobileOnly{display:none;}
    .tableScroll{overflow:auto; -webkit-overflow-scrolling: touch; padding-bottom:6px;}
    table{width:100%; border-collapse:separate; border-spacing:10px; table-layout:fixed; min-width:860px;}
    th, td{vertical-align:top;}
    .colHead{font-size:12.5px; color:var(--muted); text-align:left; padding-left:4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .rowHead{font-size:12px; color:var(--muted); text-align:right; padding-right:6px; width:140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .cell{background: rgba(8,12,22,.78); border:1px solid var(--border); border-radius:16px; padding:10px; min-height:68px; box-shadow: var(--shadow);}
    .empty{background: rgba(8,12,22,.35); border:1px dashed rgba(148,163,184,.25); box-shadow:none;}
    .cellTitle{font-weight:900; font-size:13px; margin-bottom:6px; letter-spacing:.2px;}
    .cellMeta{display:flex; gap:8px; align-items:center; font-size:12px; color:#cbd5e1;}

    /* Mobile day cards */
    .mDay{margin-top:14px;}
    .mDayTitle{margin:10px 0; font-size:16px; letter-spacing:.2px;}
    .mGrid{display:grid; grid-template-columns: 1fr; gap:10px;}
    .mCard{background: rgba(8,12,22,.78); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow: var(--shadow);}
    .mCard.empty{background: rgba(8,12,22,.35); border:1px dashed rgba(148,163,184,.25); box-shadow:none;}
    .mSlot{color:var(--muted); font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .mTitle{font-weight:950; margin-top:6px; font-size:14px;}
    .mMeta{display:flex; gap:8px; align-items:center; margin-top:8px; color:#cbd5e1; font-size:13px;}
    .mMuted{color:var(--muted); margin-top:6px;}

    hr{border:none; border-top:1px solid rgba(255,255,255,.10); margin:18px 0;}
    ul{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;}
    .li{background: rgba(8,12,22,.68); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow: var(--shadow); break-inside: avoid;}
    .liTitle{font-weight:950; margin-bottom:6px; letter-spacing:.2px;}
    .liMeta{font-size:13px; color:#cbd5e1; margin-top:6px;}
    .muted{color:var(--muted);}
    a{color: var(--blue); text-decoration:none;}
    a:hover{text-decoration:underline;}
    .sessionRow{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06); break-inside: avoid;}
    .badge{display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background: rgba(15,23,42,.75); font-weight:950; font-size:12px;}
    .room{opacity:.9;}
    .footer{margin-top:16px; color:var(--muted); font-size:12px;}

    @media (max-width: 820px){
      body{margin:14px;}
      .desktopOnly{display:none;}
      .mobileOnly{display:block;}
      .wrap{max-width:680px;}
    }

    /* PDF print */
    @page { size: A4; margin: 12mm; }
    @media print{
      :root{ color-scheme: light; }
      body{ background:#fff !important; color:#111 !important; margin:0; }
      .mobileOnly{display:none !important;}
      .desktopOnly{display:block !important;}
      table{min-width:0 !important; border-spacing:8px;}
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

    <div class="desktopOnly">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th></th>
              ${DAYS.map((d) => `<th class="colHead">${escapeHtml(d.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mobileOnly">
      ${mobileDays}
    </div>

    <hr />

    <h1>Λίστα μαθημάτων</h1>
    <div class="sub">Ομαδοποιημένα ανά μάθημα</div>

    <ul>
      ${listItems || `<li class="li"><span class="muted">Δεν υπάρχουν καταχωρήσεις.</span></li>`}
    </ul>

    <div class="footer">Φτιάχτηκε από την εφαρμογή προγράμματος.</div>
  </div>

  <script>
    // Αν ανοίξει με #print → ανοίγει κατευθείαν το print dialog (PDF)
    window.addEventListener("load", () => {
      if (location.hash === "#print") {
        setTimeout(() => window.print(), 200);
      }
    });
  </script>
</body>
</html>`;
}

/** ===== App ===== */
export default function App() {
  const [init] = useState(() => {
    const s = loadSlotsFromStorage();
    const e = loadEntriesFromStorage();
    return { slots: s.slots, showSetup: s.isFirstTime, entries: e };
  });

  const [slots, setSlots] = useState<SlotDef[]>(init.slots);
  const [showSlotsSetup, setShowSlotsSetup] = useState<boolean>(init.showSetup);
  const [entries, setEntries] = useState<Entry[]>(init.entries);

  const [mobileDay, setMobileDay] = useState<Day>("Mon");

  const [form, setForm] = useState({
    title: "",
    day: "Mon" as Day,
    slotId: init.slots[0]?.id ?? DEFAULT_SLOTS[0].id,
    classType: "THEORY" as ClassType,
    room: "",
    professors: "",
    courseUrl: "",
  });

  useEffect(() => {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }, [slots]);

  useEffect(() => {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    if (slots.length === 0) return;
    if (!slots.some((s) => s.id === form.slotId)) {
      setForm((p) => ({ ...p, slotId: slots[0].id }));
    }
  }, [slots, form.slotId]);

  const slotMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.day}__${e.slotId}`, e);
    return m;
  }, [entries]);

  const courseGroups = useMemo(() => groupEntries(entries, slots), [entries, slots]);

  function setDaySlot(day: Day, slotId: string) {
    setForm((prev) => ({ ...prev, day, slotId }));
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

      setEntries((prev) =>
        prev.map((e) =>
          e.id === existing.id
            ? {
                ...e,
                title,
                day: form.day,
                slotId: form.slotId,
                classType: form.classType,
                room: form.room.trim(),
                professors: form.professors.trim(),
                courseUrl: form.courseUrl.trim(),
              }
            : e
        )
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

    setEntries((prev) => [...prev, newEntry]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function clearAll() {
    const ok = confirm("Σίγουρα θες να διαγράψεις όλες τις καταχωρήσεις;");
    if (!ok) return;
    setEntries([]);
  }

  function openExportPage(hash: "" | "#print" = "") {
    const html = buildExportHtml(entries, slots);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob) + hash;

    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url.replace("#print", ""));
      return alert("Ο browser μπλόκαρε το νέο tab. Επίτρεψέ το και ξαναδοκίμασε.");
    }

    // revoke after some time (safe)
    setTimeout(() => URL.revokeObjectURL(url.replace("#print", "")), 8000);
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

  // PDF = Print dialog (Save as PDF)
  function exportPdf() {
    openExportPage("#print");
  }

  function recomputeLabel(start: string, end: string) {
    return `${start}–${end}`;
  }

  function addSlot() {
    const id = uid();
    setSlots((prev) => [...prev, { id, start: "09:00", end: "10:00", label: "09:00–10:00" }]);
  }

  function updateSlot(id: string, patch: Partial<SlotDef>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function moveSlot(id: string, dir: -1 | 1) {
    setSlots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
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
    const slotUsed = entries.some((e) => e.slotId === id);
    const msg = slotUsed
      ? "Αυτό το session χρησιμοποιείται σε καταχωρήσεις. Αν το σβήσεις, θα σβηστούν και οι αντίστοιχες καταχωρήσεις.\n\nΣυνέχεια;"
      : "Σίγουρα θες να διαγράψεις αυτό το session;";
    const ok = confirm(msg);
    if (!ok) return;

    setSlots((prev) => prev.filter((s) => s.id !== id));
    setEntries((prev) => prev.filter((e) => e.slotId !== id));
  }

  function resetToDefaults() {
    const ok = confirm(
      "Να γυρίσουμε στις προεπιλεγμένες ώρες (09–11, 11–13, 14–16, 16–18);\n\nΣημείωση: Όσα μαθήματα είχαν άλλα (custom) sessions θα χαθούν."
    );
    if (!ok) return;

    const keep = new Set(DEFAULT_SLOTS.map((s) => s.id));
    setSlots(DEFAULT_SLOTS);
    setEntries((prev) => prev.filter((e) => keep.has(e.slotId)));
  }

  /** ===== Setup screen ===== */
  if (showSlotsSetup) {
    return (
      <div className="page">
        <header className="header">
          <h1>Ρύθμιση Sessions (Ωρών)</h1>
          <div className="sub">Πριν βάλεις μαθήματα, όρισε τα sessions/ώρες που θα έχει ο πίνακας.</div>
        </header>

        <div className="layout">
          <section className="panel panelFull">
            <h2>Sessions</h2>

            {slots.length === 0 ? <div className="sub">Δεν υπάρχουν sessions. Πρόσθεσε τουλάχιστον ένα.</div> : null}

            <div className="stack">
              {slots.map((s) => (
                <div key={s.id} className="li">
                  <div className="liTitle">Session: {s.label}</div>

                  <div className="formGrid">
                    <label>
                      Έναρξη (HH:MM)
                      <input
                        value={s.start}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nextLabel = isHHMM(v) && isHHMM(s.end) ? recomputeLabel(v, s.end) : s.label;
                          updateSlot(s.id, { start: v, label: nextLabel });
                        }}
                        placeholder="09:00"
                      />
                    </label>

                    <label>
                      Λήξη (HH:MM)
                      <input
                        value={s.end}
                        onChange={(e) => {
                          const v = e.target.value;
                          const nextLabel = isHHMM(s.start) && isHHMM(v) ? recomputeLabel(s.start, v) : s.label;
                          updateSlot(s.id, { end: v, label: nextLabel });
                        }}
                        placeholder="11:00"
                      />
                    </label>
                  </div>

                  <div className="btnRow">
                    <button className="btn" onClick={() => moveSlot(s.id, -1)}>
                      ▲ Πάνω
                    </button>
                    <button className="btn" onClick={() => moveSlot(s.id, 1)}>
                      ▼ Κάτω
                    </button>
                    <button className="btn danger" onClick={() => deleteSlot(s.id)}>
                      Διαγραφή
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="btnRow">
              <button className="btn primary" onClick={addSlot}>
                + Προσθήκη session
              </button>
              <button className="btn" onClick={resetToDefaults}>
                Χρήση προεπιλογών
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (slots.length === 0) return alert("Βάλε τουλάχιστον ένα session.");
                  for (const s of slots) {
                    if (!isHHMM(s.start) || !isHHMM(s.end)) {
                      return alert("Διόρθωσε ώρες σε μορφή HH:MM (π.χ. 09:00).");
                    }
                  }
                  setShowSlotsSetup(false);
                }}
              >
                Έτοιμο — Πάμε στα μαθήματα
              </button>
            </div>

            <div className="sub">Tip: Μπορείς να αλλάξεις sessions οποιαδήποτε στιγμή.</div>
          </section>
        </div>
      </div>
    );
  }

  /** ===== Main app ===== */
  return (
    <div className="page">
      <header className="header">
        <h1>Εβδομαδιαίο Πρόγραμμα Μαθημάτων</h1>
        <div className="sub">Σε κινητό: προβολή ανά ημέρα. Σε υπολογιστή: πλήρης πίνακας.</div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Καταχώρηση</h2>

          <div className="btnRow">
            <button className="btn" onClick={() => setShowSlotsSetup(true)}>
              Ρύθμιση ωρών (Sessions)
            </button>
          </div>

          <div className="formGrid">
            <label>
              Τίτλος μαθήματος *
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="π.χ. Σήματα & Συστήματα"
              />
            </label>

            <label>
              Τύπος (Θ/Ε) *
              <select value={form.classType} onChange={(e) => setForm((p) => ({ ...p, classType: e.target.value as ClassType }))}>
                <option value="THEORY">Θεωρία (Θ)</option>
                <option value="LAB">Εργαστήριο (Ε)</option>
              </select>
            </label>

            <label>
              Ημέρα *
              <select value={form.day} onChange={(e) => setForm((p) => ({ ...p, day: e.target.value as Day }))}>
                {DAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Session *
              <select value={form.slotId} onChange={(e) => setForm((p) => ({ ...p, slotId: e.target.value }))}>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Αίθουσα
              <input value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} placeholder="π.χ. Αμφ. Α1 / Lab 2" />
            </label>

            <label>
              Καθηγητές
              <input
                value={form.professors}
                onChange={(e) => setForm((p) => ({ ...p, professors: e.target.value }))}
                placeholder="π.χ. Παπαδόπουλος, Γεωργίου"
              />
            </label>

            <label className="span2">
              Σελίδα μαθήματος (URL)
              <input value={form.courseUrl} onChange={(e) => setForm((p) => ({ ...p, courseUrl: e.target.value }))} placeholder="https://..." />
            </label>
          </div>

          <div className="btnRow">
            <button className="btn primary" onClick={addOrReplace}>
              Καταχώρηση
            </button>

            <button
              className="btn"
              onClick={() =>
                setForm((p) => ({
                  ...p,
                  title: "",
                  classType: "THEORY",
                  room: "",
                  professors: "",
                  courseUrl: "",
                }))
              }
            >
              Καθαρισμός
            </button>

            <button className="btn danger" onClick={clearAll}>
              Διαγραφή όλων
            </button>
          </div>

          <div className="exportRow">
            <button className="btn" onClick={() => openExportPage("")}>
              Export (HTML)
            </button>
            <button className="btn" onClick={downloadExportHtml}>
              Λήψη HTML
            </button>
            <button className="btn" onClick={exportPdf}>
              PDF (Print)
            </button>
          </div>

          <div className="sub">
            Στο PDF: θα ανοίξει Print → διάλεξε <b>Save as PDF</b>. (Σε κινητό: Share/Print → Save PDF.)
          </div>
        </section>

        <section className="panel">
          <h2>Πρόγραμμα</h2>

          {/* Desktop table */}
          <div className="desktopOnly">
            <div className="tableWrap">
              <table className="timetable">
                <thead>
                  <tr>
                    <th className="corner"></th>
                    {DAYS.map((d) => (
                      <th key={d.key} className="colHead">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id}>
                      <th className="rowHead">{s.label}</th>

                      {DAYS.map((d) => {
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
          </div>

          {/* Mobile day view */}
          <div className="mobileOnly">
            <div className="dayTabs">
              {DAYS.map((d) => (
                <button
                  key={d.key}
                  className={`tab ${mobileDay === d.key ? "active" : ""}`}
                  onClick={() => setMobileDay(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="mobileGrid">
              {slots.map((s) => {
                const e = slotMap.get(`${mobileDay}__${s.id}`);
                const selected = form.day === mobileDay && form.slotId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`mCard ${e ? "" : "empty"} ${selected ? "selected" : ""}`}
                    onClick={() => {
                      setDaySlot(mobileDay, s.id);
                      setForm((p) => ({ ...p, day: mobileDay, slotId: s.id }));
                    }}
                  >
                    <div className="mSlot">{s.label}</div>
                    {e ? (
                      <>
                        <div className="mTitle">{e.title}</div>
                        <div className="mMeta">
                          <span className="badge">{typeShort(e.classType)}</span>
                          <span className="room">{e.room || "—"}</span>
                        </div>
                      </>
                    ) : (
                      <div className="mMuted">Κενό slot (tap για επιλογή)</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <h2 className="mt">Λίστα μαθημάτων</h2>

          {courseGroups.length === 0 ? (
            <div className="muted">Δεν υπάρχουν καταχωρήσεις ακόμα.</div>
          ) : (
            <ul className="list">
              {courseGroups.map((g) => (
                <li key={g.title} className="li">
                  <div className="liTitle">{g.title}</div>

                  <div className="liMeta">
                    <b>Καθηγητές:</b> {g.professors || "—"}
                  </div>

                  <div className="liMeta">
                    <b>Σελίδα:</b>{" "}
                    {g.courseUrl ? (
                      <a href={g.courseUrl} target="_blank" rel="noreferrer">
                        {g.courseUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>

                  <div className="liMeta">
                    <b>Ώρες/slots:</b>
                  </div>

                  {g.sessions.map((s) => (
                    <div key={s.id} className="sessionRow">
                      <span>
                        {dayLabel(s.day)} — {slotLabel(s.slotId, slots)}
                      </span>
                      <span className="badge">{typeShort(s.classType)}</span>
                      <span className="room">{s.room || "—"}</span>

                      <button className="mini danger" onClick={() => removeEntry(s.id)}>
                        Διαγραφή
                      </button>
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
