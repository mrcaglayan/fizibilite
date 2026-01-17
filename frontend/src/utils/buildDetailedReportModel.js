import { getProgramType, isKademeKeyVisible } from "./programType";
import { normalizeKademeConfig } from "./kademe";

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

function buildDiscountRow({
  name,
  tuitionStudents,
  grossTuition,
  toUsd,
  inputDiscounts,
  prevDiscounts,
  currentCount,
}) {
  const normalized = normalizeName(name);
  const entry = inputDiscounts.get(normalized);
  const ratio = entry ? clamp0(entry.ratio) : 0;
  let plannedRatio = 0;
  let plannedCostUsd = 0;

  if (entry) {
    const mode = String(entry.mode || "percent").trim().toLowerCase();
    if (mode === "fixed") {
      plannedRatio = ratio;
      plannedCostUsd = tuitionStudents * ratio * toUsd(entry.value);
    } else {
      const pct = clamp0(entry.value);
      plannedRatio = ratio * pct;
      plannedCostUsd = grossTuition * plannedRatio;
    }
  }

  const prev = prevDiscounts.get(normalized);
  return {
    name,
    planned: plannedRatio,
    cost: plannedCostUsd,
    cur: currentCount ?? null,
    currentCost: prev?.amount ?? null,
  };
}

export function buildDetailedReportModel({
  school,
  scenario,
  inputs,
  report,
  prevReport,
  programType,
} = {}) {
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

  const headerParts = [
    school?.name || school?.school_name || "Okul",
    scenario?.name || "",
    scenario?.academic_year || "",
  ].filter(Boolean);
  const headerLabel = headerParts.join(" > ");

  const temel = inputs?.temelBilgiler || {};
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
  const reportTuitionStudents = safeNum(reportIncome?.tuitionStudents) || totalTuitionStudents;
  const nonEducationTotal =
    safeNum(reportIncome?.nonEducationFeesTotal) ||
    nonEducationRows.reduce((sum, row) => sum + toUsd(row?.unitFee) * safeNum(row?.studentCount), 0);
  const dormTotal =
    safeNum(reportIncome?.dormitoryRevenuesTotal) ||
    dormRows.reduce((sum, row) => sum + toUsd(row?.unitFee) * safeNum(row?.studentCount), 0);
  const otherIncomeFromInputs =
    otherIncomeRows.reduce((sum, row) => sum + toUsd(row?.amount), 0) +
    toUsd(inputs?.gelirler?.governmentIncentives ?? 0);
  const otherIncomeTotal =
    safeNum(reportIncome?.otherIncomeTotal) ||
    otherIncomeFromInputs;
  const grossIncomeBase =
    safeNum(reportIncome?.totalGrossIncome) ||
    reportGrossTuition + nonEducationTotal + dormTotal + otherIncomeTotal;

  const revenueRows = [
    { name: "Egitim Ucreti", amount: reportGrossTuition },
    { name: "Egitim Disi Ucretler", amount: nonEducationTotal },
    { name: "Yurt Gelirleri", amount: dormTotal },
    { name: "Diger Gelirler", amount: otherIncomeTotal },
  ].map((row) => ({
    name: row.name,
    amount: row.amount,
    ratio: safeDiv(row.amount, grossIncomeBase),
  }));

  const expenseRows = [
    { name: "IK Giderleri (Toplam)", amount: safeNum(reportExpenses?.hrTotal) },
    {
      name: "Isletme Giderleri (IK Haric)",
      amount: Math.max(0, safeNum(reportExpenses?.operatingExpensesTotal) - safeNum(reportExpenses?.hrTotal)),
    },
    { name: "Egitim Disi Hizmet Maliyetleri", amount: safeNum(reportExpenses?.nonTuitionServicesCostTotal) },
    { name: "Yurt Maliyetleri", amount: safeNum(reportExpenses?.dormitoryCostTotal) },
  ].map((row) => ({
    name: row.name,
    amount: row.amount,
    ratio: safeDiv(row.amount, safeNum(reportExpenses?.totalExpenses)),
  }));

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

  const tuitionStudentsForDiscounts =
    reportTuitionStudents || totalTuitionStudents || currentStudents || 0;
  const grossTuitionForDiscount = reportGrossTuition || totalTuitionEdu;
  const discountInputLookup = buildDiscountLookup(inputs?.discounts || []);
  const prevDiscountLookup = buildDiscountLookup(prevReport?.years?.y1?.income?.discountsDetail || []);

  const scholarships = SCHOLARSHIP_DEFS.map((def) =>
    buildDiscountRow({
      name: def.name,
      tuitionStudents: tuitionStudentsForDiscounts,
      grossTuition: grossTuitionForDiscount,
      toUsd,
      inputDiscounts: discountInputLookup,
      prevDiscounts: prevDiscountLookup,
      currentCount: clamp0(bursIndirimCounts?.[def.key]),
    })
  );
  const discounts = OTHER_DISCOUNT_DEFS.map((def) =>
    buildDiscountRow({
      name: def.name,
      tuitionStudents: tuitionStudentsForDiscounts,
      grossTuition: grossTuitionForDiscount,
      toUsd,
      inputDiscounts: discountInputLookup,
      prevDiscounts: prevDiscountLookup,
      currentCount: clamp0(bursIndirimCounts?.[def.key]),
    })
  );

  const plannedPerf = prevReport?.years?.y1 || {};
  const actualPerf = {
    ogrenciSayisi: safeNum(performans?.ogrenciSayisi),
    gelirler: toUsd(performans?.gelirler),
    giderler: toUsd(performans?.giderler),
    karZararOrani: safeNum(performans?.karZararOrani),
    bursVeIndirimler: toUsd(performans?.bursVeIndirimler),
  };

  const performanceRows = [
    {
      metric: "Ogrenci Sayisi",
      planned: safeNum(plannedPerf?.students?.totalStudents),
      actual: actualPerf.ogrenciSayisi,
    },
    {
      metric: "Gelirler",
      planned: safeNum(plannedPerf?.income?.netIncome),
      actual: actualPerf.gelirler,
    },
    {
      metric: "Giderler",
      planned: safeNum(plannedPerf?.expenses?.totalExpenses),
      actual: actualPerf.giderler,
    },
    {
      metric: "Kar Zarar Orani",
      planned: safeNum(plannedPerf?.kpis?.profitMargin),
      actual: actualPerf.karZararOrani,
    },
    {
      metric: "Burs ve Indirimler",
      planned: safeNum(plannedPerf?.income?.totalDiscounts),
      actual: actualPerf.bursVeIndirimler,
    },
  ].map((row) => ({
    ...row,
    variance: row.planned != null && row.actual != null ? row.actual - row.planned : null,
  }));

  const competitorRows = ["okulOncesi", "ilkokul", "ortaokul", "lise"].map((key) => {
    const source = rakipAnalizi?.[key] || {};
    return {
      level:
        key === "okulOncesi"
          ? "Okul Oncesi"
          : key === "ilkokul"
          ? "Ilkokul"
          : key === "ortaokul"
          ? "Ortaokul"
          : "Lise",
      a: toUsd(source?.a),
      b: toUsd(source?.b),
      c: toUsd(source?.c),
    };
  });

  const revenueTotal =
    safeNum(reportIncome?.netIncome) ||
    safeNum(reportIncome?.netActivityIncome) ||
    grossIncomeBase;
  const expenseTotal = safeNum(reportExpenses?.totalExpenses);
  const netTotal = revenueTotal - expenseTotal;
  const margin = safeDiv(netTotal, revenueTotal);

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
  ];

  return {
    currencyCode: "USD",
    headerLabel,
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
    expenses: expenseRows,
    scholarships,
    discounts,
    performance: performanceRows,
    competitors: competitorRows,
    revenueTotal,
    expenseTotal,
    netTotal,
    avgTuition,
    margin,
    parametersMeta: {
      expenseDeviationPct: inflation?.expenseDeviationPct,
      currentSeasonAvgFeeUsd: toUsd(inflation?.currentSeasonAvgFee),
    },
  };
}
