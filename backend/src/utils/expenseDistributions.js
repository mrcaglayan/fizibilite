// backend/src/utils/expenseDistributions.js

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cloneJson(value) {
  if (!value || typeof value !== "object") return {};
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function applyDistributionOverlay(inputs, allocations) {
  const next = cloneJson(inputs || {});
  const giderler = next.giderler || {};
  const isletme = giderler.isletme || {};
  const items = isletme.items || {};

  const list = Array.isArray(allocations) ? allocations : [];
  for (const row of list) {
    if (!row) continue;
    const key = String(row.expense_key ?? row.expenseKey ?? "").trim();
    if (!key) continue;
    const add = safeNum(row.allocated_amount ?? row.allocatedAmount);
    items[key] = safeNum(items[key]) + add;
  }

  isletme.items = items;
  giderler.isletme = isletme;
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

