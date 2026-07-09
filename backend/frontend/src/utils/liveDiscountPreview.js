import { computeDiscountTotalForYear } from "./discounts";

const YEAR_KEYS = ["y1", "y2", "y3"];

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const clone = (value) => {
  try {
    return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

function getInflationFactors(temelBilgiler) {
  const inflation = temelBilgiler?.inflation || {};
  const y2 = toNum(inflation.y2);
  const y3 = toNum(inflation.y3);
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

function studentCountForYear(row, yearKey) {
  if (yearKey === "y2") return toNum(row?.studentCountY2 ?? row?.studentCount);
  if (yearKey === "y3") return toNum(row?.studentCountY3 ?? row?.studentCountY2 ?? row?.studentCount);
  return toNum(row?.studentCount);
}

function inputTuitionBasis(inputs, yearKey) {
  const factors = getInflationFactors(inputs?.temelBilgiler);
  const rows = Array.isArray(inputs?.gelirler?.tuition?.rows) ? inputs.gelirler.tuition.rows : [];
  const students = rows.reduce((sum, row) => sum + studentCountForYear(row, yearKey), 0);
  const grossTuition = rows.reduce(
    (sum, row) => sum + studentCountForYear(row, yearKey) * toNum(row?.unitFee) * (factors[yearKey] || 1),
    0,
  );
  return {
    students,
    grossTuition,
    avgTuitionFee: students > 0 ? grossTuition / students : 0,
    factor: factors[yearKey] || 1,
  };
}

function hasDiscountValues(discounts) {
  return Array.isArray(discounts) && discounts.some((row) => {
    const count = toNum(row?.studentCount ?? row?.studentCountY2 ?? row?.studentCountY3);
    const value = toNum(row?.value ?? row?.valueY2 ?? row?.valueY3);
    return count > 0 && value > 0;
  });
}

export function applyLiveDiscountPreviewToResults(results, inputs) {
  if (!results || !inputs || !hasDiscountValues(inputs?.discounts)) return results;
  const next = clone(results);
  if (!next || typeof next !== "object") return results;

  const years = next.years && typeof next.years === "object" ? next.years : { y1: next };

  YEAR_KEYS.forEach((yearKey) => {
    const year = years?.[yearKey];
    if (!year || typeof year !== "object") return;

    const income = year.income && typeof year.income === "object" ? year.income : (year.income = {});
    const expenses = year.expenses && typeof year.expenses === "object" ? year.expenses : (year.expenses = {});
    const pnl = year.pnl && typeof year.pnl === "object" ? year.pnl : (year.pnl = {});
    const result = year.result && typeof year.result === "object" ? year.result : (year.result = {});
    const kpis = year.kpis && typeof year.kpis === "object" ? year.kpis : (year.kpis = {});

    const inputBasis = inputTuitionBasis(inputs, yearKey);
    const grossTuition = toNum(income.grossTuition) || inputBasis.grossTuition;
    const tuitionStudents = inputBasis.students || toNum(year.students?.tuitionStudents) || toNum(year.students?.totalStudents);
    const avgTuitionFee = tuitionStudents > 0 ? grossTuition / tuitionStudents : inputBasis.avgTuitionFee;

    const totalDiscounts = computeDiscountTotalForYear({
      yearKey,
      discounts: inputs.discounts,
      grossTuition,
      tuitionStudents,
      avgTuitionFee,
      factor: inputBasis.factor,
    });

    const nonEducation = toNum(income.nonEducationFeesTotal);
    const dormitory = toNum(income.dormitoryRevenuesTotal);
    const other = toNum(income.otherInstitutionIncomeTotal || income.otherIncomeTotal);
    const government = toNum(income.governmentIncentives);
    const activityGross = grossTuition + nonEducation + dormitory;
    const totalGrossIncome = toNum(income.totalGrossIncome) || activityGross + other + government;
    const totalExpenses = toNum(expenses.totalExpenses);

    income.totalDiscounts = totalDiscounts;
    income.netActivityIncome = activityGross - totalDiscounts;
    income.netIncome = totalGrossIncome - totalDiscounts;

    pnl.salesDiscounts = totalDiscounts;
    if (Number.isFinite(toNum(pnl.grossSales))) pnl.netSales = toNum(pnl.grossSales) - totalDiscounts;
    else pnl.netSales = income.netIncome;
    if (pnl.costOfSalesTotal != null) pnl.grossProfit = toNum(pnl.netSales) - toNum(pnl.costOfSalesTotal);
    if (pnl.operatingTotal != null) pnl.periodNetProfit = toNum(pnl.grossProfit) - toNum(pnl.operatingTotal);

    result.netResult = income.netIncome - totalExpenses;
    kpis.profitMargin = income.netIncome > 0 ? result.netResult / income.netIncome : null;
    year.__liveDiscountPreview = true;
  });

  next.__liveDiscountPreview = true;
  return next;
}
