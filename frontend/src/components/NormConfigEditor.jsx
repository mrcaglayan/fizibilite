//frontend/src/components/NormConfigEditor.jsx

import React, { useMemo, useState } from "react";
import { getGradeOptions, getKademeDefinitions, getKademeForGrade, formatKademeLabel, normalizeKademeConfig } from "../utils/kademe";
import NumberInput from "./NumberInput";

const KEY_SEP = "||"; // stored subject key format: "Teacher||Lesson"
const ALL_GRADES = getGradeOptions();
const GRADE_INDEX = new Map(ALL_GRADES.map((g, i) => [g, i]));
const YEAR_KEYS = ["y1", "y2", "y3"];
const DEFAULT_MAX_HOURS = 24;

const KADEME_DEFS = getKademeDefinitions();
const KADEME_LABELS = Object.freeze(
  KADEME_DEFS.reduce((m, d) => {
    m[d.key] = d.label;
    return m;
  }, {})
);

const EMPTY_ARRAY = Object.freeze([]);

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function buildEmptyCurriculum() {
  const out = {};
  ALL_GRADES.forEach((g) => (out[g] = {}));
  return out;
}

function normalizeNormValue(value) {
  const v = value && typeof value === "object" ? value : {};
  const yearsSrc = v?.years && typeof v.years === "object" ? v.years : null;
  if (yearsSrc) {
    const outYears = {};
    YEAR_KEYS.forEach((y) => {
      const src = yearsSrc?.[y] || {};
      const hoursRaw = Number(src?.teacherWeeklyMaxHours ?? v?.teacherWeeklyMaxHours ?? DEFAULT_MAX_HOURS);
      const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : DEFAULT_MAX_HOURS;
      const curr =
        src?.curriculumWeeklyHours && typeof src.curriculumWeeklyHours === "object"
          ? src.curriculumWeeklyHours
          : buildEmptyCurriculum();
      outYears[y] = { teacherWeeklyMaxHours: hours, curriculumWeeklyHours: curr };
    });
    return { years: outYears };
  }

  const baseHoursRaw = Number(v?.teacherWeeklyMaxHours ?? DEFAULT_MAX_HOURS);
  const baseHours = Number.isFinite(baseHoursRaw) && baseHoursRaw > 0 ? baseHoursRaw : DEFAULT_MAX_HOURS;
  const baseCurr =
    v?.curriculumWeeklyHours && typeof v.curriculumWeeklyHours === "object"
      ? v.curriculumWeeklyHours
      : buildEmptyCurriculum();

  const years = {};
  YEAR_KEYS.forEach((y) => {
    years[y] = { teacherWeeklyMaxHours: baseHours, curriculumWeeklyHours: structuredClone(baseCurr) };
  });
  return { years };
}

function encodeKey(teacher, lesson) {
  const t = String(teacher || "").trim();
  const l = String(lesson || "").trim();
  if (!t && !l) return "";
  if (!l) return t;
  if (!t) return l;
  return `${t}${KEY_SEP}${l}`;
}

function decodeKey(key) {
  const k = String(key || "");
  if (k.includes(KEY_SEP)) {
    const [t, ...rest] = k.split(KEY_SEP);
    return { teacher: t || "", lesson: rest.join(KEY_SEP) || "" };
  }
  return { teacher: k, lesson: k };
}

function normalizeGrades(grades, gradeOrder) {
  const data = Array.isArray(grades) ? grades : [];
  const order = Array.isArray(gradeOrder) && gradeOrder.length ? gradeOrder : ALL_GRADES;
  return order.map((g) => {
    const row = data.find((x) => String(x.grade) === g) || { grade: g, branchCount: 0, studentsPerBranch: 0 };
    return {
      grade: g,
      branchCount: safeNum(row.branchCount),
      studentsPerBranch: safeNum(row.studentsPerBranch),
    };
  });
}

function normalizePlanningGrades(input) {
  if (Array.isArray(input)) {
    return { y1: input, y2: input, y3: input };
  }
  if (input && typeof input === "object") {
    const years = input.years && typeof input.years === "object" ? input.years : input;
    const y1 = Array.isArray(years?.y1) ? years.y1 : [];
    const y2 = Array.isArray(years?.y2) ? years.y2 : y1;
    const y3 = Array.isArray(years?.y3) ? years.y3 : y1;
    return { y1, y2, y3 };
  }
  return { y1: [], y2: [], y3: [] };
}

function totalStudentsFromGrades(grades) {
  const rows = normalizeGrades(grades, ALL_GRADES);
  // studentsPerBranch now represents TOTAL students for the grade (not per-branch)
  return rows.reduce((s, r) => s + safeNum(r.studentsPerBranch), 0);
}

function resolveVisibleGrades(kademeConfig) {
  const cfg = normalizeKademeConfig(kademeConfig);
  const included = new Set();
  Object.values(cfg).forEach((row) => {
    if (!row?.enabled) return;
    const fromIdx = GRADE_INDEX.get(String(row.from));
    const toIdx = GRADE_INDEX.get(String(row.to));
    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    for (let i = start; i <= end; i += 1) included.add(ALL_GRADES[i]);
  });
  const list = ALL_GRADES.filter((g) => included.has(g));
  return list.length ? list : ALL_GRADES;
}


function buildKademeSegments(gradeOrder, kademeConfig) {
  const order = Array.isArray(gradeOrder) && gradeOrder.length ? gradeOrder : ALL_GRADES;
  const segments = [];

  let curKey = null;
  let curGrades = [];

  const push = () => {
    if (!curGrades.length) return;
    const key = curKey;
    const label = key ? formatKademeLabel(KADEME_LABELS[key] || key, kademeConfig, key) : "";
    segments.push({ key, label, grades: curGrades });
  };

  for (const g of order) {
    const k = getKademeForGrade(g, kademeConfig);
    if (k !== curKey && curGrades.length) {
      push();
      curGrades = [];
    }
    if (k !== curKey) curKey = k;
    curGrades.push(g);
  }
  push();

  return segments;
}

function GradeTable({
  title,
  subtitle,
  grades,
  onChange,
  dirtyPaths,
  onDirty,
  pathPrefix,
  gradeColWidth,
  inputWidth,
  gradeOrder,
  allGrades,
  kademeConfig,
}) {
  const visibleOrder = Array.isArray(gradeOrder) && gradeOrder.length ? gradeOrder : ALL_GRADES;
  const fullOrder = Array.isArray(allGrades) && allGrades.length ? allGrades : visibleOrder;
  const data = normalizeGrades(grades, visibleOrder);
  const fullData = normalizeGrades(grades, fullOrder);
  const disabled = typeof onChange !== "function";
  const isDirty = (path) => (path && dirtyPaths ? dirtyPaths.has(path) : false);
  const inputClass = (base, path) => base + (isDirty(path) ? " input-dirty" : "");
  const makePath = (grade, field) => (pathPrefix ? `${pathPrefix}.${grade}.${field}` : "");

  const totals = data.reduce(
    (acc, r) => {
      // studentsPerBranch is TOTAL students for the grade.
      const gradeStudents = safeNum(r.studentsPerBranch);
      acc.totalBranches += safeNum(r.branchCount);
      acc.totalStudents += gradeStudents;
      return acc;
    },
    { totalBranches: 0, totalStudents: 0 }
  );

  function setField(grade, field, value) {
    if (disabled) return;
    const nextValue = value === "" ? 0 : safeNum(value);
    const next = fullData.map((r) => {
      if (r.grade !== grade) return r;
      return { ...r, [field]: nextValue };
    });
    onChange(next);
    if (pathPrefix) onDirty?.(makePath(grade, field), nextValue);
  }

  const dividerStyle = { borderLeft: "2px solid rgba(0,0,0,0.10)" };
  const totalColStyle = { background: "rgba(0,0,0,0.04)" };
  const rowLabelStyle = { fontWeight: 800, whiteSpace: "nowrap" };

  const LABEL_COL_W = 150;
  const GRADE_COL_W = Number.isFinite(gradeColWidth) ? gradeColWidth : 44;
  const TOTAL_COL_W = 78;

  const compactInputStyle = {
    width: Number.isFinite(inputWidth) ? inputWidth : GRADE_COL_W - 4,
    boxSizing: "border-box",
    textAlign: "right",
    paddingLeft: 4,
    paddingRight: 4,
  };

  const segments = useMemo(() => buildKademeSegments(visibleOrder, kademeConfig), [visibleOrder, kademeConfig]);

  // kademe total students per segment
  const segmentTotals = useMemo(() => {
    const byGrade = new Map(data.map((r) => [r.grade, safeNum(r.studentsPerBranch)]));
    return segments.map((seg) => seg.grades.reduce((s, g) => s + safeNum(byGrade.get(g)), 0));
  }, [segments, data]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {subtitle ? <div className="small">{subtitle}</div> : null}
        </div>
        <div className="row">
          <span className="badge">Toplam Şube: {totals.totalBranches.toFixed(0)}</span>
          <span className="badge">Toplam Öğrenci: {totals.totalStudents.toFixed(0)}</span>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="table" style={{ tableLayout: "fixed" }}>
          <thead>
            {/* Grouping header (Kademe) */}
            <tr>
              <th
                rowSpan={2}
                style={{ minWidth: LABEL_COL_W, width: LABEL_COL_W, maxWidth: LABEL_COL_W }}
              ></th>
              {segments.map((seg, idx) => (
                <th
                  key={`${seg.key || "none"}-${idx}`}
                  colSpan={seg.grades.length}
                  style={{
                    textAlign: "center",
                    fontWeight: 900,
                    paddingTop: 6,
                    paddingBottom: 6,
                    ...(idx === 0 ? {} : dividerStyle),
                    background: "rgba(15, 23, 42, 0.03)",
                  }}
                  title={seg.label}
                >
                  {seg.label}
                </th>
              ))}
              <th
                rowSpan={2}
                style={{
                  textAlign: "right",
                  minWidth: TOTAL_COL_W,
                  width: TOTAL_COL_W,
                  maxWidth: TOTAL_COL_W,
                  ...dividerStyle,
                  ...totalColStyle,
                  paddingLeft: 8,
                  paddingRight: 8,
                }}
              >
                TOPLAM
              </th>
            </tr>

            {/* Grade headers */}
            <tr>
              {data.map((r, idx) => (
                <th
                  key={r.grade}
                  style={{
                    textAlign: "right",
                    minWidth: GRADE_COL_W,
                    width: GRADE_COL_W,
                    maxWidth: GRADE_COL_W,
                    ...(idx === 0 ? {} : dividerStyle),
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  {r.grade}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={rowLabelStyle}>Şube Sayısı</td>
              {data.map((r, idx) => (
                <td
                  key={r.grade}
                  style={{
                    textAlign: "right",
                    ...(idx === 0 ? {} : dividerStyle),
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  <NumberInput
                    className={inputClass("input sm", makePath(r.grade, "branchCount"))}
                    style={compactInputStyle}
                    min="0"
                    step="1"
                    value={r.branchCount}
                    disabled={disabled}
                    onChange={(value) => setField(r.grade, "branchCount", value)}
                  />
                </td>
              ))}
              <td
                style={{
                  textAlign: "right",
                  fontWeight: 900,
                  ...dividerStyle,
                  ...totalColStyle,
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                {totals.totalBranches.toFixed(0)}
              </td>
            </tr>

            <tr>
              <td style={rowLabelStyle}>Öğrenci</td>
              {data.map((r, idx) => (
                <td
                  key={r.grade}
                  style={{
                    textAlign: "right",
                    ...(idx === 0 ? {} : dividerStyle),
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  <NumberInput
                    className={inputClass("input sm", makePath(r.grade, "studentsPerBranch"))}
                    style={compactInputStyle}
                    min="0"
                    step="1"
                    value={r.studentsPerBranch}
                    disabled={disabled}
                    onChange={(value) => setField(r.grade, "studentsPerBranch", value)}
                  />
                </td>
              ))}
              <td
                style={{
                  textAlign: "right",
                  fontWeight: 900,
                  ...dividerStyle,
                  ...totalColStyle,
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                {totals.totalStudents.toFixed(0)}
              </td>
            </tr>

            {/* Kademe totals (students only) */}
            <tr>
              <td style={rowLabelStyle}>Kademe Toplamı</td>
              {segments.map((seg, idx) => (
                <td
                  key={`seg-total-${idx}`}
                  colSpan={seg.grades.length}
                  style={{
                    textAlign: "right",
                    fontWeight: 900,
                    ...(idx === 0 ? {} : dividerStyle),
                    background: "rgba(15, 23, 42, 0.03)",
                    paddingLeft: 8,
                    paddingRight: 8,
                  }}
                >
                  {safeNum(segmentTotals[idx]).toFixed(0)}
                </td>
              ))}
              <td
                style={{
                  textAlign: "right",
                  fontWeight: 900,
                  ...dividerStyle,
                  ...totalColStyle,
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                {totals.totalStudents.toFixed(0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function NormConfigEditor({
  value,
  onChange,
  lastUpdatedAt,
  planningGrades,
  currentGrades,
  onPlanningGradesChange,
  onCurrentGradesChange,
  kademeConfig,
  dirtyPaths,
  onDirty,
}) {
  const norm = useMemo(() => normalizeNormValue(value), [value]);
  const [activeYear, setActiveYear] = useState("y1");

  // ✅ Fix #1: memoize yearData (avoid `|| {}` creating a new object each render)
  const yearData = useMemo(() => {
    const yd = norm.years?.[activeYear];
    return yd || { teacherWeeklyMaxHours: DEFAULT_MAX_HOURS, curriculumWeeklyHours: buildEmptyCurriculum() };
  }, [norm.years, activeYear]);

  const teacherWeeklyMaxHours = safeNum(yearData.teacherWeeklyMaxHours ?? DEFAULT_MAX_HOURS) || DEFAULT_MAX_HOURS;

  // (normalizeNormValue already guarantees object shape, but keep safe)
  const curriculumWeeklyHours =
    yearData.curriculumWeeklyHours && typeof yearData.curriculumWeeklyHours === "object"
      ? yearData.curriculumWeeklyHours
      : buildEmptyCurriculum();

  const visibleGrades = useMemo(() => resolveVisibleGrades(kademeConfig), [kademeConfig]);
  const planningByYear = useMemo(() => normalizePlanningGrades(planningGrades), [planningGrades]);

  // ✅ Fix #2: memoize activePlanningGrades (avoid `|| []` new array each render)
  const activePlanningGrades = useMemo(
    () => planningByYear?.[activeYear] || EMPTY_ARRAY,
    [planningByYear, activeYear]
  );

  const canEditCurrent = activeYear === "y1";

  const plannedTotalsByYear = useMemo(
    () => ({
      y1: totalStudentsFromGrades(planningByYear.y1),
      y2: totalStudentsFromGrades(planningByYear.y2),
      y3: totalStudentsFromGrades(planningByYear.y3),
    }),
    [planningByYear]
  );

  const missingPlanYears = [];
  const y2Missing = plannedTotalsByYear.y2 <= 0 || planningByYear.y2 === planningByYear.y1;
  const y3Missing = plannedTotalsByYear.y3 <= 0 || planningByYear.y3 === planningByYear.y1;
  if (y2Missing) missingPlanYears.push("Y2");
  if (y3Missing) missingPlanYears.push("Y3");

  const isDirty = (path) => (path && dirtyPaths ? dirtyPaths.has(path) : false);
  const inputClass = (base, path) => base + (isDirty(path) ? " input-dirty" : "");
  const normPath = (suffix) => `norm.years.${activeYear}.${suffix}`;
  const planningPath = `inputs.gradesYears.${activeYear}`;

  const curriculumKeys = useMemo(() => {
    const set = new Set();
    ALL_GRADES.forEach((g) => {
      const obj = curriculumWeeklyHours?.[g] || {};
      Object.keys(obj).forEach((k) => set.add(k));
    });
    return Array.from(set);
  }, [curriculumWeeklyHours]);

  const rows = useMemo(() => {
    const out = curriculumKeys
      .map((k) => ({ key: k, ...decodeKey(k) }))
      .filter((r) => String(r.key || "").trim());
    out.sort((a, b) => {
      const ta = String(a.teacher || "").toLowerCase();
      const tb = String(b.teacher || "").toLowerCase();
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a.lesson || "").toLowerCase().localeCompare(String(b.lesson || "").toLowerCase());
    });
    return out;
  }, [curriculumKeys]);

  const plan = useMemo(() => normalizeGrades(activePlanningGrades, ALL_GRADES), [activePlanningGrades]);

  const branchByGrade = useMemo(() => {
    const m = {};
    plan.forEach((r) => (m[r.grade] = safeNum(r.branchCount)));
    return m;
  }, [plan]);


  const studentsPerBranchByGrade = useMemo(() => {
    const m = {};
    plan.forEach((r) => (m[r.grade] = safeNum(r.studentsPerBranch)));
    return m;
  }, [plan]);

  const [newTeacher, setNewTeacher] = useState("");
  const [newLesson, setNewLesson] = useState("");
  const [draftLabels, setDraftLabels] = useState({});

  const yearLabel = (y) => (y === "y1" ? "Y1" : y === "y2" ? "Y2" : "Y3");
  const activeYearIndex = YEAR_KEYS.indexOf(activeYear);
  const prevYearKey = activeYearIndex > 0 ? YEAR_KEYS[activeYearIndex - 1] : null;

  function setMaxHours(val) {
    const num = val === "" ? 0 : safeNum(val);
    const nextValue = Number.isFinite(num) && num > 0 ? num : 24;
    const next = structuredClone(norm);
    next.years = next.years || {};
    next.years[activeYear] = next.years[activeYear] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };
    next.years[activeYear].teacherWeeklyMaxHours = nextValue;
    onChange({ years: next.years });
    onDirty?.(normPath("teacherWeeklyMaxHours"), nextValue);
  }

  function setPlanningGrades(nextGrades) {
    if (typeof onPlanningGradesChange !== "function") return;
    const next = { ...planningByYear, [activeYear]: nextGrades };
    onPlanningGradesChange(next);
  }

  function ensureKeyEveryGrade(key) {
    const next = { ...(curriculumWeeklyHours || {}) };
    ALL_GRADES.forEach((g) => {
      next[g] = { ...(next[g] || {}) };
      if (!(key in next[g])) next[g][key] = 0;
    });
    return next;
  }

  function addRow() {
    const key = encodeKey(newTeacher, newLesson);
    if (!key) return;
    if (curriculumKeys.includes(key)) return;
    const nextCurr = ensureKeyEveryGrade(key);
    const next = structuredClone(norm);
    next.years = next.years || {};
    next.years[activeYear] = next.years[activeYear] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };
    next.years[activeYear].curriculumWeeklyHours = nextCurr;
    onChange({ years: next.years });
    ALL_GRADES.forEach((g) => {
      onDirty?.(normPath(`curriculumWeeklyHours.${g}.${key}`), 0);
    });
    setNewTeacher("");
    setNewLesson("");
  }

  function removeRow(key) {
    const next = { ...(curriculumWeeklyHours || {}) };
    ALL_GRADES.forEach((g) => {
      const row = { ...(next[g] || {}) };
      delete row[key];
      next[g] = row;
    });
    const nextNorm = structuredClone(norm);
    nextNorm.years = nextNorm.years || {};
    nextNorm.years[activeYear] = nextNorm.years[activeYear] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };
    nextNorm.years[activeYear].curriculumWeeklyHours = next;
    onChange({ years: nextNorm.years });
    ALL_GRADES.forEach((g) => {
      onDirty?.(normPath(`curriculumWeeklyHours.${g}.${key}`), undefined);
    });
  }

  function renameRow(oldKey, nextTeacher, nextLesson) {
    const newKey = encodeKey(nextTeacher, nextLesson);
    if (!newKey || newKey === oldKey) return;
    if (curriculumKeys.includes(newKey)) return;

    const nextCurr = { ...(curriculumWeeklyHours || {}) };
    ALL_GRADES.forEach((g) => {
      const row = { ...(nextCurr[g] || {}) };
      const prevVal = safeNum(row[oldKey]);
      row[newKey] = prevVal;
      delete row[oldKey];
      nextCurr[g] = row;
      onDirty?.(normPath(`curriculumWeeklyHours.${g}.${newKey}`), prevVal);
      onDirty?.(normPath(`curriculumWeeklyHours.${g}.${oldKey}`), undefined);
    });

    const nextNorm = structuredClone(norm);
    nextNorm.years = nextNorm.years || {};
    nextNorm.years[activeYear] = nextNorm.years[activeYear] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };
    nextNorm.years[activeYear].curriculumWeeklyHours = nextCurr;
    onChange({ years: nextNorm.years });
    return newKey;
  }

  function setDraft(key, patch) {
    setDraftLabels((prev) => ({
      ...prev,
      [key]: {
        teacher: rows.find((x) => x.key === key)?.teacher || "",
        lesson: rows.find((x) => x.key === key)?.lesson || "",
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  }

  function commitDraftRename(key) {
    const d = draftLabels[key];
    if (!d) return;
    const orig = decodeKey(key);
    const t = String(d.teacher || "").trim();
    const l = String(d.lesson || "").trim();

    if (t === String(orig.teacher || "").trim() && l === String(orig.lesson || "").trim()) {
      setDraftLabels((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const newKey = encodeKey(t, l);
    if (!newKey || newKey === key || curriculumKeys.includes(newKey)) {
      setDraftLabels((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    renameRow(key, t, l);
    setDraftLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function setCell(grade, key, val) {
    const num = val === "" ? 0 : safeNum(val);
    const nextValue = Number.isFinite(num) && num >= 0 ? num : 0;

    const nextNorm = structuredClone(norm);
    nextNorm.years = nextNorm.years || {};
    nextNorm.years[activeYear] = nextNorm.years[activeYear] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };

    nextNorm.years[activeYear].curriculumWeeklyHours = {
      ...(curriculumWeeklyHours || {}),
      [grade]: {
        ...(curriculumWeeklyHours?.[grade] || {}),
        [key]: nextValue,
      },
    };

    onChange({ years: nextNorm.years });
    onDirty?.(normPath(`curriculumWeeklyHours.${grade}.${key}`), nextValue);
  }

  function copyFromPrevYear() {
    if (!prevYearKey) return;

    const prevData = norm.years?.[prevYearKey] || {
      teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: buildEmptyCurriculum(),
    };

    const prevCurr =
      prevData?.curriculumWeeklyHours && typeof prevData.curriculumWeeklyHours === "object"
        ? prevData.curriculumWeeklyHours
        : buildEmptyCurriculum();

    const nextNorm = structuredClone(norm);
    nextNorm.years = nextNorm.years || {};
    nextNorm.years[activeYear] = {
      teacherWeeklyMaxHours: safeNum(prevData?.teacherWeeklyMaxHours ?? DEFAULT_MAX_HOURS) || DEFAULT_MAX_HOURS,
      curriculumWeeklyHours: structuredClone(prevCurr),
    };

    onChange({ years: nextNorm.years });
    onDirty?.(normPath("teacherWeeklyMaxHours"), nextNorm.years[activeYear].teacherWeeklyMaxHours);

    const oldCurr = norm.years?.[activeYear]?.curriculumWeeklyHours || {};
    const newCurr = nextNorm.years?.[activeYear]?.curriculumWeeklyHours || {};
    ALL_GRADES.forEach((g) => {
      const oldRow = oldCurr?.[g] || {};
      const newRow = newCurr?.[g] || {};
      Object.keys(oldRow).forEach((key) => {
        if (!(key in newRow)) onDirty?.(normPath(`curriculumWeeklyHours.${g}.${key}`), undefined);
      });
      Object.entries(newRow).forEach(([key, val]) => {
        onDirty?.(normPath(`curriculumWeeklyHours.${g}.${key}`), val);
      });
    });

    if (typeof onPlanningGradesChange === "function") {
      const prevPlan = planningByYear?.[prevYearKey] || [];
      const nextPlanning = { ...planningByYear, [activeYear]: structuredClone(prevPlan) };
      onPlanningGradesChange(nextPlanning);
      const normalizedPlan = normalizeGrades(nextPlanning[activeYear], ALL_GRADES);
      normalizedPlan.forEach((row) => {
        onDirty?.(`${planningPath}.${row.grade}.branchCount`, row.branchCount);
        onDirty?.(`${planningPath}.${row.grade}.studentsPerBranch`, row.studentsPerBranch);
      });
    }
  }

  const rowTotals = useMemo(() => {
    const totals = {};
    rows.forEach((r) => {
      let sum = 0;
      visibleGrades.forEach((g) => {
        const h = safeNum(curriculumWeeklyHours?.[g]?.[r.key]);
        const bc = safeNum(branchByGrade[g]);
        sum += h * bc;
      });
      totals[r.key] = sum;
    });
    return totals;
  }, [rows, curriculumWeeklyHours, branchByGrade, visibleGrades]);

  const gradeClassHourTotals = useMemo(() => {
    const out = {};
    visibleGrades.forEach((g) => {
      let sum = 0;
      rows.forEach((r) => {
        sum += safeNum(curriculumWeeklyHours?.[g]?.[r.key]);
      });
      out[g] = sum;
    });
    return out;
  }, [rows, curriculumWeeklyHours, visibleGrades]);

  const summary = useMemo(() => {
    const totalTeachingHours = Object.values(rowTotals).reduce((s, v) => s + safeNum(v), 0);
    const requiredTeachersOverall = teacherWeeklyMaxHours > 0 ? Math.ceil(totalTeachingHours / teacherWeeklyMaxHours) : 0;

    const byTeacher = new Map();
    rows.forEach((r) => {
      const t = String(r.teacher || "").trim() || "(No Teacher)";
      const v = safeNum(rowTotals[r.key]);
      byTeacher.set(t, (byTeacher.get(t) || 0) + v);
    });

    const teacherRows = Array.from(byTeacher.entries())
      .map(([teacher, hours]) => {
        const fte = teacherWeeklyMaxHours > 0 ? hours / teacherWeeklyMaxHours : 0;
        const needed = teacherWeeklyMaxHours > 0 ? Math.ceil(hours / teacherWeeklyMaxHours) : 0;
        return { teacher, hours, fte, needed };
      })
      .sort((a, b) => b.hours - a.hours);

    const requiredTeachersByBranch = teacherRows.reduce((s, r) => s + safeNum(r.needed), 0);

    return { totalTeachingHours, requiredTeachersOverall, teacherRows, requiredTeachersByBranch };
  }, [rows, rowTotals, teacherWeeklyMaxHours]);


  const planKpis = useMemo(() => {
    const totalBranches = visibleGrades.reduce((s, g) => s + safeNum(branchByGrade[g]), 0);
    const totalStudents = visibleGrades.reduce(
      (s, g) => s + safeNum(studentsPerBranchByGrade[g]),
      0
    );

    const kgBranches = visibleGrades.includes("KG") ? safeNum(branchByGrade["KG"]) : 0;
    const kgStudents = visibleGrades.includes("KG")
      ? safeNum(studentsPerBranchByGrade["KG"])
      : 0;

    // Okul öncesi kademesinde 50 öğrenciye 1 personel istihdamı yapılır.
    const okulOncesiPersonel50 = kgStudents > 0 ? Math.ceil(kgStudents / 50) : 0;

    // "Genel" öğretmen ihtiyacına ek olarak okul öncesi personeli eklenir.
    const totalEducatorsWithOkulOncesi = summary.requiredTeachersOverall + okulOncesiPersonel50;

    const studentTeacherRatio =
      totalEducatorsWithOkulOncesi > 0 ? totalStudents / totalEducatorsWithOkulOncesi : null;
    const teacherClassRatio = totalBranches > 0 ? totalEducatorsWithOkulOncesi / totalBranches : null;
    const studentClassRatio = totalBranches > 0 ? totalStudents / totalBranches : null;

    return {
      totalBranches,
      totalStudents,
      kgBranches,
      kgStudents,
      okulOncesiPersonel50,
      totalEducatorsWithOkulOncesi,
      studentTeacherRatio,
      teacherClassRatio,
      studentClassRatio,
    };
  }, [visibleGrades, branchByGrade, studentsPerBranchByGrade, summary.requiredTeachersOverall]);

  const CLASS_HOUR_COL_W = 34;
  const CLASS_HOUR_INPUT_W = 26;

  const tableTextInputStyle = {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const addTeacherInputStyle = {
    flex: "0 1 240px",
    minWidth: 200,
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const addLessonInputStyle = {
    flex: "1 1 320px",
    minWidth: 220,
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800 }}>N.Kadro / Norm</div>
            <div className="small">
              Planlanan (senaryo) şube bilgileri + ders dağılımı (haftalık). Sağ tarafta branşa göre toplam ders saati ve
              öğretmen ihtiyacı hesaplanır.
            </div>
          </div>

          <div className="row">
            <label>
              <div className="small">Öğretmen Haftalık Max Saat ({yearLabel(activeYear)})</div>
              <NumberInput
                className={inputClass("input sm", normPath("teacherWeeklyMaxHours"))}

                min="1"
                step="1"
                value={teacherWeeklyMaxHours}
                onChange={(value) => setMaxHours(value)}
              />
            </label>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <div className="tabs">
            {YEAR_KEYS.map((y) => (
              <div key={y} className={"tab " + (activeYear === y ? "active " : "")} onClick={() => setActiveYear(y)}>
                {yearLabel(y)}
              </div>
            ))}
          </div>
          {prevYearKey ? (
            <button className="btn" onClick={copyFromPrevYear}>
              Copy from {yearLabel(prevYearKey)}
            </button>
          ) : null}
        </div>

        {missingPlanYears.length ? (
          <div className="small" style={{ marginTop: 6, color: "#b91c1c" }}>
            Warning: {missingPlanYears.join(" and ")} planlanan ogrenci bilgisi bos.
          </div>
        ) : null}

        <hr />

        <div className="grid2" style={{ alignItems: "start" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Özet</div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <div className="stat">
                <div className="label">Toplam Ders Saati (Haftalık)</div>
                <div className="value">{summary.totalTeachingHours.toFixed(2)}</div>
              </div>

              <div className="stat">
                <div className="label">Toplam Eğitimci (Genel)</div>
                <div className="value">{summary.requiredTeachersOverall}</div>
              </div>

              <div className="stat">
                <div className="label">Okul Öncesi (KG) Yardımcı Sınıf Öğrt. (Sınıf Sayısı)</div>
                <div className="value">{planKpis.kgBranches.toFixed(0)}</div>
              </div>

              <div className="stat">
                <div className="label">Okul Öncesi Personeli (50 öğrenci / 1)</div>
                <div className="value">{planKpis.okulOncesiPersonel50}</div>
              </div>

              <div className="stat">
                <div className="label">Toplam Eğitimci (Genel + Okul Öncesi)</div>
                <div className="value">{planKpis.totalEducatorsWithOkulOncesi}</div>
              </div>

              <div className="stat">
                <div className="label">Öğrenci / Öğretmen</div>
                <div className="value">
                  {planKpis.studentTeacherRatio == null ? "—" : planKpis.studentTeacherRatio.toFixed(2)}
                </div>
              </div>

              <div className="stat">
                <div className="label">Öğretmen / Sınıf</div>
                <div className="value">
                  {planKpis.teacherClassRatio == null ? "—" : planKpis.teacherClassRatio.toFixed(2)}
                </div>
              </div>

              <div className="stat">
                <div className="label">Öğrenci / Sınıf</div>
                <div className="value">
                  {planKpis.studentClassRatio == null ? "—" : planKpis.studentClassRatio.toFixed(2)}
                </div>
              </div>

              <div className="stat">
                <div className="label">Eğitimci (Branşa Göre Toplam)</div>
                <div className="value">{summary.requiredTeachersByBranch}</div>
              </div>

              <div className="stat">
                <div className="label">Not</div>
                <div className="value" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>
                  <div>Branşa göre toplam, branş dağılımı nedeniyle genel toplamdan büyük olabilir.</div>
                  <div style={{ marginTop: 4 }}>
                    Okul öncesi personelinin pedagojik açıdan öğrenci iletişiminin yüksek olması gerekir.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800 }}>Branş Bazlı (Toplam Ders Saati)</div>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Branş Öğretmeni</th>
                    <th style={{ textAlign: "right" }}>Toplam Ders Saati</th>
                    <th style={{ textAlign: "right" }}>Limit</th>
                    <th style={{ textAlign: "right" }}>FTE</th>
                    <th style={{ textAlign: "right" }}>Eğitimci</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.teacherRows.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="small">
                        Henüz ders satırı yok.
                      </td>
                    </tr>
                  ) : (
                    summary.teacherRows.map((r) => (
                      <tr key={r.teacher}>
                        <td>{r.teacher}</td>
                        <td style={{ textAlign: "right" }}>{r.hours.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>{teacherWeeklyMaxHours}</td>
                        <td style={{ textAlign: "right" }}>{r.fte.toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{r.needed}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <GradeTable
        title="PLANLANAN DÖNEM BİLGİLERİ"
        subtitle="Her sınıf düzeyi için şube sayısı ve öğrenci sayısı (senaryo)."
        grades={activePlanningGrades}
        onChange={setPlanningGrades}
        dirtyPaths={dirtyPaths}
        onDirty={onDirty}
        pathPrefix={planningPath}
        gradeColWidth={34}
        inputWidth={24}
        gradeOrder={visibleGrades}
        allGrades={ALL_GRADES}
        kademeConfig={kademeConfig}
      />

      <GradeTable
        title="MEVCUT DÖNEM BİLGİLERİ"
        subtitle="Mevcut dönem şube ve toplam öğrenci sayıları (karşılaştırma için)."
        grades={currentGrades}
        onChange={canEditCurrent ? onCurrentGradesChange : null}
        dirtyPaths={dirtyPaths}
        onDirty={onDirty}
        pathPrefix="inputs.gradesCurrent"
        gradeOrder={visibleGrades}
        allGrades={ALL_GRADES}
        kademeConfig={kademeConfig}
      />

      {!canEditCurrent ? (
        <div className="small" style={{ marginTop: 6 }}>
          Note: Mevcut donem bilgileri sadece Y1 icin duzenlenir.
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Ders Dağılımı (Haftalık)</div>
            <div className="small">
              Her ders satırında: dersin sınıflara göre haftalık saatini gir. Toplam ders saati = (saat × şube) toplamı.
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            className="input"
            style={addTeacherInputStyle}
            placeholder="Branş Öğretmeni (örn: İngilizce Öğretmeni)"
            value={newTeacher}
            onChange={(e) => setNewTeacher(e.target.value)}
          />
          <input
            className="input"
            style={addLessonInputStyle}
            placeholder="Ders Adı (örn: English)"
            value={newLesson}
            onChange={(e) => setNewLesson(e.target.value)}
          />
          <button className="btn" onClick={addRow}>
            Ders Ekle
          </button>
          <div className="small">Not: Dersler veritabanında "Branş||Ders" formatında saklanır.</div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="table" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160, width: 160 }}>Branş Öğretmeni</th>
                <th style={{ minWidth: 160, width: 160 }}>Ders Adı</th>
                {visibleGrades.map((g) => (
                  <th
                    key={g}
                    style={{
                      textAlign: "right",
                      minWidth: CLASS_HOUR_COL_W,
                      width: CLASS_HOUR_COL_W,
                      maxWidth: CLASS_HOUR_COL_W,
                      paddingLeft: 2,
                      paddingRight: 2,
                    }}
                  >
                    {g}
                  </th>
                ))}
                <th style={{ textAlign: "right", minWidth: 140, width: 140 }}>Toplam Ders Saati</th>
                <th style={{ minWidth: 70, width: 70 }}>Sil</th>
              </tr>
              <tr>
                <th />
                <th className="small">Planlanan Şube</th>
                {visibleGrades.map((g) => (
                  <th
                    key={g}
                    className="small"
                    style={{
                      textAlign: "right",
                      minWidth: CLASS_HOUR_COL_W,
                      width: CLASS_HOUR_COL_W,
                      maxWidth: CLASS_HOUR_COL_W,
                      paddingLeft: 2,
                      paddingRight: 2,
                    }}
                  >
                    {safeNum(branchByGrade[g]).toFixed(0)}
                  </th>
                ))}
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2 + visibleGrades.length + 2} className="small">
                    Henuz ders satiri yok. Ders ekleyerek baslayabilirsin.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <input
                        className="input"
                        style={tableTextInputStyle}
                        value={(draftLabels[r.key]?.teacher ?? r.teacher) || ""}
                        onChange={(e) => setDraft(r.key, { teacher: e.target.value })}
                        onBlur={() => commitDraftRename(r.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        style={tableTextInputStyle}
                        value={(draftLabels[r.key]?.lesson ?? r.lesson) || ""}
                        onChange={(e) => setDraft(r.key, { lesson: e.target.value })}
                        onBlur={() => commitDraftRename(r.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>

                    {visibleGrades.map((g) => (
                      <td key={g} style={{ textAlign: "right", paddingLeft: 2, paddingRight: 2 }}>
                        <NumberInput
                          className={inputClass("input sm", normPath(`curriculumWeeklyHours.${g}.${r.key}`))}
                          style={{
                            width: CLASS_HOUR_INPUT_W,
                            boxSizing: "border-box",
                            textAlign: "right",
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}

                          min="0"
                          step="0.25"
                          value={safeNum(curriculumWeeklyHours?.[g]?.[r.key])}
                          onChange={(value) => setCell(g, r.key, value)}
                        />
                      </td>
                    ))}

                    <td style={{ textAlign: "right", fontWeight: 800 }}>{safeNum(rowTotals[r.key]).toFixed(2)}</td>
                    <td>
                      <button className="btn danger" onClick={() => removeRow(r.key)}>
                        x
                      </button>
                    </td>
                  </tr>
                ))
              )}

              {rows.length > 0 ? (
                <tr style={{ fontWeight: 900 }}>
                  <td>TOPLAM</td>
                  <td />
                  {visibleGrades.map((g) => (
                    <td key={g} style={{ textAlign: "right", paddingLeft: 2, paddingRight: 2 }}>
                      {safeNum(gradeClassHourTotals[g]).toFixed(0)}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>{summary.totalTeachingHours.toFixed(0)}</td>
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
