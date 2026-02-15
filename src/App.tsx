import { useEffect, useMemo, useState } from "react";
import "./App.css";

/** ===== Types ===== */
type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
type ClassType = "THEORY" | "LAB";
type Theme = "dark" | "light";

type SlotDef = {
  id: string;
  start: string;
  end: string;
  label: string;
};

type Course = {
  id: string;
  title: string;
  defaultProfessors: string;
  courseUrl: string;
  createdAt: number;
};

type Assignment = {
  id: string;
  courseId: string;
  day: Day;
  slotId: string;
  classType: ClassType;
  room: string;
  professors: string; // slot-specific professors
  createdAt: number;
};

type CourseGroup = {
  course: Course;
  sessions: Assignment[];
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

const SLOTS_KEY = "uni-schedule:slots:v1";
const COURSES_KEY = "uni-schedule:courses:v1";
const ASSIGN_KEY = "uni-schedule:assignments:v1";
const THEME_KEY = "uni-schedule:theme:v1";

// legacy keys (from previous versions)
const LEGACY_ENTRIES_KEYS = ["uni-schedule:v3", "uni-schedule:v2", "uni-schedule:v1"];

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

function loadTheme(): Theme {
  const t = localStorage.getItem(THEME_KEY);
  return t === "light" ? "light" : "dark";
}

function buildSlotIndex(slots: SlotDef[]) {
  const idx = new Map<string, number>();
  slots.forEach((s, i) => idx.set(s.id, i));
  return idx;
}

function groupCourses(courses: Course[], assigns: Assignment[], slots: SlotDef[]): CourseGroup[] {
  const courseMap = new Map<string, Course>();
  for (const c of courses) courseMap.set(c.id, c);

  const slotIdx = buildSlotIndex(slots);
  const dayOrder = (d: Day) => DAYS.findIndex((x) => x.key === d);
  const slotOrder = (slotId: string) => slotIdx.get(slotId) ?? 9999;

  const map = new Map<string, CourseGroup>();
  for (const a of assigns) {
    const c = courseMap.get(a.courseId);
    if (!c) continue;
    if (!map.has(c.id)) map.set(c.id, { course: c, sessions: [] });
    map.get(c.id)!.sessions.push(a);
  }

  for (const g of map.values()) {
    g.sessions.sort((x, y) => {
      const dd = dayOrder(x.day) - dayOrder(y.day);
      if (dd !== 0) return dd;
      return slotOrder(x.slotId) - slotOrder(y.slotId);
    });
  }

  // include even courses with zero sessions, at end of list
  const withSessions = [...map.values()].sort((a, b) => a.course.title.localeCompare(b.course.title, "el"));
  const noSessions = courses
    .filter((c) => !map.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, "el"))
    .map((c) => ({ course: c, sessions: [] as Assignment[] }));

  return [...withSessions, ...noSessions];
}

/** ===== Export HTML ===== */
function buildExportHtml(courses: Course[], assigns: Assignment[], slots: SlotDef[], theme: Theme) {
  const courseMap = new Map<string, Course>();
  for (const c of courses) courseMap.set(c.id, c);

  const byKey = new Map<string, Assignment>();
  for (const a of assigns) byKey.set(`${a.day}__${a.slotId}`, a);

  const tableRows = slots
    .map((slot) => {
      const cells = DAYS.map((day) => {
        const a = byKey.get(`${day.key}__${slot.id}`);
        if (!a) return `<td class="cell empty"></td>`;

        const c = courseMap.get(a.courseId);
        const title = c?.title ?? "—";

        return `
          <td class="cell">
            <div class="cellTitle">${escapeHtml(title)}</div>
            <div class="cellMeta">
              <span class="badge">${typeShort(a.classType)}</span>
              <span class="room">${escapeHtml(a.room || "-")}</span>
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

  const groups = groupCourses(courses, assigns, slots);

  const listItems = groups
    .map((g) => {
      const c = g.course;
      const urlPart = c.courseUrl
        ? `<a href="${escapeHtml(c.courseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(c.courseUrl)}</a>`
        : `<span class="muted">—</span>`;

      const profPart = c.defaultProfessors?.trim() ? escapeHtml(c.defaultProfessors) : "—";

      const sessionsHtml =
        g.sessions.length === 0
          ? `<div class="liMeta muted">Δεν έχει τοποθετηθεί σε slot.</div>`
          : g.sessions
              .map(
                (s) => `
          <div class="sessionRow">
            <span>${escapeHtml(dayLabel(s.day))} — ${escapeHtml(slotLabel(s.slotId, slots))}</span>
            <span class="badge">${typeShort(s.classType)}</span>
            <span class="room">${escapeHtml(s.room || "—")}</span>
            <span class="muted">|</span>
            <span>${escapeHtml(s.professors || c.defaultProfessors || "—")}</span>
          </div>
        `
              )
              .join("");

      return `
        <li class="li">
          <div class="liTitle">${escapeHtml(c.title)}</div>
          <div class="liMeta"><b>Καθηγητές (default):</b> ${profPart}</div>
          <div class="liMeta"><b>Σελίδα μαθήματος:</b> ${urlPart}</div>
          <div class="liMeta"><b>Slots:</b></div>
          ${sessionsHtml}
        </li>
      `;
    })
    .join("");

  const now = new Date().toLocaleString("el-GR");
  const htmlThemeAttr = theme === "light" ? ` data-theme="light"` : ` data-theme="dark"`;

  return `<!doctype html>
<html lang="el"${htmlThemeAttr}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Εβδομαδιαίο Πρόγραμμα</title>
  <style>
    :root{
      --bg0:#05070b;
      --bg1:#0b1020;
      --text:#e5e7eb;
      --muted:#94a3b8;
      --border: rgba(255,255,255,.10);
      --blue:#22d3ee;
      --shadow: 0 14px 42px rgba(0,0,0,.60);
      --card: rgba(8,12,22,.78);
      --cardEmpty: rgba(8,12,22,.35);
      --dash: rgba(148,163,184,.25);
      --badgeBg: rgba(15,23,42,.75);
      --badgeBorder: rgba(255,255,255,.14);
    }
    html[data-theme="light"]{
      --bg0:#f7f7fb;
      --bg1:#ffffff;
      --text:#0f172a;
      --muted:#475569;
      --border: rgba(2,6,23,.12);
      --blue:#0ea5e9;
      --shadow: 0 14px 42px rgba(2,6,23,.08);
      --card: rgba(255,255,255,.92);
      --cardEmpty: rgba(255,255,255,.75);
      --dash: rgba(2,6,23,.20);
      --badgeBg: rgba(241,245,249,.95);
      --badgeBorder: rgba(2,6,23,.12);
    }

    body{
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
      margin:18px;
      color:var(--text);
      background:
        radial-gradient(900px 520px at 10% 0%, rgba(124,58,237,.18), transparent 58%),
        radial-gradient(780px 480px at 90% 10%, rgba(255,45,85,.12), transparent 58%),
        radial-gradient(920px 640px at 50% 120%, rgba(34,211,238,.10), transparent 58%),
        linear-gradient(180deg, var(--bg0), var(--bg1));
    }

    .wrap{max-width:1100px; margin:0 auto;}
    h1{margin:0 0 6px; font-size:22px; letter-spacing:.3px;}
    .sub{color:var(--muted); margin-bottom:14px; font-size:13px;}

    .tableScroll{overflow:auto; -webkit-overflow-scrolling: touch; padding-bottom:6px;}
    table{width:100%; border-collapse:separate; border-spacing:10px; table-layout:fixed; min-width:860px;}
    th, td{vertical-align:top;}
    .colHead{font-size:12.5px; color:var(--muted); text-align:left; padding-left:4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .rowHead{font-size:12px; color:var(--muted); text-align:right; padding-right:6px; width:140px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
    .cell{background: var(--card); border:1px solid var(--border); border-radius:16px; padding:10px; min-height:68px; box-shadow: var(--shadow);}
    .empty{background: var(--cardEmpty); border:1px dashed var(--dash); box-shadow:none;}
    .cellTitle{font-weight:900; font-size:13px; margin-bottom:6px; letter-spacing:.2px;}
    .cellMeta{display:flex; gap:8px; align-items:center; font-size:12px; color:var(--muted);}

    hr{border:none; border-top:1px solid var(--border); margin:18px 0;}
    ul{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;}
    .li{background: var(--card); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow: var(--shadow); break-inside: avoid;}
    .liTitle{font-weight:950; margin-bottom:6px; letter-spacing:.2px;}
    .liMeta{font-size:13px; color:var(--muted); margin-top:6px;}
    .muted{color:var(--muted);}
    a{color: var(--blue); text-decoration:none;}
    a:hover{text-decoration:underline;}
    .sessionRow{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px solid var(--border); break-inside: avoid;}
    .badge{display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:999px; border:1px solid var(--badgeBorder); background: var(--badgeBg); font-weight:950; font-size:12px;}
    .room{opacity:.95;}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Εβδομαδιαίο Πρόγραμμα</h1>
    <div class="sub">Παραγωγή: ${escapeHtml(now)} • Theme: ${escapeHtml(theme)}</div>

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

    <hr />

    <h1>Λίστα μαθημάτων</h1>
    <div class="sub">Ομαδοποιημένα ανά μάθημα (με slots)</div>

    <ul>
      ${listItems || `<li class="li"><span class="muted">Δεν υπάρχουν καταχωρήσεις.</span></li>`}
    </ul>
  </div>
</body>
</html>`;
}

/** ===== Legacy migration: Entries -> Courses + Assignments ===== */
function tryMigrateLegacyToNew(slots: SlotDef[]): { courses: Course[]; assigns: Assignment[] } | null {
  for (const key of LEGACY_ENTRIES_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) continue;

      // Legacy Entry shape: {id,title,day,slotId,classType,room,professors,courseUrl,createdAt}
      const byTitle = new Map<string, Course>();
      const courses: Course[] = [];
      const assigns: Assignment[] = [];

      for (const x of data) {
        if (!x || typeof x !== "object") continue;
        const title = typeof x.title === "string" ? x.title.trim() : "";
        const dayRaw = (x as any).day;
        const slotId = typeof (x as any).slotId === "string" ? (x as any).slotId : typeof (x as any).slot === "string" ? (x as any).slot : "";
        if (!title || !isDay(dayRaw) || !slotId) continue;

        const classTypeRaw = (x as any).classType;
        const classType: ClassType = isClassType(classTypeRaw) ? classTypeRaw : "THEORY";

        const room = typeof (x as any).room === "string" ? (x as any).room : "";
        const professors = typeof (x as any).professors === "string" ? (x as any).professors : "";
        const courseUrl = typeof (x as any).courseUrl === "string" ? (x as any).courseUrl : "";

        let course = byTitle.get(title);
        if (!course) {
          course = {
            id: uid(),
            title,
            defaultProfessors: professors,
            courseUrl,
            createdAt: Date.now(),
          };
          byTitle.set(title, course);
          courses.push(course);
        }

        // only keep assignments that match current slots
        if (!slots.some((s) => s.id === slotId)) continue;

        assigns.push({
          id: uid(),
          courseId: course.id,
          day: dayRaw,
          slotId,
          classType,
          room,
          professors: professors || course.defaultProfessors || "",
          createdAt: Date.now(),
        });
      }

      if (courses.length || assigns.length) return { courses, assigns };
    } catch {
      // try next
    }
  }
  return null;
}

/** ===== App ===== */
export default function App() {
  const [init] = useState(() => {
    const s = loadSlotsFromStorage();
    const theme = loadTheme();

    // load new storage if exists
    const rawCourses = localStorage.getItem(COURSES_KEY);
    const rawAssign = localStorage.getItem(ASSIGN_KEY);

    if (rawCourses && rawAssign) {
      try {
        const courses = JSON.parse(rawCourses) as Course[];
        const assigns = JSON.parse(rawAssign) as Assignment[];
        return { slots: s.slots, showSetup: s.isFirstTime, courses, assigns, theme };
      } catch {
        // fallthrough
      }
    }

    // try migrate from legacy
    const migrated = tryMigrateLegacyToNew(s.slots);
    if (migrated) {
      localStorage.setItem(COURSES_KEY, JSON.stringify(migrated.courses));
      localStorage.setItem(ASSIGN_KEY, JSON.stringify(migrated.assigns));
      return { slots: s.slots, showSetup: s.isFirstTime, courses: migrated.courses, assigns: migrated.assigns, theme };
    }

    return { slots: s.slots, showSetup: s.isFirstTime, courses: [] as Course[], assigns: [] as Assignment[], theme };
  });

  const [slots, setSlots] = useState<SlotDef[]>(init.slots);
  const [showSlotsSetup, setShowSlotsSetup] = useState<boolean>(init.showSetup);

  const [theme, setTheme] = useState<Theme>(init.theme);

  const [courses, setCourses] = useState<Course[]>(init.courses);
  const [assigns, setAssigns] = useState<Assignment[]>(init.assigns);

  // selection
  const [selectedCell, setSelectedCell] = useState<{ day: Day; slotId: string }>(() => ({
    day: "Mon",
    slotId: init.slots[0]?.id ?? DEFAULT_SLOTS[0].id,
  }));
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // course form (catalog)
  const [courseForm, setCourseForm] = useState({
    id: "" as string, // if set -> edit mode
    title: "",
    defaultProfessors: "",
    courseUrl: "",
  });

  // slot edit form (only for selected slot)
  const [slotEdit, setSlotEdit] = useState({
    classType: "THEORY" as ClassType,
    room: "",
    professors: "",
  });

  /** ===== Effects ===== */
  useEffect(() => {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }, [slots]);

  useEffect(() => {
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    localStorage.setItem(ASSIGN_KEY, JSON.stringify(assigns));
  }, [assigns]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.body.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  useEffect(() => {
    // ensure selected slot exists
    if (slots.length === 0) return;
    if (!slots.some((s) => s.id === selectedCell.slotId)) {
      setSelectedCell((p) => ({ ...p, slotId: slots[0].id }));
    }
  }, [slots, selectedCell.slotId]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const assignMap = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of assigns) m.set(`${a.day}__${a.slotId}`, a);
    return m;
  }, [assigns]);

  const groups = useMemo(() => groupCourses(courses, assigns, slots), [courses, assigns, slots]);

  const selectedAssignment = useMemo(() => {
    return assignMap.get(`${selectedCell.day}__${selectedCell.slotId}`) || null;
  }, [assignMap, selectedCell.day, selectedCell.slotId]);

  // whenever selected cell changes, load slot edit state from assignment (or defaults)
  useEffect(() => {
    if (!selectedAssignment) {
      setSlotEdit({ classType: "THEORY", room: "", professors: "" });
      return;
    }
    setSlotEdit({
      classType: selectedAssignment.classType,
      room: selectedAssignment.room || "",
      professors: selectedAssignment.professors || "",
    });
  }, [selectedAssignment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ===== Slots setup helpers ===== */
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
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function deleteSlot(id: string) {
    const used = assigns.some((a) => a.slotId === id);
    const ok = confirm(
      used
        ? "Αυτό το session χρησιμοποιείται σε καταχωρήσεις. Αν το σβήσεις, θα σβηστούν και τα αντίστοιχα slots.\n\nΣυνέχεια;"
        : "Σίγουρα θες να διαγράψεις αυτό το session;"
    );
    if (!ok) return;

    setSlots((prev) => prev.filter((s) => s.id !== id));
    setAssigns((prev) => prev.filter((a) => a.slotId !== id));
  }

  function resetToDefaults() {
    const ok = confirm(
      "Να γυρίσουμε στις προεπιλεγμένες ώρες (09–11, 11–13, 14–16, 16–18);\n\nΣημείωση: όσα slots είχαν custom sessions θα χαθούν."
    );
    if (!ok) return;

    const keep = new Set(DEFAULT_SLOTS.map((s) => s.id));
    setSlots(DEFAULT_SLOTS);
    setAssigns((prev) => prev.filter((a) => keep.has(a.slotId)));
  }

  /** ===== Courses (catalog) actions ===== */
  function upsertCourse() {
    const title = courseForm.title.trim();
    if (!title) return alert("Γράψε τίτλο μαθήματος.");

    // prevent duplicates by title (simple rule)
    const existsSameTitle = courses.some(
      (c) => c.title.trim().toLowerCase() === title.toLowerCase() && c.id !== courseForm.id
    );
    if (existsSameTitle) return alert("Υπάρχει ήδη μάθημα με αυτόν τον τίτλο.");

    if (courseForm.id) {
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseForm.id
            ? {
                ...c,
                title,
                defaultProfessors: courseForm.defaultProfessors.trim(),
                courseUrl: courseForm.courseUrl.trim(),
              }
            : c
        )
      );
      return;
    }

    const c: Course = {
      id: uid(),
      title,
      defaultProfessors: courseForm.defaultProfessors.trim(),
      courseUrl: courseForm.courseUrl.trim(),
      createdAt: Date.now(),
    };

    setCourses((prev) => [...prev, c]);
    setSelectedCourseId(c.id);
    setCourseForm({ id: "", title: "", defaultProfessors: "", courseUrl: "" });
  }

  function selectCourseForEdit(courseId: string) {
    const c = courseMap.get(courseId);
    if (!c) return;
    setSelectedCourseId(courseId);
    setCourseForm({
      id: c.id,
      title: c.title,
      defaultProfessors: c.defaultProfessors,
      courseUrl: c.courseUrl,
    });
  }

  function clearCourseForm() {
    setCourseForm({ id: "", title: "", defaultProfessors: "", courseUrl: "" });
  }

  function deleteCourse(courseId: string) {
    const c = courseMap.get(courseId);
    if (!c) return;
    const used = assigns.some((a) => a.courseId === courseId);

    const ok = confirm(
      used
        ? `Το μάθημα "${c.title}" έχει τοποθετηθεί σε slots. Αν το διαγράψεις, θα αφαιρεθούν και τα slots.\n\nΣυνέχεια;`
        : `Διαγραφή μαθήματος "${c.title}";`
    );
    if (!ok) return;

    setCourses((prev) => prev.filter((x) => x.id !== courseId));
    setAssigns((prev) => prev.filter((a) => a.courseId !== courseId));
    if (selectedCourseId === courseId) setSelectedCourseId("");
    if (courseForm.id === courseId) clearCourseForm();
  }

  function clearAllCoursesAndSlots() {
    const ok = confirm("Σίγουρα θες να διαγράψεις ΟΛΑ τα μαθήματα και ΟΛΑ τα slots;");
    if (!ok) return;
    setCourses([]);
    setAssigns([]);
    setSelectedCourseId("");
    clearCourseForm();
  }

  /** ===== Assignments actions ===== */
  function placeSelectedCourseToCell() {
    const courseId = selectedCourseId || "";
    if (!courseId) return alert("Διάλεξε μάθημα από τη λίστα.");
    const course = courseMap.get(courseId);
    if (!course) return alert("Το μάθημα δεν βρέθηκε.");

    const key = `${selectedCell.day}__${selectedCell.slotId}`;
    const existing = assignMap.get(key);

    if (existing) {
      const oldCourse = courseMap.get(existing.courseId);
      const ok = confirm(
        `Το slot ${dayLabel(selectedCell.day)} ${slotLabel(selectedCell.slotId, slots)} είναι ήδη πιασμένο από "${oldCourse?.title ?? "—"}".\n\nΘες αντικατάσταση;`
      );
      if (!ok) return;

      setAssigns((prev) =>
        prev.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                courseId,
                // όταν αλλάζουμε μάθημα, κρατάμε τα slot fields (room/type/professors) όπως είναι,
                // αλλά αν θες “reset” μπορείς να πατήσεις μετά “Επαναφορά από default”.
              }
            : a
        )
      );
      return;
    }

    const a: Assignment = {
      id: uid(),
      courseId,
      day: selectedCell.day,
      slotId: selectedCell.slotId,
      classType: "THEORY",
      room: "",
      professors: course.defaultProfessors || "",
      createdAt: Date.now(),
    };
    setAssigns((prev) => [...prev, a]);
  }

  function removeAssignmentFromCell() {
    if (!selectedAssignment) return;
    const ok = confirm("Αφαίρεση μαθήματος από αυτό το slot;");
    if (!ok) return;
    setAssigns((prev) => prev.filter((a) => a.id !== selectedAssignment.id));
  }

  function saveSlotEdits() {
    if (!selectedAssignment) return;
    setAssigns((prev) =>
      prev.map((a) =>
        a.id === selectedAssignment.id
          ? {
              ...a,
              classType: slotEdit.classType,
              room: slotEdit.room.trim(),
              professors: slotEdit.professors.trim(),
            }
          : a
      )
    );
  }

  function resetSlotProfessorsFromDefault() {
    if (!selectedAssignment) return;
    const c = courseMap.get(selectedAssignment.courseId);
    const def = c?.defaultProfessors || "";
    setSlotEdit((p) => ({ ...p, professors: def }));
  }

  /** ===== Export actions ===== */
  function openExportPreview() {
    const html = buildExportHtml(courses, assigns, slots, theme);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      return alert("Ο browser μπλόκαρε το νέο tab. Επίτρεψέ το και ξαναδοκίμασε.");
    }

    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  function downloadExportHtml() {
    const html = buildExportHtml(courses, assigns, slots, theme);
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

  /** ===== Theme toggle ===== */
  function toggleTheme() {
    setTheme((p) => (p === "dark" ? "light" : "dark"));
  }

  /** ===== Setup screen ===== */
  if (showSlotsSetup) {
    return (
      <div className="page">
        <header className="header">
          <div className="headerRow">
            <div>
              <h1>Ρύθμιση Sessions (Ωρών)</h1>
              <div className="sub">Πριν βάλεις μαθήματα, όρισε τα sessions/ώρες που θα έχει ο πίνακας.</div>
            </div>
            <button className="btn" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
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
        <div className="headerRow">
          <div>
            <h1>Εβδομαδιαίο Πρόγραμμα Μαθημάτων</h1>
            <div className="sub">
              1) Καταχωρείς μαθήματα στον κατάλογο. 2) Επιλέγεις μάθημα και τοποθετείς σε slot. 3) Πατάς slot για επεξεργασία.
            </div>
          </div>

          <div className="headerBtns">
            <button className="btn" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button className="btn" onClick={() => setShowSlotsSetup(true)}>
              Sessions
            </button>
          </div>
        </div>
      </header>

      <div className="layout">
        {/* LEFT: Catalog + Placement + Slot edit */}
        <section className="panel">
          <h2>Κατάλογος μαθημάτων</h2>

          <div className="formGrid">
            <label className="span2">
              Τίτλος μαθήματος *
              <input
                value={courseForm.title}
                onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="π.χ. Σήματα & Συστήματα"
              />
            </label>

            <label className="span2">
              Καθηγητές (default)
              <input
                value={courseForm.defaultProfessors}
                onChange={(e) => setCourseForm((p) => ({ ...p, defaultProfessors: e.target.value }))}
                placeholder="π.χ. Παπαδόπουλος, Γεωργίου"
              />
            </label>

            <label className="span2">
              Σελίδα μαθήματος (URL)
              <input
                value={courseForm.courseUrl}
                onChange={(e) => setCourseForm((p) => ({ ...p, courseUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>
          </div>

          <div className="btnRow">
            <button className="btn primary" onClick={upsertCourse}>
              {courseForm.id ? "Αποθήκευση αλλαγών" : "Προσθήκη μαθήματος"}
            </button>
            <button className="btn" onClick={clearCourseForm}>
              Καθαρισμός
            </button>
            <button className="btn danger" onClick={clearAllCoursesAndSlots}>
              Διαγραφή όλων
            </button>
          </div>

          <div className="sub">Κλικ σε μάθημα στη λίστα για επιλογή/επεξεργασία.</div>

          <div className="catalog">
            {courses.length === 0 ? (
              <div className="muted">Δεν υπάρχουν μαθήματα ακόμα.</div>
            ) : (
              courses
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title, "el"))
                .map((c) => {
                  const selected = selectedCourseId === c.id;
                  const count = assigns.filter((a) => a.courseId === c.id).length;
                  return (
                    <div key={c.id} className={`catalogItem ${selected ? "selected" : ""}`}>
                      <button className="catalogMain" onClick={() => selectCourseForEdit(c.id)} title="Επιλογή/Επεξεργασία">
                        <div className="catalogTitle">{c.title}</div>
                        <div className="catalogMeta">
                          <span className="muted">Slots:</span> {count}
                        </div>
                      </button>

                      <button className="mini danger" onClick={() => deleteCourse(c.id)} title="Διαγραφή">
                        ✕
                      </button>
                    </div>
                  );
                })
            )}
          </div>

          <hr className="sep" />

          <h2>Τοποθέτηση σε slot</h2>
          <div className="sub">
            Επιλεγμένο slot: <b>{dayLabel(selectedCell.day)}</b> • <b>{slotLabel(selectedCell.slotId, slots)}</b>
          </div>

          <div className="formGrid">
            <label className="span2">
              Επιλεγμένο μάθημα
              <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                <option value="">— διάλεξε —</option>
                {courses
                  .slice()
                  .sort((a, b) => a.title.localeCompare(b.title, "el"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="btnRow">
            <button className="btn primary" onClick={placeSelectedCourseToCell}>
              Τοποθέτηση στο slot
            </button>
            {selectedAssignment ? (
              <button className="btn danger" onClick={removeAssignmentFromCell}>
                Αφαίρεση από slot
              </button>
            ) : null}
          </div>

          <hr className="sep" />

          <h2>Επεξεργασία slot</h2>
          {!selectedAssignment ? (
            <div className="muted">Το slot είναι κενό. Τοποθέτησε πρώτα ένα μάθημα.</div>
          ) : (
            <>
              <div className="sub">
                Μάθημα: <b>{courseMap.get(selectedAssignment.courseId)?.title ?? "—"}</b>
              </div>

              <div className="formGrid">
                <label>
                  Τύπος (Θ/Ε)
                  <select value={slotEdit.classType} onChange={(e) => setSlotEdit((p) => ({ ...p, classType: e.target.value as ClassType }))}>
                    <option value="THEORY">Θεωρία (Θ)</option>
                    <option value="LAB">Εργαστήριο (Ε)</option>
                  </select>
                </label>

                <label>
                  Αίθουσα
                  <input value={slotEdit.room} onChange={(e) => setSlotEdit((p) => ({ ...p, room: e.target.value }))} placeholder="π.χ. Αμφ. Α1" />
                </label>

                <label className="span2">
                  Καθηγητές (για αυτό το slot)
                  <input
                    value={slotEdit.professors}
                    onChange={(e) => setSlotEdit((p) => ({ ...p, professors: e.target.value }))}
                    placeholder="π.χ. Παπαδόπουλος"
                  />
                </label>
              </div>

              <div className="btnRow">
                <button className="btn primary" onClick={saveSlotEdits}>
                  Αποθήκευση slot
                </button>
                <button className="btn" onClick={resetSlotProfessorsFromDefault} title="Φέρνει τους default καθηγητές του μαθήματος">
                  Επαναφορά καθηγητών από default
                </button>
              </div>
            </>
          )}

          <hr className="sep" />

          <h2>Ολοκλήρωση</h2>
          <div className="exportRow">
            <button className="btn" onClick={openExportPreview}>
              Προεπισκόπηση Export HTML
            </button>
            <button className="btn" onClick={downloadExportHtml}>
              Λήψη HTML αρχείου
            </button>
          </div>
        </section>

        {/* RIGHT: Table + grouped list */}
        <section className="panel">
          <h2>Πρόγραμμα</h2>

          <div className="sub">Σε κινητό: scroll δεξιά–αριστερά στον πίνακα. Tap σε κελί για επιλογή slot.</div>

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
                      const a = assignMap.get(`${d.key}__${s.id}`);
                      const selected = selectedCell.day === d.key && selectedCell.slotId === s.id;

                      const courseTitle = a ? courseMap.get(a.courseId)?.title ?? "—" : "";
                      return (
                        <td
                          key={`${d.key}-${s.id}`}
                          className={`cell ${a ? "filled" : "empty"} ${selected ? "selected" : ""}`}
                          onClick={() => setSelectedCell({ day: d.key, slotId: s.id })}
                          title="Κλικ/Ταπ για επιλογή slot"
                        >
                          {a ? (
                            <>
                              <div className="cellTitle">{courseTitle}</div>
                              <div className="cellMeta">
                                <span className="badge">{typeShort(a.classType)}</span>
                                <span className="room">{a.room || "—"}</span>
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

          <h2 className="mt">Λίστα μαθημάτων</h2>

          {groups.length === 0 ? (
            <div className="muted">Δεν υπάρχουν μαθήματα.</div>
          ) : (
            <ul className="list">
              {groups.map((g) => {
                const c = g.course;
                return (
                  <li key={c.id} className="li">
                    <div className="liTitle">{c.title}</div>

                    <div className="liMeta">
                      <b>Καθηγητές (default):</b> {c.defaultProfessors || "—"}
                    </div>

                    <div className="liMeta">
                      <b>Σελίδα:</b>{" "}
                      {c.courseUrl ? (
                        <a href={c.courseUrl} target="_blank" rel="noreferrer">
                          {c.courseUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </div>

                    <div className="liMeta">
                      <b>Slots:</b>
                    </div>

                    {g.sessions.length === 0 ? (
                      <div className="muted">Δεν έχει τοποθετηθεί σε slot.</div>
                    ) : (
                      g.sessions.map((s) => (
                        <div key={s.id} className="sessionRow">
                          <span>
                            {dayLabel(s.day)} — {slotLabel(s.slotId, slots)}
                          </span>
                          <span className="badge">{typeShort(s.classType)}</span>
                          <span className="room">{s.room || "—"}</span>
                          <span className="muted">|</span>
                          <span>{s.professors || c.defaultProfessors || "—"}</span>
                        </div>
                      ))
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
