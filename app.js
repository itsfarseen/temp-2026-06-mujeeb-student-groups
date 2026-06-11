"use strict";

/* ============================================================
 * Student Group List — vanilla JS app
 * State is the single source of truth; UI re-renders from it.
 * ============================================================ */

const STORAGE_KEY = "studentGroups.v1";

/** @type {{ institution: string, groupCount: number, classes: { name: string, groups: string[] }[] }} */
let state = {
  institution: "",
  groupCount: 4,
  classes: [],
};

/* ---------------- Persistence ---------------- */

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore storage errors (e.g. private mode) */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.institution = typeof parsed.institution === "string" ? parsed.institution : "";
      state.groupCount = Number.isInteger(parsed.groupCount) && parsed.groupCount >= 1 ? parsed.groupCount : 4;
      state.classes = Array.isArray(parsed.classes)
        ? parsed.classes
            .filter((c) => c && typeof c.name === "string")
            .map((c) => ({
              name: c.name,
              groups: Array.isArray(c.groups) ? c.groups.map((g) => (typeof g === "string" ? g : "")) : [],
            }))
        : [];
    }
  } catch (e) {
    /* ignore corrupt storage */
  }
}

/* ---------------- Helpers ---------------- */

// Ensure a class's groups array is at least `n` long (never truncate — preserves hidden data).
function ensureGroups(cls, n) {
  while (cls.groups.length < n) cls.groups.push("");
  return cls.groups;
}

// Parse the leading number from a class code: "6A" -> 6, "12B" -> 12. Strips trailing non-digits.
function classNumber(name) {
  const m = String(name).trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Subtitle: "Group List(M-N)" using lowest..highest class numbers.
function buildSubtitle() {
  const nums = state.classes.map((c) => classNumber(c.name)).filter((n) => n !== null);
  if (nums.length === 0) return "Group List()";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `Group List(${lo})` : `Group List(${lo}-${hi})`;
}

// Normalize a raw student name: separators -> spaces, collapse whitespace,
// and Title-Case each word (e.g. "jane doe p.q" -> "Jane Doe P Q").
function cleanName(name) {
  return String(name)
    .replace(/[.,;:/\\|]+/g, " ") // separator punctuation -> space
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Split a textarea's content into a clean list of names.
function namesOf(text) {
  return String(text)
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse a pasted block into per-group name lists.
 *
 * Walks line by line. A line like "GROUP 2" (case-insensitive) starts a new
 * group; every following non-blank line is added to that group until the next
 * marker. Lines before the first marker (e.g. a "*III-F*" header) and blank
 * lines are ignored.
 *
 * @returns {{ groups: { [idx: number]: string }, maxGroupNum: number }}
 *   groups keyed by 0-based group index, joined with newlines; maxGroupNum is
 *   the highest 1-based group number seen (0 if none).
 */
function parseAiInput(text) {
  const groups = {};
  let maxGroupNum = 0;
  let current = null; // 0-based index of the group currently being filled

  String(text)
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;

      const m = trimmed.match(/^group\s*(\d+)\b/i);
      if (m) {
        const num = parseInt(m[1], 10);
        current = num - 1;
        if (num > maxGroupNum) maxGroupNum = num;
        if (!(current in groups)) groups[current] = [];
        return;
      }

      if (current !== null) {
        const cleaned = cleanName(trimmed);
        if (cleaned.length > 0) groups[current].push(cleaned);
      }
    });

  // Join each group's names into the textarea string format.
  const joined = {};
  Object.keys(groups).forEach((idx) => {
    joined[idx] = groups[idx].join("\n");
  });

  return { groups: joined, maxGroupNum };
}

/**
 * Build the logical 2D grid shared by the HTML table and the CSV.
 * Returns { rows, meta } where rows is string[][] and meta marks special rows.
 */
function buildGrid() {
  const N = state.groupCount;
  const cols = 3 * N;
  const rows = [];
  const meta = []; // per-row tag: "title" | "header" | "spacer" | "data"

  const pad = (arr) => {
    const r = arr.slice();
    while (r.length < cols) r.push("");
    return r;
  };

  // Title rows
  rows.push(pad([state.institution])); meta.push("title");
  rows.push(pad([buildSubtitle()])); meta.push("title");
  // Spacer
  rows.push(pad([])); meta.push("spacer");

  // Header row
  const header = [];
  for (let k = 1; k <= N; k++) header.push("Reg.No", `Group ${k}`, "Class");
  rows.push(header); meta.push("header");

  // Sections
  state.classes.forEach((cls, ci) => {
    ensureGroups(cls, N);
    const lists = [];
    for (let k = 0; k < N; k++) lists.push(namesOf(cls.groups[k] || ""));
    const blockHeight = lists.reduce((max, l) => Math.max(max, l.length), 0);

    for (let i = 0; i < blockHeight; i++) {
      const row = [];
      for (let k = 0; k < N; k++) {
        const name = lists[k][i];
        if (name === undefined) {
          row.push("", "", "");
        } else {
          row.push("", name, cls.name);
        }
      }
      rows.push(pad(row)); meta.push("data");
    }

    // One blank separator row between consecutive sections (not after the last).
    if (ci < state.classes.length - 1) {
      rows.push(pad([])); meta.push("spacer");
    }
  });

  return { rows, meta, cols };
}

/* ---------------- CSV ---------------- */

function csvField(value) {
  const s = String(value == null ? "" : value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv() {
  const { rows } = buildGrid();
  return rows.map((r) => r.map(csvField).join(",")).join("\n");
}

function downloadCsv() {
  const csv = buildCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "group-list.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadExcel() {
  if (typeof ExcelJS === "undefined") {
    alert("Excel export library failed to load (no network?).");
    return;
  }

  const { rows, meta, cols } = buildGrid();
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Group List");

  rows.forEach((row, i) => {
    const tag = meta[i];
    const excelRow = ws.addRow(row);
    const r = excelRow.number; // 1-based row index
    if (tag === "title") {
      ws.mergeCells(r, 1, r, cols); // span full width
      const cell = ws.getCell(r, 1);
      cell.value = row[0]; // keep title text in merged cell
      cell.font = { bold: true };
    } else if (tag === "header") {
      excelRow.font = { bold: true }; // bold the whole header row
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "group-list.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Editor rendering ---------------- */

const els = {
  editor: document.getElementById("editor"),
  preview: document.getElementById("preview"),
  institution: document.getElementById("institution"),
  groupCount: document.getElementById("groupCount"),
  classes: document.getElementById("classes"),
  newClassName: document.getElementById("newClassName"),
  tableWrap: document.getElementById("tableWrap"),
};

// Render one class block.
function renderClassBlock(cls, index) {
  ensureGroups(cls, state.groupCount);

  const block = document.createElement("div");
  block.className = "class-block";

  const head = document.createElement("div");
  head.className = "class-block-head";
  const h2 = document.createElement("h2");
  h2.textContent = cls.name;

  const headActions = document.createElement("div");
  headActions.className = "class-block-actions";

  // Toggle between the per-group editor and the AI paste panel.
  const aiBtn = document.createElement("button");
  aiBtn.className = "btn";
  aiBtn.textContent = cls.aiMode ? "Edit groups" : "Use AI";
  aiBtn.addEventListener("click", () => {
    cls.aiMode = !cls.aiMode;
    renderClasses();
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    state.classes.splice(index, 1);
    save();
    renderClasses();
  });
  headActions.appendChild(aiBtn);
  headActions.appendChild(removeBtn);
  head.appendChild(h2);
  head.appendChild(headActions);
  block.appendChild(head);

  if (cls.aiMode) {
    block.appendChild(renderAiPanel(cls));
    return block;
  }

  const grid = document.createElement("div");
  grid.className = "group-grid";

  // Render a textarea for every stored group, hiding those beyond groupCount.
  for (let k = 0; k < cls.groups.length; k++) {
    const field = document.createElement("label");
    field.className = "field group-field";
    if (k >= state.groupCount) field.style.display = "none";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = `Group ${k + 1}`;

    const ta = document.createElement("textarea");
    ta.value = cls.groups[k];
    ta.placeholder = "One student name per line";
    ta.addEventListener("input", () => {
      cls.groups[k] = ta.value;
      save();
    });

    field.appendChild(label);
    field.appendChild(ta);
    grid.appendChild(field);
  }

  block.appendChild(grid);
  return block;
}

// AI paste panel: one textarea + a button that parses it into the group boxes.
function renderAiPanel(cls) {
  const panel = document.createElement("div");
  panel.className = "ai-panel";

  const field = document.createElement("label");
  field.className = "field";
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = "AI input";

  const ta = document.createElement("textarea");
  ta.className = "ai-input";
  ta.value = cls.aiText || "";
  ta.placeholder =
    "Paste a block like:\n\nGROUP 1\nName One\nName Two\n\nGROUP 2\nName Three\n...";
  ta.addEventListener("input", () => {
    cls.aiText = ta.value;
  });
  field.appendChild(label);
  field.appendChild(ta);
  panel.appendChild(field);

  const applyBtn = document.createElement("button");
  applyBtn.className = "btn btn-primary";
  applyBtn.textContent = "Save";
  applyBtn.addEventListener("click", () => applyAiInput(cls));
  panel.appendChild(applyBtn);

  return panel;
}

// Parse the class's AI text and replace its group boxes with the result.
function applyAiInput(cls) {
  const { groups, maxGroupNum } = parseAiInput(cls.aiText || "");

  // Grow the global group count if the text references higher-numbered groups.
  if (maxGroupNum > state.groupCount) {
    state.groupCount = maxGroupNum;
    state.classes.forEach((c) => ensureGroups(c, state.groupCount));
    renderGroupCount();
  }

  ensureGroups(cls, state.groupCount);
  // Replace-all: clear every group box, then fill the ones found in the text.
  cls.groups = cls.groups.map(() => "");
  Object.keys(groups).forEach((idx) => {
    const i = Number(idx);
    while (cls.groups.length <= i) cls.groups.push("");
    cls.groups[i] = groups[idx];
  });

  cls.aiMode = false;
  cls.aiText = "";
  save();
  renderClasses();
}

function renderClasses() {
  els.classes.innerHTML = "";
  state.classes.forEach((cls, i) => {
    els.classes.appendChild(renderClassBlock(cls, i));
  });
}

function renderGroupCount() {
  els.groupCount.textContent = String(state.groupCount);
}

/* ---------------- Preview rendering ---------------- */

function renderPreview() {
  const { rows, meta, cols } = buildGrid();
  const table = document.createElement("table");
  table.className = "preview-table";

  rows.forEach((row, ri) => {
    const tag = meta[ri];
    const tr = document.createElement("tr");

    if (tag === "spacer") {
      tr.className = "spacer-row";
      const td = document.createElement("td");
      td.colSpan = cols;
      tr.appendChild(td);
      table.appendChild(tr);
      return;
    }

    if (tag === "title") {
      const td = document.createElement("td");
      td.className = "title-cell";
      td.colSpan = cols;
      td.textContent = row[0] || "";
      tr.appendChild(td);
      table.appendChild(tr);
      return;
    }

    // header or data row: emit each column
    row.forEach((val, ci) => {
      const cell = document.createElement(tag === "header" ? "th" : "td");
      const colKind = ci % 3; // 0 Reg.No, 1 Name, 2 Class
      cell.className =
        (tag === "header" ? "header-cell " : "") +
        (colKind === 0 ? "col-regno" : colKind === 1 ? "col-name" : "col-class");
      cell.textContent = val || "";
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });

  els.tableWrap.innerHTML = "";
  els.tableWrap.appendChild(table);
}

/* ---------------- View switching ---------------- */

function showPreview() {
  renderPreview();
  els.editor.style.display = "none";
  els.preview.style.display = "block";
}

function showEditor() {
  els.preview.style.display = "none";
  els.editor.style.display = "block";
}

/* ---------------- Group count controls ---------------- */

function changeGroupCount(delta) {
  const next = state.groupCount + delta;
  if (next < 1) return;
  state.groupCount = next;
  // Grow each class's stored groups so new textareas appear; never shrink (data kept).
  state.classes.forEach((cls) => ensureGroups(cls, state.groupCount));
  save();
  renderGroupCount();
  renderClasses();
}

/* ---------------- Add class ---------------- */

function addClass() {
  const name = els.newClassName.value.trim();
  if (!name) return;
  const cls = { name, groups: [] };
  ensureGroups(cls, state.groupCount);
  state.classes.push(cls);
  els.newClassName.value = "";
  save();
  renderClasses();
}

/* ---------------- Sort classes ---------------- */

// Split a class name into a leading number (0 if none) and the trimmed,
// lower-cased remainder, for ordering classes like "6A" < "6B" < "12A".
function classSortKey(name) {
  const s = String(name).trim();
  const m = s.match(/^(\d+)(.*)$/);
  const num = m ? parseInt(m[1], 10) : 0;
  const rest = (m ? m[2] : s).trim().toLowerCase();
  return { num, rest };
}

function sortClasses() {
  state.classes.sort((a, b) => {
    const ka = classSortKey(a.name), kb = classSortKey(b.name);
    if (ka.num !== kb.num) return ka.num - kb.num;
    return ka.rest.localeCompare(kb.rest);
  });
  save();
  renderClasses();
}

/* ---------------- Wire up ---------------- */

function init() {
  load();

  els.institution.value = state.institution;
  els.institution.addEventListener("input", () => {
    state.institution = els.institution.value;
    save();
  });

  document.getElementById("groupMinus").addEventListener("click", () => changeGroupCount(-1));
  document.getElementById("groupPlus").addEventListener("click", () => changeGroupCount(1));

  document.getElementById("addClassBtn").addEventListener("click", addClass);
  document.getElementById("sortClassesBtn").addEventListener("click", sortClasses);
  els.newClassName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addClass();
  });

  document.getElementById("previewBtn").addEventListener("click", showPreview);
  document.getElementById("backBtn").addEventListener("click", showEditor);
  document.getElementById("downloadBtn").addEventListener("click", downloadCsv);
  document.getElementById("downloadXlsBtn").addEventListener("click", downloadExcel);

  renderGroupCount();
  renderClasses();
}

init();
