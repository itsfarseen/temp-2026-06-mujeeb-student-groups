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

// Split a textarea's content into a clean list of names.
function namesOf(text) {
  return String(text)
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn-danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    state.classes.splice(index, 1);
    save();
    renderClasses();
  });
  head.appendChild(h2);
  head.appendChild(removeBtn);
  block.appendChild(head);

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
  els.newClassName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addClass();
  });

  document.getElementById("previewBtn").addEventListener("click", showPreview);
  document.getElementById("backBtn").addEventListener("click", showEditor);
  document.getElementById("downloadBtn").addEventListener("click", downloadCsv);

  renderGroupCount();
  renderClasses();
}

init();
