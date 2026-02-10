import { useEffect, useMemo, useState } from "react";
import "./app.css";

type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type Slot = "09-11" | "11-13" | "14-16" | "16-18";
type ClassType = "THEORY" | "LAB";

type Entry = {
  id: string;
  title: string;
  day: Day;
  slot: Slot;
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

const SLOTS: { key: Slot; label: string }[] = [
  { key: "09-11", label: "09:00–11:00" },
  { key: "11-13", label: "11:00–13:00" },
  { key: "14-16", label: "14:00–16:00" },
  { key: "16-18", label: "16:00–18:00" },
];

const STORAGE_KEY = "uni-schedule:v1";

function uid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function dayLabel(d: Day) {
  return DAYS.find(x => x.key === d)?.label ?? d;
}
function slotLabel(s: Slot) {
  return SLOTS.find(x => x.key === s)?.label ?? s;
}
function typeShort(t: ClassType) {
  return t === "THEORY" ? "Θ" : "Ε";
}


function loadEntriesFromStorage(): Entry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x: any) =>
      x &&
      typeof x.id === "string" &&
      typeof x.title === "string" &&
      typeof x.day === "string" &&
      typeof x.slot === "string" &&
      typeof x.classType === "string" &&
      typeof x.room === "string" &&
      typeof x.professors === "string" &&
      typeof x.courseUrl === "string"
    ) as Entry[];
  } catch {
    return [];
  }
}

function groupEntries(entries: Entry[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();

  for (const e of entries) {
    const key = e.title.trim();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { title: key, professors: "", courseUrl: "", sessions: [] });
    }

    const g = map.get(key)!;
    g.sessions.push(e);

    if (!g.professors && e.professors?.trim()) g.professors = e.professors.trim();
    if (!g.courseUrl && e.courseUrl?.trim()) g.courseUrl = e.courseUrl.trim();
  }

  const dayOrder = (d: Day) => DAYS.findIndex(x => x.key === d);
  const slotOrder = (s: Slot) => SLOTS.findIndex(x => x.key === s);

  for (const g of map.values()) {
    g.sessions.sort((a, b) => {
      const dd = dayOrder(a.day) - dayOrder(b.day);
      if (dd !== 0) return dd;
      return slotOrder(a.slot) - slotOrder(b.slot);
    });
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildExportHtml(entries: Entry[]) {
  const byKey = new Map<string, Entry>();
  for (const e of entries) byKey.set(`${e.day}__${e.slot}`, e);

  const tableRows = SLOTS.map(slot => {
    const cells = DAYS.map(day => {
      const e = byKey.get(`${day.key}__${slot.key}`);
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

  const groups = groupEntries(entries);

  const listItems = groups.map(g => {
    const urlPart = g.courseUrl
      ? `<a href="${escapeHtml(g.courseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(g.courseUrl)}</a>`
      : `<span class="muted">—</span>`;

    const profPart = g.professors?.trim() ? escapeHtml(g.professors) : "—";

    const sessionsHtml = g.sessions.map(s => `
      <div class="sessionRow">
        <span>${escapeHtml(dayLabel(s.day))} — ${escapeHtml(slotLabel(s.slot))}</span>
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
    --panel:#0c1326;
    --text:#e5e7eb;
    --muted:#94a3b8;
    --border: rgba(255,255,255,.10);

    --accent:#ff2d55;   /* rock red/pink */
    --accent2:#7c3aed;  /* purple */
    --blue:#22d3ee;     /* cyan */
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

  h1{
    margin:0 0 6px;
    font-size:22px;
    letter-spacing:.3px;
    text-shadow: 0 0 20px rgba(255,45,85,.10);
  }

  .sub{
    color:var(--muted);
    margin-bottom:14px;
    font-size:13px;
  }

  table{
    width:100%;
    border-collapse:separate;
    border-spacing:10px;
    table-layout:fixed;
  }
  th, td{vertical-align:top;}

  .colHead{
    font-size:12.5px;
    color:var(--muted);
    text-align:left;
    padding-left:4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .rowHead{
    font-size:12px;
    color:var(--muted);
    text-align:right;
    padding-right:6px;
    width:120px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .cell{
    background: rgba(8,12,22,.78);
    border:1px solid var(--border);
    border-radius:16px;
    padding:10px;
    min-height:68px;
    box-shadow: var(--shadow);
  }

  .empty{
    background: rgba(8,12,22,.35);
    border:1px dashed rgba(148,163,184,.25);
    box-shadow:none;
  }

  .cellTitle{
    font-weight:900;
    font-size:13px;
    margin-bottom:6px;
    letter-spacing:.2px;
  }

  .cellMeta{
    display:flex;
    gap:8px;
    align-items:center;
    font-size:12px;
    color:#cbd5e1;
  }

  .badge{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    padding:2px 8px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.14);
    background: rgba(15,23,42,.75);
    font-weight:950;
    font-size:12px;
  }

  .room{opacity:.9;}

  hr{
    border:none;
    border-top:1px solid rgba(255,255,255,.10);
    margin:18px 0;
  }

  ul{
    list-style:none;
    padding:0;
    margin:0;
    display:flex;
    flex-direction:column;
    gap:10px;
  }

  .li{
    background: rgba(8,12,22,.68);
    border:1px solid var(--border);
    border-radius:16px;
    padding:12px;
    box-shadow: var(--shadow);
  }

  .liTitle{
    font-weight:950;
    margin-bottom:6px;
    letter-spacing:.2px;
  }

  .liMeta{
    font-size:13px;
    color:#cbd5e1;
    margin-top:6px;
  }

  .muted{color:var(--muted);}

  a{color: var(--blue); text-decoration:none;}
  a:hover{text-decoration:underline;}

  .sessionRow{
    display:flex;
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
    margin-top:8px;
    padding-top:8px;
    border-top:1px solid rgba(255,255,255,.06);
  }

  .footer{
    margin-top:16px;
    color:var(--muted);
    font-size:12px;
  }

  /* PRINT: καθαρό/λευκό για PDF */
  @media print{
    :root{ color-scheme: light; }
    body{
      background:#fff !important;
      color:#111 !important;
      margin:10mm;
    }
    .cell, .li{
      background:#fff !important;
      box-shadow:none !important;
      border:1px solid #e5e7eb !important;
      color:#111 !important;
    }
    .empty{
      background:#fff !important;
      border:1px dashed #e5e7eb !important;
    }
    .colHead, .rowHead, .sub, .footer, .liMeta{ color:#374151 !important; }
    a{ color:#111 !important; text-decoration:underline; }
    hr{ border-top:1px solid #e5e7eb !important; }
    .badge{
      background:#f3f4f6 !important;
      border:1px solid #e5e7eb !important;
      color:#111 !important;
    }
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({
    title: "",
    day: "Mon" as Day,
    slot: "09-11" as Slot,
    classType: "THEORY" as ClassType,
    room: "",
    professors: "",
    courseUrl: "",
  });

  // load once
  useEffect(() => {
    setEntries(loadEntriesFromStorage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // save on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const slotMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.day}__${e.slot}`, e);
    return m;
  }, [entries]);

  const courseGroups = useMemo(() => groupEntries(entries), [entries]);

  function setDaySlot(day: Day, slot: Slot) {
    setForm(prev => ({ ...prev, day, slot }));
  }

  function addOrReplace() {
    const title = form.title.trim();
    if (!title) return alert("Γράψε τίτλο μαθήματος.");

    const key = `${form.day}__${form.slot}`;
    const existing = slotMap.get(key);

    if (existing) {
      const ok = confirm(
        `Το slot ${dayLabel(form.day)} ${slotLabel(form.slot)} είναι ήδη πιασμένο από "${existing.title}".\n\nΘες αντικατάσταση;`
      );
      if (!ok) return;

      setEntries(prev =>
        prev.map(e => (e.id === existing.id ? {
          ...e,
          title,
          day: form.day,
          slot: form.slot,
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
      slot: form.slot,
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
    const html = buildExportHtml(entries);
    const w = window.open("", "_blank");
    if (!w) return alert("Ο browser μπλόκαρε το νέο tab. Δοκίμασε ξανά ή επιτρέψ’ το.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function downloadExportHtml() {
    const html = buildExportHtml(entries);
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

  return (
    <div className="page">
      <header className="header">
        <h1>Εβδομαδιαίο Πρόγραμμα Μαθημάτων</h1>
        <div className="sub">
          Slots: 09–11, 11–13, 14–16, 16–18 (Δευτέρα–Παρασκευή). Κλικ σε κελί για επιλογή ημέρας/ώρας.
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Καταχώρηση μαθήματος</h2>

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
              <select value={form.classType} onChange={e => setForm(p => ({ ...p, classType: e.target.value as ClassType }))}>
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
              Ώρα *
              <select value={form.slot} onChange={e => setForm(p => ({ ...p, slot: e.target.value as Slot }))}>
                {SLOTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
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
            <button className="btn" onClick={() => setForm({ title: "", day: "Mon", slot: "09-11", classType: "THEORY", room: "", professors: "", courseUrl: "" })}>
              Καθαρισμός φόρμας
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
                {SLOTS.map(s => (
                  <tr key={s.key}>
                    <th className="rowHead">{s.label}</th>

                    {DAYS.map(d => {
                      const e = slotMap.get(`${d.key}__${s.key}`);
                      const selected = form.day === d.key && form.slot === s.key;

                      return (
                        <td
                          key={`${d.key}-${s.key}`}
                          className={`cell ${e ? "filled" : "empty"} ${selected ? "selected" : ""}`}
                          onClick={() => setDaySlot(d.key, s.key)}
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
                      <span>{dayLabel(s.day)} — {slotLabel(s.slot)}</span>
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
