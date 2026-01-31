// backend/src/utils/countryApprovalBatch.js

const { getScenarioProgressSnapshot } = require("./scenarioProgressCache");
const { calculateSchoolFeasibility } = require("../engine/feasibilityEngine");
const { getNormConfigRowForScenario, normalizeNormConfigRow } = require("./normConfig");
const {
  computeExpenseSplitStaleFlags,
  computeExpenseSplitStaleByDistributionIds,
} = require("./expenseSplitStale");

function normalizeIdList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  );
}

const KPI_YEAR_KEYS = ["y1", "y2", "y3"];

function parseInputsJson(inputsRaw) {
  if (inputsRaw == null) return {};
  if (typeof inputsRaw === "string") {
    try {
      return JSON.parse(inputsRaw);
    } catch (err) {
      const error = new Error("Invalid inputs JSON");
      error.status = 400;
      throw error;
    }
  }
  if (typeof inputsRaw === "object") return inputsRaw;
  return {};
}

function cloneInputs(value) {
  if (!value || typeof value !== "object") return {};
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeInputsToUsd(inputsRaw, scenario) {
  const inputs = parseInputsJson(inputsRaw);
  if (!scenario || scenario.input_currency !== "LOCAL") return inputs;

  const fx = Number(scenario.fx_usd_to_local);
  if (!Number.isFinite(fx) || fx <= 0) {
    const error = new Error("FX rate required for local currency");
    error.status = 400;
    throw error;
  }

  const out = cloneInputs(inputs);
  const convert = (obj, key) => {
    if (!obj || typeof obj !== "object") return;
    const n = Number(obj[key]);
    if (Number.isFinite(n)) obj[key] = n / fx;
  };
  const convertRows = (rows, key) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => convert(row, key));
  };

  const gelirler = out.gelirler && typeof out.gelirler === "object" ? out.gelirler : {};
  convertRows(gelirler?.tuition?.rows, "unitFee");
  convertRows(gelirler?.nonEducationFees?.rows, "unitFee");
  convertRows(gelirler?.dormitory?.rows, "unitFee");
  convertRows(gelirler?.otherInstitutionIncome?.rows, "amount");
  convert(gelirler, "governmentIncentives");
  convert(gelirler, "tuitionFeePerStudentYearly");
  convert(gelirler, "lunchFeePerStudentYearly");
  convert(gelirler, "dormitoryFeePerStudentYearly");
  convert(gelirler, "otherFeePerStudentYearly");

  const giderler = out.giderler && typeof out.giderler === "object" ? out.giderler : {};
  const isletmeItems = giderler?.isletme?.items;
  if (isletmeItems && typeof isletmeItems === "object") {
    const skipKeys = ["pct", "percent", "ratio", "margin"];
    Object.entries(isletmeItems).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (skipKeys.some((token) => lower.includes(token))) return;
      const n = Number(value);
      if (Number.isFinite(n)) isletmeItems[key] = n / fx;
    });
  }

  const legacyExpenseKeys = [
    "educationStaffYearlyCostTotal",
    "managementStaffYearlyCost",
    "supportStaffYearlyCost",
    "operationalExpensesYearly",
  ];
  legacyExpenseKeys.forEach((key) => convert(giderler, key));

  const convertUnitCostItems = (items) => {
    if (!items || typeof items !== "object") return;
    Object.values(items).forEach((row) => {
      convert(row, "unitCost");
      convert(row, "unitCostY2");
      convert(row, "unitCostY3");
    });
  };
  convertUnitCostItems(giderler?.ogrenimDisi?.items);
  convertUnitCostItems(giderler?.yurt?.items);

  const ik = out.ik && typeof out.ik === "object" ? out.ik : {};
  const ikYears = ik?.years && typeof ik.years === "object" ? ik.years : {};
  ["y1", "y2", "y3"].forEach((yearKey) => {
    const unitCosts = ikYears?.[yearKey]?.unitCosts;
    if (!unitCosts || typeof unitCosts !== "object") return;
    Object.entries(unitCosts).forEach(([key, value]) => {
      const n = Number(value);
      if (Number.isFinite(n)) unitCosts[key] = n / fx;
    });
  });
  const legacyUnitCosts = ik?.unitCosts;
  if (legacyUnitCosts && typeof legacyUnitCosts === "object") {
    Object.entries(legacyUnitCosts).forEach(([key, value]) => {
      const n = Number(value);
      if (Number.isFinite(n)) legacyUnitCosts[key] = n / fx;
    });
  }

  if (Array.isArray(out.discounts)) {
    out.discounts = out.discounts.map((d) => {
      if (!d || typeof d !== "object") return d;
      const mode = String(d.mode || "percent");
      if (mode !== "fixed") return d;
      const n = Number(d.value);
      if (!Number.isFinite(n)) return d;
      return { ...d, value: n / fx };
    });
  }

  return out;
}

function extractScenarioYears(results) {
  let parsed = results;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed?.years && typeof parsed.years === "object") return parsed.years;
  return { y1: parsed };
}

async function upsertScenarioKpis(pool, scenarioId, academicYear, results) {
  const years = extractScenarioYears(results);
  for (const yearKey of KPI_YEAR_KEYS) {
    const y = years?.[yearKey];
    if (!y || typeof y !== "object") continue;
    const netCiro = Number(y?.income?.netActivityIncome || 0);
    const netIncome = Number(y?.income?.netIncome || 0);
    const totalExpenses = Number(y?.expenses?.totalExpenses || 0);
    const netResult = Number(y?.result?.netResult || 0);
    const studentsTotal = Math.round(Number(y?.students?.totalStudents || 0));

    await pool.query(
      `INSERT INTO scenario_kpis
        (scenario_id, academic_year, year_key, net_ciro, net_income, total_expenses, net_result, students_total)
       VALUES
        (:scenario_id, :academic_year, :year_key, :net_ciro, :net_income, :total_expenses, :net_result, :students_total)
       ON DUPLICATE KEY UPDATE
        academic_year=VALUES(academic_year),
        net_ciro=VALUES(net_ciro),
        net_income=VALUES(net_income),
        total_expenses=VALUES(total_expenses),
        net_result=VALUES(net_result),
        students_total=VALUES(students_total)`,
      {
        scenario_id: scenarioId,
        academic_year: academicYear,
        year_key: yearKey,
        net_ciro: Number.isFinite(netCiro) ? netCiro : 0,
        net_income: Number.isFinite(netIncome) ? netIncome : 0,
        total_expenses: Number.isFinite(totalExpenses) ? totalExpenses : 0,
        net_result: Number.isFinite(netResult) ? netResult : 0,
        students_total: Number.isFinite(studentsTotal) ? studentsTotal : 0,
      }
    );
  }
}

async function ensureScenarioKpis(pool, scenarioRow, userId) {
  const scenarioId = Number(scenarioRow?.id);
  const schoolId = Number(scenarioRow?.school_id);
  if (!Number.isFinite(scenarioId) || !Number.isFinite(schoolId)) {
    throw new Error("Invalid scenario");
  }

  const [kpiRows] = await pool.query(
    "SELECT year_key FROM scenario_kpis WHERE scenario_id=:id",
    { id: scenarioId }
  );
  const kpiKeys = new Set(
    (Array.isArray(kpiRows) ? kpiRows : [])
      .map((row) => String(row?.year_key || ""))
      .filter((key) => key)
  );
  const hasAllKpis = KPI_YEAR_KEYS.every((key) => kpiKeys.has(key));
  if (hasAllKpis) return;

  const [[inputsRow]] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
    { id: scenarioId }
  );
  if (!inputsRow) {
    throw new Error("Inputs bulunamadi");
  }

  const normRow = await getNormConfigRowForScenario(pool, schoolId, scenarioId);
  if (!normRow) {
    throw new Error("Norm config eksik");
  }
  const normConfig = normalizeNormConfigRow(normRow);

  const scenarioMeta = {
    input_currency: scenarioRow?.input_currency,
    fx_usd_to_local: scenarioRow?.fx_usd_to_local,
    local_currency_code: scenarioRow?.local_currency_code,
  };
  const inputsForCalc = normalizeInputsToUsd(inputsRow.inputs_json, scenarioMeta);
  const results = calculateSchoolFeasibility(inputsForCalc, normConfig);

  await pool.query(
    "INSERT INTO scenario_results (scenario_id, results_json, calculated_by) VALUES (:id,:json,:u) ON DUPLICATE KEY UPDATE results_json=VALUES(results_json), calculated_by=VALUES(calculated_by), calculated_at=CURRENT_TIMESTAMP",
    { id: scenarioId, json: JSON.stringify(results), u: userId ?? null }
  );
  await upsertScenarioKpis(pool, scenarioId, scenarioRow?.academic_year, results);
}

async function listAccessibleSchools(pool, user) {
  const isPrincipal = String(user.role) === "principal";
  if (isPrincipal) {
    const [rows] = await pool.query(
      `SELECT s.id, s.name
       FROM schools s
       JOIN school_user_roles sur ON sur.school_id = s.id
       WHERE sur.user_id = :uid
         AND sur.role = 'principal'
         AND s.status = 'active'
         AND (:country_id IS NULL OR s.country_id = :country_id)`,
      { uid: user.id, country_id: user.country_id ?? null }
    );
    return Array.isArray(rows) ? rows : [];
  }

  const [rows] = await pool.query(
    "SELECT id, name FROM schools WHERE country_id = :country_id AND status = 'active'",
    { country_id: user.country_id }
  );
  return Array.isArray(rows) ? rows : [];
}

async function assertAccessibleSchoolIds(pool, user, schoolIds) {
  const ids = normalizeIdList(schoolIds);
  if (!ids.length) {
    const err = new Error("schoolIds is required");
    err.status = 400;
    throw err;
  }

  const isPrincipal = String(user.role) === "principal";
  let rows = [];
  if (isPrincipal) {
    const [res] = await pool.query(
      `SELECT s.id, s.name
       FROM schools s
       JOIN school_user_roles sur ON sur.school_id = s.id
       WHERE sur.user_id = :uid AND sur.role = 'principal' AND s.id IN (:ids)`,
      { uid: user.id, ids }
    );
    rows = Array.isArray(res) ? res : [];
  } else {
    const [res] = await pool.query(
      "SELECT id, name FROM schools WHERE country_id = :country_id AND id IN (:ids)",
      { country_id: user.country_id, ids }
    );
    rows = Array.isArray(res) ? res : [];
  }

  const accessibleSet = new Set(rows.map((r) => String(r.id)));
  const hasInaccessible = ids.some((id) => !accessibleSet.has(String(id)));
  if (hasInaccessible) {
    const err = new Error("One or more schools not accessible");
    err.status = 403;
    throw err;
  }

  const nameById = new Map(rows.map((r) => [String(r.id), r.name]));
  return { ids, nameById };
}

async function buildStaleSourceGuard(pool, schoolIds) {
  if (!Array.isArray(schoolIds) || !schoolIds.length) {
    return { bulkDisabledDueToStaleSource: false, staleSources: [] };
  }
  const [rows] = await pool.query(
    `SELECT sc.id, sc.school_id, sc.name, sc.academic_year, s.name AS schoolName
     FROM school_scenarios sc
     JOIN schools s ON s.id = sc.school_id
     WHERE sc.school_id IN (:ids)
       AND EXISTS (
         SELECT 1 FROM expense_distribution_sets eds WHERE eds.source_scenario_id = sc.id
       )`,
    { ids: schoolIds }
  );

  const scenarioRows = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    expense_split_applied: true,
  }));
  const staleMap =
    scenarioRows.length > 0 ? await computeExpenseSplitStaleFlags(pool, scenarioRows) : new Map();
  const staleSources = (Array.isArray(rows) ? rows : [])
    .filter((row) => staleMap.get(Number(row.id)))
    .map((row) => ({
      schoolId: row.school_id,
      schoolName: row.schoolName,
      scenarioId: row.id,
      scenarioName: row.name,
      yearText: row.academic_year,
    }));

  return {
    bulkDisabledDueToStaleSource: staleSources.length > 0,
    staleSources,
  };
}

async function buildScenarioSplitInfo(pool, scenarioRows) {
  const list = Array.isArray(scenarioRows) ? scenarioRows : [];
  const ids = normalizeIdList(list.map((row) => (row && typeof row === "object" ? row.id : row)));
  if (!ids.length) return new Map();

  const [sourceRows] = await pool.query(
    `SELECT source_scenario_id AS scenario_id, MAX(id) AS latest_id
     FROM expense_distribution_sets
     WHERE source_scenario_id IN (:ids)
     GROUP BY source_scenario_id`,
    { ids }
  );
  const [targetRows] = await pool.query(
    `SELECT target_scenario_id AS scenario_id, MAX(distribution_id) AS latest_id
     FROM expense_distribution_targets
     WHERE target_scenario_id IN (:ids)
     GROUP BY target_scenario_id`,
    { ids }
  );

  const latestSourceByScenario = new Map();
  (Array.isArray(sourceRows) ? sourceRows : []).forEach((row) => {
    const sid = Number(row?.scenario_id);
    const did = Number(row?.latest_id);
    if (Number.isFinite(sid) && Number.isFinite(did)) {
      latestSourceByScenario.set(String(sid), did);
    }
  });

  const latestTargetByScenario = new Map();
  (Array.isArray(targetRows) ? targetRows : []).forEach((row) => {
    const sid = Number(row?.scenario_id);
    const did = Number(row?.latest_id);
    if (Number.isFinite(sid) && Number.isFinite(did)) {
      latestTargetByScenario.set(String(sid), did);
    }
  });

  const allDistributionIds = new Set();
  ids.forEach((scenarioId) => {
    const key = String(scenarioId);
    const srcId = latestSourceByScenario.get(key);
    const tgtId = latestTargetByScenario.get(key);
    if (Number.isFinite(srcId)) allDistributionIds.add(srcId);
    if (Number.isFinite(tgtId)) allDistributionIds.add(tgtId);
  });

  const staleByDist = await computeExpenseSplitStaleByDistributionIds(
    pool,
    Array.from(allDistributionIds)
  );
  const splitInfoByScenarioId = new Map();

  ids.forEach((scenarioId) => {
    const key = String(scenarioId);
    const srcId = latestSourceByScenario.get(key);
    const tgtId = latestTargetByScenario.get(key);
    const hasSplit = Number.isFinite(srcId) || Number.isFinite(tgtId);
    let splitStatus = "none";
    if (hasSplit) {
      const isStale =
        (Number.isFinite(srcId) && staleByDist.get(Number(srcId))) ||
        (Number.isFinite(tgtId) && staleByDist.get(Number(tgtId)));
      splitStatus = isStale ? "stale" : "ok";
    }
    splitInfoByScenarioId.set(key, {
      splitStatus,
      isSourceScenario: Number.isFinite(srcId),
    });
  });

  return splitInfoByScenarioId;
}

async function buildProgressByScenarioId(pool, countryId, scenarioRows) {
  const progressByScenarioId = new Map();
  await Promise.all(
    (Array.isArray(scenarioRows) ? scenarioRows : []).map(async (row) => {
      const scenarioId = Number(row?.id);
      const schoolId = Number(row?.school_id);
      if (!Number.isFinite(scenarioId) || !Number.isFinite(schoolId)) return;
      try {
        const snapshot = await getScenarioProgressSnapshot(pool, {
          schoolId,
          scenarioId,
          countryId,
        });
        const pct = Number(snapshot?.progress?.pct ?? 0);
        progressByScenarioId.set(String(scenarioId), Number.isFinite(pct) ? pct : 0);
      } catch (_) {
        progressByScenarioId.set(String(scenarioId), 0);
      }
    })
  );
  return progressByScenarioId;
}

module.exports = {
  normalizeIdList,
  listAccessibleSchools,
  assertAccessibleSchoolIds,
  buildStaleSourceGuard,
  buildScenarioSplitInfo,
  buildProgressByScenarioId,
  ensureScenarioKpis,
};
