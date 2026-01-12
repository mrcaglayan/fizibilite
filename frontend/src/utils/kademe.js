const GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Öncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "İlkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
];

function normalizeGrade(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "KG") return "KG";
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return String(n);
}

function gradeIndex(value) {
  const g = normalizeGrade(value);
  if (!g) return -1;
  return GRADES.indexOf(g);
}

function normalizeRange(fromValue, toValue, def) {
  const from = normalizeGrade(fromValue) ?? def.defaultFrom;
  const to = normalizeGrade(toValue) ?? def.defaultTo;
  const fromIdx = gradeIndex(from);
  const toIdx = gradeIndex(to);
  if (fromIdx < 0 || toIdx < 0) return { from: def.defaultFrom, to: def.defaultTo };
  if (fromIdx <= toIdx) return { from, to };
  return { from: to, to: from };
}

export function getKademeDefinitions() {
  return KADEME_DEFS.map((d) => ({ ...d }));
}

export function getDefaultKademeConfig() {
  const out = {};
  KADEME_DEFS.forEach((d) => {
    out[d.key] = { enabled: true, from: d.defaultFrom, to: d.defaultTo };
  });
  return out;
}

export function normalizeKademeConfig(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const out = {};
  KADEME_DEFS.forEach((d) => {
    const row = cfg[d.key] && typeof cfg[d.key] === "object" ? cfg[d.key] : {};
    const enabled = row.enabled !== false;
    const range = normalizeRange(row.from, row.to, d);
    out[d.key] = { enabled, ...range };
  });
  return out;
}

export function getKademeRangeLabel(config, key) {
  const def = KADEME_DEFS.find((d) => d.key === key);
  if (!def) return "";
  const cfg = normalizeKademeConfig(config)[key];
  if (!cfg?.enabled) return "";
  return cfg.from === cfg.to ? cfg.from : `${cfg.from}-${cfg.to}`;
}

export function formatKademeLabel(label, config, key) {
  const range = getKademeRangeLabel(config, key);
  if (!range) return label;
  return `${label} (${range})`;
}

export function getKademeForGrade(grade, config) {
  const idx = gradeIndex(grade);
  if (idx < 0) return null;
  const cfg = normalizeKademeConfig(config);
  for (const def of KADEME_DEFS) {
    const row = cfg[def.key];
    if (!row?.enabled) continue;
    const fromIdx = gradeIndex(row.from);
    const toIdx = gradeIndex(row.to);
    if (fromIdx <= idx && idx <= toIdx) return def.key;
  }
  return null;
}

export function summarizeGradesByKademe(grades, config) {
  const rows = Array.isArray(grades) ? grades : [];
  const out = { okulOncesi: 0, ilkokul: 0, ortaokul: 0, lise: 0, total: 0 };

  for (const r of rows) {
    // studentsPerBranch now represents TOTAL students for the grade (not per-branch).
    const students = Number(r?.studentsPerBranch || 0);
    if (!Number.isFinite(students)) continue;
    out.total += students;
    const key = getKademeForGrade(r?.grade, config);
    if (key && Object.prototype.hasOwnProperty.call(out, key)) out[key] += students;
  }

  return out;
}

export function getGradeOptions() {
  return GRADES.map((g) => g);
}
