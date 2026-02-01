// backend/src/utils/report/buildNormModel.js
// Pure model builder for Excel export of Norm (N.Kadro) sheets.

const YEAR_KEYS = ["y1", "y2", "y3"];
const DEFAULT_MAX_HOURS = 24;
const KEY_SEP = "||";

const ALL_GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const GRADE_INDEX = new Map(ALL_GRADES.map((g, i) => [g, i]));

const KADEME_DEFS = [
    { key: "okulOncesi", label: "Okul Öncesi", defaultFrom: "KG", defaultTo: "KG" },
    { key: "ilkokul", label: "İlkokul", defaultFrom: "1", defaultTo: "5" },
    { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
    { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
];

function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
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
    return ALL_GRADES.indexOf(g);
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
    for (const def of KADEME_DEFS) {
        const row = cfg[def.key] && typeof cfg[def.key] === "object" ? cfg[def.key] : {};
        const enabled = row.enabled !== false;
        const range = normalizeRange(row.from, row.to, def);
        out[def.key] = { enabled, ...range };
    }
    return out;
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

function formatKademeLabel(label, config, key) {
    const cfg = normalizeKademeConfig(config)[key];
    if (!cfg?.enabled) return label;
    const range = cfg.from === cfg.to ? cfg.from : `${cfg.from}-${cfg.to}`;
    return range ? `${label} (${range})` : label;
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
        const def = KADEME_DEFS.find((d) => d.key === key);
        const baseLabel = def ? def.label : key || "";
        const label = key ? formatKademeLabel(baseLabel, kademeConfig, key) : "";
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

function normalizeGrades(grades, gradeOrder) {
    const data = Array.isArray(grades) ? grades : [];
    const order = Array.isArray(gradeOrder) && gradeOrder.length ? gradeOrder : ALL_GRADES;
    return order.map((g) => {
        const row = data.find((x) => String(x.grade) === g) || { grade: g, branchCount: 0, studentsPerBranch: 0 };
        return {
            grade: g,
            branchCount: safeNum(row.branchCount),
            // NOTE: In this app, studentsPerBranch represents TOTAL students per grade.
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

function normalizeNormYears(normConfig) {
    const base = normConfig && typeof normConfig === "object" ? normConfig : {};
    const yearsSrc = base.years && typeof base.years === "object" ? base.years : null;

    const baseHoursRaw = Number(base.teacherWeeklyMaxHours ?? base.teacher_weekly_max_hours ?? DEFAULT_MAX_HOURS);
    const baseHours = Number.isFinite(baseHoursRaw) && baseHoursRaw > 0 ? baseHoursRaw : DEFAULT_MAX_HOURS;
    const baseCurr =
        base.curriculumWeeklyHours && typeof base.curriculumWeeklyHours === "object"
            ? base.curriculumWeeklyHours
            : base.curriculum_weekly_hours_json && typeof base.curriculum_weekly_hours_json === "object"
                ? base.curriculum_weekly_hours_json
                : {};

    const years = {};
    for (const y of YEAR_KEYS) {
        const src = yearsSrc?.[y] || {};
        const hoursRaw = Number(src?.teacherWeeklyMaxHours ?? src?.teacher_weekly_max_hours ?? baseHours);
        const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : baseHours;
        const curr =
            src?.curriculumWeeklyHours && typeof src.curriculumWeeklyHours === "object"
                ? src.curriculumWeeklyHours
                : src?.curriculum_weekly_hours_json && typeof src.curriculum_weekly_hours_json === "object"
                    ? src.curriculum_weekly_hours_json
                    : src && typeof src === "object" && !Array.isArray(src)
                        ? src
                        : baseCurr;
        years[y] = { teacherWeeklyMaxHours: hours, curriculumWeeklyHours: curr || {} };
    }
    return years;
}

function decodeKey(key) {
    const k = String(key || "");
    if (k.includes(KEY_SEP)) {
        const [t, ...rest] = k.split(KEY_SEP);
        return { teacher: t || "", lesson: rest.join(KEY_SEP) || "" };
    }
    return { teacher: k, lesson: k };
}

function computeTotals(rows, visibleGrades, curriculumWeeklyHours, branchByGrade) {
    // rowTotals: total teaching hours per curriculum row (sum of hour * branchCount across grades)
    const rowTotals = {};
    for (const r of rows) {
        let sum = 0;
        for (const g of visibleGrades) {
            const h = safeNum(curriculumWeeklyHours?.[g]?.[r.key]);
            const bc = safeNum(branchByGrade?.[g]);
            sum += h * bc;
        }
        rowTotals[r.key] = sum;
    }

    // gradeClassHourTotals: weekly class-hours per grade (sum of weekly hours per lesson)
    const gradeClassHourTotals = {};
    for (const g of visibleGrades) {
        let sum = 0;
        for (const r of rows) sum += safeNum(curriculumWeeklyHours?.[g]?.[r.key]);
        gradeClassHourTotals[g] = sum;
    }

    return { rowTotals, gradeClassHourTotals };
}

function buildNormModel({ yearIndex, scenario, inputs, report, normConfig }) {
    const yearKey = YEAR_KEYS[Number(yearIndex)] || "y1";

    const kademeConfig = inputs?.temelBilgiler?.kademeler;
    const visibleGrades = resolveVisibleGrades(kademeConfig);
    const segments = buildKademeSegments(visibleGrades, kademeConfig);

    const yearsNorm = normalizeNormYears(normConfig);
    const yearNorm = yearsNorm?.[yearKey] || { teacherWeeklyMaxHours: DEFAULT_MAX_HOURS, curriculumWeeklyHours: {} };

    const teacherWeeklyMaxHours = safeNum(yearNorm.teacherWeeklyMaxHours) || DEFAULT_MAX_HOURS;
    const curriculumWeeklyHours = yearNorm.curriculumWeeklyHours && typeof yearNorm.curriculumWeeklyHours === "object" ? yearNorm.curriculumWeeklyHours : {};

    // Planning grades are stored in inputs.gradesYears (preferred) or legacy inputs.grades
    const planningByYear = normalizePlanningGrades(inputs?.gradesYears || inputs?.grades);
    const activePlanningGrades = planningByYear?.[yearKey] || [];

    // Current grades are for comparison only (editable only in UI for y1)
    const currentGrades = inputs?.gradesCurrent || [];

    // Grade tables: visible order only
    const planningRowsVisible = normalizeGrades(activePlanningGrades, visibleGrades);
    const currentRowsVisible = normalizeGrades(currentGrades, visibleGrades);

    const planningTotals = planningRowsVisible.reduce(
        (acc, r) => {
            acc.totalBranches += safeNum(r.branchCount);
            acc.totalStudents += safeNum(r.studentsPerBranch);
            return acc;
        },
        { totalBranches: 0, totalStudents: 0 }
    );

    const currentTotals = currentRowsVisible.reduce(
        (acc, r) => {
            acc.totalBranches += safeNum(r.branchCount);
            acc.totalStudents += safeNum(r.studentsPerBranch);
            return acc;
        },
        { totalBranches: 0, totalStudents: 0 }
    );

    const segmentTotalsPlanning = (() => {
        const byGrade = new Map(planningRowsVisible.map((r) => [r.grade, safeNum(r.studentsPerBranch)]));
        return segments.map((seg) => seg.grades.reduce((s, g) => s + safeNum(byGrade.get(g)), 0));
    })();

    const segmentTotalsCurrent = (() => {
        const byGrade = new Map(currentRowsVisible.map((r) => [r.grade, safeNum(r.studentsPerBranch)]));
        return segments.map((seg) => seg.grades.reduce((s, g) => s + safeNum(byGrade.get(g)), 0));
    })();

    // Branch mapping for curriculum table (based on ALL grades, but used only for visible grades)
    const planningRowsAll = normalizeGrades(activePlanningGrades, ALL_GRADES);
    const branchByGrade = {};
    const studentsByGrade = {};
    planningRowsAll.forEach((r) => {
        branchByGrade[r.grade] = safeNum(r.branchCount);
        studentsByGrade[r.grade] = safeNum(r.studentsPerBranch);
    });

    // Curriculum keys are collected from ALL grades (same as UI)
    const curriculumKeys = new Set();
    ALL_GRADES.forEach((g) => {
        const obj = curriculumWeeklyHours?.[g] || {};
        if (obj && typeof obj === "object") Object.keys(obj).forEach((k) => curriculumKeys.add(k));
    });

    const rows = Array.from(curriculumKeys)
        .map((k) => ({ key: k, ...decodeKey(k) }))
        .filter((r) => String(r.key || "").trim());

    rows.sort((a, b) => {
        const ta = String(a.teacher || "").toLowerCase();
        const tb = String(b.teacher || "").toLowerCase();
        if (ta !== tb) return ta.localeCompare(tb);
        return String(a.lesson || "").toLowerCase().localeCompare(String(b.lesson || "").toLowerCase());
    });

    const { rowTotals, gradeClassHourTotals } = computeTotals(rows, visibleGrades, curriculumWeeklyHours, branchByGrade);

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

    const totalBranches = visibleGrades.reduce((s, g) => s + safeNum(branchByGrade[g]), 0);
    const totalStudents = visibleGrades.reduce((s, g) => s + safeNum(studentsByGrade[g]), 0);

    const kgBranches = visibleGrades.includes("KG") ? safeNum(branchByGrade["KG"]) : 0;
    const kgStudents = visibleGrades.includes("KG") ? safeNum(studentsByGrade["KG"]) : 0;
    const okulOncesiPersonel50 = kgStudents > 0 ? Math.ceil(kgStudents / 50) : 0;
    const totalEducatorsWithOkulOncesi = requiredTeachersOverall + okulOncesiPersonel50;

    const studentTeacherRatio = totalEducatorsWithOkulOncesi > 0 ? totalStudents / totalEducatorsWithOkulOncesi : null;
    const teacherClassRatio = totalBranches > 0 ? totalEducatorsWithOkulOncesi / totalBranches : null;
    const studentClassRatio = totalBranches > 0 ? totalStudents / totalBranches : null;

    return {
        yearIndex: Number(yearIndex) || 0,
        yearKey,
        meta: {
            teacherWeeklyMaxHours,
        },
        visibleGrades,
        segments,
        planning: {
            rows: planningRowsVisible,
            totals: planningTotals,
            segmentTotals: segmentTotalsPlanning,
            branchByGrade,
            studentsByGrade,
        },
        current: {
            rows: currentRowsVisible,
            totals: currentTotals,
            segmentTotals: segmentTotalsCurrent,
        },
        curriculum: {
            rows,
            curriculumWeeklyHours,
            rowTotals,
            gradeClassHourTotals,
        },
        summary: {
            totalTeachingHours,
            requiredTeachersOverall,
            requiredTeachersByBranch,
            totalBranches,
            totalStudents,
            kgBranches,
            kgStudents,
            okulOncesiPersonel50,
            totalEducatorsWithOkulOncesi,
            studentTeacherRatio,
            teacherClassRatio,
            studentClassRatio,
            teacherRows,
        },
        // keep params for debugging if needed
        _debug: {
            scenarioAcademicYear: scenario?.academic_year || null,
            hasReport: !!report,
        },
    };
}

module.exports = { buildNormModel };
