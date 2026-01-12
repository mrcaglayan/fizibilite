//frontend/src/components/ExpensesEditor.jsx

import React, { useEffect, useMemo } from "react";
import { useScenarioUiFlag } from "../hooks/useScenarioUIState";
import NumberInput from "./NumberInput";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-";
const fmtPct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "-");

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

const BURS_DEFAULTS = [
  { name: "MAGİS BAŞARI BURSU" },
  { name: "MAARİF YETENEK BURSU" },
  { name: "İHTİYAÇ BURSU" },
  { name: "OKUL BAŞARI BURSU" },
  { name: "TAM EĞİTİM BURSU" },
  { name: "BARINMA BURSU" },
  { name: "TÜRKÇE BAŞARI BURSU" },
  { name: "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM" },
  { name: "VAAKIF ÇALIŞANI İNDİRİMİ" },
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
  for (const it of SERVICE_ITEMS) svc[it.key] = { studentCount: 0, unitCost: 0 };

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
const IK_LEVELS = [
  "okulOncesi",
  "ilkokulYerel",
  "ilkokulInt",
  "ortaokulYerel",
  "ortaokulInt",
  "liseYerel",
  "liseInt",
];
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
    for (const lvl of IK_LEVELS) totalCount += toNum(hc?.[lvl]?.[role]);
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

  const sumStudents = (rows) => rows.reduce((s, r) => s + toNum(r?.studentCount), 0);

  const tuitionStudents = tuitionRows.length ? sumStudents(tuitionRows) : totalStudents;

  const calcTuition = (f) => {
    if (tuitionRows.length) return tuitionRows.reduce((s, r) => s + toNum(r?.studentCount) * toNum(r?.unitFee) * f, 0);
    return tuitionStudents * toNum(inc.tuitionFeePerStudentYearly) * f;
  };
  const calcNonEd = (f) => {
    if (nonEdRows.length) return nonEdRows.reduce((s, r) => s + toNum(r?.studentCount) * toNum(r?.unitFee) * f, 0);
    return totalStudents * toNum(inc.lunchFeePerStudentYearly) * f;
  };
  const calcDorm = (f) => {
    if (dormRows.length) return dormRows.reduce((s, r) => s + toNum(r?.studentCount) * toNum(r?.unitFee) * f, 0);
    return totalStudents * toNum(inc.dormitoryFeePerStudentYearly) * f;
  };

  const out = {};
  for (const y of YEAR_KEYS) {
    const f = factors?.[y] ?? 1;
    const grossTuition = calcTuition(f);
    const nonEdTotal = calcNonEd(f);
    const dormIncomeTotal = calcDorm(f);
    const activityGross = grossTuition + nonEdTotal + dormIncomeTotal;
    const avgTuitionFee = tuitionStudents > 0 ? grossTuition / tuitionStudents : 0;
    out[y] = { grossTuition, tuitionStudents, avgTuitionFee, activityGross };
  }
  return out;
}

function computeDiscountTotalForYear({ discounts, grossTuition, tuitionStudents, avgTuitionFee, factor }) {
  const students = toNum(tuitionStudents);
  const gross = toNum(grossTuition);
  const tuition = toNum(avgTuitionFee);
  if (gross <= 0 || students <= 0) return 0;

  let avgRate = 0;

  for (const d of discounts || []) {
    if (!d) continue;
    const ratio = clamp(toNum(d.ratio), 0, 1);
    const mode = String(d.mode || "percent");
    const value = toNum(d.value);

    if (mode === "fixed") {
      // fixed = kişi başı indirim tutarı (Y2/Y3 enflasyonla artar)
      const val = Math.max(0, value) * (factor ?? 1);
      if (tuition > 0) avgRate += (ratio * val) / tuition;
    } else {
      const pct = clamp(value, 0, 1);
      avgRate += ratio * pct;
    }
  }

  const capped = clamp(avgRate, 0, 1);
  const total = gross * capped;
  return Math.min(total, gross);
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
  const baseTuitionStudents = toNum(incomeYears?.y1?.tuitionStudents);

  const discountTotals = useMemo(() => {
    const out = {};
    for (const y of YEAR_KEYS) {
      const inc = incomeYears?.[y] || {};
      out[y] = computeDiscountTotalForYear({
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
    const base1 = Math.max(toNum(g?.isletme?.items?.[key]), toNum(salaryByYear?.y1?.[key]));
    const fromIk = toNum(salaryByYear?.[yearKey]?.[key]);
    if (fromIk > 0) return fromIk;
    if (yearKey === "y1") return base1;
    return base1 * (factors?.[yearKey] ?? 1);
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
    const out = { y1: 0, y2: 0, y3: 0, students: 0 };
    for (const it of SERVICE_ITEMS) {
      const row = g.ogrenimDisi?.items?.[it.key] || {};
      const sc = toNum(row.studentCount);
      const uc1 = toNum(row.unitCost);
      out.students += sc;
      out.y1 += sc * uc1;
      out.y2 += sc * (uc1 * factors.y2);
      out.y3 += sc * (uc1 * factors.y3);
    }
    return out;
  }, [g, factors]);

  const dormTotals = useMemo(() => {
    const out = { y1: 0, y2: 0, y3: 0, students: 0 };
    for (const it of DORM_ITEMS) {
      const row = g.yurt?.items?.[it.key] || {};
      const sc = toNum(row.studentCount);
      const uc1 = toNum(row.unitCost);
      out.students += sc;
      out.y1 += sc * uc1;
      out.y2 += sc * (uc1 * factors.y2);
      out.y3 += sc * (uc1 * factors.y3);
    }
    return out;
  }, [g, factors]);

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

  // -------- Burs/İndirim (Excel section inside "Giderler") ----------
  const normalizedDiscounts = useMemo(() => {
    const list = Array.isArray(discounts) ? discounts : [];
    const byName = new Map(list.map((d) => [String(d.name || ""), d]));
    return BURS_DEFAULTS.map((row) => {
      const d = byName.get(row.name) || { name: row.name, mode: "percent", value: 0, ratio: 0 };
      const hasStudentCount = d && d.studentCount != null && d.studentCount !== "";
      const rawCount = hasStudentCount ? Number(d.studentCount) : NaN;
      const studentCount = Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : null;
      return {
        name: row.name,
        mode: d.mode || "percent",
        value: toNum(d.value), // percent stored as 0-1
        ratio: clamp(toNum(d.ratio), 0, 1),
        studentCount,
      };
    });
  }, [discounts]);

  const bursRows = useMemo(() => {
    const baseStudents = baseTuitionStudents || 0;
    return normalizedDiscounts.map((d) => {
      const rawCount = Number.isFinite(d.studentCount) ? Math.max(0, Math.round(d.studentCount)) : null;
      const count =
        baseStudents > 0
          ? Math.min(rawCount != null ? rawCount : Math.round(d.ratio * baseStudents), baseStudents)
          : rawCount != null
            ? rawCount
            : 0;
      const ratio = baseStudents > 0 ? clamp(count / baseStudents, 0, 1) : clamp(d.ratio, 0, 1);
      const pct = clamp(d.value, 0, 1);
      const amountY = (yearKey) => {
        const avg = toNum(incomeYears?.[yearKey]?.avgTuitionFee);
        if (d.mode === "fixed") return count * Math.max(0, toNum(d.value)) * (factors?.[yearKey] ?? 1);
        return avg * count * pct;
      };
      return {
        ...d,
        ratio,
        studentCount: count,
        pct,
        a1: amountY("y1"),
        a2: amountY("y2"),
        a3: amountY("y3"),
      };
    });
  }, [normalizedDiscounts, incomeYears, factors, baseTuitionStudents]);

  const bursTotals = useMemo(() => {
    const students = bursRows.reduce((s, r) => s + toNum(r.studentCount), 0);
    const a1 = bursRows.reduce((s, r) => s + toNum(r.a1), 0);
    const a2 = bursRows.reduce((s, r) => s + toNum(r.a2), 0);
    const a3 = bursRows.reduce((s, r) => s + toNum(r.a3), 0);
    const weightedAvgPct = students > 0 ? bursRows.reduce((s, r) => s + toNum(r.studentCount) * clamp(r.pct, 0, 1), 0) / students : 0;
    const tuitionStudents = toNum(incomeYears?.y1?.tuitionStudents);
    const grossTuition = toNum(incomeYears?.y1?.grossTuition);
    return {
      students,
      a1,
      a2,
      a3,
      weightedAvgPct,
      shareStudents: tuitionStudents > 0 ? students / tuitionStudents : 0,
      shareTuition: grossTuition > 0 ? a1 / grossTuition : 0,
    };
  }, [bursRows, incomeYears]);

  function writeBursRow(name, studentCount, pct100) {
    const isEmpty = studentCount === "" || studentCount == null;
    const students = baseTuitionStudents;
    const safeCount = isEmpty ? 0 : Math.max(0, Math.round(toNum(studentCount)));
    const boundedCount = students > 0 ? Math.min(safeCount, students) : safeCount;
    const pct = clamp(toNum(pct100) / 100, 0, 1);

    const list = Array.isArray(discounts) ? discounts : [];
    const next = [...list];
    const idx = next.findIndex((x) => String(x?.name || "") === name);
    const ratioBase = students > 0 ? students : 1;
    const ratio = clamp(boundedCount / ratioBase, 0, 1);
    const studentCountValue = isEmpty ? undefined : boundedCount;
    const payload = { name, mode: "percent", value: pct, ratio, studentCount: studentCountValue };
    if (idx >= 0) next[idx] = { ...next[idx], ...payload };
    else next.push(payload);

    onDiscountsChange?.(next);
    onDirty?.(discountPath(name, "ratio"), ratio);
    onDirty?.(discountPath(name, "value"), pct);
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
          "temsilAgirlama",
          "ulkeIciUlasim",
        ],
      },
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
      <div style={{ marginTop: 14, fontWeight: 800 }}>{`GİDERLER (İŞLETME) / YIL (${currencyCode})`}</div>
      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table table-3y expenses-3block expenses-main">
          <thead>
            <tr className="group">
              <th rowSpan={2} className="exp-group-col" style={{ width: 30 }} />
              {showAccountCol ? <th rowSpan={2} style={{ width: 70 }}>Hesap</th> : null}
              <th rowSpan={2} className="exp-label-col">Gider Kalemi</th>

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
                    <td className="exp-label-col" title={it.label}>{it.label}</td>

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
      <div style={{ marginTop: 18, fontWeight: 800 }}>
        GİDERLER (ÖĞRENİM DIŞI HİZMETLERE YÖNELİK SATILAN MAL VE HİZMETLER) / YIL
      </div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr>
              {showAccountCol ? <th style={{ width: 70 }}>Hesap</th> : null}
              <th>Gider Kalemi</th>
              <th className="sep-left" style={{ width: 120 }}>Öğrenci</th>
              <th style={{ width: 140 }}>Birim (Y1)</th>
              <th style={{ width: 160 }}>Toplam (Y1)</th>
              <th style={{ width: 160 }}>Toplam (Y2)</th>
              <th style={{ width: 160 }}>Toplam (Y3)</th>
            </tr>
          </thead>
          <tbody>
            {SERVICE_ITEMS.map((it, idx) => {
              const row = g.ogrenimDisi?.items?.[it.key] || {};
              const sc = toNum(row.studentCount);
              const uc1 = toNum(row.unitCost);
              const t1 = sc * uc1;
              const uc2 = uc1 * factors.y2;
              const uc3 = uc1 * factors.y3;
              const t2 = sc * uc2;
              const t3 = sc * uc3;

              return (
                <tr key={it.key} className={idx === 0 ? "row-group-start" : ""}>
                  {showAccountCol ? <td>{it.code}</td> : null}
                  <td>{it.label}</td>
                  <td className="sep-left cell-count">
                    <NumberInput
                      className={inputClass("input xs num", svcPath(it.key, "studentCount"))}
                     
                      min="0"
                      step="1"
                      value={sc}
                      onChange={(value) => setSvc(it.key, "studentCount", value)}
                    />
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
                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(t2)}</div>
                    <div className="small">Birim: {fmtMoney(uc2)}</div>
                  </td>
                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(t3)}</div>
                    <div className="small">Birim: {fmtMoney(uc3)}</div>
                  </td>
                </tr>
              );
            })}

            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td colSpan={showAccountCol ? 2 : 1}>TOPLAM</td>
              <td className="cell-count sep-left">{fmtMoney(svcTotals.students)}</td>
              <td />
              <td className="cell-num">{fmtMoney(svcTotals.y1)}</td>
              <td className="cell-num">{fmtMoney(svcTotals.y2)}</td>
              <td className="cell-num">{fmtMoney(svcTotals.y3)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 3 */}
      <div style={{ marginTop: 18, fontWeight: 800 }}>GİDERLER (YURT, KONAKLAMA) / YIL</div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr>
              {showAccountCol ? <th style={{ width: 70 }}>Hesap</th> : null}
              <th>Gider Kalemi</th>
              <th className="sep-left" style={{ width: 120 }}>Öğrenci</th>
              <th style={{ width: 140 }}>Birim (Y1)</th>
              <th style={{ width: 160 }}>Toplam (Y1)</th>
              <th style={{ width: 160 }}>Toplam (Y2)</th>
              <th style={{ width: 160 }}>Toplam (Y3)</th>
            </tr>
          </thead>
          <tbody>
            {DORM_ITEMS.map((it, idx) => {
              const row = g.yurt?.items?.[it.key] || {};
              const sc = toNum(row.studentCount);
              const uc1 = toNum(row.unitCost);
              const t1 = sc * uc1;
              const uc2 = uc1 * factors.y2;
              const uc3 = uc1 * factors.y3;
              const t2 = sc * uc2;
              const t3 = sc * uc3;

              return (
                <tr key={it.key} className={idx === 0 ? "row-group-start" : ""}>
                  {showAccountCol ? <td>{it.code}</td> : null}
                  <td>{it.label}</td>
                  <td className="sep-left cell-count">
                    <NumberInput
                      className={inputClass("input xs num", dormPath(it.key, "studentCount"))}
                     
                      min="0"
                      step="1"
                      value={sc}
                      onChange={(value) => setDorm(it.key, "studentCount", value)}
                    />
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
                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(t2)}</div>
                    <div className="small">Birim: {fmtMoney(uc2)}</div>
                  </td>
                  <td className="cell-num">
                    <div className="cell-num">{fmtMoney(t3)}</div>
                    <div className="small">Birim: {fmtMoney(uc3)}</div>
                  </td>
                </tr>
              );
            })}

            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td colSpan={showAccountCol ? 2 : 1}>TOPLAM</td>
              <td className="cell-count sep-left">{fmtMoney(dormTotals.students)}</td>
              <td />
              <td className="cell-num">{fmtMoney(dormTotals.y1)}</td>
              <td className="cell-num">{fmtMoney(dormTotals.y2)}</td>
              <td className="cell-num">{fmtMoney(dormTotals.y3)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 4 */}
      <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800 }}>BURS VE İNDİRİMLER / YIL</div>
      </div>

      <div className="table-scroll no-vert-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr>
              <th>Burs / İndirim</th>
              <th style={{ width: 140 }}>Burslu Öğrenci</th>
              <th style={{ width: 120 }}>Ort. %</th>
              <th style={{ width: 150 }}>Tutar (Y1)</th>
              <th style={{ width: 150 }}>Tutar (Y2)</th>
              <th style={{ width: 150 }}>Tutar (Y3)</th>
            </tr>
          </thead>
          <tbody>
            {bursRows.map((r, idx) => (
              <tr key={r.name} className={idx === 0 ? "row-group-start" : ""}>
                <td>{r.name}</td>
                <td className="cell-count">
                  <NumberInput
                    className={inputClass("input xs num", discountPath(r.name, "ratio"))}
                     
                    min="0"
                    step="1"
                    value={r.studentCount}
                    onChange={(value) => writeBursRow(r.name, value, r.pct * 100)}
                    disabled={!onDiscountsChange}
                  />
                </td>
                <td className="cell-num">
                  <NumberInput
                    className={inputClass("input xs num", discountPath(r.name, "value"))}
                   
                    min="0"
                    max="100"
                    step="0.1"
                    value={(r.pct * 100).toFixed(1)}
                    onChange={(value) => writeBursRow(r.name, r.studentCount, value)}
                    disabled={!onDiscountsChange}
                  />
                </td>
                <td className="cell-num">{fmtMoney(r.a1)}</td>
                <td className="cell-num">{fmtMoney(r.a2)}</td>
                <td className="cell-num">{fmtMoney(r.a3)}</td>
              </tr>
            ))}

            <tr className="row-group-start" style={{ fontWeight: 800 }}>
              <td>TOPLAM</td>
              <td className="cell-count">{fmtMoney(bursTotals.students)}</td>
              <td className="cell-pct">{fmtPct(bursTotals.weightedAvgPct)}</td>
              <td className="cell-num">{fmtMoney(bursTotals.a1)}</td>
              <td className="cell-num">{fmtMoney(bursTotals.a2)}</td>
              <td className="cell-num">{fmtMoney(bursTotals.a3)}</td>
            </tr>
            <tr>
              <td className="small">Burs/İndirimli Öğrenci Oranı</td>
              <td className="small cell-pct" colSpan={5}>{fmtPct(bursTotals.shareStudents)}</td>
            </tr>
            <tr>
              <td className="small">Burs/İndirimlerin Öğrenci Ücret Gelirleri İçindeki % (Y1)</td>
              <td className="small cell-pct" colSpan={5}>{fmtPct(bursTotals.shareTuition)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SUMMARY */}
      <div style={{ marginTop: 18, fontWeight: 800 }}>ÖZET</div>
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
