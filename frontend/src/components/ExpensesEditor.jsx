//frontend/src/components/ExpensesEditor.jsx

import React, { useEffect, useMemo } from "react";
import { useScenarioUiFlag } from "../hooks/useScenarioUIState";
import { computeDiscountTotalForYear } from "../utils/discounts";
import NumberInput from "./NumberInput";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-";
const fmtPct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "-");

// Wider first column to avoid excessive wrapping (Sections 1–4)
const LABEL_COL_STYLE = { minWidth: 360, width: 360 };

const YEAR_KEYS = ["y1", "y2", "y3"];

function getGroupScale(label, rowCount) {
  const text = String(label || "");
  const rows = Number.isFinite(Number(rowCount)) ? Number(rowCount) : 1;

  // Heuristic: each row is ~28px tall in the compact table.
  const availablePx = Math.max(28, rows * 28);

  // Estimate horizontal text length in pixels at ~11px font.
  const estTextPx = Math.max(80, text.length * 6.2);

  const raw = availablePx / estTextPx;
  const clamped = Math.min(1, Math.max(0.65, raw));
  return clamped.toFixed(2);
}


function getInflationFactors(temelBilgiler) {
  const infl = temelBilgiler?.inflation || {};
  const y2 = toNum(infl?.y2);
  const y3 = toNum(infl?.y3);
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

// These 5 rows are auto-calculated from HR (IK) and must be read-only in Expenses.
const IK_AUTO_KEYS = new Set([
  "turkPersonelMaas",
  "turkDestekPersonelMaas",
  "yerelPersonelMaas",
  "yerelDestekPersonelMaas",
  "internationalPersonelMaas",
]);

// --- Excel "Giderler" kalemleri ---

const OPERATING_ITEMS = [
  { key: "ulkeTemsilciligi", no: 1, code: 632, label: "Ülke Temsilciliği Giderleri (Temsilcilik Per. Gid. HARİÇ)" },
  { key: "genelYonetim", no: 2, code: 632, label: "Genel Yönetim Giderleri (Ofis Giderleri, Kırtasiye, Aidatlar,Sosyal Yardımlar, Araç Kiralama, Sigorta vb.)" },

  { key: "kira", no: 3, code: 622, group: "Eğitim Hizmetleri Maliyeti", label: "İşletme Giderleri (Kira)" },
  { key: "emsalKira", no: 4, code: 622, label: "İşletme Giderleri (Emsal Kira, Bina Tahsis veya Vakıf'a ait ise Emsal Kira Bedeli Yazılacak)" },
  { key: "enerjiKantin", no: 5, code: 622, label: "İşletme Giderleri (Elektrik, Su, Isıtma, Soğutma, Veri/Ses İletişim vb. Kantin)" },

  { key: "turkPersonelMaas", no: 6, code: 622, label: "Yurt dışı TÜRK Personel Maaş Giderleri (Müdür, Müdür Yardımcısı,Yönetici, Eğitimci, Öğretmen, Belletmen vb.)" },
  { key: "turkDestekPersonelMaas", no: 7, code: 622, label: "Yurt dışı TÜRK DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar. Ülke Temsilcisi, Temsilcilik destek vb.)" },
  { key: "yerelPersonelMaas", no: 8, code: 622, label: "Yurt dışı YEREL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)" },
  { key: "yerelDestekPersonelMaas", no: 9, code: 622, label: "Yurt dışı YEREL DESTEK ve Ülke Temsilciği DESTEK Personel Maaş Giderleri (Eğitim faaliyetinde bulunmayan diğer çalışanlar)" },
  { key: "internationalPersonelMaas", no: 10, code: 622, label: "Yurt dışı INTERNATIONAL Personel Maaş Giderleri (Yönetici, Eğitimci, Öğretmen, Belletmen vb.)" },

  { key: "disaridanHizmet", no: 11, code: 632, label: "Dışarıdan Sağlanan Mal ve Hizmet Alımları (Güvenlik,Temizlik,Avukatlık, Danışmanlık, İş Sağlığı ve Güvenliği, Mali Müşavir vb.)" },
  { key: "egitimAracGerec", no: 12, code: 622, label: "Eğitim Araç ve Gereçleri (Okul ve Sınıflar için Kırtasiye Malzemeleri, Kitaplar, vb.) - (Öğrencilere dönem başı verilen)" },
  { key: "finansalGiderler", no: 13, code: 632, label: "Finansal Giderler (Prim ödemeleri, Komisyon ve Kredi Giderleri, Teminat Mektupları)" },
  { key: "egitimAmacliHizmet", no: 14, code: 622, label: "Eğitim Amaçlı Hizmet Alımları (İzinler ve lisanslama, Cambridge Lisanslamaları vb.)" },

  { key: "temsilAgirlama", no: 16, code: 632, label: "Temsil ve Ağırlama - Kampüs bazında (Öğlen Yemeği Giderleri Hariç) mutfak giderleri vs.)" },
  { key: "ulkeIciUlasim", no: 17, code: 622, label: "Ülke İçi Ulaşım ve Konaklama / Uçak Bileti Dahil / PERSONEL ULAŞIM" },
  { key: "ulkeDisiUlasim", no: 18, code: 632, label: "Ülke Dışı Ulaşım ve Konaklama / Uçak Bileti Dahil / (TMV Merkez Misafir Ağırlama, Türk Personel)" },

  { key: "vergilerResmiIslemler", no: 21, code: 632, label: "Vergiler Resmi İşlemler (Mahkeme,Dava ve İcra, Resmi İzinler,Tescil ve Kuruluş İşlemleri, Noter vb.)" },
  { key: "vergiler", no: 22, code: 632, label: "Vergiler (Kira Stopaj dahil)" },

  { key: "demirbasYatirim", no: 23, code: 622, label: "Demirbaş, Arsa, Bina, Taşıt ve Diğer Yatırım Alımları (Lisanslama, Yazılım ve program, Telif hakları vb. dahil)" },
  { key: "rutinBakim", no: 24, code: 622, label: "Rutin Bakım, Onarım Giderleri (Boya, Tamirat, Tadilat, Makine Teçhizat, Araç, Ofis Malzeme Tamiri vb.)" },

  { key: "pazarlamaOrganizasyon", no: 25, code: 631, label: "Pazarlama, Tanıtım Organizasyon, Etkinlikler (Öğrenci Faaliyetleri Dahil)" },
  { key: "reklamTanitim", no: 26, code: 631, label: "Reklam, Tanıtım, Basım, İlan" },

  { key: "tahsilEdilemeyenGelirler", no: 29, code: 622, label: "Tahsil Edilemeyen Gelirler" },
];

const SERVICE_ITEMS = [
  { key: "yemek", no: 27, code: 622, label: "Yemek (Öğrenci ve Personel öğlen yemeği için yapılan harcamalar (Enerji, gıda,yakıt,elektrik,gaz vs. ve org. gideri))" },
  { key: "uniforma", no: 28, code: 621, label: "Üniforma (Öğrenci Üniforma maliyeti (Liste fiyatı değil, maliyet fiyatı))" },
  { key: "kitapKirtasiye", no: 29, code: 621, label: "Kitap-Kırtasiye (Öğrencilere dönem başı verdiğimiz materyallerin maliyeti)" },
  { key: "ulasimServis", no: 30, code: 622, label: "Ulaşım (Okul Servisi) Öğrencilerimiz için kullanılan servis maliyeti" },
];

const DORM_ITEMS = [
  { key: "yurtGiderleri", no: 31, code: 622, label: "Yurt Giderleri (Kampüs giderleri içinde gösterilmeyecek; yurt için yapılan giderler)" },
  { key: "digerYurt", no: 32, code: 622, label: "Diğer (Yaz Okulu Giderleri vs)" },
];

const SERVICE_TO_INCOME_KEY = {
  yemek: "yemek",
  uniforma: "uniforma",
  kitapKirtasiye: "kitap",
  ulasimServis: "ulasim",
};

const DORM_TO_INCOME_KEY = {
  yurtGiderleri: "yurt",
  digerYurt: "yazOkulu",
};

const studentCountFromIncomeRow = (row, yearKey) => {
  if (!row) return 0;
  if (yearKey === "y2") return toNum(row?.studentCountY2 ?? row?.studentCount);
  if (yearKey === "y3") return toNum(row?.studentCountY3 ?? row?.studentCount);
  return toNum(row?.studentCount);
};


const BURS_DEFAULTS = [
  { name: "MAGİS BAŞARI BURSU" },
  { name: "MAARİF YETENEK BURSU" },
  { name: "İHTİYAÇ BURSU" },
  { name: "OKUL BAŞARI BURSU" },
  { name: "TAM EĞİTİM BURSU" },
  { name: "BARINMA BURSU" },
  { name: "TÜRKÇE BAŞARI BURSU" },
  { name: "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM" },
  { name: "VAKIF ÇALIŞANI İNDİRİMİ" },
  { name: "KARDEŞ İNDİRİMİ" },
  { name: "ERKEN KAYIT İNDİRİMİ" },
  { name: "PEŞİN ÖDEME İNDİRİMİ" },
  { name: "KADEME GEÇİŞ İNDİRİMİ" },
  { name: "TEMSİL İNDİRİMİ" },
  { name: "KURUM İNDİRİMİ" },
  { name: "İSTİSNAİ İNDİRİM" },
  { name: "YEREL MEVZUATIN ŞART KOŞTUĞU İNDİRİM" },
];

function deepMerge(target, source) {
  const t = { ...(target || {}) };
  const s = source || {};
  for (const k of Object.keys(s)) {
    const sv = s[k];
    if (sv && typeof sv === "object" && !Array.isArray(sv)) t[k] = deepMerge(t[k], sv);
    else t[k] = sv;
  }
  return t;
}

function defaultGiderler() {
  const isletmeItems = {};
  for (const it of OPERATING_ITEMS) isletmeItems[it.key] = 0;

  const svc = {};
  for (const it of SERVICE_ITEMS) svc[it.key] = { studentCount: 0, unitCost: 0, unitCostY2: 0, unitCostY3: 0 };

  const dorm = {};
  for (const it of DORM_ITEMS) dorm[it.key] = { studentCount: 0, unitCost: 0 };

  return {
    isletme: { items: isletmeItems },
    ogrenimDisi: { items: svc },
    yurt: { items: dorm },
  };
}

function computeTotalStudents(grades) {
  const list = Array.isArray(grades) ? grades : [];
  // studentsPerBranch now represents TOTAL students for the grade (not per-branch)
  return list.reduce((sum, r) => sum + toNum(r?.studentsPerBranch), 0);
}

// ---- IK salary mapping (same formula as HR tab) ----
const IK_ROLES = [
  "turk_mudur",
  "turk_mdyard",
  "turk_egitimci",
  "turk_temsil",
  "yerel_yonetici_egitimci",
  "yerel_destek",
  "yerel_ulke_temsil_destek",
  "int_yonetici_egitimci",
];

function salaryMapForYear(yearIK) {
  const unitCosts = yearIK?.unitCosts || {};
  const hc = yearIK?.headcountsByLevel || {};
  const roleAnnual = {};

  for (const role of IK_ROLES) {
    let totalCount = 0;
    const levelKeys = Object.keys(hc || {});
    for (const lvl of levelKeys) totalCount += toNum(hc?.[lvl]?.[role]);
    roleAnnual[role] = toNum(unitCosts?.[role]) * totalCount;
  }

  const sum = (keys) => keys.reduce((s, k) => s + toNum(roleAnnual[k]), 0);
  return {
    turkPersonelMaas: sum(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
    turkDestekPersonelMaas: sum(["turk_temsil"]),
    yerelPersonelMaas: sum(["yerel_yonetici_egitimci"]),
    yerelDestekPersonelMaas: sum(["yerel_destek", "yerel_ulke_temsil_destek"]),
    internationalPersonelMaas: sum(["int_yonetici_egitimci"]),
  };
}

function computeIncomeYears(gelirler, totalStudents, factors) {
  const inc = gelirler || {};
  const tuitionRows = Array.isArray(inc?.tuition?.rows) ? inc.tuition.rows : [];
  const nonEdRows = Array.isArray(inc?.nonEducationFees?.rows) ? inc.nonEducationFees.rows : [];
  const dormRows = Array.isArray(inc?.dormitory?.rows) ? inc.dormitory.rows : [];

  const studentCountForYear = (row, yearKey) => {
    if (!row) return 0;
    if (yearKey === "y2") return toNum(row?.studentCountY2 ?? row?.studentCount);
    if (yearKey === "y3") return toNum(row?.studentCountY3 ?? row?.studentCountY2 ?? row?.studentCount);
    return toNum(row?.studentCount);
  };

  const tuitionStudentsForYear = (yearKey) => {
    if (!tuitionRows.length) return totalStudents;
    return tuitionRows.reduce((s, r) => s + studentCountForYear(r, yearKey), 0);
  };

  const grossTuitionForYear = (yearKey) => {
    const f = factors?.[yearKey] ?? 1;
    if (tuitionRows.length) {
      return tuitionRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
    }
    return tuitionStudentsForYear(yearKey) * toNum(inc.tuitionFeePerStudentYearly) * f;
  };

  const nonEdForYear = (yearKey) => {
    const f = factors?.[yearKey] ?? 1;
    if (nonEdRows.length) {
      return nonEdRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
    }
    return totalStudents * toNum(inc.lunchFeePerStudentYearly) * f;
  };

  const dormForYear = (yearKey) => {
    const f = factors?.[yearKey] ?? 1;
    if (dormRows.length) {
      return dormRows.reduce((s, r) => s + studentCountForYear(r, yearKey) * toNum(r?.unitFee) * f, 0);
    }
    return totalStudents * toNum(inc.dormitoryFeePerStudentYearly) * f;
  };

  const out = {};
  for (const y of YEAR_KEYS) {
    const grossTuition = grossTuitionForYear(y);
    const tuitionStudents = tuitionStudentsForYear(y);
    const nonEdTotal = nonEdForYear(y);
    const dormIncomeTotal = dormForYear(y);
    const activityGross = grossTuition + nonEdTotal + dormIncomeTotal;
    const avgTuitionFee = tuitionStudents > 0 ? grossTuition / tuitionStudents : 0;
    out[y] = { grossTuition, tuitionStudents, avgTuitionFee, activityGross };
  }
  return out;
}


export default function ExpensesEditor({
  baseYear,
  giderler,
  onChange,
  grades,
  gelirler,
  discounts,
  onDiscountsChange,
  currencyCode = "USD",
  temelBilgiler,
  ik,
  dirtyPaths,
  onDirty,
  uiScopeKey,
}) {
  const factors = useMemo(() => getInflationFactors(temelBilgiler), [temelBilgiler]);

  // Persist per school + scenario (scoped by URL)
  const [showAccountCol, setShowAccountCol] = useScenarioUiFlag("expenses.showAccountCol", false, { scope: uiScopeKey });

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

  const totalStudents = useMemo(() => computeTotalStudents(grades), [grades]);

  const isletmePath = (key) => `inputs.giderler.isletme.items.${key}`;
  const svcPath = (key, field) => `inputs.giderler.ogrenimDisi.items.${key}.${field}`;
  const dormPath = (key, field) => `inputs.giderler.yurt.items.${key}.${field}`;
  const discountPath = (name, field) => `inputs.discounts.${name}.${field}`;
  const isDirty = (path) => (dirtyPaths ? dirtyPaths.has(path) : false);
  const inputClass = (base, path) => base + (isDirty(path) ? " input-dirty" : "");

  const g = useMemo(() => {
    const base = defaultGiderler();
    const old = giderler || {};
    return deepMerge(base, old);
  }, [giderler]);

  const salaryByYear = useMemo(() => {
    const y = ik?.years || {};
    return {
      y1: salaryMapForYear(y?.y1 || {}),
      y2: salaryMapForYear(y?.y2 || {}),
      y3: salaryMapForYear(y?.y3 || {}),
    };
  }, [ik]);

  const incomeYears = useMemo(() => computeIncomeYears(gelirler, totalStudents, factors), [gelirler, totalStudents, factors]);
  const nonEdIncomeByKey = useMemo(() => {
    const rows = Array.isArray(gelirler?.nonEducationFees?.rows) ? gelirler.nonEducationFees.rows : [];
    return new Map(rows.map((r) => [String(r?.key || ""), r]));
  }, [gelirler]);

  const dormIncomeByKey = useMemo(() => {
    const rows = Array.isArray(gelirler?.dormitory?.rows) ? gelirler.dormitory.rows : [];
    return new Map(rows.map((r) => [String(r?.key || ""), r]));
  }, [gelirler]);

  const baseTuitionStudents = toNum(incomeYears?.y1?.tuitionStudents);

  const discountTotals = useMemo(() => {
    const out = {};
    for (const y of YEAR_KEYS) {
      const inc = incomeYears?.[y] || {};
      out[y] = computeDiscountTotalForYear({
        yearKey: y,
        discounts,
        grossTuition: inc.grossTuition,
        tuitionStudents: inc.tuitionStudents,
        avgTuitionFee: inc.avgTuitionFee,
        factor: factors?.[y] ?? 1,
      });

    }
    return out;
  }, [discounts, factors, incomeYears]);

  const netCiro = {
    y1: toNum(incomeYears?.y1?.activityGross) - toNum(discountTotals?.y1),
    y2: toNum(incomeYears?.y2?.activityGross) - toNum(discountTotals?.y2),
    y3: toNum(incomeYears?.y3?.activityGross) - toNum(discountTotals?.y3),
  };

  const getSalaryAmount = (key, yearKey) => {
    const baseIsletmeVal = toNum(g?.isletme?.items?.[key]);
    const ikBaseY1 = toNum(salaryByYear?.y1?.[key]);
    const extraY1 = ikBaseY1 > 0 ? Math.max(0, baseIsletmeVal - ikBaseY1) : 0;
    const base = ikBaseY1 > 0 ? ikBaseY1 : baseIsletmeVal;
    const fromIk = toNum(salaryByYear?.[yearKey]?.[key]);
    const baseYearVal = fromIk > 0 ? fromIk : yearKey === "y1" ? base : base * (factors?.[yearKey] ?? 1);
    const extraYearVal = yearKey === "y1" ? extraY1 : extraY1 * (factors?.[yearKey] ?? 1);
    return baseYearVal + extraYearVal;
  };

  const getOperatingAmount = (key, yearKey) => {
    if (IK_AUTO_KEYS.has(key)) return getSalaryAmount(key, yearKey);
    const base = toNum(g?.isletme?.items?.[key]);
    if (yearKey === "y1") return base;
    return base * (factors?.[yearKey] ?? 1);
  };

  const operatingTotals = useMemo(() => {
    const out = { y1: 0, y2: 0, y3: 0 };
    for (const it of OPERATING_ITEMS) {
      out.y1 += getOperatingAmount(it.key, "y1");
      out.y2 += getOperatingAmount(it.key, "y2");
      out.y3 += getOperatingAmount(it.key, "y3");
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, salaryByYear, factors]);

  const svcTotals = useMemo(() => {
    const out = {
      y1: 0, y2: 0, y3: 0,
      studentsY1: 0, studentsY2: 0, studentsY3: 0,
    };

    const rows = Array.isArray(gelirler?.nonEducationFees?.rows) ? gelirler.nonEducationFees.rows : [];
    const byKey = new Map(rows.map((r) => [String(r?.key || ""), r]));

    for (const it of SERVICE_ITEMS) {
      const expRow = g.ogrenimDisi?.items?.[it.key] || {};
      const incomeKey = SERVICE_TO_INCOME_KEY[it.key];
      const incRow = incomeKey ? byKey.get(incomeKey) : null;

      const sc1 = studentCountFromIncomeRow(incRow, "y1");
      const sc2 = studentCountFromIncomeRow(incRow, "y2");
      const sc3 = studentCountFromIncomeRow(incRow, "y3");

      const uc1 = toNum(expRow.unitCost);
      const uc2 = toNum(expRow.unitCostY2);
      const uc3 = toNum(expRow.unitCostY3);

      out.studentsY1 += sc1;
      out.studentsY2 += sc2;
      out.studentsY3 += sc3;

      out.y1 += sc1 * uc1;
      out.y2 += sc2 * uc2;
      out.y3 += sc3 * uc3;
    }

    return out;
  }, [g, gelirler]);

  const dormTotals = useMemo(() => {
    const out = {
      y1: 0, y2: 0, y3: 0,
      studentsY1: 0, studentsY2: 0, studentsY3: 0,
    };

    const rows = Array.isArray(gelirler?.dormitory?.rows) ? gelirler.dormitory.rows : [];
    const byKey = new Map(rows.map((r) => [String(r?.key || ""), r]));

    for (const it of DORM_ITEMS) {
      const expRow = g.yurt?.items?.[it.key] || {};
      const incomeKey = DORM_TO_INCOME_KEY[it.key];
      const incRow = incomeKey ? byKey.get(incomeKey) : null;

      const sc1 = studentCountFromIncomeRow(incRow, "y1");
      const sc2 = studentCountFromIncomeRow(incRow, "y2");
      const sc3 = studentCountFromIncomeRow(incRow, "y3");

      const uc1 = toNum(expRow.unitCost);
      const uc2 = uc1 * (factors?.y2 ?? 1);
      const uc3 = uc1 * (factors?.y3 ?? 1);

      out.studentsY1 += sc1;
      out.studentsY2 += sc2;
      out.studentsY3 += sc3;

      out.y1 += sc1 * uc1;
      out.y2 += sc2 * uc2;
      out.y3 += sc3 * uc3;
    }

    return out;
  }, [g, gelirler, factors]);


  const totalExpenses = {
    y1: operatingTotals.y1 + svcTotals.y1 + dormTotals.y1,
    y2: operatingTotals.y2 + svcTotals.y2 + dormTotals.y2,
    y3: operatingTotals.y3 + svcTotals.y3 + dormTotals.y3,
  };

  function setIsletme(key, value) {
    const nextValue = value === "" ? 0 : toNum(value);
    if (IK_AUTO_KEYS.has(key)) return; // HR(İK) drives these rows
    const next = {
      ...g,
      isletme: {
        ...(g.isletme || {}),
        items: { ...(g.isletme?.items || {}), [key]: nextValue },
      },
    };
    onChange(next);
    onDirty?.(isletmePath(key), nextValue);
  }

  function setSvc(key, field, value) {
    const prevRow = g.ogrenimDisi?.items?.[key] || { studentCount: 0, unitCost: 0 };
    const nextValue = value === "" ? 0 : toNum(value);
    const next = {
      ...g,
      ogrenimDisi: {
        ...(g.ogrenimDisi || {}),
        items: {
          ...(g.ogrenimDisi?.items || {}),
          [key]: { ...prevRow, [field]: nextValue },
        },
      },
    };
    onChange(next);
    onDirty?.(svcPath(key, field), nextValue);
  }

  function setDorm(key, field, value) {
    const prevRow = g.yurt?.items?.[key] || { studentCount: 0, unitCost: 0 };
    const nextValue = value === "" ? 0 : toNum(value);
    const next = {
      ...g,
      yurt: {
        ...(g.yurt || {}),
        items: {
          ...(g.yurt?.items || {}),
          [key]: { ...prevRow, [field]: nextValue },
        },
      },
    };
    onChange(next);
    onDirty?.(dormPath(key, field), nextValue);
  }



  useEffect(() => {
    if (!onDiscountsChange) return;
    if (!Number.isFinite(baseTuitionStudents) || baseTuitionStudents <= 0) return;
    const list = Array.isArray(discounts) ? discounts : [];
    let changed = false;
    const next = list.map((d) => {
      if (!d) return d;
      if (d.studentCount == null || d.studentCount === "") return d;
      const rawCount = Number(d.studentCount);
      if (!Number.isFinite(rawCount)) return d;
      const count = Math.max(0, Math.round(rawCount));
      const ratio = clamp(count / baseTuitionStudents, 0, 1);
      const prevRatio = clamp(toNum(d.ratio), 0, 1);
      if (Math.abs(ratio - prevRatio) < 1e-6) return d;
      changed = true;
      return { ...d, ratio };
    });
    if (changed) onDiscountsChange(next);
  }, [baseTuitionStudents, discounts, onDiscountsChange]);


  const yoy = (cur, prev) => (prev > 0 ? cur / prev - 1 : null);

  const operatingByKey = useMemo(() => {
    const m = new Map();
    for (const it of OPERATING_ITEMS) m.set(it.key, it);
    return m;
  }, []);

  const OPERATING_GROUPS = useMemo(
    () => [
      { label: null, keys: ["ulkeTemsilciligi", "genelYonetim"] },
      {
        label: "Eğitim Hizmetleri Maliyetleri",
        bandClass: "exp-band-edu",
        keys: [
          "kira",
          "emsalKira",
          "enerjiKantin",
          "turkPersonelMaas",
          "turkDestekPersonelMaas",
          "yerelPersonelMaas",
          "yerelDestekPersonelMaas",
          "internationalPersonelMaas",
          "disaridanHizmet",
          "egitimAracGerec",
          "finansalGiderler",
          "egitimAmacliHizmet",
        ],
      },
      { label: null, keys: ["temsilAgirlama"] },
      { label: null, keys: ["ulkeIciUlasim"] },
      { label: null, keys: ["ulkeDisiUlasim"] },
      { label: "Vergiler", keys: ["vergilerResmiIslemler", "vergiler"] },
      { label: null, keys: ["demirbasYatirim", "rutinBakim"] },
      { label: "Pazarlama, Tanıtım", keys: ["pazarlamaOrganizasyon", "reklamTanitim"] },
      { label: null, keys: ["tahsilEdilemeyenGelirler"] },
    ],
    []
  );

  return (
    <div className="card expenses-card expenses-table-container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>


        <button className="btn" type="button" onClick={() => setShowAccountCol((s) => !s)}>
          {showAccountCol ? "Hesap kolonunu gizle" : "Hesap kolonunu göster"}
        </button>
      </div>

      {/* SECTION 1 */}
      <div className="section-head">
        <div className="section-title">{`GİDERLER (İŞLETME) / YIL (${currencyCode})`}</div>
      </div>
      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table table-3y expenses-3block expenses-main">
          <thead>
            <tr className="group">
              <th rowSpan={2} className="exp-group-col" style={{ width: 30 }} />
              {showAccountCol ? <th rowSpan={2} style={{ width: 70 }}>Hesap</th> : null}
              <th rowSpan={2} className="exp-label-col" style={LABEL_COL_STYLE}>Gider Kalemi</th>

              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th colSpan={4} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y2.labelLong}</th>
              <th colSpan={4} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y3.labelLong}</th>
            </tr>
            <tr>
              <th className="sep-left exp-col-total cell-num">{`Toplam (${currencyCode})`}</th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>İşletme Giderleri</div><div>Toplamı içindeki %</div></div></th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>Toplam Ciro</div><div>içindeki %</div></div></th>

              <th className="sep-left exp-col-yoy cell-num"><div className="exp-th-wrap"><div>Tahmini</div><div>artış %</div></div></th>
              <th className="exp-col-total cell-num">{`Toplam (${currencyCode})`}</th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>İşletme Giderleri</div><div>Toplamı içindeki %</div></div></th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>Toplam Ciro</div><div>içindeki %</div></div></th>

              <th className="sep-left exp-col-yoy cell-num"><div className="exp-th-wrap"><div>Tahmini</div><div>artış %</div></div></th>
              <th className="exp-col-total cell-num">{`Toplam (${currencyCode})`}</th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>İşletme Giderleri</div><div>Toplamı içindeki %</div></div></th>
              <th className="exp-col-pct cell-num"><div className="exp-th-wrap"><div>Toplam Ciro</div><div>içindeki %</div></div></th>
            </tr>
          </thead>

          <tbody>
            {OPERATING_GROUPS.flatMap((grp) => {
              const items = grp.keys.map((k) => operatingByKey.get(k)).filter(Boolean);
              return items.map((it, idxInGroup) => {
                const a1 = getOperatingAmount(it.key, "y1");
                const a2 = getOperatingAmount(it.key, "y2");
                const a3 = getOperatingAmount(it.key, "y3");

                const inc2 = yoy(a2, a1);
                const inc3 = yoy(a3, a2);

                const op1 = operatingTotals.y1 > 0 ? a1 / operatingTotals.y1 : null;
                const op2 = operatingTotals.y2 > 0 ? a2 / operatingTotals.y2 : null;
                const op3 = operatingTotals.y3 > 0 ? a3 / operatingTotals.y3 : null;

                const c1 = netCiro.y1 > 0 ? a1 / netCiro.y1 : null;
                const c2 = netCiro.y2 > 0 ? a2 / netCiro.y2 : null;
                const c3 = netCiro.y3 > 0 ? a3 / netCiro.y3 : null;

                const y1InputValue = IK_AUTO_KEYS.has(it.key) ? getSalaryAmount(it.key, "y1") : toNum(g.isletme?.items?.[it.key]);

                return (
                  <tr
                    key={it.key}
                    className={`${grp.bandClass || ""}${idxInGroup === 0 ? " row-group-start" : ""}`}
                  >
                    {grp.label ? (
                      idxInGroup === 0 ? (
                        <td rowSpan={items.length} className="exp-group-cell">
                          <div className="exp-group-label" style={{ "--exp-scale": getGroupScale(grp.label, items.length) }} title={grp.label}>{grp.label}</div>
                        </td>
                      ) : null
                    ) : (
                      <td className="exp-group-blank" />
                    )}

                    {showAccountCol ? <td>{it.code}</td> : null}
                    <td className="exp-label-col" style={LABEL_COL_STYLE} title={it.label}>{it.label}</td>

                    {/* Y1 */}
                    <td className="sep-left cell-num">
                      <NumberInput
                        className={inputClass("input xxs num", isletmePath(it.key))}

                        min="0"
                        step="0.01"
                        value={y1InputValue}
                        disabled={IK_AUTO_KEYS.has(it.key)}
                        title={
                          IK_AUTO_KEYS.has(it.key)
                            ? "Bu satır HR (İK) tabından otomatik hesaplanır"
                            : "Sadece 1. yılı gir, 2-3. yıl otomatik"
                        }
                        onChange={(value) => setIsletme(it.key, value)}
                      />
                    </td>
                    <td className="cell-pct">{fmtPct(op1)}</td>
                    <td className="cell-pct">{fmtPct(c1)}</td>

                    {/* Y2 */}
                    <td className="cell-pct sep-left">{fmtPct(inc2)}</td>
                    <td className="cell-num">{fmtMoney(a2)}</td>
                    <td className="cell-pct">{fmtPct(op2)}</td>
                    <td className="cell-pct">{fmtPct(c2)}</td>

                    {/* Y3 */}
                    <td className="cell-pct sep-left">{fmtPct(inc3)}</td>
                    <td className="cell-num">{fmtMoney(a3)}</td>
                    <td className="cell-pct">{fmtPct(op3)}</td>
                    <td className="cell-pct">{fmtPct(c3)}</td>
                  </tr>
                );
              });
            })}

            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td className="exp-group-blank" />
              <td colSpan={showAccountCol ? 2 : 1}>TOPLAM</td>

              <td className="cell-num sep-left">{fmtMoney(operatingTotals.y1)}</td>
              <td className="cell-pct">{fmtPct(1)}</td>
              <td className="cell-pct">{fmtPct(netCiro.y1 > 0 ? operatingTotals.y1 / netCiro.y1 : null)}</td>

              <td className="cell-pct sep-left">{fmtPct(yoy(operatingTotals.y2, operatingTotals.y1))}</td>
              <td className="cell-num">{fmtMoney(operatingTotals.y2)}</td>
              <td className="cell-pct">{fmtPct(1)}</td>
              <td className="cell-pct">{fmtPct(netCiro.y2 > 0 ? operatingTotals.y2 / netCiro.y2 : null)}</td>

              <td className="cell-pct sep-left">{fmtPct(yoy(operatingTotals.y3, operatingTotals.y2))}</td>
              <td className="cell-num">{fmtMoney(operatingTotals.y3)}</td>
              <td className="cell-pct">{fmtPct(1)}</td>
              <td className="cell-pct">{fmtPct(netCiro.y3 > 0 ? operatingTotals.y3 / netCiro.y3 : null)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 2 */}
      <div className="section-head">
        <div className="section-title">
          GİDERLER (ÖĞRENİM DIŞI HİZMETLERE YÖNELİK SATILAN MAL VE HİZMETLER) / YIL
        </div>
      </div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr className="group">
              {showAccountCol ? <th rowSpan={2} style={{ width: 70 }}>Hesap</th> : null}
              <th rowSpan={2} className="exp-label-col" style={LABEL_COL_STYLE}>Gider Kalemi</th>

              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y2.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y3.labelLong}</th>
            </tr>
            <tr>
              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y1.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y1.range})`}</th>

              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y2.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y2.range})`}</th>

              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y3.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y3.range})`}</th>
            </tr>
          </thead>
          <tbody>
            {SERVICE_ITEMS.map((it, idx) => {
              const row = g.ogrenimDisi?.items?.[it.key] || {};

              const incomeKey =
                it.key === "yemek"
                  ? "yemek"
                  : it.key === "uniforma"
                    ? "uniforma"
                    : it.key === "kitapKirtasiye"
                      ? "kitap"
                      : it.key === "ulasimServis"
                        ? "ulasim"
                        : null;

              const incRow = incomeKey ? nonEdIncomeByKey.get(incomeKey) : null;

              const sc1 = toNum(incRow?.studentCount);
              const sc2 = toNum(incRow?.studentCountY2 ?? incRow?.studentCount);
              const sc3 = toNum(incRow?.studentCountY3 ?? incRow?.studentCountY2 ?? incRow?.studentCount);

              const uc1 = toNum(row.unitCost);
              const uc2 = uc1 * (factors.y2 ?? 1);
              const uc3 = uc1 * (factors.y3 ?? 1);

              const t1 = sc1 * uc1;
              const t2 = sc2 * uc2;
              const t3 = sc3 * uc3;

              return (
                <tr key={it.key} className={idx === 0 ? "row-group-start" : ""}>
                  {showAccountCol ? <td>{it.code}</td> : null}
                  <td>{it.label}</td>

                  <td className="sep-left cell-count">
                    <div className="cell-num">{fmtMoney(sc1)}</div>
                  </td>

                  <td className="cell-num">
                    <NumberInput
                      className={inputClass("input xs num", svcPath(it.key, "unitCost"))}
                      min="0"
                      step="0.01"
                      value={uc1}
                      onChange={(value) => setSvc(it.key, "unitCost", value)}
                    />
                  </td>

                  <td className="cell-num">{fmtMoney(t1)}</td>

                  <td className="cell-count sep-left">
                    <div className="cell-num">{fmtMoney(sc2)}</div>
                  </td>

                  <td className="cell-num">
                    <div>{fmtMoney(uc2)}</div>
                  </td>

                  <td className="cell-num">{fmtMoney(t2)}</td>

                  <td className="cell-count sep-left">
                    <div className="cell-num">{fmtMoney(sc3)}</div>
                  </td>

                  <td className="cell-num">
                    <div>{fmtMoney(uc3)}</div>
                  </td>

                  <td className="cell-num">{fmtMoney(t3)}</td>
                </tr>
              );
            })}
            {(() => {
              const byKey = nonEdIncomeByKey;

              const totals = SERVICE_ITEMS.reduce(
                (acc, it) => {
                  const row = g.ogrenimDisi?.items?.[it.key] || {};
                  const incomeKey =
                    it.key === "yemek"
                      ? "yemek"
                      : it.key === "uniforma"
                        ? "uniforma"
                        : it.key === "kitapKirtasiye"
                          ? "kitap"
                          : it.key === "ulasimServis"
                            ? "ulasim"
                            : null;

                  const incRow = incomeKey ? byKey.get(incomeKey) : null;

                  const sc1 = toNum(incRow?.studentCount);
                  const sc2 = toNum(incRow?.studentCountY2 ?? incRow?.studentCount);
                  const sc3 = toNum(incRow?.studentCountY3 ?? incRow?.studentCountY2 ?? incRow?.studentCount);

                  const uc1 = toNum(row.unitCost);
                  const uc2 = uc1 * (factors.y2 ?? 1);
                  const uc3 = uc1 * (factors.y3 ?? 1);

                  acc.s1 += sc1;
                  acc.s2 += sc2;
                  acc.s3 += sc3;
                  acc.y1 += sc1 * uc1;
                  acc.y2 += sc2 * uc2;
                  acc.y3 += sc3 * uc3;
                  return acc;
                },
                { s1: 0, s2: 0, s3: 0, y1: 0, y2: 0, y3: 0 }
              );

              return (
                <tr className="row-group-start" style={{ fontWeight: 800 }}>
                  <td colSpan={showAccountCol ? 2 : 1}>TOPLAM</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y1)}</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y2)}</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y3)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>


      {/* SECTION 3 */}
      <div className="section-head">
        <div className="section-title">GİDERLER (YURT, KONAKLAMA) / YIL</div>
      </div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr className="group">
              {showAccountCol ? <th rowSpan={2} style={{ width: 70 }}>Hesap</th> : null}
              <th rowSpan={2} className="exp-label-col" style={LABEL_COL_STYLE}>Gider Kalemi</th>

              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y2.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y3.labelLong}</th>
            </tr>
            <tr>
              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y1.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y1.range})`}</th>

              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y2.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y2.range})`}</th>

              <th className="sep-left" style={{ width: 140 }}>Öğrenci</th>
              <th style={{ width: 140 }}>{`Birim (${yearMeta.y3.range})`}</th>
              <th style={{ width: 160 }}>{`Toplam (${yearMeta.y3.range})`}</th>
            </tr>
          </thead>
          <tbody>
            {DORM_ITEMS.map((it, idx) => {
              const row = g.yurt?.items?.[it.key] || {};

              const incomeKey =
                it.key === "yurtGiderleri"
                  ? "yurt"
                  : it.key === "digerYurt"
                    ? "yazOkulu"
                    : null;

              const incRow = incomeKey ? dormIncomeByKey.get(incomeKey) : null;

              const sc1 = toNum(incRow?.studentCount);
              const sc2 = toNum(incRow?.studentCountY2 ?? incRow?.studentCount);
              const sc3 = toNum(incRow?.studentCountY3 ?? incRow?.studentCountY2 ?? incRow?.studentCount);

              const uc1 = toNum(row.unitCost);
              const uc2 = uc1 * factors.y2;
              const uc3 = uc1 * factors.y3;

              const t1 = sc1 * uc1;
              const t2 = sc2 * uc2;
              const t3 = sc3 * uc3;

              return (
                <tr key={it.key} className={idx === 0 ? "row-group-start" : ""}>
                  {showAccountCol ? <td>{it.code}</td> : null}
                  <td>{it.label}</td>

                  <td className="sep-left cell-count">
                    <div className="cell-num">{fmtMoney(sc1)}</div>
                  </td>

                  <td className="cell-num">
                    <NumberInput
                      className={inputClass("input xs num", dormPath(it.key, "unitCost"))}
                      min="0"
                      step="0.01"
                      value={uc1}
                      onChange={(value) => setDorm(it.key, "unitCost", value)}
                    />
                  </td>

                  <td className="cell-num">{fmtMoney(t1)}</td>

                  <td className="sep-left cell-count">
                    <div className="cell-num">{fmtMoney(sc2)}</div>
                  </td>

                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(uc2)}</div>
                  </td>

                  <td className="cell-num">{fmtMoney(t2)}</td>

                  <td className="sep-left cell-count">
                    <div className="cell-num">{fmtMoney(sc3)}</div>
                  </td>

                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(uc3)}</div>
                  </td>

                  <td className="cell-num">{fmtMoney(t3)}</td>
                </tr>
              );
            })}

            {(() => {
              const byKey = dormIncomeByKey;

              const totals = DORM_ITEMS.reduce(
                (acc, it) => {
                  const row = g.yurt?.items?.[it.key] || {};
                  const incomeKey =
                    it.key === "yurtGiderleri"
                      ? "yurt"
                      : it.key === "digerYurt"
                        ? "yazOkulu"
                        : null;

                  const incRow = incomeKey ? byKey.get(incomeKey) : null;

                  const sc1 = toNum(incRow?.studentCount);
                  const sc2 = toNum(incRow?.studentCountY2 ?? incRow?.studentCount);
                  const sc3 = toNum(incRow?.studentCountY3 ?? incRow?.studentCountY2 ?? incRow?.studentCount);

                  const uc1 = toNum(row.unitCost);
                  const uc2 = uc1 * factors.y2;
                  const uc3 = uc1 * factors.y3;

                  acc.s1 += sc1;
                  acc.s2 += sc2;
                  acc.s3 += sc3;
                  acc.y1 += sc1 * uc1;
                  acc.y2 += sc2 * uc2;
                  acc.y3 += sc3 * uc3;
                  return acc;
                },
                { s1: 0, s2: 0, s3: 0, y1: 0, y2: 0, y3: 0 }
              );

              return (
                <tr className="row-group-start" style={{ fontWeight: 800 }}>
                  <td colSpan={showAccountCol ? 2 : 1}>TOPLAM</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y1)}</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y2)}</td>

                  <td className="cell-count sep-left" />
                  <td />
                  <td className="cell-num">{fmtMoney(totals.y3)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>


      {/* SECTION 4 */}
      <div className="section-head">
        <div className="section-title">BURS VE İNDİRİMLER / YIL</div>
      </div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr className="group">
              <th rowSpan={2} className="exp-label-col" style={LABEL_COL_STYLE}>Burs / İndirim</th>

              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y1.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y2.labelLong}</th>
              <th colSpan={3} className="sep-left exp-year-head" style={{ textAlign: "center" }}>{yearMeta.y3.labelLong}</th>
            </tr>
            <tr>
              <th className="sep-left" style={{ width: 140 }}>Burslu Öğrenci</th>
              <th style={{ width: 120 }}>Ort. %</th>
              <th style={{ width: 150 }}>Toplam</th>

              <th className="sep-left" style={{ width: 140 }}>Burslu Öğrenci</th>
              <th style={{ width: 120 }}>Ort. %</th>
              <th style={{ width: 150 }}>Toplam</th>

              <th className="sep-left" style={{ width: 140 }}>Burslu Öğrenci</th>
              <th style={{ width: 120 }}>Ort. %</th>
              <th style={{ width: 150 }}>Toplam</th>
            </tr>
          </thead>

          <tbody>
            {(() => {
              const list = Array.isArray(discounts) ? discounts : [];
              const byName = new Map(list.map((d) => [String(d?.name || ""), d]));

              const tuitionStudents = (yk) =>
                toNum(incomeYears?.[yk]?.tuitionStudents) || toNum(incomeYears?.y1?.tuitionStudents);
              const avgTuition = (yk) => toNum(incomeYears?.[yk]?.avgTuitionFee);

              const getCount = (d, yk) => {
                const students = tuitionStudents(yk);
                const rawCount =
                  yk === "y1"
                    ? d?.studentCount
                    : yk === "y2"
                      ? d?.studentCountY2
                      : d?.studentCountY3;

                const rawRatio =
                  yk === "y1"
                    ? d?.ratio
                    : yk === "y2"
                      ? d?.ratioY2
                      : d?.ratioY3;

                const hasCount = rawCount != null && rawCount !== "";
                const c = hasCount ? Math.max(0, Math.round(toNum(rawCount))) : null;

                if (students > 0) {
                  const derived = c != null ? c : Math.round(clamp(toNum(rawRatio), 0, 1) * students);
                  return Math.min(derived, students);
                }
                return c != null ? c : 0;
              };

              const getPct = (d, yk) => {
                const v =
                  yk === "y1"
                    ? d?.value
                    : yk === "y2"
                      ? d?.valueY2
                      : d?.valueY3;
                return clamp(toNum(v), 0, 1);
              };

              const calcAmount = (d, yk, count, pct) => {
                const avg = avgTuition(yk);
                if (String(d?.mode || "percent") === "fixed") {
                  const rawVal =
                    yk === "y1"
                      ? d?.value
                      : yk === "y2"
                        ? d?.valueY2
                        : d?.valueY3;
                  const hasYearVal =
                    (yk === "y2" && d?.valueY2 != null && d?.valueY2 !== "") ||
                    (yk === "y3" && d?.valueY3 != null && d?.valueY3 !== "");
                  const val = toNum(rawVal);
                  const perStudent = hasYearVal ? val : val * (factors?.[yk] ?? 1);
                  return count * Math.max(0, perStudent);
                }
                return avg * count * pct;
              };

              const writeYear = (name, yk, studentCount, pct100) => {
                if (!onDiscountsChange) return;

                const students = tuitionStudents(yk);
                const isEmpty = studentCount === "" || studentCount == null;
                const safeCount = isEmpty ? 0 : Math.max(0, Math.round(toNum(studentCount)));
                const boundedCount = students > 0 ? Math.min(safeCount, students) : safeCount;

                const pct = clamp(toNum(pct100) / 100, 0, 1);
                const ratioBase = students > 0 ? students : 1;
                const ratio = clamp(boundedCount / ratioBase, 0, 1);

                const next = [...list];
                const idx = next.findIndex((x) => String(x?.name || "") === name);
                const prev = idx >= 0 ? next[idx] : { name, mode: "percent" };

                const studentCountValue = isEmpty ? undefined : boundedCount;

                const payload =
                  yk === "y1"
                    ? { studentCount: studentCountValue, ratio, value: pct, mode: "percent" }
                    : yk === "y2"
                      ? { studentCountY2: studentCountValue, ratioY2: ratio, valueY2: pct, mode: "percent" }
                      : { studentCountY3: studentCountValue, ratioY3: ratio, valueY3: pct, mode: "percent" };

                if (idx >= 0) next[idx] = { ...prev, ...payload };
                else next.push({ ...prev, ...payload });

                onDiscountsChange(next);

                if (yk === "y1") {
                  onDirty?.(discountPath(name, "ratio"), ratio);
                  onDirty?.(discountPath(name, "value"), pct);
                } else if (yk === "y2") {
                  onDirty?.(discountPath(name, "ratioY2"), ratio);
                  onDirty?.(discountPath(name, "valueY2"), pct);
                } else {
                  onDirty?.(discountPath(name, "ratioY3"), ratio);
                  onDirty?.(discountPath(name, "valueY3"), pct);
                }
              };

              const rows = BURS_DEFAULTS.map((r) => {
                const d = byName.get(r.name) || { name: r.name, mode: "percent", value: 0, ratio: 0 };
                const c1 = getCount(d, "y1");
                const c2 = getCount(d, "y2");
                const c3 = getCount(d, "y3");
                const p1 = getPct(d, "y1");
                const p2 = getPct(d, "y2");
                const p3 = getPct(d, "y3");
                const a1 = calcAmount(d, "y1", c1, p1);
                const a2 = calcAmount(d, "y2", c2, p2);
                const a3 = calcAmount(d, "y3", c3, p3);
                return { name: r.name, c1, c2, c3, p1, p2, p3, a1, a2, a3 };
              });

              const totals = rows.reduce(
                (acc, r) => {
                  acc.s1 += toNum(r.c1);
                  acc.s2 += toNum(r.c2);
                  acc.s3 += toNum(r.c3);
                  acc.a1 += toNum(r.a1);
                  acc.a2 += toNum(r.a2);
                  acc.a3 += toNum(r.a3);
                  acc.w1 += toNum(r.c1) * clamp(r.p1, 0, 1);
                  acc.w2 += toNum(r.c2) * clamp(r.p2, 0, 1);
                  acc.w3 += toNum(r.c3) * clamp(r.p3, 0, 1);
                  return acc;
                },
                { s1: 0, s2: 0, s3: 0, a1: 0, a2: 0, a3: 0, w1: 0, w2: 0, w3: 0 }
              );

              const avgPct1 = totals.s1 > 0 ? totals.w1 / totals.s1 : 0;
              const avgPct2 = totals.s2 > 0 ? totals.w2 / totals.s2 : 0;
              const avgPct3 = totals.s3 > 0 ? totals.w3 / totals.s3 : 0;

              const grossTuitionY1 = toNum(incomeYears?.y1?.grossTuition);
              const tuitionStudentsY1 = tuitionStudents("y1");

              return (
                <>
                  {rows.map((r, idx) => (
                    <tr key={r.name} className={idx === 0 ? "row-group-start" : ""}>
                      <td>{r.name}</td>
                      <td className="cell-count sep-left">
                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "ratio"))}
                          min="0"
                          step="1"
                          value={r.c1}
                          onChange={(value) => writeYear(r.name, "y1", value, r.p1 * 100)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">
                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "value"))}
                          min="0"
                          max="100"
                          step="0.1"
                          value={(r.p1 * 100).toFixed(1)}
                          onChange={(value) => writeYear(r.name, "y1", r.c1, value)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">{fmtMoney(r.a1)}</td>

                      <td className="cell-count sep-left">
                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "ratioY2"))}
                          min="0"
                          step="1"
                          value={r.c2}
                          onChange={(value) => writeYear(r.name, "y2", value, r.p2 * 100)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">

                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "valueY2"))}
                          min="0"
                          max="100"
                          step="0.1"
                          value={(r.p2 * 100).toFixed(1)}
                          onChange={(value) => writeYear(r.name, "y2", r.c2, value)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">{fmtMoney(r.a2)}</td>

                      <td className="cell-count sep-left">
                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "ratioY3"))}
                          min="0"
                          step="1"
                          value={r.c3}
                          onChange={(value) => writeYear(r.name, "y3", value, r.p3 * 100)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">
                        <NumberInput
                          className={inputClass("input xs num", discountPath(r.name, "valueY3"))}
                          min="0"
                          max="100"
                          step="0.1"
                          value={(r.p3 * 100).toFixed(1)}
                          onChange={(value) => writeYear(r.name, "y3", r.c3, value)}
                          disabled={!onDiscountsChange}
                        />
                      </td>
                      <td className="cell-num">{fmtMoney(r.a3)}</td>
                    </tr>
                  ))}

                  <tr className="row-group-start" style={{ fontWeight: 800 }}>
                    <td>TOPLAM</td>

                    <td className="cell-count sep-left">{fmtMoney(totals.s1)}</td>
                    <td className="cell-pct">{fmtPct(avgPct1)}</td>
                    <td className="cell-num">{fmtMoney(totals.a1)}</td>

                    <td className="cell-count sep-left">{fmtMoney(totals.s2)}</td>
                    <td className="cell-pct">{fmtPct(avgPct2)}</td>
                    <td className="cell-num">{fmtMoney(totals.a2)}</td>

                    <td className="cell-count sep-left">{fmtMoney(totals.s3)}</td>
                    <td className="cell-pct">{fmtPct(avgPct3)}</td>
                    <td className="cell-num">{fmtMoney(totals.a3)}</td>
                  </tr>

                  <tr>
                    <td className="small">Burs/İndirimli Öğrenci Oranı (Y1)</td>
                    <td className="small cell-pct" colSpan={9}>
                      {fmtPct(tuitionStudentsY1 > 0 ? totals.s1 / tuitionStudentsY1 : 0)}
                    </td>
                  </tr>

                  <tr>
                    <td className="small">Burs/İndirimlerin Öğrenci Ücret Gelirleri İçindeki % (Y1)</td>
                    <td className="small cell-pct" colSpan={9}>
                      {fmtPct(grossTuitionY1 > 0 ? totals.a1 / grossTuitionY1 : 0)}
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>


      {/* SUMMARY */}
      <div className="section-head">
        <div className="section-title">ÖZET</div>
      </div>
      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr>
              <th />
              <th style={{ width: 170 }}>Y1</th>
              <th style={{ width: 170 }}>Y2</th>
              <th style={{ width: 170 }}>Y3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>İşletme Giderleri</td>
              <td className="cell-num">{fmtMoney(operatingTotals.y1)}</td>
              <td className="cell-num">{fmtMoney(operatingTotals.y2)}</td>
              <td className="cell-num">{fmtMoney(operatingTotals.y3)}</td>
            </tr>
            <tr>
              <td>Öğrenim Dışı Maliyetler</td>
              <td className="cell-num">{fmtMoney(svcTotals.y1)}</td>
              <td className="cell-num">{fmtMoney(svcTotals.y2)}</td>
              <td className="cell-num">{fmtMoney(svcTotals.y3)}</td>
            </tr>
            <tr>
              <td>Yurt/Konaklama Giderleri</td>
              <td className="cell-num">{fmtMoney(dormTotals.y1)}</td>
              <td className="cell-num">{fmtMoney(dormTotals.y2)}</td>
              <td className="cell-num">{fmtMoney(dormTotals.y3)}</td>
            </tr>
            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td>Toplam Gider</td>
              <td className="cell-num">{fmtMoney(totalExpenses.y1)}</td>
              <td className="cell-num">{fmtMoney(totalExpenses.y2)}</td>
              <td className="cell-num">{fmtMoney(totalExpenses.y3)}</td>
            </tr>
            <tr>
              <td className="small">Net Ciro (Gelirler - İndirimler)</td>
              <td className="cell-num">{fmtMoney(netCiro.y1)}</td>
              <td className="cell-num">{fmtMoney(netCiro.y2)}</td>
              <td className="cell-num">{fmtMoney(netCiro.y3)}</td>
            </tr>
            <tr>
              <td className="small">Gider / Net Ciro</td>
              <td className="cell-num">{netCiro.y1 > 0 ? fmtPct(totalExpenses.y1 / netCiro.y1) : "-"}</td>
              <td className="cell-num">{netCiro.y2 > 0 ? fmtPct(totalExpenses.y2 / netCiro.y2) : "-"}</td>
              <td className="cell-num">{netCiro.y3 > 0 ? fmtPct(totalExpenses.y3 / netCiro.y3) : "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        İpucu: HR (İK) tabındaki 1/2/3. yıl personel sayıları ve birim maliyetleri girildiğinde, maaş satırları burada
        otomatik güncellenir (1. yıl giriş alanı kilitlenir).
      </div>
    </div>
  );
}
