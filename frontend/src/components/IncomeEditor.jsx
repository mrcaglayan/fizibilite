//frontend/src/components/IncomeEditor.jsx

import React, { useCallback, useMemo } from "react";
import { formatKademeLabel, summarizeGradesByKademe } from "../utils/kademe";
import NumberInput from "./NumberInput";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-";
const fmt0 = (v) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-";
const fmtPct = (v) =>
  Number.isFinite(v) ? (v * 100).toFixed(2) + "%" : "-";

const YEAR_KEYS = ["y1", "y2", "y3"];
const EMPTY_ROWS = Object.freeze([]);

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
  { key: "isletmeGelirleri", label: "İşletme Gelirleri (Kantin, Kafeterya, Sosyal Faaliyet ve Spor Kulüpleri vb.)" },
  { key: "tesisKira", label: "Bina ve Tesislerin Konaklama, Sosyal, Kültür, Spor vb. Amaçlı Kullanımından Kaynaklı Tesis Kira Gelirleri" },
  { key: "egitimDisiHizmet", label: "Eğitim Dışı Verilen Hizmetler (Danışmanlık vb.) Karşılığı Gelirler" },
  { key: "yazOkuluOrganizasyon", label: "Yaz Okulları, Organizasyon, Kurs vb. İkinci Eğitim Gelirleri" },
  { key: "kayitUcreti", label: "Kayıt Ücreti" },
  { key: "bagislar", label: "Bağışlar" },
  { key: "stkKamu", label: "STK/Kamu Sübvansiyonları" },
  { key: "faizPromosyon", label: "Faiz, Banka Promosyon/Komisyon vb. Kaynaklı Gelirler" },
];

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
    tuition: {
      rows: TUITION_ROWS.map((r) => ({ key: r.key, label: r.label, studentCount: 0, unitFee: 0 })),
    },
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
    otherInstitutionIncome: {
      rows: OTHER_INCOME_ROWS.map((r) => ({ key: r.key, label: r.label, amount: 0 })),
    },
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

  // Legacy mapping (old per-student fields)
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

  // Backward compatible: if a scenario didn't store Y2/Y3 student counts for manual tables,
  // initialize them to Year-1 counts so the table isn't blank.
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

    next.tuition.rows = next.tuition.rows.map((r) => (r.unitFee ? r : { ...r, unitFee: tuitionFee }));
    next.nonEducationFees.rows = next.nonEducationFees.rows.map((r) =>
      r.key === "yemek" && !r.unitFee ? { ...r, unitFee: lunchFee } : r
    );
    next.dormitory.rows = next.dormitory.rows.map((r) =>
      r.key === "yurt" && !r.unitFee ? { ...r, unitFee: dormFee } : r
    );

    const anyTuitionStudents = next.tuition.rows.some((r) => toNum(r.studentCount) > 0);
    if (!anyTuitionStudents) {
      next.tuition.rows = next.tuition.rows.map((r, idx) => {
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
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

function computeDiscountPreview({ discounts, tuitionStudents, grossTuition }) {
  const list = Array.isArray(discounts) ? discounts : [];
  const students = toNum(tuitionStudents);
  const gross = toNum(grossTuition);
  if (gross <= 0 || students <= 0 || list.length === 0) return { totalDiscounts: 0, details: [] };

  const avgTuitionFee = gross / students;

  const details = [];
  let avgRate = 0;

  for (const d of list) {
    if (!d) continue;
    const name = String(d.name || "Discount");
    const mode = String(d.mode || "percent");
    const value = toNum(d.value);
    const ratio = clamp(toNum(d.ratio), 0, 1);

    let amount = 0;
    let effectiveRatePart = 0;

    if (mode === "fixed") {
      amount = students * ratio * value;
      if (avgTuitionFee > 0) effectiveRatePart = (ratio * value) / avgTuitionFee;
    } else {
      const pct = clamp(value, 0, 1);
      amount = gross * ratio * pct;
      effectiveRatePart = ratio * pct;
    }

    details.push({ name, mode, value, ratio, amount, effectiveRatePart });
    avgRate += effectiveRatePart;
  }

  const capped = clamp(avgRate, 0, 1);
  const totalDiscounts = Math.min(gross, gross * capped);

  return { totalDiscounts, details };
}

export default function IncomeEditor({
  gelirler,
  temelBilgiler,
  baseYear,
  onChange,
  grades,
  gradesYears,
  discounts,
  currencyCode = "USD",
  dirtyPaths,
  onDirty,
}) {
  const normalizedGradesYears = useMemo(() => {
    const src = gradesYears && typeof gradesYears === "object" ? gradesYears : null;
    const fallback = grades || {};
    const y1 = src?.y1 || fallback;
    const y2 = src?.y2 || y1;
    const y3 = src?.y3 || y2;
    return { y1, y2, y3 };
  }, [gradesYears, grades]);

  const suggestedByYear = useMemo(() => {
    const kademeConfig = temelBilgiler?.kademeler;
    return {
      y1: computeStudentsFromGrades(normalizedGradesYears.y1, kademeConfig),
      y2: computeStudentsFromGrades(normalizedGradesYears.y2, kademeConfig),
      y3: computeStudentsFromGrades(normalizedGradesYears.y3, kademeConfig),
    };
  }, [normalizedGradesYears, temelBilgiler?.kademeler]);

  // Backward compatibility: places that still expect a single "suggested" use Year-1 values.
  const suggested = suggestedByYear.y1;

  const g = useMemo(
    () => normalizeGelirler(gelirler, normalizedGradesYears.y1, temelBilgiler?.kademeler),
    [gelirler, normalizedGradesYears, temelBilgiler?.kademeler]
  );
  const kademeLabels = useMemo(
    () => ({
      okulOncesi: formatKademeLabel("Okul Öncesi", temelBilgiler?.kademeler, "okulOncesi"),
      ilkokulYerel: `${formatKademeLabel("İlkokul", temelBilgiler?.kademeler, "ilkokul")}-YEREL`,
      ilkokulInt: `${formatKademeLabel("İlkokul", temelBilgiler?.kademeler, "ilkokul")}-INT.`,
      ortaokulYerel: `${formatKademeLabel("Ortaokul", temelBilgiler?.kademeler, "ortaokul")}-YEREL`,
      ortaokulInt: `${formatKademeLabel("Ortaokul", temelBilgiler?.kademeler, "ortaokul")}-INT.`,
      liseYerel: `${formatKademeLabel("Lise", temelBilgiler?.kademeler, "lise")}-YEREL`,
      liseInt: `${formatKademeLabel("Lise", temelBilgiler?.kademeler, "lise")}-INT.`,
    }),
    [temelBilgiler?.kademeler]
  );
  const tuitionBaseByKey = useMemo(
    () => ({
      okulOncesi: "okulOncesi",
      ilkokulYerel: "ilkokul",
      ilkokulInt: "ilkokul",
      ortaokulYerel: "ortaokul",
      ortaokulInt: "ortaokul",
      liseYerel: "lise",
      liseInt: "lise",
    }),
    []
  );
  const factors = useMemo(() => getInflationFactors(temelBilgiler), [temelBilgiler]);
  const pathForRow = (sectionKey, rowKey, field) =>
    `inputs.gelirler.${sectionKey}.rows.${rowKey}.${field}`;
  const pathForOtherRow = (rowKey) => `inputs.gelirler.otherInstitutionIncome.rows.${rowKey}.amount`;
  const govtPath = "inputs.gelirler.governmentIncentives";
  const isDirty = (path) => (dirtyPaths ? dirtyPaths.has(path) : false);
  const inputClass = (base, path) => base + (isDirty(path) ? " input-dirty" : "");

  const tuitionRows = useMemo(() => g.tuition?.rows || EMPTY_ROWS, [g.tuition?.rows]);
  const visibleTuitionRows = useMemo(
    () =>
      tuitionRows.filter((r) => {
        const baseKey = tuitionBaseByKey[r.key];
        if (!baseKey) return true;
        return temelBilgiler?.kademeler?.[baseKey]?.enabled !== false;
      }),
    [tuitionRows, tuitionBaseByKey, temelBilgiler?.kademeler]
  );
  const nonEdRows = useMemo(() => g.nonEducationFees?.rows || EMPTY_ROWS, [g.nonEducationFees?.rows]);
  const dormRows = useMemo(() => g.dormitory?.rows || EMPTY_ROWS, [g.dormitory?.rows]);
  const otherRows = useMemo(
    () => g.otherInstitutionIncome?.rows || EMPTY_ROWS,
    [g.otherInstitutionIncome?.rows]
  );
  const nonEdRowByKey = useMemo(
    () => new Map(nonEdRows.map((r) => [String(r.key), r])),
    [nonEdRows]
  );
  const dormRowByKey = useMemo(
    () => new Map(dormRows.map((r) => [String(r.key), r])),
    [dormRows]
  );

  const getManualStudentCount = useCallback((row, yearKey) => {
    if (!row) return 0;
    const v =
      yearKey === "y1"
        ? row.studentCount
        : yearKey === "y2"
          ? row.studentCountY2 ?? row.studentCount
          : row.studentCountY3 ?? row.studentCount;
    return toNum(v);
  }, []);

  const suggestedForTuitionKeyYear = useCallback(
    (key, yearKey) => {
      const s = suggestedByYear?.[yearKey] || suggestedByYear?.y1 || suggested;
      if (key === "okulOncesi") return s.kg;
      if (key === "ilkokulYerel") return s.ilkokul;
      if (key === "ortaokulYerel") return s.ortaokul;
      if (key === "liseYerel") return s.lise;
      return 0; // INT. rows default 0
    },
    [suggested, suggestedByYear]
  );

  const studentCountForRowYear = useCallback(
    (sectionKey, rowKey, yearKey) => {
      if (sectionKey === "tuition") return toNum(suggestedForTuitionKeyYear(rowKey, yearKey));
      if (sectionKey === "nonEducationFees")
        return getManualStudentCount(nonEdRowByKey.get(String(rowKey)), yearKey);
      if (sectionKey === "dormitory")
        return getManualStudentCount(dormRowByKey.get(String(rowKey)), yearKey);
      return 0;
    },
    [dormRowByKey, getManualStudentCount, nonEdRowByKey, suggestedForTuitionKeyYear]
  );

  const tuitionStudentsByYear = useMemo(() => {
    const out = { y1: 0, y2: 0, y3: 0 };
    for (const y of YEAR_KEYS) {
      out[y] = visibleTuitionRows.reduce(
        (s, r) => s + studentCountForRowYear("tuition", r.key, y),
        0
      );
    }
    return out;
  }, [studentCountForRowYear, visibleTuitionRows]);

  const byYear = useMemo(() => {
    const out = {};

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

      const otherInstitutionTotal = otherRows.reduce((s, r) => s + (toNum(r.amount) * f), 0);
      const govt = toNum(g.governmentIncentives) * f;
      const otherTotal = otherInstitutionTotal + govt;
      const grossTotal = activityGross + otherTotal;

      const fallbackStudents = suggestedByYear?.[y]?.total ?? suggested.total;
      const tuitionBaseStudents = tuitionStudentsByYear?.[y] > 0 ? tuitionStudentsByYear[y] : fallbackStudents;
      const discountPreview = computeDiscountPreview({
        discounts,
        tuitionStudents: tuitionBaseStudents,
        grossTuition: tuitionTotal,
      });
      const totalDiscounts = toNum(discountPreview.totalDiscounts);

      const netActivity = activityGross - totalDiscounts;
      const netIncome = grossTotal - totalDiscounts;
      const netCiroPerStudent = tuitionBaseStudents > 0 ? netActivity / tuitionBaseStudents : null;
      const otherIncomeRatio = netIncome > 0 ? otherTotal / netIncome : null;

      out[y] = {
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

    return out;
  }, [
    discounts,
    dormRows,
    factors,
    g.governmentIncentives,
    nonEdRows,
    otherRows,
    suggested,
    suggestedByYear,
    tuitionStudentsByYear,
    visibleTuitionRows,
    studentCountForRowYear,
  ]);

  function update(path, value) {
    const next = structuredClone(g);
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    onChange(next);
  }

  function setRow(sectionKey, rowKey, field, value) {
    const nextValue = value === "" ? 0 : toNum(value);
    const rows = (g[sectionKey]?.rows || []).map((r) => {
      if (String(r.key) !== String(rowKey)) return r;
      return { ...r, [field]: nextValue };
    });
    update(sectionKey + ".rows", rows);
    onDirty?.(pathForRow(sectionKey, rowKey, field), nextValue);
  }

  function setOtherRow(rowKey, value) {
    const nextValue = value === "" ? 0 : toNum(value);
    const rows = (g.otherInstitutionIncome?.rows || []).map((r) => {
      if (String(r.key) !== String(rowKey)) return r;
      return { ...r, amount: nextValue };
    });
    update("otherInstitutionIncome.rows", rows);
    onDirty?.(pathForOtherRow(rowKey), nextValue);
  }



  const yearMeta = useMemo(() => {
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
  }, [baseYear]);


  const sectionTable = (title, rows, sectionKey, unitField = "unitFee") => {
    const totals = { y1: 0, y2: 0, y3: 0 };
    const totalStudents = { y1: 0, y2: 0, y3: 0 };

    for (const r of rows) {
      const uf1 = toNum(r[unitField]);
      const uf2 = uf1 * factors.y2;
      const uf3 = uf1 * factors.y3;

      const sc1 = studentCountForRowYear(sectionKey, r.key, "y1");
      const sc2 = studentCountForRowYear(sectionKey, r.key, "y2");
      const sc3 = studentCountForRowYear(sectionKey, r.key, "y3");

      totalStudents.y1 += sc1;
      totalStudents.y2 += sc2;
      totalStudents.y3 += sc3;

      totals.y1 += sc1 * uf1;
      totals.y2 += sc2 * uf2;
      totals.y3 += sc3 * uf3;
    }

    const isTuitionSection = sectionKey === "tuition";

    return (
      <>
        <div style={{ marginTop: 16, fontWeight: 800 }}>{title}</div>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="table data-table table-3y income-3block">
            <thead>
              <tr className="group">
                <th rowSpan={2}>Kalem</th>
                <th colSpan={3} className="sep-left" style={{ textAlign: "center" }}>
                  {yearMeta.y1.labelLong}
                </th>
                <th colSpan={3} className="sep-left" style={{ textAlign: "center" }}>
                  {yearMeta.y2.labelLong}
                </th>
                <th colSpan={3} className="sep-left" style={{ textAlign: "center" }}>
                  {yearMeta.y3.labelLong}
                </th>
              </tr>
              <tr>
                <th className="sep-left" style={{ width: 130, textAlign: "right" }}>
                  Öğrenci Sayısı
                </th>

                <th style={{ width: 120, textAlign: "right" }}>{`Birim Ücret (${currencyCode})`}</th>
                <th style={{ width: 140, textAlign: "right" }}>{`Toplam (${currencyCode})`}</th>

                <th className="sep-left" style={{ width: 130, textAlign: "right" }}>
                  Öğrenci Sayısı
                </th>
                <th style={{ width: 120, textAlign: "right" }}>{`Birim Ücret (${currencyCode})`}</th>
                <th style={{ width: 140, textAlign: "right" }}>{`Toplam (${currencyCode})`}</th>

                <th className="sep-left" style={{ width: 130, textAlign: "right" }}>
                  Öğrenci Sayısı
                </th>
                <th style={{ width: 120, textAlign: "right" }}>{`Birim Ücret (${currencyCode})`}</th>
                <th style={{ width: 140, textAlign: "right" }}>{`Toplam (${currencyCode})`}</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => {
                const uf1 = toNum(r[unitField]);
                const uf2 = uf1 * factors.y2;
                const uf3 = uf1 * factors.y3;

                const sc1 = studentCountForRowYear(sectionKey, r.key, "y1");
                const sc2 = studentCountForRowYear(sectionKey, r.key, "y2");
                const sc3 = studentCountForRowYear(sectionKey, r.key, "y3");

                const t1 = sc1 * uf1;
                const t2 = sc2 * uf2;
                const t3 = sc3 * uf3;

                const displayLabel = isTuitionSection ? (kademeLabels[r.key] || r.label) : r.label;

                return (
                  <tr key={r.key} className={idx === 0 ? "row-group-start" : ""}>
                    <td>{displayLabel}</td>

                    {/* 1. Yıl */}
                    <td className="sep-left cell-count">
                      <NumberInput
                        className={inputClass("input xs", pathForRow(sectionKey, r.key, "studentCount"))}
                       
                        min="0"
                        step="1"
                        value={sc1}
                        disabled={isTuitionSection}
                        onChange={(value) => setRow(sectionKey, r.key, "studentCount", value)}
                      />
                    </td>
                    <td className="cell-num">
                      <NumberInput
                        className={inputClass("input xs", pathForRow(sectionKey, r.key, unitField))}
                       
                        min="0"
                        step="0.01"
                        value={uf1}
                        onChange={(value) => setRow(sectionKey, r.key, unitField, value)}
                      />
                    </td>
                    <td className="cell-num">{fmtMoney(t1)}</td>

                    {/* 2. Yıl */}
                    <td className="sep-left cell-count">
                      {isTuitionSection ? (
                        <span className="muted">{fmt0(sc2)}</span>
                      ) : (
                        <NumberInput
                          className={inputClass(
                            "input xs",
                            pathForRow(sectionKey, r.key, "studentCountY2")
                          )}
                         
                          min="0"
                          step="1"
                          value={sc2}
                          onChange={(value) => setRow(sectionKey, r.key, "studentCountY2", value)}
                        />
                      )}
                    </td>
                    <td className="cell-num muted">{fmtMoney(uf2)}</td>
                    <td className="cell-num">{fmtMoney(t2)}</td>

                    {/* 3. Yıl */}
                    <td className="sep-left cell-count">
                      {isTuitionSection ? (
                        <span className="muted">{fmt0(sc3)}</span>
                      ) : (
                        <NumberInput
                          className={inputClass(
                            "input xs",
                            pathForRow(sectionKey, r.key, "studentCountY3")
                          )}
                         
                          min="0"
                          step="1"
                          value={sc3}
                          onChange={(value) => setRow(sectionKey, r.key, "studentCountY3", value)}
                        />
                      )}
                    </td>
                    <td className="cell-num muted">{fmtMoney(uf3)}</td>
                    <td className="cell-num">{fmtMoney(t3)}</td>
                  </tr>
                );
              })}

              <tr className="row-group-start" style={{ fontWeight: 800 }}>
                <td>TOPLAM</td>

                {/* 1. Yıl */}
                <td className="cell-count sep-left">{fmt0(totalStudents.y1)}</td>
                <td />
                <td className="cell-num">{fmtMoney(totals.y1)}</td>

                {/* 2. Yıl */}
                <td className="cell-count muted sep-left">{fmt0(totalStudents.y2)}</td>
                <td />
                <td className="cell-num">{fmtMoney(totals.y2)}</td>

                {/* 3. Yıl */}
                <td className="cell-count muted sep-left">{fmt0(totalStudents.y3)}</td>
                <td />
                <td className="cell-num">{fmtMoney(totals.y3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
    <div className="card income-table">


      {sectionTable(`EĞİTİM FAALİYET GELİRLERİ / YIL (${currencyCode})`, visibleTuitionRows, "tuition")}
      {sectionTable(`ÖĞRENİM DIŞI ÜCRETLER / YIL (${currencyCode})`, nonEdRows, "nonEducationFees")}
      {sectionTable(`YURT / KONAKLAMA GELİRLERİ / YIL (${currencyCode})`, dormRows, "dormitory")}

      {/* Other institutional income */}
      <div style={{ marginTop: 18, fontWeight: 800 }}>
        {`ÖĞRENCİ ÜCRETLERİ HARİÇ KURUMUN DİĞER GELİRLERİ (BRÜT) / YIL (${currencyCode})`}
      </div>
      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table table-3y">
          <thead>
            <tr className="group">
              <th rowSpan={2}>Gelir Kalemi</th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>
                {yearMeta.y2.labelLong}
              </th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>
                {yearMeta.y3.labelLong}
              </th>
            </tr>
            <tr>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
            </tr>
          </thead>
          <tbody>
            {otherRows.map((r, idx) => {
              const a1 = toNum(r.amount);
              const a2 = a1 * factors.y2;
              const a3 = a1 * factors.y3;
              return (
                <tr key={r.key} className={idx === 0 ? "row-group-start" : ""}>
                  <td>{r.label}</td>
                  <td className="sep-left cell-num">
                    <NumberInput
                      className={inputClass("input xs", pathForOtherRow(r.key))}
                     
                      min="0"
                      step="0.01"
                      value={a1}
                      onChange={(value) => setOtherRow(r.key, value)}
                    />
                  </td>
                  <td className="cell-num muted sep-left">{fmtMoney(a2)}</td>
                  <td className="cell-num muted sep-left">{fmtMoney(a3)}</td>
                </tr>
              );
            })}
            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td>TOPLAM</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y1.otherInstitutionTotal)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y2.otherInstitutionTotal)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y3.otherInstitutionTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Government incentives */}
      <div style={{ marginTop: 18, fontWeight: 800 }}>{`DEVLET TEŞVİKLERİ / YIL (${currencyCode})`}</div>
      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table table-3y">
          <thead>
            <tr className="group">
              <th rowSpan={2}></th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>
                {yearMeta.y2.labelLong}
              </th>
              <th className="sep-left" style={{ width: 160, textAlign: "center" }}>
                {yearMeta.y3.labelLong}
              </th>
            </tr>
            <tr>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
              <th className="sep-left" style={{ width: 140, textAlign: "right" }}>{`Tutar (${currencyCode})`}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Devlet Teşvikleri</td>
              <td className="sep-left cell-num">
                <NumberInput
                  className={inputClass("input xs", govtPath)}
                 
                  min="0"
                  step="0.01"
                  value={toNum(g.governmentIncentives)}
                  onChange={(value) => {
                    const nextValue = value === "" ? 0 : toNum(value);
                    onDirty?.(govtPath, nextValue);
                    update("governmentIncentives", nextValue);
                  }}
                />
              </td>
              <td className="cell-num muted">{fmtMoney(byYear.y2.govt)}</td>
              <td className="cell-num muted">{fmtMoney(byYear.y3.govt)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div style={{ marginTop: 18, fontWeight: 800 }}>ÖZET</div>
      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table table-3y">
          <thead>
            <tr className="group">
              <th rowSpan={2}></th>
              <th className="sep-left" style={{ textAlign: "center", width: 200 }}>{yearMeta.y1.labelLong}</th>
              <th className="sep-left" style={{ textAlign: "center", width: 200 }}>
                {yearMeta.y2.labelLong}
              </th>
              <th className="sep-left" style={{ textAlign: "center", width: 200 }}>
                {yearMeta.y3.labelLong}
              </th>
            </tr>
            <tr>
              <th className="sep-left" style={{ textAlign: "right", width: 160 }}>{currencyCode}</th>
              <th className="sep-left" style={{ textAlign: "right", width: 160 }}>{currencyCode}</th>
              <th className="sep-left" style={{ textAlign: "right", width: 160 }}>{currencyCode}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>FAALİYET GELİRLERİ (Brüt)</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y1.activityGross)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y2.activityGross)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y3.activityGross)}</td>
            </tr>
            <tr>
              <td>BURS VE İNDİRİMLER (Önizleme)</td>
              <td className="cell-num sep-left">-{fmtMoney(byYear.y1.totalDiscounts)}</td>
              <td className="cell-num sep-left">-{fmtMoney(byYear.y2.totalDiscounts)}</td>
              <td className="cell-num sep-left">-{fmtMoney(byYear.y3.totalDiscounts)}</td>
            </tr>
            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td>NET FAALİYET GELİRLERİ</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y1.netActivity)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y2.netActivity)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y3.netActivity)}</td>
            </tr>
            <tr>
              <td className="small">Net Kişi Başı Ciro (Tuition öğrenci sayısı)</td>
              <td className="cell-num sep-left">{byYear.y1.netCiroPerStudent == null ? "-" : fmtMoney(byYear.y1.netCiroPerStudent)}</td>
              <td className="cell-num sep-left">{byYear.y2.netCiroPerStudent == null ? "-" : fmtMoney(byYear.y2.netCiroPerStudent)}</td>
              <td className="cell-num sep-left">{byYear.y3.netCiroPerStudent == null ? "-" : fmtMoney(byYear.y3.netCiroPerStudent)}</td>
            </tr>
            <tr>
              <td>DİĞER GELİRLER (Brüt + Devlet Teşvikleri)</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y1.otherTotal)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y2.otherTotal)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y3.otherTotal)}</td>
            </tr>
            <tr>
              <td className="small">Diğer Gelirler % (Net Toplam Gelir içinde)</td>
              <td className="cell-pct sep-left">{byYear.y1.otherIncomeRatio == null ? "-" : fmtPct(byYear.y1.otherIncomeRatio)}</td>
              <td className="cell-pct sep-left">{byYear.y2.otherIncomeRatio == null ? "-" : fmtPct(byYear.y2.otherIncomeRatio)}</td>
              <td className="cell-pct sep-left">{byYear.y3.otherIncomeRatio == null ? "-" : fmtPct(byYear.y3.otherIncomeRatio)}</td>
            </tr>
            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td>NET TOPLAM GELİR</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y1.netIncome)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y2.netIncome)}</td>
              <td className="cell-num sep-left">{fmtMoney(byYear.y3.netIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
