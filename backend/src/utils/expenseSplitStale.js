const { calculateSchoolFeasibility } = require("../engine/feasibilityEngine");
const { computePoolAmounts } = require("./expenseDistributions");

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundTo(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const m = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * m) / m;
}

function almostEqual6(a, b) {
  const x = roundTo(a, 6);
  const y = roundTo(b, 6);
  return Math.abs(x - y) <= 0.0005;
}

function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function computeExpenseSplitStaleByDistributions(pool, distributions) {
  const distList = Array.isArray(distributions) ? distributions : [];
  const distIds = distList
    .map((d) => Number(d?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!distIds.length) return new Map();

  const [targetRows] = await pool.query(
    `SELECT distribution_id, target_scenario_id, basis_value
     FROM expense_distribution_targets
     WHERE distribution_id IN (:dids)`,
    { dids: distIds }
  );

  const [allocRows] = await pool.query(
    `SELECT distribution_id, expense_key, SUM(allocated_amount) AS pool_amount
     FROM expense_distribution_allocations
     WHERE distribution_id IN (:dids)
     GROUP BY distribution_id, expense_key`,
    { dids: distIds }
  );

  // Build per-distribution target and pool maps.
  const targetsByDist = new Map();
  (Array.isArray(targetRows) ? targetRows : []).forEach((r) => {
    const did = Number(r.distribution_id);
    const tid = Number(r.target_scenario_id);
    if (!Number.isFinite(did) || !Number.isFinite(tid)) return;
    const list = targetsByDist.get(did) || [];
    list.push({
      targetScenarioId: tid,
      basisValue: roundTo(safeNum(r.basis_value), 6),
    });
    targetsByDist.set(did, list);
  });

  const poolsByDist = new Map();
  (Array.isArray(allocRows) ? allocRows : []).forEach((r) => {
    const did = Number(r.distribution_id);
    if (!Number.isFinite(did)) return;
    const key = String(r.expense_key || "").trim();
    if (!key) return;
    const map = poolsByDist.get(did) || new Map();
    map.set(key, roundTo(safeNum(r.pool_amount), 6));
    poolsByDist.set(did, map);
  });

  // IMPORTANT:
  // We intentionally do NOT rely on scenario_kpis for stale detection.
  // KPIs are only refreshed when "Hesapla" runs, but users can change inputs (student counts / gelirler / giderler)
  // without recalculating. To reflect those changes immediately, we derive basis values directly from inputs_json.
  const allTargetIds = Array.from(
    new Set(
      (Array.isArray(targetRows) ? targetRows : [])
        .map((r) => Number(r.target_scenario_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );

  // Load inputs for all scenarios involved (sources + targets):
  // - sources: to recompute current pool amounts
  // - targets: to recompute current basis values (students/revenue) without requiring "Hesapla"
  const distSourceIds = Array.from(
    new Set(
      distList
        .map((d) => Number(d?.source_scenario_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );

  const inputsByScenario = new Map();
  const inputIds = Array.from(new Set([...distSourceIds, ...allTargetIds]));
  if (inputIds.length) {
    const [inputRows] = await pool.query(
      `SELECT scenario_id, inputs_json
       FROM scenario_inputs
       WHERE scenario_id IN (:ids)`,
      { ids: inputIds }
    );
    (Array.isArray(inputRows) ? inputRows : []).forEach((row) => {
      const sid = Number(row.scenario_id);
      if (!Number.isFinite(sid)) return;
      const parsed = parseJsonMaybe(row.inputs_json) || {};
      inputsByScenario.set(sid, parsed);
    });
  }

  // Load source scenario currency metadata for "new target" detection.
  const sourceCurrencyByScenario = new Map();
  if (distSourceIds.length) {
    const [rows] = await pool.query(
      `SELECT id, input_currency, local_currency_code
       FROM school_scenarios
       WHERE id IN (:ids)`,
      { ids: distSourceIds }
    );
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const sid = Number(row?.id);
      if (!Number.isFinite(sid)) return;
      sourceCurrencyByScenario.set(sid, {
        input_currency: String(row?.input_currency || "").toUpperCase(),
        local_currency_code: String(row?.local_currency_code || "").toUpperCase(),
      });
    });
  }

  // Preload "new target" candidates per (country, year, currency) group.
  const newTargetsByGroup = new Map();
  const groupMetaByKey = new Map();
  const toMs = (value) => {
    const d = value ? new Date(value) : null;
    const ms = d ? d.getTime() : NaN;
    return Number.isFinite(ms) ? ms : NaN;
  };
  for (const dist of distList) {
    const srcId = Number(dist?.source_scenario_id);
    const srcMeta = sourceCurrencyByScenario.get(srcId);
    const countryId = Number(dist?.country_id);
    const academicYear = String(dist?.academic_year || "").trim();
    const createdAtMs = toMs(dist?.created_at);
    if (!srcMeta || !Number.isFinite(countryId) || !academicYear || !Number.isFinite(createdAtMs)) continue;
    const inputCurrency = String(srcMeta.input_currency || "").toUpperCase();
    if (!inputCurrency) continue;
    const localCode = inputCurrency === "LOCAL" ? String(srcMeta.local_currency_code || "").toUpperCase() : "";
    if (inputCurrency === "LOCAL" && !localCode) continue;
    const key = `${countryId}|${academicYear}|${inputCurrency}|${localCode}`;
    const current = groupMetaByKey.get(key) || {
      countryId,
      academicYear,
      inputCurrency,
      localCode,
      minCreatedAt: createdAtMs,
    };
    if (Number.isFinite(createdAtMs) && createdAtMs < current.minCreatedAt) {
      current.minCreatedAt = createdAtMs;
    }
    groupMetaByKey.set(key, current);
  }

  for (const [key, group] of groupMetaByKey.entries()) {
    const minDate = new Date(group.minCreatedAt);
    let sql = `SELECT sc.id, sc.created_at
               FROM school_scenarios sc
               JOIN schools s ON s.id = sc.school_id
               WHERE s.country_id = :country_id
                 AND s.status = 'active'
                 AND sc.academic_year = :academic_year
                 AND sc.input_currency = :input_currency
                 AND NOT EXISTS (
                   SELECT 1 FROM expense_distribution_sets eds
                   WHERE eds.source_scenario_id = sc.id
                 )
                 AND sc.created_at > :min_created_at`;
    const params = {
      country_id: group.countryId,
      academic_year: group.academicYear,
      input_currency: group.inputCurrency,
      min_created_at: minDate,
    };
    if (group.inputCurrency === "LOCAL") {
      sql += " AND sc.local_currency_code = :local_currency_code";
      params.local_currency_code = group.localCode;
    }
    const [rows] = await pool.query(sql, params);
    const list = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: Number(row?.id),
        createdAtMs: toMs(row?.created_at),
      }))
      .filter((row) => Number.isFinite(row.id) && Number.isFinite(row.createdAtMs));
    newTargetsByGroup.set(key, list);
  }

  // Cache feasibility-derived basis metrics per scenario so we don't recalculate repeatedly.
  // Map: scenarioId -> { y1:{netCiro, students}, y2:{...}, y3:{...} }
  const basisMetricsCache = new Map();
  const getBasisMetrics = (scenarioId) => {
    const sid = Number(scenarioId);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    if (basisMetricsCache.has(sid)) return basisMetricsCache.get(sid);
    const inputs = inputsByScenario.get(sid);
    if (!inputs) {
      basisMetricsCache.set(sid, null);
      return null;
    }
    try {
      const results = calculateSchoolFeasibility(inputs, {});
      const years =
        results && typeof results === "object" && results.years && typeof results.years === "object"
          ? results.years
          : { y1: results };
      const out = {};
      for (const yk of ["y1", "y2", "y3"]) {
        const y = years?.[yk] || null;
        out[yk] = {
          netCiro: roundTo(safeNum(y?.income?.netActivityIncome), 6),
          students: roundTo(safeNum(y?.students?.totalStudents), 6),
        };
      }
      basisMetricsCache.set(sid, out);
      return out;
    } catch (_) {
      basisMetricsCache.set(sid, null);
      return null;
    }
  };

  // Determine whether each distribution is stale.
  const staleByDist = new Map();
  for (const dist of distList) {
    const did = Number(dist.id);
    if (!Number.isFinite(did)) continue;

    const basis = String(dist.basis || "students").toLowerCase();
    const yearKey = String(dist.basis_year_key || "y1").toLowerCase();

    const scope = parseJsonMaybe(dist.scope_json) || {};
    const expenseKeys = Array.isArray(scope.expenseKeys) ? scope.expenseKeys : null;
    const baselineBasisMap =
      scope && typeof scope.targetBasisValues === "object" && scope.targetBasisValues
        ? scope.targetBasisValues
        : null;
    const baselineTargets = new Set(
      Array.isArray(scope.targetScenarioIds)
        ? scope.targetScenarioIds.map((id) => String(id))
        : []
    );

    let isStale = false;

    // 1) Targets: basis values changed?
    const tRows = targetsByDist.get(did) || [];
    for (const t of tRows) {
      const metrics = getBasisMetrics(t.targetScenarioId);
      const m = metrics?.[yearKey] || metrics?.y1;
      const current = basis === "revenue" ? safeNum(m?.netCiro) : safeNum(m?.students);
      const baseline = baselineBasisMap
        ? safeNum(baselineBasisMap[String(t.targetScenarioId)])
        : safeNum(t.basisValue);

      if (!almostEqual6(current, baseline)) {
        // If inputs are missing and baseline is also zero, don't mark stale.
        if (metrics || roundTo(baseline, 6) !== 0) {
          isStale = true;
          break;
        }
      }
    }

    // 2) Source: pool amounts changed?
    if (!isStale) {
      const srcId = Number(dist.source_scenario_id);
      const srcInputs = inputsByScenario.get(srcId);

      // Prefer the pool snapshot saved in scope_json (avoids rounding drift from allocations).
      let baselinePools = null;
      if (scope && typeof scope.poolAmounts === "object" && scope.poolAmounts) {
        baselinePools = new Map(
          Object.entries(scope.poolAmounts).map(([k, v]) => [String(k), roundTo(safeNum(v), 6)])
        );
      } else {
        baselinePools = poolsByDist.get(did) || new Map();
      }

      const keys = expenseKeys || Array.from(baselinePools.keys());
      const currentPools = srcInputs ? computePoolAmounts(srcInputs, keys, []) : new Map();

      for (const key of keys) {
        const base = roundTo(safeNum(baselinePools.get(String(key))), 6);
        const cur = roundTo(safeNum(currentPools.get(String(key))), 6);
        if (!almostEqual6(cur, base)) {
          isStale = true;
          break;
        }
      }
    }

    // 3) New targets created after this split?
    if (!isStale) {
      const srcId = Number(dist.source_scenario_id);
      const srcMeta = sourceCurrencyByScenario.get(srcId);
      const countryId = Number(dist?.country_id);
      const academicYear = String(dist?.academic_year || "").trim();
      const createdAtMs = toMs(dist?.created_at);
      if (
        srcMeta &&
        Number.isFinite(countryId) &&
        academicYear &&
        Number.isFinite(createdAtMs)
      ) {
        const inputCurrency = String(srcMeta.input_currency || "").toUpperCase();
        const localCode = inputCurrency === "LOCAL" ? String(srcMeta.local_currency_code || "").toUpperCase() : "";
        const groupKey = `${countryId}|${academicYear}|${inputCurrency}|${localCode}`;
        const candidates = newTargetsByGroup.get(groupKey) || [];
        for (const row of candidates) {
          if (row.createdAtMs <= createdAtMs) continue;
          if (Number(row.id) === Number(srcId)) continue;
          if (baselineTargets.has(String(row.id))) continue;
          isStale = true;
          break;
        }
      }
    }

    staleByDist.set(did, isStale);
  }

  return staleByDist;
}

async function computeExpenseSplitStaleByDistributionIds(pool, distributionIds) {
  const ids = (Array.isArray(distributionIds) ? distributionIds : [])
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return new Map();
  const [distRows] = await pool.query(
    `SELECT id, source_scenario_id, country_id, academic_year, basis, basis_year_key, scope_json, created_at
     FROM expense_distribution_sets
     WHERE id IN (:ids)`,
    { ids }
  );
  return computeExpenseSplitStaleByDistributions(pool, distRows);
}

async function computeExpenseSplitStaleFlags(pool, scenarioRows) {
  const sourceScenarioIds = (Array.isArray(scenarioRows) ? scenarioRows : [])
    .filter((r) => !!r?.expense_split_applied)
    .map((r) => Number(r?.id))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!sourceScenarioIds.length) return new Map();

  // Load the latest distribution set for each *source* scenario (the one that was "Gider Paylaştır" applied).
  const [distRows] = await pool.query(
    `SELECT s.id, s.source_scenario_id, s.country_id, s.academic_year, s.basis, s.basis_year_key, s.scope_json, s.created_at
     FROM expense_distribution_sets s
     INNER JOIN (
       SELECT source_scenario_id, MAX(id) AS max_id
       FROM expense_distribution_sets
       WHERE source_scenario_id IN (:sourceScenarioIds)
       GROUP BY source_scenario_id
     ) latest ON latest.max_id = s.id`,
    { sourceScenarioIds }
  );

  const distributions = Array.isArray(distRows) ? distRows : [];
  if (!distributions.length) return new Map();

  const staleByDist = await computeExpenseSplitStaleByDistributions(pool, distributions);

  // Mark scenarios in the list as stale if they participate in any stale distribution.
  const staleByScenario = new Map();
  const sourceIdSet = new Set(sourceScenarioIds.map(String));
  for (const dist of distributions) {
    const did = Number(dist.id);
    if (!Number.isFinite(did) || !staleByDist.get(did)) continue;

    const srcId = Number(dist.source_scenario_id);
    if (Number.isFinite(srcId) && sourceIdSet.has(String(srcId))) {
      staleByScenario.set(srcId, true);
    }
  }

  return staleByScenario;
}

async function getScenarioSplitParticipation(pool, scenarioId) {
  const sid = Number(scenarioId);
  if (!Number.isFinite(sid) || sid <= 0) {
    return { sourceDistributionIds: [], targetDistributionIds: [] };
  }

  const [sourceRows] = await pool.query(
    "SELECT id FROM expense_distribution_sets WHERE source_scenario_id=:sid",
    { sid }
  );
  const [targetRows] = await pool.query(
    "SELECT distribution_id FROM expense_distribution_targets WHERE target_scenario_id=:sid",
    { sid }
  );

  const sourceDistributionIds = Array.from(
    new Set(
      (Array.isArray(sourceRows) ? sourceRows : [])
        .map((row) => Number(row?.id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  const targetDistributionIds = Array.from(
    new Set(
      (Array.isArray(targetRows) ? targetRows : [])
        .map((row) => Number(row?.distribution_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );

  return { sourceDistributionIds, targetDistributionIds };
}

module.exports = {
  computeExpenseSplitStaleFlags,
  computeExpenseSplitStaleByDistributionIds,
  getScenarioSplitParticipation,
};
