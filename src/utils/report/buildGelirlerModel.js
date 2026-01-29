// backend/src/utils/report/buildGelirlerModel.js

const { normalizeProgramType, isKademeKeyVisible } = require("../programType");

// Keep these definitions aligned with frontend IncomeEditor.jsx
const YEAR_KEYS = ["y1", "y2", "y3"];

const TUITION_ROWS = [
    { key: "okulOncesi", label: "Okul Öncesi" },
    { key: "ilkokulYerel", label: "İlkokul-YEREL" },
    { key: "ilkokulInt", label: "İlkokul-INT." },
    { key: "ortaokulYerel", label: "Ortaokul-YEREL" },
    { key: "ortaokulInt", label: "Ortaokul-INT." },
    { key: "liseYerel", label: "Lise-YEREL" },
    { key: "liseInt", label: "Lise-INT." },
];

const NON_ED_ROWS = [
    { key: "yemek", label: "Yemek" },
    { key: "uniforma", label: "Üniforma" },
    { key: "kitap", label: "Kitap" },
    { key: "ulasim", label: "Ulaşım" },
];

const DORM_ROWS = [
    { key: "yurt", label: "Yurt Gelirleri" },
    { key: "yazOkulu", label: "Yaz Okulu Dersleri Gelirleri" },
];

const OTHER_INCOME_ROWS = [
    { key: "gayrimenkulKira", label: "Gayrimenkul Kira Gelirleri ve Diğer Gelirler" },
    {
        key: "isletmeGelirleri",
        label: "İşletme Gelirleri (Kantin, Kafeterya, Sosyal Faaliyet ve Spor Kulüpleri vb.)",
    },
    {
        key: "tesisKira",
        label: "Bina ve Tesislerin Konaklama, Sosyal, Kültür, Spor vb. Amaçlı Kullanımından Kaynaklı Tesis Kira Gelirleri",
    },
    { key: "egitimDisiHizmet", label: "Eğitim Dışı Verilen Hizmetler (Danışmanlık vb.) Karşılığı Gelirler" },
    { key: "yazOkuluOrganizasyon", label: "Yaz Okulları, Organizasyon, Kurs vb. İkinci Eğitim Gelirleri" },
    { key: "kayitUcreti", label: "Kayıt Ücreti" },
    { key: "bagislar", label: "Bağışlar" },
    { key: "stkKamu", label: "STK/Kamu Sübvansiyonları" },
    { key: "faizPromosyon", label: "Faiz, Banka Promosyon/Komisyon vb. Kaynaklı Gelirler" },
];

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function deepClone(obj) {
    if (!obj || typeof obj !== "object") return {};
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

// ----------------------------
// Kademe helpers (ported from frontend/src/utils/kademe.js)
// ----------------------------

const GRADES = [
    "KG",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
];

const KADEME_DEFS = [
    { key: "okulOncesi", label: "Okul Öncesi", from: "KG", to: "KG" },
    { key: "ilkokul", label: "İlkokul", from: "1", to: "5" },
    { key: "ortaokul", label: "Ortaokul", from: "6", to: "9" },
    { key: "lise", label: "Lise", from: "10", to: "12" },
];

function normalizeGrade(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return null;
    if (raw === "K" || raw === "KG" || raw === "ANA") return "KG";
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return String(Math.trunc(n));
    return null;
}

function gradeIndex(g) {
    const ng = normalizeGrade(g);
    if (!ng) return null;
    const idx = GRADES.indexOf(ng);
    return idx >= 0 ? idx : null;
}

function normalizeRange(from, to) {
    const iFrom = gradeIndex(from);
    const iTo = gradeIndex(to);
    if (iFrom == null || iTo == null) return null;
    return iFrom <= iTo ? { from: GRADES[iFrom], to: GRADES[iTo] } : { from: GRADES[iTo], to: GRADES[iFrom] };
}

function normalizeKademeConfig(input) {
    const cfg = input && typeof input === "object" ? input : {};
    const out = {};
    for (const def of KADEME_DEFS) {
        const row = cfg[def.key] && typeof cfg[def.key] === "object" ? cfg[def.key] : {};
        const enabled = row.enabled !== false;
        const r = normalizeRange(row.from ?? def.from, row.to ?? def.to) || { from: def.from, to: def.to };
        out[def.key] = { enabled, from: r.from, to: r.to };
    }
    return out;
}

function getKademeForGrade(grade, cfg) {
    const gIdx = gradeIndex(grade);
    if (gIdx == null) return null;
    for (const def of KADEME_DEFS) {
        const row = cfg?.[def.key] || def;
        const r = normalizeRange(row.from ?? def.from, row.to ?? def.to);
        if (!r) continue;
        const a = gradeIndex(r.from);
        const b = gradeIndex(r.to);
        if (a == null || b == null) continue;
        if (gIdx >= a && gIdx <= b) return def.key;
    }
    return null;
}

function summarizeGradesByKademe(grades, kademeConfig) {
    const cfg = normalizeKademeConfig(kademeConfig);
    const rows = Array.isArray(grades) ? grades : [];
    const sums = { okulOncesi: 0, ilkokul: 0, ortaokul: 0, lise: 0, total: 0 };

    rows.forEach((r) => {
        const grade = r?.grade ?? r?.sinif ?? r?.class;
        const students = toNum(r?.students ?? r?.count ?? r?.value);
        const k = getKademeForGrade(grade, cfg);
        if (!k) return;
        if (cfg?.[k]?.enabled === false) return;
        sums[k] += students;
        sums.total += students;
    });

    return sums;
}

function getKademeRangeLabel(configRow) {
    if (!configRow) return "";
    const from = String(configRow.from || "").trim();
    const to = String(configRow.to || "").trim();
    if (!from) return "";
    if (!to || from === to) return `(${from})`;
    return `(${from}-${to})`;
}

function formatKademeLabel(baseLabel, kademeConfig, key) {
    const cfg = normalizeKademeConfig(kademeConfig);
    const row = cfg?.[key];
    const range = getKademeRangeLabel(row);
    return range ? `${baseLabel} ${range}` : baseLabel;
}

// ----------------------------
// Gelirler normalization & calculations (ported from IncomeEditor.jsx)
// ----------------------------

function computeStudentsFromGrades(grades, kademeConfig) {
    const sums = summarizeGradesByKademe(grades, kademeConfig);
    return {
        kg: toNum(sums.okulOncesi),
        ilkokul: toNum(sums.ilkokul),
        ortaokul: toNum(sums.ortaokul),
        lise: toNum(sums.lise),
        total: toNum(sums.total),
    };
}

function defaultGelirler() {
    return {
        tuition: { rows: TUITION_ROWS.map((r) => ({ key: r.key, label: r.label, studentCount: 0, unitFee: 0 })) },
        nonEducationFees: {
            rows: NON_ED_ROWS.map((r) => ({
                key: r.key,
                label: r.label,
                studentCount: 0,
                studentCountY2: 0,
                studentCountY3: 0,
                unitFee: 0,
            })),
        },
        dormitory: {
            rows: DORM_ROWS.map((r) => ({
                key: r.key,
                label: r.label,
                studentCount: 0,
                studentCountY2: 0,
                studentCountY3: 0,
                unitFee: 0,
            })),
        },
        otherInstitutionIncome: { rows: OTHER_INCOME_ROWS.map((r) => ({ key: r.key, label: r.label, amount: 0 })) },
        governmentIncentives: 0,
    };
}

function normalizeRows(baseRows, savedRows, keyField) {
    const base = Array.isArray(baseRows) ? baseRows : [];
    const saved = Array.isArray(savedRows) ? savedRows : [];
    const byKey = new Map(saved.map((r) => [String(r?.[keyField] ?? r?.key ?? ""), r]));

    const merged = base.map((b) => {
        const k = String(b?.[keyField] ?? b?.key ?? "");
        const s = byKey.get(k);
        return s ? { ...b, ...s, key: b.key, label: b.label } : b;
    });

    const baseKeys = new Set(base.map((b) => String(b?.[keyField] ?? b?.key ?? "")));
    const extras = saved.filter((s) => !baseKeys.has(String(s?.[keyField] ?? s?.key ?? "")));
    return [...merged, ...extras];
}

function normalizeGelirler(saved, grades, kademeConfig) {
    const base = defaultGelirler();
    const g = saved && typeof saved === "object" ? saved : {};

    const isLegacy =
        !g.tuition &&
        (g.tuitionFeePerStudentYearly != null ||
            g.lunchFeePerStudentYearly != null ||
            g.dormitoryFeePerStudentYearly != null ||
            g.otherFeePerStudentYearly != null);

    const suggested = computeStudentsFromGrades(grades, kademeConfig);

    const next = {
        ...base,
        ...g,
        tuition: {
            ...base.tuition,
            ...(g.tuition || {}),
            rows: normalizeRows(base.tuition.rows, g.tuition?.rows, "key"),
        },
        nonEducationFees: {
            ...base.nonEducationFees,
            ...(g.nonEducationFees || {}),
            rows: normalizeRows(base.nonEducationFees.rows, g.nonEducationFees?.rows, "key"),
        },
        dormitory: {
            ...base.dormitory,
            ...(g.dormitory || {}),
            rows: normalizeRows(base.dormitory.rows, g.dormitory?.rows, "key"),
        },
        otherInstitutionIncome: {
            ...base.otherInstitutionIncome,
            ...(g.otherInstitutionIncome || {}),
            rows: normalizeRows(base.otherInstitutionIncome.rows, g.otherInstitutionIncome?.rows, "key"),
        },
        governmentIncentives: g.governmentIncentives ?? base.governmentIncentives,
    };

    const withManualYearCounts = (rows) =>
        (Array.isArray(rows) ? rows : []).map((r) => {
            const sc = toNum(r?.studentCount);
            const y2 = r?.studentCountY2 == null ? sc : toNum(r?.studentCountY2);
            const y3 = r?.studentCountY3 == null ? sc : toNum(r?.studentCountY3);
            return { ...r, studentCount: sc, studentCountY2: y2, studentCountY3: y3 };
        });

    next.nonEducationFees.rows = withManualYearCounts(next.nonEducationFees.rows);
    next.dormitory.rows = withManualYearCounts(next.dormitory.rows);

    if (isLegacy) {
        const tuitionFee = toNum(g.tuitionFeePerStudentYearly);
        const lunchFee = toNum(g.lunchFeePerStudentYearly);
        const dormFee = toNum(g.dormitoryFeePerStudentYearly);

        next.tuition.rows = next.tuition.rows.map((r) => (toNum(r.unitFee) ? r : { ...r, unitFee: tuitionFee }));
        next.nonEducationFees.rows = next.nonEducationFees.rows.map((r) =>
            r.key === "yemek" && !toNum(r.unitFee) ? { ...r, unitFee: lunchFee } : r
        );
        next.dormitory.rows = next.dormitory.rows.map((r) =>
            r.key === "yurt" && !toNum(r.unitFee) ? { ...r, unitFee: dormFee } : r
        );

        const anyTuitionStudents = next.tuition.rows.some((r) => toNum(r.studentCount) > 0);
        if (!anyTuitionStudents) {
            next.tuition.rows = next.tuition.rows.map((r) => {
                let sc = 0;
                if (r.key === "okulOncesi") sc = suggested.kg;
                else if (r.key === "ilkokulYerel") sc = suggested.ilkokul;
                else if (r.key === "ortaokulYerel") sc = suggested.ortaokul;
                else if (r.key === "liseYerel") sc = suggested.lise;
                return { ...r, studentCount: sc };
            });
        }
    }

    return next;
}

function getInflationFactors(temelBilgiler) {
    const infl = temelBilgiler?.inflation || {};
    const y2 = toNum(infl.y2);
    const y3 = toNum(infl.y3);
    return { y1: 1, y2: 1 + y2, y3: (1 + y2) * (1 + y3) };
}

// Compute total discounts exactly like frontend computeDiscountTotalForYear
function computeDiscountTotalForYear({ yearKey, discounts, grossTuition, tuitionStudents, avgTuitionFee, factor = 1 }) {
    const list = Array.isArray(discounts) ? discounts : [];
    const y = String(yearKey || "y1");

    let total = 0;
    for (const d of list) {
        if (!d || typeof d !== "object") continue;
        const mode = String(d.mode || "percent");
        if (mode === "percent") {
            const pct = toNum(d.value) / 100;
            if (pct <= 0) continue;
            total += grossTuition * pct;
            continue;
        }

        if (mode === "fixed") {
            const hasY2 = d.valueY2 != null;
            const hasY3 = d.valueY3 != null;
            const hasYearSpecific = (y === "y2" && hasY2) || (y === "y3" && hasY3);
            const base = y === "y2" ? (hasY2 ? d.valueY2 : d.value) : y === "y3" ? (hasY3 ? d.valueY3 : d.value) : d.value;
            const perStudent = toNum(base) * (hasYearSpecific ? 1 : factor);
            if (perStudent <= 0) continue;
            total += tuitionStudents * perStudent;
            continue;
        }

        if (mode === "cap") {
            const pct = toNum(d.value) / 100;
            if (pct <= 0) continue;
            const capPct = toNum(d.capPct) / 100;
            const capAmount = toNum(d.capAmount);
            const capStudent = capPct > 0 ? tuitionStudents * capPct : 0;
            const capMoney = capAmount > 0 ? capAmount : capStudent * avgTuitionFee;
            const discount = grossTuition * pct;
            total += Math.min(discount, capMoney > 0 ? capMoney : discount);
            continue;
        }
    }

    return total;
}

function parseBaseYearFromAcademicYear(academicYear) {
    const raw = String(academicYear || "").trim();
    const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (range) return Number(range[1]);
    const single = raw.match(/^(\d{4})$/);
    if (single) return Number(single[1]);
    return null;
}

function buildYearMeta(baseYear) {
    const y = Number.isFinite(Number(baseYear)) ? Number(baseYear) : null;
    const mk = (idx) => {
        const n = idx + 1;
        const start = y != null ? y + idx : null;
        const end = start != null ? start + 1 : null;
        const range = start != null && end != null ? `${start}-${end}` : "";
        const labelLong = range ? `${n}.Yıl (${range} EĞİTİM ÖĞRETİM YILI)` : `${n}.Yıl`;
        const labelShort = range ? `${n}.Yıl (${range})` : `${n}.Yıl`;
        return { n, start, end, range, labelLong, labelShort };
    };
    return { y1: mk(0), y2: mk(1), y3: mk(2) };
}

function applyScaleToGelirler(rawGelirler, scale) {
    if (!rawGelirler || typeof rawGelirler !== "object") return {};
    const g = deepClone(rawGelirler);
    const mul = (obj, key) => {
        if (!obj || typeof obj !== "object") return;
        const n = toNum(obj[key]);
        if (n !== 0) obj[key] = n * scale;
        else if (obj[key] != null) obj[key] = 0;
    };
    const mulRows = (rows, key) => {
        if (!Array.isArray(rows)) return;
        rows.forEach((r) => mul(r, key));
    };

    mulRows(g?.tuition?.rows, "unitFee");
    mulRows(g?.nonEducationFees?.rows, "unitFee");
    mulRows(g?.dormitory?.rows, "unitFee");
    mulRows(g?.otherInstitutionIncome?.rows, "amount");
    mul(g, "governmentIncentives");

    // legacy fields
    mul(g, "tuitionFeePerStudentYearly");
    mul(g, "lunchFeePerStudentYearly");
    mul(g, "dormitoryFeePerStudentYearly");
    mul(g, "otherFeePerStudentYearly");
    mul(g, "otherInstitutionIncomeYearly");
    return g;
}

function applyScaleToDiscounts(discounts, scale) {
    const list = Array.isArray(discounts) ? discounts : [];
    return list.map((d) => {
        if (!d || typeof d !== "object") return d;
        const mode = String(d.mode || "percent");
        const out = { ...d };
        // fixed mode values are money
        if (mode === "fixed") {
            if (out.value != null) out.value = toNum(out.value) * scale;
            if (out.valueY2 != null) out.valueY2 = toNum(out.valueY2) * scale;
            if (out.valueY3 != null) out.valueY3 = toNum(out.valueY3) * scale;
        }
        // cap mode may include a money cap
        if (mode === "cap" && out.capAmount != null) {
            out.capAmount = toNum(out.capAmount) * scale;
        }
        return out;
    });
}

/**
 * buildGelirlerModel
 *
 * A backend model builder that matches the UI Gelirler tab (IncomeEditor.jsx)
 * and is ready for AOA-only Excel exporting.
 */
function buildGelirlerModel({ scenario, inputs, report, programType, currencyMeta, reportCurrency }) {
    const inputsObj = inputs && typeof inputs === "object" ? inputs : {};
    const gSaved = inputsObj?.gelirler;

    const type = normalizeProgramType(programType || scenario?.program_type || currencyMeta?.program_type);

    // Currency display
    const inputCurrency = String(currencyMeta?.input_currency || scenario?.input_currency || "USD").toUpperCase();
    const fx = toNum(currencyMeta?.fx_usd_to_local || scenario?.fx_usd_to_local);
    const localCode = String(currencyMeta?.local_currency_code || scenario?.local_currency_code || "LOCAL").trim();
    const showLocal = String(reportCurrency || "usd").toLowerCase() === "local";
    const currencyCode = showLocal ? (localCode || "LOCAL") : "USD";

    // If scenario is LOCAL but reportCurrency is USD, convert stored inputs (local) -> USD
    const scale = inputCurrency === "LOCAL" && !showLocal && fx > 0 ? 1 / fx : 1;

    const gradesYearsRaw = inputsObj?.gradesYears;
    const gradesYearsSrc =
        gradesYearsRaw && typeof gradesYearsRaw === "object"
            ? gradesYearsRaw?.years && typeof gradesYearsRaw.years === "object"
                ? gradesYearsRaw.years
                : gradesYearsRaw
            : null;
    const fallbackGrades = inputsObj?.grades || [];
    const normalizedGradesYears = {
        y1: gradesYearsSrc?.y1 || fallbackGrades,
        y2: gradesYearsSrc?.y2 || gradesYearsSrc?.y1 || fallbackGrades,
        y3: gradesYearsSrc?.y3 || gradesYearsSrc?.y2 || gradesYearsSrc?.y1 || fallbackGrades,
    };

    const kademeConfig = inputsObj?.temelBilgiler?.kademeler;
    const suggestedByYear = {
        y1: computeStudentsFromGrades(normalizedGradesYears.y1, kademeConfig),
        y2: computeStudentsFromGrades(normalizedGradesYears.y2, kademeConfig),
        y3: computeStudentsFromGrades(normalizedGradesYears.y3, kademeConfig),
    };

    const temelBilgiler = inputsObj?.temelBilgiler || report?.temelBilgiler || {};
    const factors = getInflationFactors(temelBilgiler);

    const gScaled = applyScaleToGelirler(gSaved, scale);
    const g = normalizeGelirler(gScaled, normalizedGradesYears.y1, kademeConfig);

    const discountsScaled = applyScaleToDiscounts(inputsObj?.discounts, scale);

    const tuitionBaseByKey = {
        okulOncesi: "okulOncesi",
        ilkokulYerel: "ilkokul",
        ilkokulInt: "ilkokul",
        ortaokulYerel: "ortaokul",
        ortaokulInt: "ortaokul",
        liseYerel: "lise",
        liseInt: "lise",
    };

    const kademeLabels = {
        okulOncesi: formatKademeLabel("Okul Öncesi", kademeConfig, "okulOncesi"),
        ilkokulYerel: `${formatKademeLabel("İlkokul", kademeConfig, "ilkokul")}-YEREL`,
        ilkokulInt: `${formatKademeLabel("İlkokul", kademeConfig, "ilkokul")}-INT.`,
        ortaokulYerel: `${formatKademeLabel("Ortaokul", kademeConfig, "ortaokul")}-YEREL`,
        ortaokulInt: `${formatKademeLabel("Ortaokul", kademeConfig, "ortaokul")}-INT.`,
        liseYerel: `${formatKademeLabel("Lise", kademeConfig, "lise")}-YEREL`,
        liseInt: `${formatKademeLabel("Lise", kademeConfig, "lise")}-INT.`,
    };

    const tuitionRows = Array.isArray(g?.tuition?.rows) ? g.tuition.rows : [];
    const nonEdRows = Array.isArray(g?.nonEducationFees?.rows) ? g.nonEducationFees.rows : [];
    const dormRows = Array.isArray(g?.dormitory?.rows) ? g.dormitory.rows : [];
    const otherRows = Array.isArray(g?.otherInstitutionIncome?.rows) ? g.otherInstitutionIncome.rows : [];

    const visibleTuitionRows = tuitionRows.filter((r) => {
        const baseKey = tuitionBaseByKey[r?.key];
        const baseEnabled = !baseKey || kademeConfig?.[baseKey]?.enabled !== false;
        return baseEnabled && isKademeKeyVisible(r?.key, type);
    });

    const nonEdByKey = new Map(nonEdRows.map((r) => [String(r?.key), r]));
    const dormByKey = new Map(dormRows.map((r) => [String(r?.key), r]));

    const getManualStudentCount = (row, yearKey) => {
        if (!row) return 0;
        const v =
            yearKey === "y1" ? row.studentCount : yearKey === "y2" ? row.studentCountY2 ?? row.studentCount : row.studentCountY3 ?? row.studentCount;
        return toNum(v);
    };

    const suggestedForTuitionKeyYear = (key, yearKey) => {
        const s = suggestedByYear?.[yearKey] || suggestedByYear.y1;
        if (key === "okulOncesi") return toNum(s.kg);
        if (key === "ilkokulYerel" || key === "ilkokulInt") return toNum(s.ilkokul);
        if (key === "ortaokulYerel" || key === "ortaokulInt") return toNum(s.ortaokul);
        if (key === "liseYerel" || key === "liseInt") return toNum(s.lise);
        return 0;
    };

    const studentCountForRowYear = (sectionKey, rowKey, yearKey) => {
        if (sectionKey === "tuition") return suggestedForTuitionKeyYear(rowKey, yearKey);
        if (sectionKey === "nonEducationFees") return getManualStudentCount(nonEdByKey.get(String(rowKey)), yearKey);
        if (sectionKey === "dormitory") return getManualStudentCount(dormByKey.get(String(rowKey)), yearKey);
        return 0;
    };

    const tuitionStudentsByYear = { y1: 0, y2: 0, y3: 0 };
    for (const y of YEAR_KEYS) {
        tuitionStudentsByYear[y] = visibleTuitionRows.reduce((s, r) => s + studentCountForRowYear("tuition", r.key, y), 0);
    }

    const byYear = {};
    for (const y of YEAR_KEYS) {
        const f = factors?.[y] ?? 1;
        const tuitionTotal = visibleTuitionRows.reduce(
            (s, r) => s + studentCountForRowYear("tuition", r.key, y) * (toNum(r.unitFee) * f),
            0
        );
        const nonEdTotal = nonEdRows.reduce(
            (s, r) => s + studentCountForRowYear("nonEducationFees", r.key, y) * (toNum(r.unitFee) * f),
            0
        );
        const dormTotal = dormRows.reduce(
            (s, r) => s + studentCountForRowYear("dormitory", r.key, y) * (toNum(r.unitFee) * f),
            0
        );
        const activityGross = tuitionTotal + nonEdTotal + dormTotal;

        const otherInstitutionTotal = otherRows.reduce((s, r) => s + toNum(r.amount) * f, 0);
        const govt = toNum(g.governmentIncentives) * f;
        const otherTotal = otherInstitutionTotal + govt;
        const grossTotal = activityGross + otherTotal;

        const fallbackStudents = suggestedByYear?.[y]?.total ?? suggestedByYear.y1.total;
        const tuitionBaseStudents = tuitionStudentsByYear?.[y] > 0 ? tuitionStudentsByYear[y] : fallbackStudents;
        const avgTuitionFee = tuitionBaseStudents > 0 ? tuitionTotal / tuitionBaseStudents : 0;
        const totalDiscounts = computeDiscountTotalForYear({
            yearKey: y,
            discounts: discountsScaled,
            grossTuition: tuitionTotal,
            tuitionStudents: tuitionBaseStudents,
            avgTuitionFee,
            factor: f,
        });

        const netActivity = activityGross - totalDiscounts;
        const netIncome = grossTotal - totalDiscounts;
        const netCiroPerStudent = tuitionBaseStudents > 0 ? netActivity / tuitionBaseStudents : null;
        const otherIncomeRatio = netIncome > 0 ? otherTotal / netIncome : null;

        byYear[y] = {
            tuitionTotal,
            nonEdTotal,
            dormTotal,
            activityGross,
            otherInstitutionTotal,
            govt,
            otherTotal,
            grossTotal,
            totalDiscounts,
            netActivity,
            netIncome,
            netCiroPerStudent,
            otherIncomeRatio,
        };
    }

    const baseYear = parseBaseYearFromAcademicYear(scenario?.academic_year);
    const yearMeta = buildYearMeta(baseYear);

    const mkPerStudentTable = (title, rows, sectionKey, isTuition) => {
        const headerRows = [
            [
                "Kalem",
                yearMeta.y1.labelLong,
                null,
                null,
                yearMeta.y2.labelLong,
                null,
                null,
                yearMeta.y3.labelLong,
                null,
                null,
            ],
            [
                null,
                "Öğrenci Sayısı",
                `Birim Ücret (${currencyCode})`,
                `Toplam (${currencyCode})`,
                "Öğrenci Sayısı",
                `Birim Ücret (${currencyCode})`,
                `Toplam (${currencyCode})`,
                "Öğrenci Sayısı",
                `Birim Ücret (${currencyCode})`,
                `Toplam (${currencyCode})`,
            ],
        ];

        const totals = { y1: 0, y2: 0, y3: 0 };
        const totalStudents = { y1: 0, y2: 0, y3: 0 };
        const outRows = [];

        for (const r of rows) {
            const label = isTuition ? kademeLabels[r.key] || r.label : r.label;
            const uf1 = toNum(r.unitFee);
            const uf2 = uf1 * factors.y2;
            const uf3 = uf1 * factors.y3;

            const sc1 = studentCountForRowYear(sectionKey, r.key, "y1");
            const sc2 = studentCountForRowYear(sectionKey, r.key, "y2");
            const sc3 = studentCountForRowYear(sectionKey, r.key, "y3");

            const t1 = sc1 * uf1;
            const t2 = sc2 * uf2;
            const t3 = sc3 * uf3;

            totals.y1 += t1;
            totals.y2 += t2;
            totals.y3 += t3;
            totalStudents.y1 += sc1;
            totalStudents.y2 += sc2;
            totalStudents.y3 += sc3;

            outRows.push([label, sc1, uf1, t1, sc2, uf2, t2, sc3, uf3, t3]);
        }

        outRows.push([
            "TOPLAM",
            totalStudents.y1,
            null,
            totals.y1,
            totalStudents.y2,
            null,
            totals.y2,
            totalStudents.y3,
            null,
            totals.y3,
        ]);

        return { title, headerRows, rows: outRows };
    };

    const tuitionTable = mkPerStudentTable(
        `EĞİTİM FAALİYET GELİRLERİ / YIL (${currencyCode})`,
        visibleTuitionRows,
        "tuition",
        true
    );

    const nonEdTable = mkPerStudentTable(
        `ÖĞRENİM DIŞI ÜCRETLER / YIL (${currencyCode})`,
        nonEdRows,
        "nonEducationFees",
        false
    );

    const dormTable = mkPerStudentTable(
        `YURT / KONAKLAMA GELİRLERİ / YIL (${currencyCode})`,
        dormRows,
        "dormitory",
        false
    );

    const otherHeader = [["Gelir Kalemi", yearMeta.y1.labelShort, yearMeta.y2.labelShort, yearMeta.y3.labelShort]];
    const otherRowsOut = [];
    let other1 = 0;
    let other2 = 0;
    let other3 = 0;
    for (const r of otherRows) {
        const a1 = toNum(r.amount);
        const a2 = a1 * factors.y2;
        const a3 = a1 * factors.y3;
        other1 += a1;
        other2 += a2;
        other3 += a3;
        otherRowsOut.push([r.label || r.key || "", a1, a2, a3]);
    }
    otherRowsOut.push(["TOPLAM", other1, other2, other3]);

    const otherTable = {
        title: `ÖĞRENCİ ÜCRETLERİ HARİÇ KURUMUN DİĞER GELİRLERİ (BRÜT) / YIL (${currencyCode})`,
        headerRows: otherHeader,
        rows: otherRowsOut,
    };

    const gov1 = toNum(g.governmentIncentives);
    const gov2 = gov1 * factors.y2;
    const gov3 = gov1 * factors.y3;
    const govtTable = {
        title: `DEVLET TEŞVİKLERİ / YIL (${currencyCode})`,
        headerRows: [["Gelir Kalemi", yearMeta.y1.labelShort, yearMeta.y2.labelShort, yearMeta.y3.labelShort]],
        rows: [
            ["Devlet Teşvikleri", gov1, gov2, gov3],
            ["TOPLAM", gov1, gov2, gov3],
        ],
    };

    const summaryTable = {
        title: "ÖZET",
        headerRows: [[null, yearMeta.y1.labelShort, yearMeta.y2.labelShort, yearMeta.y3.labelShort]],
        rows: [
            ["FAALİYET GELİRLERİ (Brüt)", byYear.y1.activityGross, byYear.y2.activityGross, byYear.y3.activityGross],
            [
                "BURS VE İNDİRİMLER (Önizleme)",
                -byYear.y1.totalDiscounts,
                -byYear.y2.totalDiscounts,
                -byYear.y3.totalDiscounts,
            ],
            ["NET FAALİYET GELİRLERİ", byYear.y1.netActivity, byYear.y2.netActivity, byYear.y3.netActivity],
            [
                "NET KİŞİ BAŞI CİRO",
                byYear.y1.netCiroPerStudent,
                byYear.y2.netCiroPerStudent,
                byYear.y3.netCiroPerStudent,
            ],
            [
                "DİĞER GELİRLER (Brüt + Devlet Teşvikleri)",
                byYear.y1.otherTotal,
                byYear.y2.otherTotal,
                byYear.y3.otherTotal,
            ],
            ["DİĞER GELİRLER %", byYear.y1.otherIncomeRatio, byYear.y2.otherIncomeRatio, byYear.y3.otherIncomeRatio],
            ["NET TOPLAM GELİR", byYear.y1.netIncome, byYear.y2.netIncome, byYear.y3.netIncome],
        ],
    };

    return {
        sheetTitle: "Gelirler ( Incomes )",
        currencyCode,
        reportCurrency: showLocal ? "local" : "usd",
        yearMeta,
        factors,
        tables: [tuitionTable, nonEdTable, dormTable, otherTable, govtTable, summaryTable],
    };
}

module.exports = {
    buildGelirlerModel,
};
