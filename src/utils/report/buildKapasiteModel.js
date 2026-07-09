// backend/src/utils/report/buildKapasiteModel.js
// Pure model builder for Excel export: "Kapasite" sheet (AOA-only)

const {
  normalizeProgramType,
  isKademeKeyVisible,
  mapBaseKademeToVariant,
} = require("../programType");

// --- kademe helpers (ported from frontend/src/utils/kademe.js) ---
const GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Öncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "İlkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
];

function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(a, b) {
  const A = Number(a);
  const B = Number(b);
  if (!Number.isFinite(A) || !Number.isFinite(B) || B === 0) return null;
  return A / B;
}

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

function normalizeKademeConfig(config) {
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

function getKademeRangeLabel(config, key) {
  const def = KADEME_DEFS.find((d) => d.key === key);
  if (!def) return "";
  const cfg = normalizeKademeConfig(config)[key];
  if (!cfg?.enabled) return "";
  return cfg.from === cfg.to ? cfg.from : `${cfg.from}-${cfg.to}`;
}

function formatKademeLabel(label, config, key) {
  const range = getKademeRangeLabel(config, key);
  if (!range) return label;
  return `${label} (${range})`;
}

function getKademeForGrade(grade, config) {
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

function summarizeGradesByKademe(grades, config) {
  const rows = Array.isArray(grades) ? grades : [];
  const out = { okulOncesi: 0, ilkokul: 0, ortaokul: 0, lise: 0, total: 0 };

  for (const r of rows) {
    // studentsPerBranch represents TOTAL students for the grade.
    const students = Number(r?.studentsPerBranch || 0);
    if (!Number.isFinite(students)) continue;
    out.total += students;
    const key = getKademeForGrade(r?.grade, config);
    if (key && Object.prototype.hasOwnProperty.call(out, key)) out[key] += students;
  }

  return out;
}

function normalizePlanningGrades(input) {
  if (Array.isArray(input)) return { y1: input, y2: input, y3: input };
  if (input && typeof input === "object") {
    const years = input.years && typeof input.years === "object" ? input.years : input;
    const y1 = Array.isArray(years?.y1) ? years.y1 : [];
    const y2 = Array.isArray(years?.y2) ? years.y2 : y1;
    const y3 = Array.isArray(years?.y3) ? years.y3 : y1;
    return { y1, y2, y3 };
  }
  return { y1: [], y2: [], y3: [] };
}

function parseAcademicStartYear(academicYear) {
  const raw = String(academicYear || "").trim();
  const m = raw.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function getYearLabel(baseYear, offset) {
  const y = Number.isFinite(Number(baseYear)) ? Number(baseYear) : null;
  if (y == null) return `${offset + 1}. YIL`;
  const a = y + offset;
  const b = y + offset + 1;
  return `${offset + 1}. YIL (${a}-${b})`;
}

/**
 * buildKapasiteModel
 * Reflects UI CapacityEditor.jsx structure:
 * - Growth rows (delta, growthRate)
 * - Kademe rows (capacity, students, utilization)
 * - TOTAL row
 */
function buildKapasiteModel({ scenario, inputs, programType, currencyMeta }) {
  const _inputs = inputs && typeof inputs === "object" ? inputs : {};
  const cap = _inputs.kapasite && typeof _inputs.kapasite === "object" ? _inputs.kapasite : {};
  const kademeConfig = _inputs?.temelBilgiler?.kademeler;
  const kademeler = normalizeKademeConfig(kademeConfig);

  const resolvedProgramType = normalizeProgramType(programType);

  const activeKademeler = KADEME_DEFS.filter((d) => kademeler?.[d.key]?.enabled);
  const variantCandidates = activeKademeler.length ? activeKademeler : KADEME_DEFS;
  let visibleKademeler = variantCandidates.filter((d) => {
    const variantKey = mapBaseKademeToVariant(d.key, resolvedProgramType);
    return isKademeKeyVisible(variantKey, resolvedProgramType);
  });
  if (!visibleKademeler.length) visibleKademeler = variantCandidates;

  const planningByYear = normalizePlanningGrades(_inputs.gradesYears || _inputs.grades);
  const plannedByYear = {
    y1: summarizeGradesByKademe(planningByYear.y1, kademeler),
    y2: summarizeGradesByKademe(planningByYear.y2, kademeler),
    y3: summarizeGradesByKademe(planningByYear.y3, kademeler),
  };

  const current = summarizeGradesByKademe(_inputs.gradesCurrent, kademeler);

  // Capacity storage: cap.byKademe[rowKey].caps = { cur, y1, y2, y3 }
  const srcByKademe = cap.byKademe && typeof cap.byKademe === "object" ? cap.byKademe : {};
  const byKademe = {};
  for (const lvl of visibleKademeler) {
    const row = srcByKademe?.[lvl.key] && typeof srcByKademe[lvl.key] === "object" ? srcByKademe[lvl.key] : {};
    const caps = row.caps && typeof row.caps === "object" ? row.caps : row; // legacy-friendly
    byKademe[lvl.key] = {
      caps: {
        cur: n0(caps?.cur),
        y1: n0(caps?.y1),
        y2: n0(caps?.y2),
        y3: n0(caps?.y3),
      },
    };
  }

  const sumCap = (periodKey) => {
    let t = 0;
    for (const lvl of visibleKademeler) {
      t += n0(byKademe?.[lvl.key]?.caps?.[periodKey]);
    }
    return t;
  };

  const totals = {
    cur: sumCap("cur"),
    y1: sumCap("y1"),
    y2: sumCap("y2"),
    y3: sumCap("y3"),
  };

  const studentsTotals = {
    cur: n0(current?.total),
    y1: n0(plannedByYear?.y1?.total),
    y2: n0(plannedByYear?.y2?.total),
    y3: n0(plannedByYear?.y3?.total),
  };

  // Growth calculations (TOTAL)
  const delta = {
    y1: studentsTotals.y1 - studentsTotals.cur,
    y2: studentsTotals.y2 - studentsTotals.y1,
    y3: studentsTotals.y3 - studentsTotals.y2,
  };
  const growthRate = {
    y1: safeDiv(delta.y1, studentsTotals.cur),
    y2: safeDiv(delta.y2, studentsTotals.y1),
    y3: safeDiv(delta.y3, studentsTotals.y2),
  };

  const baseYear = parseAcademicStartYear(scenario?.academic_year);
  const periods = {
    cur: { key: "cur", label: "Mevcut veya Ön Kayıt" },
    y1: { key: "y1", label: getYearLabel(baseYear, 0) },
    y2: { key: "y2", label: getYearLabel(baseYear, 1) },
    y3: { key: "y3", label: getYearLabel(baseYear, 2) },
  };

  const rows = [];

  // Growth rows
  rows.push({
    kind: "growthDelta",
    label: "Bir Önceki Yıla Göre Öğrenci Artışı",
    values: { y1: n0(delta.y1), y2: n0(delta.y2), y3: n0(delta.y3) },
  });
  rows.push({
    kind: "growthRate",
    label: "1'nci Yıla Göre Öğrenci Artış Oranı",
    values: {
      y1: growthRate.y1 == null ? null : growthRate.y1 * 100,
      y2: growthRate.y2 == null ? null : growthRate.y2 * 100,
      y3: growthRate.y3 == null ? null : growthRate.y3 * 100,
    },
  });

  // Kademe rows
  for (const lvl of visibleKademeler) {
    const label = formatKademeLabel(lvl.label, kademeler, lvl.key);
    const studentsCur = n0(current?.[lvl.key]);
    const studentsY1 = n0(plannedByYear?.y1?.[lvl.key]);
    const studentsY2 = n0(plannedByYear?.y2?.[lvl.key]);
    const studentsY3 = n0(plannedByYear?.y3?.[lvl.key]);

    const capCur = n0(byKademe?.[lvl.key]?.caps?.cur);
    const capY1 = n0(byKademe?.[lvl.key]?.caps?.y1);
    const capY2 = n0(byKademe?.[lvl.key]?.caps?.y2);
    const capY3 = n0(byKademe?.[lvl.key]?.caps?.y3);

    const utilCur = capCur > 0 ? (studentsCur / capCur) * 100 : null;
    const utilY1 = capY1 > 0 ? (studentsY1 / capY1) * 100 : null;
    const utilY2 = capY2 > 0 ? (studentsY2 / capY2) * 100 : null;
    const utilY3 = capY3 > 0 ? (studentsY3 / capY3) * 100 : null;

    rows.push({
      kind: "kademe",
      key: lvl.key,
      label,
      periods: {
        cur: { capacity: capCur, students: studentsCur, utilizationPct: utilCur },
        y1: { capacity: capY1, students: studentsY1, utilizationPct: utilY1 },
        y2: { capacity: capY2, students: studentsY2, utilizationPct: utilY2 },
        y3: { capacity: capY3, students: studentsY3, utilizationPct: utilY3 },
      },
    });
  }

  // TOTAL row
  const totalUtil = {
    cur: totals.cur > 0 ? (studentsTotals.cur / totals.cur) * 100 : null,
    y1: totals.y1 > 0 ? (studentsTotals.y1 / totals.y1) * 100 : null,
    y2: totals.y2 > 0 ? (studentsTotals.y2 / totals.y2) * 100 : null,
    y3: totals.y3 > 0 ? (studentsTotals.y3 / totals.y3) * 100 : null,
  };

  rows.push({
    kind: "total",
    label: "TOPLAM",
    periods: {
      cur: { capacity: totals.cur, students: studentsTotals.cur, utilizationPct: totalUtil.cur },
      y1: { capacity: totals.y1, students: studentsTotals.y1, utilizationPct: totalUtil.y1 },
      y2: { capacity: totals.y2, students: studentsTotals.y2, utilizationPct: totalUtil.y2 },
      y3: { capacity: totals.y3, students: studentsTotals.y3, utilizationPct: totalUtil.y3 },
    },
  });

  return {
    title: "Kapasite",
    periods,
    rows,
    meta: {
      programType: resolvedProgramType,
      currencyMeta: currencyMeta || null,
    },
  };
}

module.exports = { buildKapasiteModel };
