// backend/src/utils/expenseDistributions.js

const {
  computeIncomeFromGelirler,
  computeStudentsFromGrades,
} = require("../engine/feasibilityEngine");

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cloneJson(value) {
  if (!value || typeof value !== "object") return {};
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const OPERATING_KEYS = new Set([
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
]);

const SERVICE_KEYS = new Set(["yemek", "uniforma", "kitapKirtasiye", "ulasimServis"]);
const SERVICE_TO_INCOME_KEY = {
  yemek: "yemek",
  uniforma: "uniforma",
  kitapKirtasiye: "kitap",
  ulasimServis: "ulasim",
};
const DORM_KEYS = new Set(["yurtGiderleri", "digerYurt"]);
const DORM_TO_INCOME_KEY = {
  yurtGiderleri: "yurt",
  digerYurt: "yazOkulu",
};
const DISCOUNT_TOTAL_KEY = "discountsTotal";
const DISTRIBUTED_DISCOUNT_NAME = "Paylaşılan Burs/İndirim (Dağıtım)";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickGradesForY1(inputs) {
  if (!inputs || typeof inputs !== "object") return [];
  if (Array.isArray(inputs?.gradesYears?.y1)) return inputs.gradesYears.y1;
  if (Array.isArray(inputs?.grades)) return inputs.grades;
  return [];
}

function computeGrossTuitionY1(inputs) {
  const grades = pickGradesForY1(inputs);
  const totalStudents = computeStudentsFromGrades(grades).total;
  const incomeBase = computeIncomeFromGelirler({
    totalStudents,
    gelirler: inputs?.gelirler || {},
  });
  return safeNum(incomeBase?.grossTuition);
}

function applyDistributionOverlay(inputs, allocations) {
  const next = cloneJson(inputs || {});
  const giderler = next.giderler || {};
  const isletme = giderler.isletme || {};
  const operatingItems = isletme.items || {};
  const ogrenimDisi = giderler.ogrenimDisi || {};
  const serviceItems = ogrenimDisi.items || {};
  const yurt = giderler.yurt || {};
  const dormItems = yurt.items || {};

  const nonEdRows = Array.isArray(next?.gelirler?.nonEducationFees?.rows)
    ? next.gelirler.nonEducationFees.rows
    : [];
  const nonEdByKey = new Map(nonEdRows.map((row) => [String(row?.key || ""), row]));
  const dormRows = Array.isArray(next?.gelirler?.dormitory?.rows) ? next.gelirler.dormitory.rows : [];
  const dormByKey = new Map(dormRows.map((row) => [String(row?.key || ""), row]));

  const list = Array.isArray(allocations) ? allocations : [];
  for (const row of list) {
    if (!row) continue;
    const key = String(row.expense_key ?? row.expenseKey ?? "").trim();
    if (!key) continue;
    const add = safeNum(row.allocated_amount ?? row.allocatedAmount);

    if (OPERATING_KEYS.has(key)) {
      operatingItems[key] = safeNum(operatingItems[key]) + add;
      continue;
    }

    if (SERVICE_KEYS.has(key)) {
      const incomeKey = SERVICE_TO_INCOME_KEY[key];
      const incRow = incomeKey ? nonEdByKey.get(incomeKey) : null;
      const sc = safeNum(incRow?.studentCount);
      if (sc <= 0) continue;
      const prev = serviceItems[key] || {};
      const unitCostAdd = add / sc;
      serviceItems[key] = { ...prev, unitCost: safeNum(prev.unitCost) + unitCostAdd };
      continue;
    }

    if (DORM_KEYS.has(key)) {
      const incomeKey = DORM_TO_INCOME_KEY[key];
      const incRow = incomeKey ? dormByKey.get(incomeKey) : null;
      const sc = safeNum(incRow?.studentCount);
      if (sc <= 0) continue;
      const prev = dormItems[key] || {};
      const unitCostAdd = add / sc;
      dormItems[key] = { ...prev, unitCost: safeNum(prev.unitCost) + unitCostAdd };
      continue;
    }

    if (key === DISCOUNT_TOTAL_KEY) {
      const grossTuition = computeGrossTuitionY1(next);
      if (grossTuition <= 0) continue;
      const deltaPct = add / grossTuition;
      if (!Number.isFinite(deltaPct) || deltaPct <= 0) continue;

      const list = Array.isArray(next.discounts) ? [...next.discounts] : [];
      const idx = list.findIndex(
        (d) => String(d?.name || "") === DISTRIBUTED_DISCOUNT_NAME
      );
      const prev = idx >= 0 ? list[idx] : { name: DISTRIBUTED_DISCOUNT_NAME };
      const nextValue = clamp(safeNum(prev.value) + deltaPct, 0, 1);
      const updated = {
        ...prev,
        name: DISTRIBUTED_DISCOUNT_NAME,
        mode: "percent",
        ratio: 1,
        value: nextValue,
      };
      if (idx >= 0) list[idx] = updated;
      else list.push(updated);
      next.discounts = list;
    }
  }

  isletme.items = operatingItems;
  giderler.isletme = isletme;
  ogrenimDisi.items = serviceItems;
  giderler.ogrenimDisi = ogrenimDisi;
  yurt.items = dormItems;
  giderler.yurt = yurt;
  next.giderler = giderler;
  return next;
}

async function getLatestDistributionForScenario(pool, scenarioId, academicYear) {
  if (!pool) throw new Error("getLatestDistributionForScenario requires pool");
  const sid = Number(scenarioId);
  if (!Number.isFinite(sid)) return null;
  const year = String(academicYear || "").trim();
  if (!year) return null;
  const [[row]] = await pool.query(
    `SELECT s.id, s.basis, s.basis_year_key, s.created_at
     FROM expense_distribution_sets s
     JOIN expense_distribution_targets t ON t.distribution_id = s.id
     WHERE t.target_scenario_id=:scenario_id AND s.academic_year=:academic_year
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT 1`,
    { scenario_id: sid, academic_year: year }
  );
  return row || null;
}

async function getDistributionAllocationsForTarget(pool, distributionId, scenarioId) {
  if (!pool) throw new Error("getDistributionAllocationsForTarget requires pool");
  const did = Number(distributionId);
  const sid = Number(scenarioId);
  if (!Number.isFinite(did) || !Number.isFinite(sid)) return [];
  const [rows] = await pool.query(
    `SELECT expense_key, allocated_amount
     FROM expense_distribution_allocations
     WHERE distribution_id=:distribution_id AND target_scenario_id=:target_scenario_id`,
    { distribution_id: did, target_scenario_id: sid }
  );
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  applyDistributionOverlay,
  getLatestDistributionForScenario,
  getDistributionAllocationsForTarget,
};

