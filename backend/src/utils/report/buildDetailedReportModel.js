// Backend port of frontend/src/utils/buildDetailedReportModel.js
// NOTE: Keep this file browser-free (no React/window/document). Pure computation only.

const { getProgramType, isKademeKeyVisible } = require("../programType");


// --- kademe helpers (ported from frontend/src/utils/kademe.js) ---
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


const DISCOUNT_DEFS = [
  { key: "magisBasariBursu", name: "MAGIS BASARI BURSU" },
  { key: "maarifYetenekBursu", name: "MAARIF YETENEK BURSU" },
  { key: "ihtiyacBursu", name: "IHTIYAC BURSU" },
  { key: "okulBasariBursu", name: "OKUL BASARI BURSU" },
  { key: "tamEgitimBursu", name: "TAM EGITIM BURSU" },
  { key: "barinmaBursu", name: "BARINMA BURSU" },
  { key: "turkceBasariBursu", name: "TURKCE BASARI BURSU" },
  {
    key: "uluslararasiYukumlulukIndirimi",
    name: "VAKFIN ULUSLARARASI YUKUMLULUKLERINDEN KAYNAKLI INDIRIM",
  },
  { key: "vakifCalisaniIndirimi", name: "VAKIF CALISANI INDIRIMI" },
  { key: "kardesIndirimi", name: "KARDES INDIRIMI" },
  { key: "erkenKayitIndirimi", name: "ERKEN KAYIT INDIRIMI" },
  { key: "pesinOdemeIndirimi", name: "PESIN ODEME INDIRIMI" },
  { key: "kademeGecisIndirimi", name: "KADEME GECIS INDIRIMI" },
  { key: "temsilIndirimi", name: "TEMSIL INDIRIMI" },
  { key: "kurumIndirimi", name: "KURUM INDIRIMI" },
  { key: "istisnaiIndirim", name: "ISTISNAI INDIRIM" },
  { key: "yerelMevzuatIndirimi", name: "YEREL MEVZUATIN SART KOSTUGU INDIRIM" },
];

const SCHOLARSHIP_DEFS = DISCOUNT_DEFS.slice(0, 7);
const OTHER_DISCOUNT_DEFS = DISCOUNT_DEFS.slice(7);

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  const n = safeNum(value);
  return Math.min(max, Math.max(min, n));
}

function clamp0(value) {
  return Math.max(0, safeNum(value));
}

function safeDiv(numerator, denominator) {
  const num = Number(numerator);
  const denom = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom === 0) {
    return null;
  }
  return num / denom;
}

function normalizeText(value) {
  const map = {
    ş: "s",
    Ş: "s",
    ı: "i",
    İ: "i",
    ğ: "g",
    Ğ: "g",
    ü: "u",
    Ü: "u",
    ö: "o",
    Ö: "o",
    ç: "c",
    Ç: "c",
  };
  const replaced = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return replaced
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRowLabel(row) {
  return (
    row?.key ||
    row?.code ||
    row?.name ||
    row?.title ||
    row?.label ||
    row?.description ||
    row?.item_name ||
    ""
  );
}

function getRowCount(row) {
  return safeNum(
    row?.studentCount ||
    row?.count ||
    row?.students ||
    row?.qty ||
    row?.quantity ||
    0
  );
}

function scoreMatch(normLabel, aliases) {
  let best = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    if (normLabel === alias) best = Math.max(best, 100);
    else if (normLabel.startsWith(alias)) best = Math.max(best, 80);
    else if (normLabel.includes(alias)) best = Math.max(best, 60);
    else if (new RegExp(`(^|\\s)${alias}(\\s|$)`).test(normLabel))
      best = Math.max(best, 70);
  }
  return best;
}

function findBestCount(rows, aliases) {
  const normalizedAliases = aliases.map(normalizeText);
  let best = { score: 0, count: 0 };
  for (const row of rows || []) {
    const normLabel = normalizeText(getRowLabel(row));
    const score = scoreMatch(normLabel, normalizedAliases);
    const count = getRowCount(row);
    if (
      score > best.score ||
      (score === best.score && count > best.count)
    ) {
      best = { score, count };
    }
  }
  return best.count;
}

const numOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function parseAcademicStartYear(academicYear) {
  const raw = String(academicYear || "").trim();
  const range = raw.match(/(\d{4})\s*-\s*(\d{4})/);
  if (range) {
    const start = Number(range[1]);
    if (Number.isFinite(start)) return start;
  }
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const start = Number(single[1]);
    if (Number.isFinite(start)) return start;
  }
  return null;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .toUpperCase();
}

function buildDiscountLookup(list) {
  const map = new Map();
  for (const row of list || []) {
    const key = normalizeName(row?.name);
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

const TUITION_VARIANT_BASE = {
  okuloncesi: "okulOncesi",
  ilkokul: "ilkokul",
  ilkokulyerel: "ilkokul",
  ilkokulint: "ilkokul",
  ortaokul: "ortaokul",
  ortaokulyerel: "ortaokul",
  ortaokulint: "ortaokul",
  lise: "lise",
  liseyerel: "lise",
  liseint: "lise",
};

function normalizeTuitionVariant(value) {
  if (value == null) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function getTuitionBaseKey(row) {
  const normalized = normalizeTuitionVariant(row?.key ?? row?.label ?? row?.level);
  if (!normalized) return null;
  return TUITION_VARIANT_BASE[normalized] || null;
}

function collectTuitionStudents(rows) {
  return rows.reduce((sum, row) => sum + safeNum(row.studentCount), 0);
}

function buildTuitionRowCosts(row, uniformFee, booksFee, transportFee, mealFee, raisePct, toUsd) {
  const eduFeeUsd = toUsd(row?.unitFee);
  const uniformUsd = uniformFee;
  const booksUsd = booksFee;
  const transportUsd = transportFee;
  const mealUsd = mealFee;
  const totalUsd = eduFeeUsd + uniformUsd + booksUsd + transportUsd + mealUsd;
  return {
    key: String(row?.key || row?.level || row?.label || ""),
    level: row?.label || row?.level || row?.key || "",
    edu: eduFeeUsd,
    uniform: uniformUsd,
    books: booksUsd,
    transport: transportUsd,
    meal: mealUsd,
    raisePct,
    total: totalUsd,
    studentCount: safeNum(row?.studentCount),
  };
}

function buildDiscountPlanRowY1({ name, key, tuitionStudents, avgTuition, toUsd, inputDiscounts, currentCount }) {
  const normalized = normalizeName(name);
  const entry = inputDiscounts.get(normalized);
  const row = entry || { name, mode: "percent", value: 0, ratio: 0 };

  const hasCount = row.studentCount != null && row.studentCount !== "";
  const count = hasCount ? Math.max(0, Math.round(safeNum(row.studentCount))) : null;
  const ratio = clamp(row.ratio, 0, 1);
  const derived = tuitionStudents > 0 ? Math.round((count != null ? count : ratio * tuitionStudents)) : 0;
  const plannedCount = tuitionStudents > 0 ? Math.min(derived, tuitionStudents) : count != null ? count : 0;

  const mode = String(row.mode || "percent").trim().toLowerCase();
  const value = safeNum(row.value);
  const pct = clamp(value, 0, 1);
  const fixedValueUsd = Math.max(0, toUsd(value));
  const fixedRate =
    Number.isFinite(avgTuition) && avgTuition > 0 ? clamp(fixedValueUsd / avgTuition, 0, 1) : null;
  const rate = mode === "fixed" ? fixedRate : pct;
  const cost =
    mode === "fixed"
      ? plannedCount * fixedValueUsd
      : safeNum(avgTuition) * plannedCount * pct;

  return {
    name,
    planned: plannedCount,
    cost,
    cur: currentCount ?? null,
    key,
    rate,
  };
}

function buildDetailedReportModel({
  school,
  scenario,
  inputs,
  report,
  prevReport,
  prevCurrencyMeta,
  reportCurrency,
  currencyMeta,
  programType,
  mode,
} = {}) {
  const countryName = school?.country_name || school?.country || "Ülke";
  const schoolName = school?.name || school?.school_name || "Okul";
  const temel = inputs?.temelBilgiler || {};
  const principalName = temel?.yetkililer?.mudur || "";

  const reporterName = temel?.yetkililer?.raporuHazirlayan || "";
  const temsilciName = temel?.yetkililer?.ulkeTemsilcisi || "";



  const normKey = (k) => String(k || "").trim().toLowerCase();
  const resolvedProgramType = programType || getProgramType(inputs, scenario);
  const inputCurrency = String(scenario?.input_currency || "USD").toUpperCase();
  const fx = Number(scenario?.fx_usd_to_local || 0);
  const shouldConvertLocal = inputCurrency === "LOCAL" && fx > 0;
  const toUsd = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (shouldConvertLocal) {
      return n / fx;
    }
    return n;
  };
  const prevFx = Number(prevCurrencyMeta?.fx_usd_to_local || 0);
  const perfRealizedFx = Number(
    temel?.performans?.prevYearRealizedFxUsdToLocal || 0,
  );
  const perfRealizedFxValid = perfRealizedFx > 0;
  const plannedFxForLocal = prevFx > 0 ? prevFx : perfRealizedFxValid ? perfRealizedFx : null;
  const toUsdPerf = (value) => {
    const raw = numOrNull(value);
    if (raw == null) return null;
    if (inputCurrency === "LOCAL") {
      return perfRealizedFxValid ? raw / perfRealizedFx : null;
    }
    return raw;
  };

  const headerParts = [
    school?.name || school?.school_name || "Okul",
    scenario?.name || "",
    scenario?.academic_year || "",
  ].filter(Boolean);
  const headerLabel = headerParts.join(" > ");


  const kademeConfig = normalizeKademeConfig(temel?.kademeler);
  const okulEgitim = temel?.okulEgitimBilgileri || {};
  const ucretArtisOranlari = temel?.ucretArtisOranlari || {};
  const ikMevcut = temel?.ikMevcut || {};
  const performans = temel?.performans?.gerceklesen || {};
  const rakipAnalizi = temel?.rakipAnalizi || {};
  const inflation = temel?.inflation || {};
  const bursIndirimCounts = temel?.bursIndirimOgrenciSayilari || {};

  const kapasite = inputs?.kapasite || {};
  const byKademe = kapasite?.byKademe || {};
  const derivedCapacity =
    safeNum(kapasite?.totals?.cur) ||
    Object.values(byKademe).reduce((sum, row) => sum + safeNum(row?.caps?.cur), 0);
  const schoolCapacity = derivedCapacity || safeNum(kapasite?.currentStudents);
  const derivedCapacityY1 =
    safeNum(kapasite?.years?.y1) ||
    safeNum(kapasite?.totals?.y1) ||
    Object.values(byKademe).reduce((sum, row) => sum + safeNum(row?.caps?.y1), 0);
  const capacityYear1 = derivedCapacityY1 || schoolCapacity;

  const gradesCurrent = Array.isArray(inputs?.gradesCurrent) ? inputs?.gradesCurrent : [];
  const currentStudentsFromGrades = gradesCurrent.reduce((sum, row) => sum + safeNum(row?.studentsPerBranch), 0);
  const currentStudents = safeNum(kapasite?.currentStudents) || currentStudentsFromGrades;
  const totalBranchesCurrent = gradesCurrent.reduce((sum, row) => sum + safeNum(row?.branchCount), 0);
  const classroomUtilization = safeDiv(currentStudents, totalBranchesCurrent);

  const gradesYearsY1 = Array.isArray(inputs?.gradesYears?.y1) ? inputs?.gradesYears.y1 : [];
  const plannedStudents = gradesYearsY1.reduce((sum, row) => sum + safeNum(row?.studentsPerBranch), 0);
  const plannedBranches = gradesYearsY1.reduce((sum, row) => sum + safeNum(row?.branchCount), 0);
  const plannedUtilization = safeDiv(plannedStudents, schoolCapacity);
  const avgStudentsPerClassPlanned = safeDiv(plannedStudents, plannedBranches);

  const shiftSystem = okulEgitim?.sabahciOglenci || "";
  const programTypeLabel = okulEgitim?.uygulananProgram ||
    (resolvedProgramType === "international" ? "Uluslararasi" : "Ulusal");

  const tuitionInputRows = Array.isArray(inputs?.gelirler?.tuition?.rows)
    ? inputs.gelirler.tuition.rows
    : [];
  const nonEducationRows = Array.isArray(inputs?.gelirler?.nonEducationFees?.rows)
    ? inputs.gelirler.nonEducationFees.rows
    : [];
  const dormRows = Array.isArray(inputs?.gelirler?.dormitory?.rows)
    ? inputs.gelirler.dormitory.rows
    : [];
  const otherIncomeRows = Array.isArray(inputs?.gelirler?.otherInstitutionIncome?.rows)
    ? inputs.gelirler.otherInstitutionIncome.rows
    : [];
  const dormIncomeRows = Array.isArray(inputs?.gelirler?.dormitory?.rows)
    ? inputs.gelirler.dormitory.rows
    : [];
  const dormByKey = new Map(dormIncomeRows.map((r) => [normKey(r?.key), r]));
  const yurtCount = safeNum(dormByKey.get("yurt")?.studentCount);
  const yazOkuluCount = safeNum(dormByKey.get("yazokulu")?.studentCount);

  const tuitionVisibleRows = tuitionInputRows.filter((row) => {
    const baseKey = getTuitionBaseKey(row);
    if (baseKey && kademeConfig[baseKey]?.enabled === false) return false;
    return isKademeKeyVisible(row?.key, resolvedProgramType);
  });

  const feeLookup = new Map();
  for (const row of nonEducationRows) {
    const key = String(row?.key || "").trim().toLowerCase();
    if (key) feeLookup.set(key, row);
  }

  const uniformFee = toUsd(feeLookup.get("uniforma")?.unitFee ?? 0);
  const booksFee = toUsd(feeLookup.get("kitap")?.unitFee ?? 0);
  const transportFee = toUsd(feeLookup.get("ulasim")?.unitFee ?? 0);
  const mealFee = toUsd(feeLookup.get("yemek")?.unitFee ?? 0);

  const nonEduIncomeRows =
    inputs?.gelirler?.nonEducationFees?.rows ||
    inputs?.gelirler?.nonEducationFees?.items ||
    [];
  const MEAL_ALIASES = [
    "yemek",
    "ogrenci yemegi",
    "ogrenci yemegi ucreti",
    "ogrenci yemeği",
    "yemek ucreti",
    "lunch",
    "meal",
    "meal fee",
    "food",
  ];
  const UNIFORM_ALIASES = [
    "uniforma",
    "okul uniformasi",
    "okul üniformasi",
    "forma",
    "kiyafet",
    "kıyafet",
    "uniform",
    "uniform fee",
  ];
  const BOOK_ALIASES = [
    "kitap",
    "kirtasiye",
    "kırtasiye",
    "kitap kirtasiye",
    "kitap-kirtasiye",
    "book",
    "books",
    "stationery",
    "book stationery",
  ];
  const SERVICE_ALIASES = [
    "servis",
    "ogrenci servisi",
    "ogrenci servis",
    "ulasim",
    "ulaşim",
    "servis ucreti",
    "transport",
    "transportation",
    "bus",
    "school bus",
  ];
  const mealCount = findBestCount(nonEduIncomeRows, MEAL_ALIASES);
  const uniformCount = findBestCount(nonEduIncomeRows, UNIFORM_ALIASES);
  const bookCount = findBestCount(nonEduIncomeRows, BOOK_ALIASES);
  const serviceCount = findBestCount(nonEduIncomeRows, SERVICE_ALIASES);

  const tuitionRows = tuitionVisibleRows.map((row) => {
    const raisePct = clamp0(ucretArtisOranlari?.[row?.key]);
    return buildTuitionRowCosts(row, uniformFee, booksFee, transportFee, mealFee, raisePct, toUsd);
  });

  const totalTuitionStudents = collectTuitionStudents(tuitionRows);
  const totalTuitionEdu = tuitionRows.reduce((sum, r) => sum + r.edu * r.studentCount, 0);
  const avgTuition = totalTuitionStudents
    ? totalTuitionEdu / totalTuitionStudents
    : tuitionRows.length
      ? tuitionRows.reduce((sum, r) => sum + r.edu, 0) / tuitionRows.length
      : 0;

  const totalRow = {
    key: "total",
    level: "TOPLAM",
    edu: tuitionRows.reduce((sum, r) => sum + r.edu, 0),
    uniform: tuitionRows.reduce((sum, r) => sum + r.uniform, 0),
    books: tuitionRows.reduce((sum, r) => sum + r.books, 0),
    transport: tuitionRows.reduce((sum, r) => sum + r.transport, 0),
    meal: tuitionRows.reduce((sum, r) => sum + r.meal, 0),
    raisePct: null,
    total: tuitionRows.reduce((sum, r) => sum + r.total, 0),
    studentCount: totalTuitionStudents,
  };

  const averageRow = {
    key: "average",
    level: "ORTALAMA UCRET",
    edu: avgTuition,
    uniform: tuitionRows.length ? uniformFee : 0,
    books: tuitionRows.length ? booksFee : 0,
    transport: tuitionRows.length ? transportFee : 0,
    meal: tuitionRows.length ? mealFee : 0,
    raisePct: null,
    total: tuitionRows.length
      ? uniformFee + booksFee + transportFee + mealFee + avgTuition
      : 0,
    studentCount: totalTuitionStudents,
  };

  const tuitionTable = [...tuitionRows, totalRow, averageRow];

  const reportIncome = report?.years?.y1?.income || {};
  const reportExpenses = report?.years?.y1?.expenses || {};

  const reportGrossTuition = safeNum(reportIncome?.grossTuition) || totalTuitionEdu;
  const nonEducationTotal =
    safeNum(reportIncome?.nonEducationFeesTotal) ||
    nonEducationRows.reduce((sum, row) => sum + toUsd(row?.unitFee) * safeNum(row?.studentCount), 0);
  const dormTotal =
    safeNum(reportIncome?.dormitoryRevenuesTotal) ||
    dormRows.reduce((sum, row) => sum + toUsd(row?.unitFee) * safeNum(row?.studentCount), 0);
  const governmentIncentives = toUsd(inputs?.gelirler?.governmentIncentives ?? 0);
  const otherIncomePure = otherIncomeRows.reduce((sum, row) => sum + toUsd(row?.amount), 0);
  const otherIncomeFromInputs = otherIncomePure + governmentIncentives;
  const otherIncomeTotal =
    safeNum(reportIncome?.otherIncomeTotal) ||
    otherIncomeFromInputs;
  const grossIncomeBase =
    safeNum(reportIncome?.totalGrossIncome) ||
    reportGrossTuition + nonEducationTotal + dormTotal + otherIncomeTotal;

  const calcNonEdRevenue = (key) => {
    const row = feeLookup.get(key) || {};
    return toUsd(row?.unitFee) * safeNum(row?.studentCount);
  };
  const nonEdRevenues = {
    uniforma: calcNonEdRevenue("uniforma"),
    kitap: calcNonEdRevenue("kitap"),
    yemek: calcNonEdRevenue("yemek"),
    ulasim: calcNonEdRevenue("ulasim"),
  };
  const revenueRows = [
    { name: "Egitim Ucreti", amount: reportGrossTuition },
    { name: "Uniforma", amount: nonEdRevenues.uniforma },
    { name: "Kitap Kirtasiye", amount: nonEdRevenues.kitap },
    { name: "Yemek", amount: nonEdRevenues.yemek },
    { name: "Servis", amount: nonEdRevenues.ulasim },
    { name: "Yurt Gelirleri", amount: dormTotal },
    { name: "Diger (kantin, kira vb.)", amount: otherIncomePure },
    { name: "Devlet Tesvikleri", amount: governmentIncentives },
  ].map((row) => ({
    name: row.name,
    amount: row.amount,
    ratio: safeDiv(row.amount, grossIncomeBase),
  }));
  const revenuesDetailed = revenueRows;
  const revenuesDetailedTotal =
    grossIncomeBase ||
    revenuesDetailed.reduce((sum, r) => (Number.isFinite(r.amount) ? sum + Number(r.amount) : sum), 0);
  const nonEducationBreakdown = nonEducationRows
    .map((row) => {
      const name = row?.label || row?.name || row?.key || "";
      const amount = toUsd(row?.unitFee) * safeNum(row?.studentCount);
      return { name, amount };
    })
    .filter((row) => row.name && Number.isFinite(row.amount) && row.amount !== 0);

  const otherIncomeBreakdown = [
    ...otherIncomeRows
      .map((row) => {
        const name = row?.label || row?.name || row?.key || "";
        const amount = toUsd(row?.amount);
        return { name, amount };
      })
      .filter((row) => row.name && Number.isFinite(row.amount) && row.amount !== 0),
    ...(inputs?.gelirler?.governmentIncentives
      ? [{ name: "Devlet Tesvikleri", amount: toUsd(inputs?.gelirler?.governmentIncentives) }]
      : []),
  ];

  const nonEduExpenseItems = inputs?.giderler?.ogrenimDisi?.items || {};
  const unitMealUsd = toUsd(safeNum(nonEduExpenseItems?.yemek?.unitCost));
  const unitUniformUsd = toUsd(safeNum(nonEduExpenseItems?.uniforma?.unitCost));
  const unitBookUsd = toUsd(
    safeNum(
      nonEduExpenseItems?.kitapKirtasiye?.unitCost ??
      nonEduExpenseItems?.kitap?.unitCost ??
      nonEduExpenseItems?.kirtasiye?.unitCost
    )
  );
  const unitServiceUsd = toUsd(
    safeNum(
      nonEduExpenseItems?.ulasimServis?.unitCost ??
      nonEduExpenseItems?.servis?.unitCost ??
      nonEduExpenseItems?.ulasim?.unitCost
    )
  );

  const dormExpenseItems = inputs?.giderler?.yurt?.items || {};

  const mealAmount = unitMealUsd * mealCount;
  const uniformAmount = unitUniformUsd * uniformCount;
  const bookAmount = unitBookUsd * bookCount;
  const serviceAmount = unitServiceUsd * serviceCount;

  const unitYurtUsd = toUsd(safeNum(dormExpenseItems?.yurtGiderleri?.unitCost));
  const unitOtherUsd = toUsd(safeNum(dormExpenseItems?.digerYurt?.unitCost));
  const dormYurtAmount = unitYurtUsd * yurtCount;
  const dormOtherAmount = unitOtherUsd * yazOkuluCount;
  const dormAmount = Math.max(0, dormYurtAmount + dormOtherAmount);

  const serviceCosts = {
    yemek: mealAmount,
    uniforma: uniformAmount,
    kitapKirtasiye: bookAmount,
    ulasimServis: serviceAmount,
    total: mealAmount + uniformAmount + bookAmount + serviceAmount,
  };

  const dormCosts = {
    yurtGiderleri: dormYurtAmount,
    digerYurt: dormOtherAmount,
    total: dormAmount,
  };

  const plannedHeadcountsByRole = (() => {
    const hc = inputs?.ik?.years?.y1?.headcountsByLevel || {};
    const levels = Object.keys(hc);
    const sumRole = (roleKey) =>
      levels.reduce((sum, level) => sum + safeNum(hc?.[level]?.[roleKey]), 0);
    return {
      turkPersonelYoneticiEgitimci:
        sumRole("turk_mudur") + sumRole("turk_mdyard") + sumRole("turk_egitimci"),
      turkPersonelTemsilcilik: sumRole("turk_temsil"),
      yerelKadroluEgitimci: sumRole("yerel_yonetici_egitimci"),
      yerelUcretliVakaterEgitimci: sumRole("yerel_ucretli_egitimci"),
      yerelDestek: sumRole("yerel_destek"),
      yerelTemsilcilik: sumRole("yerel_ulke_temsil_destek"),
      international: sumRole("int_yonetici_egitimci"),
    };
  })();
  const isletmeItems = inputs?.giderler?.isletme?.items || {};
  const OPERATING_KEYS = [
    "ulkeTemsilciligi",
    "genelYonetim",
    "kira",
    "emsalKira",
    "enerjiKantin",
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
    "sharedPayrollAllocation",
    "disaridanHizmet",
    "egitimAracGerec",
    "finansalGiderler",
    "egitimAmacliHizmet",
    "temsilAgirlama",
    "ulkeIciUlasim",
    "ulkeDisiUlasim",
    "vergilerResmiIslemler",
    "vergiler",
    "demirbasYatirim",
    "rutinBakim",
    "pazarlamaOrganizasyon",
    "reklamTanitim",
    "tahsilEdilemeyenGelirler",
  ];
  const HR_KEYS = [
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
  ];
  const operatingTotalUsd = OPERATING_KEYS.reduce(
    (sum, k) => sum + toUsd(safeNum(isletmeItems?.[k])),
    0
  );
  const hrTotalUsd = HR_KEYS.reduce((sum, k) => sum + toUsd(safeNum(isletmeItems?.[k])), 0);
  const hrTurkCost =
    toUsd(isletmeItems?.turkPersonelMaas) + toUsd(isletmeItems?.turkDestekPersonelMaas);
  const hrYerelCost =
    toUsd(isletmeItems?.yerelPersonelMaas) +
    toUsd(isletmeItems?.yerelDestekPersonelMaas) +
    toUsd(isletmeItems?.internationalPersonelMaas);
  const badDebtAmount = toUsd(safeNum(isletmeItems?.tahsilEdilemeyenGelirler));
  const uncollectableExpenseAmount = badDebtAmount;
  const isletmeGiderleriInputsOnlyUsd = Math.max(
    0,
    operatingTotalUsd - hrTotalUsd - badDebtAmount
  );


  const hrRows = [
    {
      item: "Turk Personel Yonetici ve Egitimci Sayisi",
      current: safeNum(ikMevcut?.turkPersonelYoneticiEgitimci),
      planned: plannedHeadcountsByRole?.turkPersonelYoneticiEgitimci,
    },
    {
      item: "Turk Personel Temsilcilik Personeli Sayisi",
      current: safeNum(ikMevcut?.turkPersonelTemsilcilik),
      planned: plannedHeadcountsByRole?.turkPersonelTemsilcilik,
    },
    {
      item: "Yerel Kadrolu Egitimci Personel Sayisi",
      current: safeNum(ikMevcut?.yerelKadroluEgitimci),
      planned: plannedHeadcountsByRole?.yerelKadroluEgitimci,
    },
    {
      item: "Yerel Ucretli (Vaka) Egitimci Personel Sayisi",
      current: safeNum(ikMevcut?.yerelUcretliVakaterEgitimci),
      planned: plannedHeadcountsByRole?.yerelUcretliVakaterEgitimci,
    },
    {
      item: "Yerel Destek Personel Sayisi",
      current: safeNum(ikMevcut?.yerelDestek),
      planned: plannedHeadcountsByRole?.yerelDestek,
    },
    {
      item: "Yerel Personel Temsilcilik Personeli Sayisi",
      current: safeNum(ikMevcut?.yerelTemsilcilik),
      planned: plannedHeadcountsByRole?.yerelTemsilcilik,
    },
    {
      item: "International Personel Sayisi",
      current: safeNum(ikMevcut?.international),
      planned: plannedHeadcountsByRole?.international,
    },
  ];



  // compute tuition totals from inputs as fallback basis for discount calculations
  const tuitionStudentsFromInputs = tuitionInputRows.length
    ? tuitionInputRows.reduce((sum, r) => sum + safeNum(r?.studentCount), 0)
    : 0;
  const grossTuitionFromInputs = tuitionInputRows.length
    ? tuitionInputRows.reduce((sum, r) => sum + safeNum(r?.studentCount) * toUsd(r?.unitFee), 0)
    : 0;
  const avgTuitionFromInputs =
    tuitionStudentsFromInputs > 0
      ? grossTuitionFromInputs / tuitionStudentsFromInputs
      : toUsd(inputs?.gelirler?.tuitionFeePerStudentYearly ?? 0);

  // categorize discount inputs into scholarships (first 7 defs) and others
  const scholarshipNameSet = new Set(SCHOLARSHIP_DEFS.map((d) => normalizeName(d.name)));
  const discountInputList = Array.isArray(inputs?.discounts) ? inputs.discounts : [];

  let scholarshipsSumInputs = 0;
  let discountsSumInputs = 0;

  for (const d of discountInputList) {
    const mode = String(d?.mode || "percent").trim().toLowerCase();
    const value = safeNum(d?.value);
    const pct = clamp(value, 0, 1);
    const fixedValueUsd = Math.max(0, toUsd(value));
    const hasCount = d?.studentCount != null && d?.studentCount !== "";
    const count = hasCount ? Math.max(0, Math.round(safeNum(d?.studentCount))) : null;
    const ratio = clamp(d?.ratio, 0, 1);
    const derived = tuitionStudentsFromInputs > 0 ? Math.round((count != null ? count : ratio * tuitionStudentsFromInputs)) : 0;
    const plannedCount =
      tuitionStudentsFromInputs > 0
        ? Math.min(derived, tuitionStudentsFromInputs)
        : count != null
          ? count
          : 0;

    const cost =
      mode === "fixed"
        ? plannedCount * fixedValueUsd
        : avgTuitionFromInputs * plannedCount * pct;

    const nameKey = normalizeName(d?.name || d?.key || "");
    if (scholarshipNameSet.has(nameKey)) scholarshipsSumInputs += cost;
    else discountsSumInputs += cost;
  }

  // allow report-provided values to override
  const scholarshipsAmount =
    numOrNull(reportExpenses?.scholarshipsTotal) != null
      ? safeNum(reportExpenses?.scholarshipsTotal)
      : scholarshipsSumInputs;
  const discountsAmount =
    numOrNull(reportExpenses?.discountsTotal) != null
      ? safeNum(reportExpenses?.discountsTotal)
      : discountsSumInputs;

  const expenseTotal =
    safeNum(operatingTotalUsd + serviceCosts.total + dormCosts.total + scholarshipsAmount + discountsAmount);




  const expenseRows = [
    {
      name: "IK Giderleri (Toplam)",
      amount:
        numOrNull(reportExpenses?.hrTotal) != null
          ? safeNum(reportExpenses?.hrTotal)
          : hrTotalUsd,
    },
    { name: "Isletme Giderleri (IK Haric)", amount: isletmeGiderleriInputsOnlyUsd },
    {
      name: "Egitim Disi Hizmet Maliyetleri",
      amount:
        numOrNull(reportExpenses?.nonTuitionServicesCostTotal) != null
          ? safeNum(reportExpenses?.nonTuitionServicesCostTotal)
          : serviceCosts.total,
    },
    { name: "Yurt Maliyetleri", amount: dormCosts.total },
    { name: "Indirimler", amount: discountsAmount },
    { name: "Burslar", amount: scholarshipsAmount },
  ].map((row) => ({
    name: row.name,
    amount: row.amount,
    ratio: safeDiv(row.amount, expenseTotal),
  }));

  const tuitionStudentsForDiscounts = tuitionInputRows.length
    ? tuitionInputRows.reduce((sum, row) => sum + safeNum(row?.studentCount), 0)
    : plannedStudents || currentStudents || 0;
  const grossTuitionForDiscounts = tuitionInputRows.length
    ? tuitionInputRows.reduce((sum, row) => sum + safeNum(row?.studentCount) * toUsd(row?.unitFee), 0)
    : tuitionStudentsForDiscounts * toUsd(inputs?.gelirler?.tuitionFeePerStudentYearly ?? 0);
  const avgTuitionForDiscounts =
    tuitionStudentsForDiscounts > 0 ? grossTuitionForDiscounts / tuitionStudentsForDiscounts : 0;
  const discountInputLookup = buildDiscountLookup(inputs?.discounts || []);

  const scholarships = SCHOLARSHIP_DEFS.map((def) =>
    buildDiscountPlanRowY1({
      name: def.name,
      key: def.key,
      tuitionStudents: tuitionStudentsForDiscounts,
      avgTuition: avgTuitionForDiscounts,
      toUsd,
      inputDiscounts: discountInputLookup,
      currentCount: clamp0(bursIndirimCounts?.[def.key]),
    })
  );
  const discounts = OTHER_DISCOUNT_DEFS.map((def) =>
    buildDiscountPlanRowY1({
      name: def.name,
      key: def.key,
      tuitionStudents: tuitionStudentsForDiscounts,
      avgTuition: avgTuitionForDiscounts,
      toUsd,
      inputDiscounts: discountInputLookup,
      currentCount: clamp0(bursIndirimCounts?.[def.key]),
    })
  );

  const plannedPerf = prevReport?.years?.y1 || prevReport || {};
  const plannedStudentsPerf = numOrNull(plannedPerf?.students?.totalStudents);
  const plannedIncome = numOrNull(plannedPerf?.income?.netIncome);
  const plannedExpenses = numOrNull(plannedPerf?.expenses?.totalExpenses);
  const plannedDiscounts = numOrNull(plannedPerf?.income?.totalDiscounts);
  const plannedProfit =
    plannedIncome != null && plannedExpenses != null ? plannedIncome - plannedExpenses : null;

  const actualStudents = numOrNull(performans?.ogrenciSayisi);
  const actualIncome = toUsdPerf(performans?.gelirler);
  const actualExpenses = toUsdPerf(performans?.giderler);
  const actualDiscounts = toUsdPerf(performans?.bursVeIndirimler);
  const actualProfitFromInputs =
    actualIncome != null && actualExpenses != null ? actualIncome - actualExpenses : null;
  const storedProfit = numOrNull(performans?.karZarar);
  const actualProfit =
    actualProfitFromInputs != null
      ? actualProfitFromInputs
      : storedProfit != null
        ? toUsdPerf(storedProfit)
        : null;

  const calcVariance = (planned, actual) =>
    planned != null && actual != null && Number(planned) !== 0
      ? (actual - planned) / planned
      : null;

  const performanceRows = [
    {
      metric: "Ogrenci Sayisi",
      planned: plannedStudentsPerf,
      actual: actualStudents,
    },
    {
      metric: "Gelirler",
      planned: plannedIncome,
      actual: actualIncome,
    },
    {
      metric: "Giderler",
      planned: plannedExpenses,
      actual: actualExpenses,
    },
    {
      metric: "Kar Zarar",
      planned: plannedProfit,
      actual: actualProfit,
    },
    {
      metric: "Burs ve Indirimler",
      planned: plannedDiscounts,
      actual: actualDiscounts,
    },
  ].map((row) => ({
    ...row,
    variance: calcVariance(row.planned, row.actual),
  }));

  const programTypeSuffix = resolvedProgramType === "international" ? "INT." : "YEREL";
  const competitorRows = ["okulOncesi", "ilkokul", "ortaokul", "lise"]
    .filter((key) => kademeConfig?.[key]?.enabled !== false)
    .map((key) => {
      const source = rakipAnalizi?.[key] || {};
      const baseLabel =
        key === "okulOncesi"
          ? "Okul Oncesi"
          : key === "ilkokul"
            ? "Ilkokul"
            : key === "ortaokul"
              ? "Ortaokul"
              : "Lise";
      const labelWithRange = formatKademeLabel(baseLabel, kademeConfig, key);
      const level = key === "okulOncesi" ? labelWithRange : `${labelWithRange} - ${programTypeSuffix}`;
      return {
        level,
        a: toUsd(source?.a),
        b: toUsd(source?.b),
        c: toUsd(source?.c),
      };
    });

  const scholarshipsTotalCost = scholarships.reduce((sum, r) => sum + safeNum(r.cost), 0);
  const discountsTotalCost = discounts.reduce((sum, r) => sum + safeNum(r.cost), 0);
  const scholarshipDiscountCostTotal = scholarshipsTotalCost + discountsTotalCost;
  const activityRevenueY1 = (() => {
    const activityGross = safeNum(reportIncome?.activityGross);
    if (activityGross > 0) return activityGross;
    return reportGrossTuition + nonEducationTotal + dormTotal;
  })();
  const parentStudentRevenue = activityRevenueY1;
  const sumPlanned = (rows) => rows.reduce((sum, r) => sum + safeNum(r.planned), 0);
  const calcWeightedAvgRate = (rows, avgTuition) => {
    const totalPlanned = sumPlanned(rows);
    if (totalPlanned <= 0) return null;
    const weighted = rows.reduce((sum, r) => {
      const planned = safeNum(r.planned);
      if (planned <= 0) return sum;
      let rate = numOrNull(r.rate);
      if (rate == null) {
        if (!Number.isFinite(avgTuition) || avgTuition <= 0) return sum;
        const cost = safeNum(r.cost);
        rate = cost / (planned * avgTuition);
      }
      return sum + planned * clamp(rate, 0, 1);
    }, 0);
    return weighted / totalPlanned;
  };
  const plannedStudentsTotal = plannedStudents;
  const targetStudentsForCost =
    plannedStudentsTotal > 0 ? plannedStudentsTotal : tuitionStudentsForDiscounts;
  const buildGroupAnalysis = (rows, totalCost) => {
    const plannedGroupStudents = sumPlanned(rows);
    const perTargetStudent =
      targetStudentsForCost > 0 ? totalCost / targetStudentsForCost : null;
    const studentShare =
      capacityYear1 > 0 ? plannedGroupStudents / capacityYear1 : null;
    const revenueShare =
      parentStudentRevenue > 0 ? (totalCost > 0 ? totalCost / parentStudentRevenue : 0) : null;
    const weightedAvgRate = calcWeightedAvgRate(rows, avgTuitionForDiscounts);
    return {
      perTargetStudent,
      studentShare,
      revenueShare,
      weightedAvgRate,
      plannedStudents: plannedGroupStudents,
      totalCost,
    };
  };
  const discountAnalysis = {
    targetStudents: targetStudentsForCost,
    parentStudentRevenue,
    scholarships: buildGroupAnalysis(scholarships, scholarshipsTotalCost),
    discounts: buildGroupAnalysis(discounts, discountsTotalCost),
  };
  const plannedRaiseAvg = (() => {
    const rates = tuitionRows.map((r) => r.raisePct).filter((v) => Number.isFinite(v));
    return rates.length ? rates.reduce((sum, v) => sum + v, 0) / rates.length : null;
  })();
  // Rakip Kurumlarin Analizi (VAR / YOK)
  // IMPORTANT: Reuse the exact same input paths/shape as the frontend
  // (frontend/src/utils/buildDetailedReportModel.js)
  // inputs.temelBilgiler.rakipAnalizi.{okulOncesi|ilkokul|ortaokul|lise}.{a|b|c}
  // Missing/null/empty values are treated as 0. Only numbers > 0 trigger VAR.
  const competitorHasData = ["okulOncesi", "ilkokul", "ortaokul", "lise"].some((kademeKey) =>
    ["a", "b", "c"].some((abcKey) => {
      const v = Number(temel?.rakipAnalizi?.[kademeKey]?.[abcKey]);
      return Number.isFinite(v) && v > 0;
    })
  );
  const baseYear = parseAcademicStartYear(scenario?.academic_year);
  const inflationYears = (() => {
    const ref = Number.isFinite(baseYear) ? baseYear : 2026;
    const yearList = [ref - 3, ref - 2, ref - 1];
    const fallbackKeys = ["y2023", "y2024", "y2025"];
    return yearList.map((year, idx) => {
      const exact = numOrNull(inflation?.[`y${year}`]);
      const fallback = numOrNull(inflation?.[fallbackKeys[idx]]);
      return { year, value: exact != null ? exact : fallback };
    });
  })();
  const inflationHistory = {
    y2023: numOrNull(inflation?.y2023),
    y2024: numOrNull(inflation?.y2024),
    y2025: numOrNull(inflation?.y2025),
  };
  const rawCurrentSeasonAvgFee = numOrNull(inflation?.currentSeasonAvgFee);
  const currentSeasonAvgFeeUsd = rawCurrentSeasonAvgFee == null ? null : toUsd(rawCurrentSeasonAvgFee);
  const rawFinalFee = numOrNull(inflation?.finalFee);
  const finalFeeUsd =
    rawFinalFee != null ? toUsd(rawFinalFee) : Number.isFinite(averageRow?.total) ? averageRow.total : null;
  const uncollectableRevenuePct = numOrNull(
    inflation?.uncollectableRevenuePct ?? inflation?.badDebtPct ?? inflation?.tahsilEdilemeyenGelirPct
  );

  const revenueTotal =
    grossIncomeBase;
  const netTotal = revenueTotal - expenseTotal;
  const margin = safeDiv(netTotal, revenueTotal);
  const perStudentCost = plannedStudents > 0 ? safeDiv(expenseTotal, plannedStudents) : null;

  const parameters = [
    {
      no: "1",
      desc: "Planlanan Donem Kapasite Kullanim Orani (%)",
      value: plannedUtilization,
      valueType: "percent",
    },
    {
      no: "2",
      desc: "Insan Kaynaklari Planlamasi (Turk + Yerel + International)",
      value: Object.values(plannedHeadcountsByRole).reduce((sum, v) => sum + safeNum(v), 0),
      valueType: "number",
    },
    { no: "3", desc: "Gelir Planlamasi", value: revenueTotal, valueType: "currency" },
    { no: "4", desc: "Gider Planlamasi", value: expenseTotal, valueType: "currency" },
    { no: "", desc: "Gelir - Gider Farki", value: netTotal, valueType: "currency" },
    {
      no: "5",
      desc: "Tahsil Edilemeyecek Gelirler (Onceki Donemin Tahsil Edilemeyen yuzdelik rakami)",
      value: badDebtAmount,
      valueType: "currency",
    },
    {
      no: "6",
      desc: "Giderlerin Sapma Yuzdeligi (%... Olarak Hesaplanabilir)",
      value: inflation?.expenseDeviationPct,
      valueType: "percent",
    },
    {
      no: "7",
      desc: "Burs ve Indirim Giderleri (Fizibilite-G71)",
      value: scholarshipDiscountCostTotal,
      valueType: "currency",
    },
    {
      no: "",
      desc: "Ogrenci Basina Maliyet (Tum Giderler (Parametre 4 / Planlanan Ogrenci Sayisi))",
      value: perStudentCost,
      valueType: "currency",
    },
    {
      no: "8",
      desc: "Rakip Kurumlarin Analizi (VAR / YOK)",
      value: competitorHasData ? "VAR" : "YOK",
    },
    {
      no: "",
      desc: "Planlanan Donem Egitim Ucretleri Artis Orani",
      value: plannedRaiseAvg,
      valueType: "percent",
    },
    {
      no: "9",
      desc:
        "Yerel Mevzuatta uygunluk (yasal azami artis, Protokol Sinirliliklari, Son 3 yilin resmi enflasyon orn.)",
      value: null,
    },
    { no: "10", desc: "Mevcut Egitim Sezonu Ucreti (ortalama)", value: currentSeasonAvgFeeUsd, valueType: "currency" },
    { no: "", desc: "Nihai Ucret", value: finalFeeUsd, valueType: "currency" },
  ];

  const detailedExpenses = (() => {
    const rows = [
      { name: "IK Giderleri (Turk Personel)", amount: hrTurkCost, targetPct: 0.15 },
      { name: "IK (Yerel Personel)", amount: hrYerelCost, targetPct: 0.45 },
      {
        name: "Isletme Giderleri",
        amount: isletmeGiderleriInputsOnlyUsd,
      },
      { name: "Yemek (Ogrenci Yemegi)", amount: serviceCosts.yemek },
      { name: "Uniforma", amount: serviceCosts.uniforma },
      { name: "Kitap- Kirtasiye", amount: serviceCosts.kitapKirtasiye },
      { name: "Ogrenci Servisi", amount: serviceCosts.ulasimServis },
      { name: "Yurt Giderleri", amount: dormCosts.total },
      { name: "Indirimler", amount: discountsTotalCost, targetPct: 0.08 },
      { name: "Burslar", amount: scholarshipsTotalCost, targetPct: 0.05 },
      { name: "Tahsil Edilemeyecek Gelirler", amount: badDebtAmount, targetPct: 0.02 },
    ];
    const rowsSum = rows.reduce((sum, r) => (Number.isFinite(Number(r.amount)) ? sum + Number(r.amount) : sum), 0);
    const total = rowsSum;
    return rows.map((r) => ({
      ...r,
      ratio: Number.isFinite(Number(r.amount)) && total ? safeDiv(r.amount, total) : null,
    }));
  })();

  const localCurrencyCode =
    currencyMeta?.local_currency_code || prevCurrencyMeta?.local_currency_code || null;
  const performanceMeta = {
    realized_fx_usd_to_local: perfRealizedFxValid ? perfRealizedFx : null,
    planned_fx_usd_to_local: plannedFxForLocal > 0 ? plannedFxForLocal : null,
    local_currency_code: localCurrencyCode,
  };

  return {
    currencyCode: "USD",
    headerLabel,
    countryName,
    schoolName,
    principalName,
    reporterName,
    temsilciName,
    academicStartYear: baseYear,
    programType: programTypeLabel,
    periodStartDate: okulEgitim?.egitimBaslamaTarihi || "",
    schoolCapacity,
    currentStudents,
    compulsoryEducation: okulEgitim?.zorunluEgitimDonemleri || "",
    lessonDuration: okulEgitim?.birDersSuresiDakika ?? null,
    dailyLessonHours: okulEgitim?.gunlukDersSaati ?? null,
    weeklyLessonHours: okulEgitim?.haftalikDersSaatiToplam ?? null,
    shiftSystem,
    teacherWeeklyHoursAvg: okulEgitim?.ogretmenHaftalikDersOrt ?? null,
    classroomUtilization,
    transitionExamInfo: okulEgitim?.gecisSinaviBilgisi || "",
    tuitionTable,
    parameters,
    capacity: {
      buildingCapacity: schoolCapacity,
      currentStudents,
      plannedStudents,
      plannedUtilization,
      plannedBranches,
      totalBranches: totalBranchesCurrent,
      usedBranches: totalBranchesCurrent,
      avgStudentsPerClass: safeDiv(currentStudents, totalBranchesCurrent),
      avgStudentsPerClassPlanned,
    },
    hr: hrRows,
    revenues: revenueRows,
    revenuesMeta: {
      nonEducationBreakdown,
      otherIncomeBreakdown,
    },
    expenses: expenseRows,
    scholarships,
    discounts,
    discountAnalysis,
    performance: performanceRows,
    performanceMeta,
    competitors: competitorRows,
    revenuesDetailed,
    revenuesDetailedTotal,
    revenueTotal,
    expenseTotal,
    netTotal,
    avgTuition,
    margin,
    parametersMeta: {
      expenseDeviationPct: inflation?.expenseDeviationPct,
      currentSeasonAvgFeeUsd,
      perStudentCost,
      plannedRaiseAvg,
      scholarshipsAndDiscountsTotal: scholarshipDiscountCostTotal,
      uncollectableRevenuePct,
      uncollectableExpenseAmount,
      inflationHistory,
      inflationYears,
      inflationBaseYear: baseYear,
      competitorStatus: competitorHasData ? "VAR" : "YOK",
      finalFeeUsd,
      // detailed expense view helpers
      serviceCosts,
      dormCosts,
      hrTurkCost,
      hrYerelCost,
      detailedExpenses,
      detailedExpenseTotal: detailedExpenses.reduce(
        (sum, r) => (Number.isFinite(Number(r.amount)) ? sum + Number(r.amount) : sum),
        0
      ),
      discountAnalysis,
    },
  };
}

module.exports = {
  buildDetailedReportModel,
};
