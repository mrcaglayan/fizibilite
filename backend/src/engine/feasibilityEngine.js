//backend/src/engine/feasibilityEngine.js

const DEFAULT_GRADE_KEYS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const DEFAULT_NORM_MAX_HOURS = 24;

const isFiniteNumber = (v) => Number.isFinite(v) && !Number.isNaN(v);
const safeNum = (v) => (isFiniteNumber(Number(v)) ? Number(v) : 0);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const GRADE_INDEX = new Map(DEFAULT_GRADE_KEYS.map((g, i) => [g, i]));

/**
 * Kademe configuration (same defaults as backend routes/scenarios.js)
 * Shape: { okulOncesi:{enabled,from,to}, ilkokul:{...}, ortaokul:{...}, lise:{...} }
 */
function normalizeKademeConfig(input) {
  const base = {
    okulOncesi: { enabled: true, from: "KG", to: "KG" },
    ilkokul: { enabled: true, from: "1", to: "5" },
    ortaokul: { enabled: true, from: "6", to: "9" },
    lise: { enabled: true, from: "10", to: "12" },
  };
  const cfg = input && typeof input === "object" ? input : {};
  const out = {};
  for (const key of Object.keys(base)) {
    const row = cfg[key] && typeof cfg[key] === "object" ? cfg[key] : {};
    out[key] = {
      enabled: row.enabled !== false,
      from: String(row.from ?? base[key].from),
      to: String(row.to ?? base[key].to),
    };
  }
  return out;
}

function summarizeGradesByKademe(grades, kademeConfig) {
  const cfg = normalizeKademeConfig(kademeConfig);
  const { perGrade } = computeStudentsFromGrades(grades || [], DEFAULT_GRADE_KEYS);
  const byGrade = new Map(perGrade.map((r) => [String(r.grade), safeNum(r.gradeStudents)]));

  const sumRange = (from, to) => {
    const f = String(from ?? "");
    const t = String(to ?? "");
    const i1 = GRADE_INDEX.get(f);
    const i2 = GRADE_INDEX.get(t);
    if (i1 == null || i2 == null) return 0;
    const a = Math.min(i1, i2);
    const b = Math.max(i1, i2);
    let s = 0;
    for (let i = a; i <= b; i++) {
      const g = DEFAULT_GRADE_KEYS[i];
      s += safeNum(byGrade.get(g));
    }
    return s;
  };

  const okulOncesi = cfg.okulOncesi.enabled ? sumRange(cfg.okulOncesi.from, cfg.okulOncesi.to) : 0;
  const ilkokul = cfg.ilkokul.enabled ? sumRange(cfg.ilkokul.from, cfg.ilkokul.to) : 0;
  const ortaokul = cfg.ortaokul.enabled ? sumRange(cfg.ortaokul.from, cfg.ortaokul.to) : 0;
  const lise = cfg.lise.enabled ? sumRange(cfg.lise.from, cfg.lise.to) : 0;

  return {
    okulOncesi,
    ilkokul,
    ortaokul,
    lise,
    total: okulOncesi + ilkokul + ortaokul + lise,
  };
}


const round2 = (v) => {
  if (!isFiniteNumber(v)) return null;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

const safeDiv = (a, b) => {
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || b === 0) return null;
  return a / b;
};

function computeStudentsFromGrades(gradeInputs, gradeKeys) {
  const keys = Array.isArray(gradeKeys) && gradeKeys.length ? gradeKeys : DEFAULT_GRADE_KEYS;
  const perGradeMap = new Map(keys.map((g) => [g, { grade: g, branchCount: 0, studentsPerBranch: 0 }]));

  (gradeInputs || []).forEach((row) => {
    if (!row) return;
    const g = String(row.grade);
    if (!perGradeMap.has(g)) return;
    perGradeMap.set(g, {
      grade: g,
      branchCount: Number(row.branchCount ?? 0),
      studentsPerBranch: Number(row.studentsPerBranch ?? 0),
    });
  });

  const perGrade = [];
  let totalStudents = 0;

  for (const g of keys) {
    const r = perGradeMap.get(g);
    const branchCount = isFiniteNumber(r.branchCount) ? r.branchCount : 0;
    // NOTE: In this project, studentsPerBranch now stores TOTAL students for the grade.
    // (Classes are not assumed to be equal size.)
    const studentsPerBranch = isFiniteNumber(r.studentsPerBranch) ? r.studentsPerBranch : 0;
    const gradeStudents = studentsPerBranch;

    perGrade.push({ grade: g, branchCount, studentsPerBranch, gradeStudents });
    totalStudents += gradeStudents;
  }

  return { perGrade, totalStudents, gradeKeys: keys };
}

function selectGradesForYear(input, yearKey) {
  const yearsRaw = input?.gradesYears && typeof input.gradesYears === "object" ? input.gradesYears : null;
  const years = yearsRaw?.years && typeof yearsRaw.years === "object" ? yearsRaw.years : yearsRaw;
  if (years) {
    const list = years?.[yearKey];
    if (Array.isArray(list)) return list;
    if (Array.isArray(years?.y1)) return years.y1;
  }
  if (Array.isArray(input?.grades)) return input.grades;
  return [];
}

function calculateNormTeachers({ gradeBranches, curriculumWeeklyHours, teacherWeeklyMaxHours }) {
  const errors = [];
  const warnings = [];

  const maxHours = Number(teacherWeeklyMaxHours);
  if (!isFiniteNumber(maxHours) || maxHours <= 0) errors.push("teacherWeeklyMaxHours must be a positive number.");
  if (!curriculumWeeklyHours || typeof curriculumWeeklyHours !== "object")
    errors.push("curriculumWeeklyHours is required (object).");

  if (errors.length) {
    return {
      totalTeachingHours: null,
      requiredTeachers: null,
      breakdownByGrade: [],
      breakdownBySubject: [],
      errors,
      warnings,
    };
  }

  let totalTeachingHours = 0;
  const breakdownByGrade = [];
  const subjectTotals = new Map();

  for (const row of gradeBranches || []) {
    const grade = String(row.grade);
    const branchCount = safeNum(row.branchCount);
    const gradeCurr = curriculumWeeklyHours[grade] || {};
    let gradeHours = 0;

    for (const [subject, hoursPerClass] of Object.entries(gradeCurr)) {
      const h = safeNum(hoursPerClass);
      if (!isFiniteNumber(h) || h < 0) continue;
      const subjectHours = h * branchCount;
      gradeHours += subjectHours;
      subjectTotals.set(subject, (subjectTotals.get(subject) || 0) + subjectHours);
    }

    breakdownByGrade.push({ grade, branchCount, weeklyTeachingHours: gradeHours });
    totalTeachingHours += gradeHours;
  }

  const requiredTeachers = Math.ceil(totalTeachingHours / maxHours);

  const breakdownBySubject = Array.from(subjectTotals.entries())
    .map(([subject, weeklyTeachingHours]) => ({ subject, weeklyTeachingHours }))
    .sort((a, b) => b.weeklyTeachingHours - a.weeklyTeachingHours);

  return { totalTeachingHours, requiredTeachers, breakdownByGrade, breakdownBySubject, errors, warnings };
}

// --- Gelirler (Excel "Gelirler" – tek yıl hesap fonksiyonu) ---
function computeIncomeFromGelirler({ totalStudents, gelirler }) {
  const inc = gelirler || {};

  const tuitionRows = Array.isArray(inc?.tuition?.rows) ? inc.tuition.rows : [];
  const nonEdRows = Array.isArray(inc?.nonEducationFees?.rows) ? inc.nonEducationFees.rows : [];
  const dormRows = Array.isArray(inc?.dormitory?.rows) ? inc.dormitory.rows : [];
  const otherRows = Array.isArray(inc?.otherInstitutionIncome?.rows) ? inc.otherInstitutionIncome.rows : [];
  const govt = safeNum(inc.governmentIncentives);

  const hasNewShape = Boolean(
    inc &&
    (inc.tuition ||
      inc.nonEducationFees ||
      inc.dormitory ||
      inc.otherInstitutionIncome ||
      inc.governmentIncentives != null)
  );

  const sumRows = (rows, a, b) => (rows || []).reduce((s, r) => s + safeNum(r?.[a]) * safeNum(r?.[b]), 0);
  const sumStudents = (rows, a) => (rows || []).reduce((s, r) => s + safeNum(r?.[a]), 0);
  const sumAmounts = (rows, a) => (rows || []).reduce((s, r) => s + safeNum(r?.[a]), 0);

  // Tuition
  let tuitionStudents = 0;
  let grossTuition = 0;

  if (tuitionRows.length) {
    tuitionStudents = sumStudents(tuitionRows, "studentCount");
    grossTuition = sumRows(tuitionRows, "studentCount", "unitFee");
  } else {
    const legacyTuitionFee = safeNum(inc.tuitionFeePerStudentYearly);
    tuitionStudents = safeNum(totalStudents);
    grossTuition = tuitionStudents * legacyTuitionFee;
  }

  if (tuitionStudents <= 0) tuitionStudents = safeNum(totalStudents);
  const tuitionAvgFee = tuitionStudents > 0 ? grossTuition / tuitionStudents : 0;

  // Activity revenues
  let nonEducationFeesTotal = 0;
  let dormitoryRevenuesTotal = 0;

  if (nonEdRows.length) nonEducationFeesTotal = sumRows(nonEdRows, "studentCount", "unitFee");
  else nonEducationFeesTotal = safeNum(totalStudents) * safeNum(inc.lunchFeePerStudentYearly); // legacy only has "lunch"

  if (dormRows.length) dormitoryRevenuesTotal = sumRows(dormRows, "studentCount", "unitFee");
  else dormitoryRevenuesTotal = safeNum(totalStudents) * safeNum(inc.dormitoryFeePerStudentYearly);

  // Legacy "otherFeePerStudentYearly"
  const legacyOther = safeNum(totalStudents) * safeNum(inc.otherFeePerStudentYearly);

  // Other institution incomes
  let otherInstitutionIncomeTotal = 0;
  if (otherRows.length) otherInstitutionIncomeTotal = sumAmounts(otherRows, "amount");
  else otherInstitutionIncomeTotal = hasNewShape ? 0 : 0;

  const otherIncomeTotal = otherInstitutionIncomeTotal + govt;

  // Excel uyumu:
  // - Yeni modelde net ciro = faaliyet gelirleri (tuition + öğrenci ücretleri + yurt)
  // - Eski modelde tüm gelirler kişi başı tek yerdeydi; o durumda legacyOther'ı faaliyet içine dahil ediyoruz.
  const activityGross =
    grossTuition +
    nonEducationFeesTotal +
    dormitoryRevenuesTotal +
    (tuitionRows.length || nonEdRows.length || dormRows.length ? 0 : legacyOther);

  const totalGrossIncome = activityGross + (tuitionRows.length || nonEdRows.length || dormRows.length ? otherIncomeTotal : 0);

  return {
    tuitionRows,
    nonEdRows,
    dormRows,
    otherRows,
    tuitionStudents,
    tuitionAvgFee,
    grossTuition,
    nonEducationFeesTotal,
    dormitoryRevenuesTotal,
    activityGross,
    otherInstitutionIncomeTotal: tuitionRows.length || nonEdRows.length || dormRows.length ? otherInstitutionIncomeTotal : 0,
    governmentIncentives: tuitionRows.length || nonEdRows.length || dormRows.length ? govt : 0,
    otherIncomeTotal: tuitionRows.length || nonEdRows.length || dormRows.length ? otherIncomeTotal : 0,
    totalGrossIncome,
  };
}

// Weighted average discount (Excel mantığı) – discounts apply on tuition only
function calculateDiscounts({ tuitionStudents, grossTuition, tuitionAvgFee, discountCategories }) {
  const errors = [];
  const warnings = [];

  const students = safeNum(tuitionStudents);
  const gross = safeNum(grossTuition);
  const tuitionFee = safeNum(tuitionAvgFee);

  if (students < 0) errors.push("tuitionStudents must be >= 0.");
  if (gross < 0) errors.push("grossTuition must be >= 0.");

  if (errors.length) return { totalDiscounts: null, details: [], capApplied: null, errors, warnings };

  const details = [];
  let avgDiscountRate = 0;

  for (const d of discountCategories || []) {
    if (!d) continue;
    const name = String(d.name ?? "Discount");
    const mode = String(d.mode ?? "percent");
    const value = safeNum(d.value);
    const ratio = safeNum(d.ratio);

    if (!isFiniteNumber(value) || value < 0) {
      warnings.push(`Discount "${name}" has invalid value; ignored.`);
      continue;
    }
    if (!isFiniteNumber(ratio) || ratio < 0) {
      warnings.push(`Discount "${name}" has invalid ratio; ignored.`);
      continue;
    }

    const r = clamp(ratio, 0, 1);

    let effectiveRatePart = 0;
    let amount = 0;

    if (mode === "fixed") {
      // fixed = kişi başı indirim tutarı
      if (tuitionFee > 0) effectiveRatePart = (r * value) / tuitionFee;
      amount = students * r * value;
    } else {
      const pct = clamp(value, 0, 1);
      effectiveRatePart = r * pct;
      amount = gross * effectiveRatePart;
    }

    details.push({ name, mode, value, ratio: r, amount, effectiveRatePart });
    avgDiscountRate += effectiveRatePart;
  }

  const cappedAvgRate = clamp(avgDiscountRate, 0, 1);
  const totalDiscounts = Math.min(gross * cappedAvgRate, gross);
  const capApplied = avgDiscountRate > 1 ? { originalAvgRate: avgDiscountRate, cappedAvgRate } : null;

  return { totalDiscounts, details, capApplied, errors, warnings };
}

// --- Giderler (Excel "Giderler" – tek yıl hesap fonksiyonu) ---
function calculateTotalExpensesFromExcelGiderler(giderler) {
  const errors = [];
  const warnings = [];

  const checkNonNeg = (v, label) => {
    if (!isFiniteNumber(v)) errors.push(`${label} must be a number.`);
    else if (v < 0) warnings.push(`${label} is negative; treated as 0 in totals.`);
  };

  const isletme = giderler?.isletme?.items || {};
  const ogrenimDisi = giderler?.ogrenimDisi?.items || {};
  const yurt = giderler?.yurt?.items || {};

  const operatingKeys = [
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

  let operatingTotal = 0;
  for (const k of operatingKeys) {
    const vRaw = safeNum(isletme[k]);
    checkNonNeg(vRaw, `giderler.isletme.items.${k}`);
    operatingTotal += Math.max(0, vRaw);
  }

  const hrKeys = [
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
  ];
  let hrTotal = 0;
  for (const k of hrKeys) hrTotal += Math.max(0, safeNum(isletme[k]));

  const serviceKeys = ["yemek", "uniforma", "kitapKirtasiye", "ulasimServis"];
  let servicesTotal = 0;
  for (const k of serviceKeys) {
    const row = ogrenimDisi[k] || {};
    const sc = safeNum(row.studentCount);
    const uc = safeNum(row.unitCost);
    checkNonNeg(sc, `giderler.ogrenimDisi.items.${k}.studentCount`);
    checkNonNeg(uc, `giderler.ogrenimDisi.items.${k}.unitCost`);
    servicesTotal += Math.max(0, sc) * Math.max(0, uc);
  }

  const dormKeys = ["yurtGiderleri", "digerYurt"];
  let dormTotal = 0;
  for (const k of dormKeys) {
    const row = yurt[k] || {};
    const sc = safeNum(row.studentCount);
    const uc = safeNum(row.unitCost);
    checkNonNeg(sc, `giderler.yurt.items.${k}.studentCount`);
    checkNonNeg(uc, `giderler.yurt.items.${k}.unitCost`);
    dormTotal += Math.max(0, sc) * Math.max(0, uc);
  }

  const totalExpenses = operatingTotal + servicesTotal + dormTotal;

  return { operatingTotal, servicesTotal, dormTotal, hrTotal, totalExpenses, errors, warnings };
}

// -----------------------------------------------------------------------------
// 3-Year helpers (Excel 1/2/3 yıl kolonları)
// 2. ve 3. yıl, TEMEL BİLGİLER'deki tahmini enflasyon oranlarına göre otomatik türetilir.
// -----------------------------------------------------------------------------

function getInflationRates(input) {
  const t = input?.temelBilgiler || {};
  // allow a couple of shapes for backward compatibility
  const y2 = safeNum(t?.inflation?.y2 ?? t?.inflationY2 ?? t?.inflation_rate_y2 ?? 0);
  const y3 = safeNum(t?.inflation?.y3 ?? t?.inflationY3 ?? t?.inflation_rate_y3 ?? 0);
  return {
    y2: clamp(y2, -0.99, 10),
    y3: clamp(y3, -0.99, 10),
  };
}

function getInflationFactors(input) {
  const r = getInflationRates(input);
  const f1 = 1;
  const f2 = 1 + r.y2;
  const f3 = f2 * (1 + r.y3);
  return { rates: r, factors: { y1: f1, y2: f2, y3: f3 } };
}

function looksLikeCurriculumMap(obj) {
  if (!obj || typeof obj !== "object") return false;
  return DEFAULT_GRADE_KEYS.some((g) => Object.prototype.hasOwnProperty.call(obj, g));
}

function normalizeNormYearConfig(normConfig, yearKey) {
  const base = normConfig && typeof normConfig === "object" ? normConfig : {};
  const years = base.years && typeof base.years === "object" ? base.years : null;
  const source = years ? years?.[yearKey] || years?.y1 || {} : base;

  const rawHours = Number(source?.teacherWeeklyMaxHours);
  const baseHours = Number(base?.teacherWeeklyMaxHours);
  const teacherWeeklyMaxHours =
    isFiniteNumber(rawHours) && rawHours > 0
      ? rawHours
      : isFiniteNumber(baseHours) && baseHours > 0
        ? baseHours
        : DEFAULT_NORM_MAX_HOURS;

  let curriculumWeeklyHours = null;
  if (source?.curriculumWeeklyHours && typeof source.curriculumWeeklyHours === "object") {
    curriculumWeeklyHours = source.curriculumWeeklyHours;
  } else if (looksLikeCurriculumMap(source)) {
    curriculumWeeklyHours = source;
  } else if (base?.curriculumWeeklyHours && typeof base.curriculumWeeklyHours === "object") {
    curriculumWeeklyHours = base.curriculumWeeklyHours;
  } else {
    curriculumWeeklyHours = {};
  }

  return { teacherWeeklyMaxHours, curriculumWeeklyHours };
}

// IK (HR) -> salary rows mapping (same mapping as frontend HREditorIK)
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

function computeIkSalaryMappingForYear(yearIK) {
  const unitCosts = yearIK?.unitCosts || {};
  const hc = yearIK?.headcountsByLevel || {};

  const roleTotals = {};
  const roleAnnualCosts = {};

  for (const role of IK_ROLES) {
    let totalCount = 0;
    for (const lvl of IK_LEVELS) {
      totalCount += safeNum(hc?.[lvl]?.[role]);
    }
    roleTotals[role] = totalCount;
    const unit = safeNum(unitCosts?.[role]);
    roleAnnualCosts[role] = unit * totalCount;
  }

  const sumAnnual = (keys) => keys.reduce((s, k) => s + safeNum(roleAnnualCosts[k]), 0);
  return {
    turkPersonelMaas: sumAnnual(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
    turkDestekPersonelMaas: sumAnnual(["turk_temsil"]),
    yerelPersonelMaas: sumAnnual(["yerel_yonetici_egitimci"]),
    yerelDestekPersonelMaas: sumAnnual(["yerel_destek", "yerel_ulke_temsil_destek"]),
    internationalPersonelMaas: sumAnnual(["int_yonetici_egitimci"]),
  };
}

function computeIkSalaryMappingByYear(ik) {
  const years = ik?.years || {};
  return {
    y1: computeIkSalaryMappingForYear(years?.y1 || {}),
    y2: computeIkSalaryMappingForYear(years?.y2 || {}),
    y3: computeIkSalaryMappingForYear(years?.y3 || {}),
  };
}

function inflateDiscountCategories(discounts, factor) {
  const list = Array.isArray(discounts) ? discounts : [];
  return list.map((d) => {
    if (!d) return d;
    const mode = String(d.mode || "percent");
    const value = safeNum(d.value);
    return {
      ...d,
      // percent stays same, fixed amount scales with inflation
      value: mode === "fixed" ? value * factor : value,
    };
  });
}

function inflateGelirler(gelirler, factor) {
  const inc = gelirler && typeof gelirler === "object" ? gelirler : {};
  const out = JSON.parse(JSON.stringify(inc));

  const mul = (x) => safeNum(x) * factor;
  const inflateRowsUnitFee = (rows) => (rows || []).map((r) => ({ ...r, unitFee: mul(r?.unitFee) }));

  if (out?.tuition?.rows) out.tuition.rows = inflateRowsUnitFee(out.tuition.rows);
  if (out?.nonEducationFees?.rows) out.nonEducationFees.rows = inflateRowsUnitFee(out.nonEducationFees.rows);
  if (out?.dormitory?.rows) out.dormitory.rows = inflateRowsUnitFee(out.dormitory.rows);

  if (out?.otherInstitutionIncome?.rows) {
    out.otherInstitutionIncome.rows = (out.otherInstitutionIncome.rows || []).map((r) => ({ ...r, amount: mul(r?.amount) }));
  }

  if (out?.governmentIncentives != null) out.governmentIncentives = mul(out.governmentIncentives);

  // legacy fields (if any)
  if (out?.tuitionFeePerStudentYearly != null) out.tuitionFeePerStudentYearly = mul(out.tuitionFeePerStudentYearly);
  if (out?.lunchFeePerStudentYearly != null) out.lunchFeePerStudentYearly = mul(out.lunchFeePerStudentYearly);
  if (out?.dormitoryFeePerStudentYearly != null) out.dormitoryFeePerStudentYearly = mul(out.dormitoryFeePerStudentYearly);
  if (out?.otherFeePerStudentYearly != null) out.otherFeePerStudentYearly = mul(out.otherFeePerStudentYearly);

  return out;
}

function inflateGiderler(giderler, factor) {
  const g = giderler && typeof giderler === "object" ? giderler : {};
  const out = JSON.parse(JSON.stringify(g));

  const mul = (x) => safeNum(x) * factor;

  // legacy shape fallback
  if (
    !out?.isletme &&
    (out?.educationStaffYearlyCostTotal != null ||
      out?.managementStaffYearlyCost != null ||
      out?.supportStaffYearlyCost != null ||
      out?.operationalExpensesYearly != null)
  ) {
    const approx =
      safeNum(out.educationStaffYearlyCostTotal) +
      safeNum(out.managementStaffYearlyCost) +
      safeNum(out.supportStaffYearlyCost) +
      safeNum(out.operationalExpensesYearly);
    return {
      isletme: { items: { genelYonetim: mul(approx) } },
      ogrenimDisi: { items: {} },
      yurt: { items: {} },
    };
  }

  out.isletme = out.isletme || {};
  out.isletme.items = out.isletme.items || {};
  for (const [k, v] of Object.entries(out.isletme.items)) {
    out.isletme.items[k] = mul(v);
  }

  const inflateSvcOrDorm = (obj) => {
    const items = obj?.items || {};
    const nextItems = {};
    for (const [k, row] of Object.entries(items)) {
      const r = row || {};
      nextItems[k] = {
        ...r,
        unitCost: mul(r.unitCost),
        // studentCount stays same
        studentCount: safeNum(r.studentCount),
      };
    }
    return { ...(obj || {}), items: nextItems };
  };

  out.ogrenimDisi = inflateSvcOrDorm(out.ogrenimDisi);
  out.yurt = inflateSvcOrDorm(out.yurt);

  return out;
}

function deriveInputForYear(baseInput, yearKey, factors, salaryByYear) {
  const f = factors?.[yearKey] ?? 1;

  const out = {
    ...(baseInput || {}),
    grades: selectGradesForYear(baseInput, yearKey),
    gelirler: inflateGelirler(baseInput?.gelirler || {}, f),
    giderler: inflateGiderler(baseInput?.giderler || {}, f),
    discounts: inflateDiscountCategories(baseInput?.discounts || [], f),
  };

  // --- Gelirler: per-year student counts ---
  // Tuition student counts are derived from selected grades (gradesYears) + kademe config.
  // Non-education fees and dormitory student counts can be entered manually per year
  // (studentCount, studentCountY2, studentCountY3) and will be applied here.
  try {
    const kademeSums = summarizeGradesByKademe(out.grades || [], baseInput?.temelBilgiler?.kademeler);

    if (out?.gelirler?.tuition?.rows) {
      out.gelirler.tuition.rows = (out.gelirler.tuition.rows || []).map((r) => {
        const key = String(r?.key ?? "");
        let sc = null;

        if (key === "okulOncesi") sc = kademeSums.okulOncesi;
        else if (key === "ilkokulYerel") sc = kademeSums.ilkokul;
        else if (key === "ortaokulYerel") sc = kademeSums.ortaokul;
        else if (key === "liseYerel") sc = kademeSums.lise;
        else if (key === "ilkokulInt" || key === "ortaokulInt" || key === "liseInt") sc = 0;

        return sc == null ? r : { ...r, studentCount: safeNum(sc) };
      });
    }

    const pickManualStudentCount = (r) => {
      if (yearKey === "y2") return safeNum(r?.studentCountY2 ?? r?.studentCount);
      if (yearKey === "y3") return safeNum(r?.studentCountY3 ?? r?.studentCountY2 ?? r?.studentCount);
      return safeNum(r?.studentCount);
    };

    if (out?.gelirler?.nonEducationFees?.rows) {
      out.gelirler.nonEducationFees.rows = (out.gelirler.nonEducationFees.rows || []).map((r) => ({
        ...r,
        studentCount: pickManualStudentCount(r),
      }));
    }

    if (out?.gelirler?.dormitory?.rows) {
      out.gelirler.dormitory.rows = (out.gelirler.dormitory.rows || []).map((r) => ({
        ...r,
        studentCount: pickManualStudentCount(r),
      }));
    }
  } catch (_) {
    // ignore
  }


  // --- Capacity per-year selection (NEW) ---
  // capacity is NOT inflated; it's selected by year:
  // out.schoolCapacity = kapasite.years[yearKey] || kapasite.years.y1 || legacy schoolCapacity
  const capObj = baseInput?.kapasite && typeof baseInput.kapasite === "object" ? baseInput.kapasite : null;
  const yearsObj = capObj?.years && typeof capObj.years === "object" ? capObj.years : null;

  const legacyCapacity = safeNum(baseInput?.schoolCapacity);
  const capY1 = safeNum(yearsObj?.y1);
  const capForThisYear = safeNum(yearsObj?.[yearKey]);

  out.schoolCapacity =
    (capForThisYear > 0 ? capForThisYear : 0) ||
    (capY1 > 0 ? capY1 : 0) ||
    (legacyCapacity > 0 ? legacyCapacity : 0) ||
    0;

  // Patch the 5 salary rows using IK per-year values if present;
  // otherwise fall back to year-1 value inflated by the corresponding factor.
  const salaryKeys = [
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
  ];

  out.giderler = out.giderler || {};
  out.giderler.isletme = out.giderler.isletme || {};
  out.giderler.isletme.items = out.giderler.isletme.items || {};

  const baseIsletmeY1 = baseInput?.giderler?.isletme?.items || {};
  const ikY1 = salaryByYear?.y1 || {};
  const ikY = salaryByYear?.[yearKey] || {};

  for (const k of salaryKeys) {
    const base = safeNum(ikY1?.[k]) > 0 ? safeNum(ikY1[k]) : safeNum(baseIsletmeY1?.[k]);
    const fromIk = safeNum(ikY?.[k]);
    const val = fromIk > 0 ? fromIk : base * f;
    out.giderler.isletme.items[k] = val;
  }

  return out;
}

// -----------------------------------------------------------------------------
// Single-year calculation (previous behavior)
// -----------------------------------------------------------------------------

function calculateOneYear(input, normConfig) {
  const errors = [];
  const warnings = [];

  // Backward compatible:
  // - primary: input.schoolCapacity
  // - fallback: input.kapasite.years.y1
  const legacyCapacity = safeNum(input?.schoolCapacity);
  const capObj = input?.kapasite && typeof input.kapasite === "object" ? input.kapasite : null;
  const capY1 = safeNum(capObj?.years?.y1);

  const schoolCapacity = legacyCapacity > 0 ? legacyCapacity : capY1;

  if (!isFiniteNumber(schoolCapacity) || schoolCapacity <= 0) errors.push("schoolCapacity must be a positive number.");

  const { perGrade, totalStudents, gradeKeys } = computeStudentsFromGrades(input?.grades || [], DEFAULT_GRADE_KEYS);

  if (!isFiniteNumber(totalStudents) || totalStudents < 0) errors.push("totalStudents computed invalid.");
  if (schoolCapacity > 0 && totalStudents > schoolCapacity) errors.push("totalStudents exceeds schoolCapacity.");

  const utilizationRate = safeDiv(totalStudents, schoolCapacity);

  const norm = calculateNormTeachers({
    gradeBranches: perGrade,
    curriculumWeeklyHours: normConfig?.curriculumWeeklyHours,
    teacherWeeklyMaxHours: normConfig?.teacherWeeklyMaxHours,
  });

  errors.push(...(norm.errors || []));
  warnings.push(...(norm.warnings || []));

  // Gelirler
  const incomeBase = computeIncomeFromGelirler({ totalStudents, gelirler: input?.gelirler || {} });

  const disc = calculateDiscounts({
    tuitionStudents: incomeBase.tuitionStudents,
    grossTuition: incomeBase.grossTuition,
    tuitionAvgFee: incomeBase.tuitionAvgFee,
    discountCategories: input?.discounts || [],
  });

  errors.push(...(disc.errors || []));
  warnings.push(...(disc.warnings || []));

  const totalDiscounts = safeNum(disc.totalDiscounts);
  const netActivityIncome = incomeBase.activityGross - totalDiscounts;
  const netIncome = incomeBase.totalGrossIncome - totalDiscounts;
  const otherIncomeRatio = netIncome > 0 ? safeNum(incomeBase.otherIncomeTotal) / netIncome : 0;

  // Giderler
  let giderlerForCalc = input?.giderler || {};
  if (
    !giderlerForCalc?.isletme &&
    (giderlerForCalc?.educationStaffYearlyCostTotal != null ||
      giderlerForCalc?.managementStaffYearlyCost != null ||
      giderlerForCalc?.supportStaffYearlyCost != null ||
      giderlerForCalc?.operationalExpensesYearly != null)
  ) {
    const approx =
      safeNum(giderlerForCalc.educationStaffYearlyCostTotal) +
      safeNum(giderlerForCalc.managementStaffYearlyCost) +
      safeNum(giderlerForCalc.supportStaffYearlyCost) +
      safeNum(giderlerForCalc.operationalExpensesYearly);

    giderlerForCalc = {
      isletme: { items: { genelYonetim: approx } },
      ogrenimDisi: { items: {} },
      yurt: { items: {} },
    };
  }

  const expenses = calculateTotalExpensesFromExcelGiderler(giderlerForCalc);
  errors.push(...(expenses.errors || []));
  warnings.push(...(expenses.warnings || []));

  const totalExpenses = safeNum(expenses.totalExpenses);
  const netResult = netIncome - totalExpenses;

  const studentBase = incomeBase.tuitionStudents > 0 ? incomeBase.tuitionStudents : totalStudents;

  const revenuePerStudent = safeDiv(netIncome, studentBase);
  const netCiroPerStudent = safeDiv(netActivityIncome, studentBase);
  const costPerStudent = safeDiv(totalExpenses, studentBase);
  const profitPerStudent = safeDiv(netResult, studentBase);

  const profitMargin = safeDiv(netResult, netIncome);
  const discountToTuitionRatio = safeDiv(totalDiscounts, incomeBase.grossTuition);
  const hrShare = safeDiv(expenses.hrTotal, totalExpenses);

  // warnings
  if (utilizationRate != null) {
    if (utilizationRate < 0.6) warnings.push(`Low utilization (${round2(utilizationRate * 100)}%).`);
    if (utilizationRate > 0.95) warnings.push(`High utilization (${round2(utilizationRate * 100)}%). Capacity risk.`);
  }
  if (profitMargin != null && profitMargin < 0) warnings.push("Operating loss (profit margin < 0).");
  if (discountToTuitionRatio != null && discountToTuitionRatio > 0.3) warnings.push("High discount pressure.");

  return {
    students: {
      schoolCapacity: round2(schoolCapacity),
      totalStudents: round2(totalStudents),
      utilizationRate: utilizationRate == null ? null : round2(utilizationRate),
      perGrade: perGrade.map((r) => ({ ...r, gradeStudents: round2(r.gradeStudents) })),
      gradeKeys,
    },
    income: {
      grossTuition: round2(incomeBase.grossTuition),
      tuitionStudents: round2(incomeBase.tuitionStudents),
      tuitionAvgFee: round2(incomeBase.tuitionAvgFee),
      nonEducationFeesTotal: round2(incomeBase.nonEducationFeesTotal),
      dormitoryRevenuesTotal: round2(incomeBase.dormitoryRevenuesTotal),
      activityGross: round2(incomeBase.activityGross),
      otherInstitutionIncomeTotal: round2(incomeBase.otherInstitutionIncomeTotal),
      governmentIncentives: round2(incomeBase.governmentIncentives),
      otherIncomeTotal: round2(incomeBase.otherIncomeTotal),
      totalGrossIncome: round2(incomeBase.totalGrossIncome),
      totalDiscounts: round2(totalDiscounts),
      netActivityIncome: round2(netActivityIncome),
      netIncome: round2(netIncome),
      otherIncomeRatio: round2(otherIncomeRatio),
      discountsDetail: (disc.details || []).map((d) => ({
        ...d,
        amount: round2(d.amount),
        effectiveRatePart: round2(d.effectiveRatePart),
      })),
      discountsCapApplied: disc.capApplied,
    },
    expenses: {
      operatingExpensesTotal: round2(safeNum(expenses.operatingTotal)),
      nonTuitionServicesCostTotal: round2(safeNum(expenses.servicesTotal)),
      dormitoryCostTotal: round2(safeNum(expenses.dormTotal)),
      totalExpenses: round2(totalExpenses),
      hrTotal: round2(safeNum(expenses.hrTotal)),
      hrShare: hrShare == null ? null : round2(hrShare),
    },
    result: { netResult: round2(netResult) },
    kpis: {
      revenuePerStudent: revenuePerStudent == null ? null : round2(revenuePerStudent),
      netCiroPerStudent: netCiroPerStudent == null ? null : round2(netCiroPerStudent),
      costPerStudent: costPerStudent == null ? null : round2(costPerStudent),
      profitPerStudent: profitPerStudent == null ? null : round2(profitPerStudent),
      profitMargin: profitMargin == null ? null : round2(profitMargin),
      discountToTuitionRatio: discountToTuitionRatio == null ? null : round2(discountToTuitionRatio),
      hrShare: hrShare == null ? null : round2(hrShare),
    },
    norm: {
      totalTeachingHours: norm.totalTeachingHours == null ? null : round2(norm.totalTeachingHours),
      requiredTeachers: norm.requiredTeachers,
      breakdownByGrade: (norm.breakdownByGrade || []).map((x) => ({ ...x, weeklyTeachingHours: round2(x.weeklyTeachingHours) })),
      breakdownBySubject: (norm.breakdownBySubject || []).map((x) => ({ ...x, weeklyTeachingHours: round2(x.weeklyTeachingHours) })),
    },
    flags: { errors, warnings },
    isValid: errors.length === 0,
  };
}

// -----------------------------------------------------------------------------
// Public API: multi-year wrapper
// - Backward compatible: returns year-1 at top level (same fields as before)
// - Adds: years: { y1, y2, y3 } and inflation meta.
// -----------------------------------------------------------------------------

function calculateSchoolFeasibility(input, normConfig) {
  const { rates, factors } = getInflationFactors(input);
  const salaryByYear = computeIkSalaryMappingByYear(input?.ik || {});

  const y1Input = deriveInputForYear(input, "y1", factors, salaryByYear);
  const y2Input = deriveInputForYear(input, "y2", factors, salaryByYear);
  const y3Input = deriveInputForYear(input, "y3", factors, salaryByYear);

  const normY1 = normalizeNormYearConfig(normConfig, "y1");
  const normY2 = normalizeNormYearConfig(normConfig, "y2");
  const normY3 = normalizeNormYearConfig(normConfig, "y3");

  const y1 = calculateOneYear(y1Input, normY1);
  const y2 = calculateOneYear(y2Input, normY2);
  const y3 = calculateOneYear(y3Input, normY3);

  const multiYearValid = Boolean(y1?.isValid && y2?.isValid && y3?.isValid);

  return {
    ...y1,
    years: { y1, y2, y3 },
    temelBilgiler: {
      ...(input?.temelBilgiler || {}),
      inflation: { y2: rates.y2, y3: rates.y3 },
      inflationFactors: factors,
    },
    multiYearValid,
  };
}

module.exports = {
  DEFAULT_GRADE_KEYS,
  computeStudentsFromGrades,
  calculateNormTeachers,
  computeIncomeFromGelirler,
  calculateDiscounts,
  calculateTotalExpensesFromExcelGiderler,
  calculateSchoolFeasibility,
};
