// backend/src/routes/expenseDistributions.js

const express = require("express");
const { getPool } = require("../db");
const {
  computeIncomeFromGelirler,
  computeStudentsFromGrades,
  calculateDiscounts,
} = require("../engine/feasibilityEngine");
const {
  requireAuth,
  requireAssignedCountry,
  requireSchoolContextAccess,
  requirePermission,
} = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);
router.use("/schools/:schoolId", requireSchoolContextAccess("schoolId"));

const IK_AUTO_KEYS = new Set([
  "turkPersonelMaas",
  "turkDestekPersonelMaas",
  "yerelPersonelMaas",
  "yerelDestekPersonelMaas",
  "internationalPersonelMaas",
]);

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
const SPLITTABLE_KEYS = new Set([
  ...OPERATING_KEYS,
  ...SERVICE_KEYS,
  ...DORM_KEYS,
  DISCOUNT_TOTAL_KEY,
]);

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickGradesForY1(inputs) {
  if (!inputs || typeof inputs !== "object") return [];
  if (Array.isArray(inputs?.gradesYears?.y1)) return inputs.gradesYears.y1;
  if (Array.isArray(inputs?.grades)) return inputs.grades;
  return [];
}

function computeDiscountTotalY1(inputs, warnings) {
  const grades = pickGradesForY1(inputs);
  const totalStudents = computeStudentsFromGrades(grades).total;
  const incomeBase = computeIncomeFromGelirler({
    totalStudents,
    gelirler: inputs?.gelirler || {},
  });

  const tuitionStudents = safeNum(incomeBase?.tuitionStudents);
  const grossTuition = safeNum(incomeBase?.grossTuition);
  const avgTuition = safeNum(incomeBase?.tuitionAvgFee);

  if (tuitionStudents <= 0 || grossTuition <= 0) {
    warnings.push("Burs/indirim havuzu için brut ogrenim ucreti 0.");
    return 0;
  }

  const list = Array.isArray(inputs?.discounts) ? inputs.discounts : [];
  const discountCategories = list.map((d) => {
    if (!d) return d;
    const count = d.studentCount != null && d.studentCount !== "" ? safeNum(d.studentCount) : null;
    const ratioFromCount =
      count != null && tuitionStudents > 0 ? clamp(count / tuitionStudents, 0, 1) : null;
    const ratio = ratioFromCount != null ? ratioFromCount : clamp(safeNum(d.ratio), 0, 1);
    return {
      ...d,
      ratio,
      value: safeNum(d.value),
    };
  });

  const disc = calculateDiscounts({
    tuitionStudents,
    grossTuition,
    tuitionAvgFee: avgTuition,
    discountCategories,
  });

  return safeNum(disc?.totalDiscounts);
}
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

function normalizeAcademicYear(value) {
  const raw = String(value || "").trim();
  const single = raw.match(/^(\d{4})$/);
  if (single) return single[1];
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) return `${range[1]}-${range[2]}`;
  return raw;
}

async function assertSchoolInUserCountry(pool, schoolId, countryId) {
  const [[s]] = await pool.query(
    `SELECT s.id, s.name, s.status,
            c.name AS country_name, c.code AS country_code
     FROM schools s
     JOIN countries c ON c.id = s.country_id
     WHERE s.id = :id AND s.country_id = :country_id`,
    { id: schoolId, country_id: countryId }
  );
  return s || null;
}

async function assertScenarioInSchool(pool, scenarioId, schoolId) {
  const [[s]] = await pool.query(
    `SELECT id, name, academic_year, status,
            submitted_at, submitted_by,
            reviewed_at, reviewed_by,
            review_note,
            sent_at, sent_by,
            checked_at, checked_by,
            input_currency, local_currency_code, fx_usd_to_local, program_type
     FROM school_scenarios
     WHERE id=:id AND school_id=:school_id`,
    { id: scenarioId, school_id: schoolId }
  );
  return s || null;
}

function pickUniqueScenarioIds(list) {
  const ids = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const key = String(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function filterExpenseKeys(keys, warnings) {
  const list = Array.isArray(keys) ? keys : [];
  const valid = [];
  const seen = new Set();
  for (const raw of list) {
    const key = String(raw || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!SPLITTABLE_KEYS.has(key)) {
      warnings.push(`Gider anahtari desteklenmiyor: ${key}`);
      continue;
    }
    if (IK_AUTO_KEYS.has(key)) {
      warnings.push(`IK otomatik gider anahtari seçilemez: ${key}`);
      continue;
    }
    valid.push(key);
  }
  return valid;
}

function isCurrencyMatch(sourceScenario, targetScenario) {
  const srcCur = String(sourceScenario?.input_currency || "USD").toUpperCase();
  const tgtCur = String(targetScenario?.input_currency || "USD").toUpperCase();
  if (srcCur !== tgtCur) return false;
  if (srcCur === "LOCAL") {
    const srcCode = String(sourceScenario?.local_currency_code || "").toUpperCase();
    const tgtCode = String(targetScenario?.local_currency_code || "").toUpperCase();
    if (!srcCode || !tgtCode) return false;
    return srcCode === tgtCode;
  }
  return true;
}

async function buildPreview({
  pool,
  sourceScenario,
  sourceSchoolId,
  targetScenarioIds,
  basis,
  basisYearKey,
  expenseKeys,
  countryId,
}) {
  const warnings = [];
  const sourceScenarioId = Number(sourceScenario?.id);
  const academicYear = String(sourceScenario?.academic_year || "").trim();

  const cleanExpenseKeys = filterExpenseKeys(expenseKeys, warnings);
  if (!cleanExpenseKeys.length) {
    const err = new Error("Geçerli gider anahtari seçilmelidir.");
    err.status = 400;
    throw err;
  }

  const uniqueTargetIds = pickUniqueScenarioIds(targetScenarioIds).filter(
    (id) => String(id) !== String(sourceScenarioId)
  );
  if (pickUniqueScenarioIds(targetScenarioIds).length !== uniqueTargetIds.length) {
    warnings.push("Kaynak senaryo hedef listesinden çikarildi.");
  }

  let targetRows = [];
  if (uniqueTargetIds.length) {
    const [rows] = await pool.query(
      `SELECT sc.id AS scenarioId,
              sc.name AS scenarioName,
              sc.academic_year,
              sc.input_currency,
              sc.local_currency_code,
              sc.fx_usd_to_local,
              s.id AS schoolId,
              s.name AS schoolName
       FROM school_scenarios sc
       JOIN schools s ON s.id = sc.school_id
       WHERE sc.id IN (:ids) AND s.country_id = :country_id
       ORDER BY s.name ASC, sc.name ASC`,
      { ids: uniqueTargetIds, country_id: countryId }
    );
    targetRows = Array.isArray(rows) ? rows : [];

    const found = new Set(targetRows.map((r) => String(r.scenarioId)));
    uniqueTargetIds.forEach((id) => {
      if (!found.has(String(id))) {
        warnings.push(`Hedef senaryo bulunamadi veya erisim disi: ${id}`);
      }
    });
  } else {
    warnings.push("Hedef senaryo seçilmedi.");
  }

  const includedTargets = [];
  for (const row of targetRows) {
    if (String(row.academic_year || "") !== academicYear) {
      warnings.push(
        `Hedef senaryo akademik yili uyusmuyor (${row.scenarioId}): ${row.academic_year}`
      );
      continue;
    }
    if (!isCurrencyMatch(sourceScenario, row)) {
      const srcCur = String(sourceScenario?.input_currency || "USD").toUpperCase();
      const srcCode = String(sourceScenario?.local_currency_code || "").toUpperCase();
      const srcLabel = srcCur === "LOCAL" ? `${srcCur}/${srcCode || "LOCAL"}` : srcCur;
      const tgtCur = String(row.input_currency || "USD").toUpperCase();
      const tgtCode = String(row.local_currency_code || "").toUpperCase();
      const tgtLabel = tgtCur === "LOCAL" ? `${tgtCur}/${tgtCode || "LOCAL"}` : tgtCur;
      warnings.push(`Para birimi uyumsuz (${row.scenarioId}): ${tgtLabel} ? ${srcLabel}`);
      continue;
    }
    includedTargets.push(row);
  }

  const [[inputsRow]] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
    { id: sourceScenarioId }
  );
  if (!inputsRow) {
    const err = new Error("Inputs not found");
    err.status = 404;
    throw err;
  }
  const inputs = parseInputsJson(inputsRow.inputs_json);

  const nonEdRows = Array.isArray(inputs?.gelirler?.nonEducationFees?.rows)
    ? inputs.gelirler.nonEducationFees.rows
    : [];
  const nonEdByKey = new Map(nonEdRows.map((row) => [String(row?.key || ""), row]));
  const dormRows = Array.isArray(inputs?.gelirler?.dormitory?.rows)
    ? inputs.gelirler.dormitory.rows
    : [];
  const dormByKey = new Map(dormRows.map((row) => [String(row?.key || ""), row]));

  const pools = cleanExpenseKeys.map((key) => {
    let poolAmount = 0;
    if (OPERATING_KEYS.has(key)) {
      poolAmount = safeNum(inputs?.giderler?.isletme?.items?.[key]);
    } else if (SERVICE_KEYS.has(key)) {
      const incomeKey = SERVICE_TO_INCOME_KEY[key];
      const incRow = incomeKey ? nonEdByKey.get(incomeKey) : null;
      const sc = safeNum(incRow?.studentCount);
      const uc = safeNum(inputs?.giderler?.ogrenimDisi?.items?.[key]?.unitCost);
      poolAmount = sc * uc;
    } else if (DORM_KEYS.has(key)) {
      const incomeKey = DORM_TO_INCOME_KEY[key];
      const incRow = incomeKey ? dormByKey.get(incomeKey) : null;
      const sc = safeNum(incRow?.studentCount);
      const uc = safeNum(inputs?.giderler?.yurt?.items?.[key]?.unitCost);
      poolAmount = sc * uc;
    } else if (key === DISCOUNT_TOTAL_KEY) {
      poolAmount = computeDiscountTotalY1(inputs, warnings);
    }
    return {
      expenseKey: key,
      poolAmount: roundTo(poolAmount, 6),
    };
  });

  const includedIds = includedTargets.map((t) => Number(t.scenarioId));
  const basisRows = new Map();
  if (includedIds.length) {
    const [rows] = await pool.query(
      `SELECT scenario_id, net_ciro, students_total
       FROM scenario_kpis
       WHERE scenario_id IN (:ids) AND academic_year=:academic_year AND year_key=:year_key`,
      { ids: includedIds, academic_year: academicYear, year_key: basisYearKey }
    );
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      basisRows.set(String(row.scenario_id), row);
    });
  }

  const basisKind = String(basis || "").toLowerCase();
  const targetsWithBasis = includedTargets.map((row) => {
    const kpi = basisRows.get(String(row.scenarioId));
    let basisValue = 0;
    if (kpi) {
      basisValue = basisKind === "revenue" ? safeNum(kpi.net_ciro) : safeNum(kpi.students_total);
    } else {
      warnings.push(`KPI bulunamadi: senaryo ${row.scenarioId} (${basisYearKey})`);
    }
    if (!Number.isFinite(basisValue) || basisValue < 0) basisValue = 0;
    return { row, basisValue: roundTo(basisValue, 6) };
  });

  const sumBasis = targetsWithBasis.reduce((s, t) => s + safeNum(t.basisValue), 0);
  const useEqual = targetsWithBasis.length > 0 && sumBasis <= 0;
  if (useEqual) {
    warnings.push("Basis toplami 0 oldugu için esit dagitim yapildi.");
  }

  const targetCount = targetsWithBasis.length || 0;
  const equalWeight = targetCount > 0 ? 1 / targetCount : 0;

  const targets = targetsWithBasis.map(({ row, basisValue }) => {
    const weight = useEqual ? equalWeight : sumBasis > 0 ? basisValue / sumBasis : 0;
    return {
      targetScenarioId: row.scenarioId,
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      scenarioName: row.scenarioName,
      basisValue: roundTo(basisValue, 6),
      weight: roundTo(weight, 10),
    };
  });

  const allocations = [];
  for (const t of targets) {
    for (const pool of pools) {
      const allocated = roundTo(safeNum(pool.poolAmount) * safeNum(t.weight), 6);
      allocations.push({
        targetScenarioId: t.targetScenarioId,
        expenseKey: pool.expenseKey,
        allocatedAmount: allocated,
      });
    }
  }

  return {
    source: {
      scenarioId: sourceScenarioId,
      schoolId: sourceSchoolId,
      academicYear,
      input_currency: sourceScenario?.input_currency,
      local_currency_code: sourceScenario?.local_currency_code,
    },
    basis: { kind: basisKind, yearKey: basisYearKey },
    targets,
    pools,
    allocations,
    warnings,
  };
}

/**
 * GET /expense-distributions/targets?academicYear=YYYY-YYYY
 */
router.get("/expense-distributions/targets", async (req, res) => {
  try {
    const academicYear = normalizeAcademicYear(req.query?.academicYear ?? req.query?.academic_year);
    if (!academicYear) return res.status(400).json({ error: "academicYear is required" });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT sc.id AS scenarioId,
              sc.name AS scenarioName,
              sc.academic_year,
              sc.input_currency,
              sc.local_currency_code,
              sc.fx_usd_to_local,
              s.id AS schoolId,
              s.name AS schoolName
       FROM school_scenarios sc
       JOIN schools s ON s.id = sc.school_id
       WHERE s.country_id = :country_id AND sc.academic_year = :academic_year
       ORDER BY s.name ASC, sc.name ASC`,
      { country_id: req.user.country_id, academic_year: academicYear }
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/expense-split/preview
 */
router.post(
  "/schools/:schoolId/scenarios/:scenarioId/expense-split/preview",
  requirePermission("scenario.expense_split", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const { targetScenarioIds, basis, basisYearKey, expenseKeys } = req.body || {};

      if (!Array.isArray(targetScenarioIds)) {
        return res.status(400).json({ error: "targetScenarioIds must be an array" });
      }
      const basisKind = String(basis || "").toLowerCase();
      if (!['students', 'revenue'].includes(basisKind)) {
        return res.status(400).json({ error: "basis must be students or revenue" });
      }
      const yearKey = String(basisYearKey || "y1").toLowerCase();
      if (!['y1', 'y2', 'y3'].includes(yearKey)) {
        return res.status(400).json({ error: "basisYearKey must be y1, y2, or y3" });
      }

      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: "School not found" });

      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const preview = await buildPreview({
        pool,
        sourceScenario: scenario,
        sourceSchoolId: schoolId,
        targetScenarioIds,
        basis: basisKind,
        basisYearKey: yearKey,
        expenseKeys,
        countryId: req.user.country_id,
      });

      return res.json(preview);
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid request" });
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/expense-split/apply
 */
router.post(
  "/schools/:schoolId/scenarios/:scenarioId/expense-split/apply",
  requirePermission("scenario.expense_split", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const { targetScenarioIds, basis, basisYearKey, expenseKeys } = req.body || {};

      if (!Array.isArray(targetScenarioIds)) {
        return res.status(400).json({ error: "targetScenarioIds must be an array" });
      }
      const basisKind = String(basis || "").toLowerCase();
      if (!['students', 'revenue'].includes(basisKind)) {
        return res.status(400).json({ error: "basis must be students or revenue" });
      }
      const yearKey = String(basisYearKey || "y1").toLowerCase();
      if (!['y1', 'y2', 'y3'].includes(yearKey)) {
        return res.status(400).json({ error: "basisYearKey must be y1, y2, or y3" });
      }

      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: "School not found" });

      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const preview = await buildPreview({
        pool,
        sourceScenario: scenario,
        sourceSchoolId: schoolId,
        targetScenarioIds,
        basis: basisKind,
        basisYearKey: yearKey,
        expenseKeys,
        countryId: req.user.country_id,
      });

      if (!preview.targets.length) {
        return res.status(400).json({ error: "Geçerli hedef senaryo bulunamadi", warnings: preview.warnings });
      }
      if (!preview.pools.length) {
        return res.status(400).json({ error: "Geçerli gider anahtari bulunamadi", warnings: preview.warnings });
      }

      await conn.beginTransaction();
      const scopeJson = JSON.stringify({
        basis: basisKind,
        basisYearKey: yearKey,
        expenseKeys: preview.pools.map((p) => p.expenseKey),
        targetScenarioIds: preview.targets.map((t) => t.targetScenarioId),
      });

      const [setResult] = await conn.query(
        `INSERT INTO expense_distribution_sets
          (country_id, academic_year, source_scenario_id, basis, basis_year_key, scope_json, created_by)
         VALUES
          (:country_id, :academic_year, :source_scenario_id, :basis, :basis_year_key, :scope_json, :created_by)`,
        {
          country_id: req.user.country_id,
          academic_year: preview.source.academicYear,
          source_scenario_id: scenarioId,
          basis: basisKind,
          basis_year_key: yearKey,
          scope_json: scopeJson,
          created_by: req.user.id,
        }
      );

      const distributionId = setResult?.insertId;
      if (!distributionId) throw new Error("Failed to create distribution set");

      for (const t of preview.targets) {
        await conn.query(
          `INSERT INTO expense_distribution_targets
            (distribution_id, target_scenario_id, basis_value, weight)
           VALUES
            (:distribution_id, :target_scenario_id, :basis_value, :weight)`,
          {
            distribution_id: distributionId,
            target_scenario_id: t.targetScenarioId,
            basis_value: roundTo(t.basisValue, 6),
            weight: roundTo(t.weight, 10),
          }
        );
      }

      for (const a of preview.allocations) {
        await conn.query(
          `INSERT INTO expense_distribution_allocations
            (distribution_id, target_scenario_id, expense_key, allocated_amount)
           VALUES
            (:distribution_id, :target_scenario_id, :expense_key, :allocated_amount)`,
          {
            distribution_id: distributionId,
            target_scenario_id: a.targetScenarioId,
            expense_key: a.expenseKey,
            allocated_amount: roundTo(a.allocatedAmount, 6),
          }
        );
      }

      await conn.commit();
      return res.json({ ok: true, distributionId });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {
        // ignore rollback errors
      }
      if (e?.status) return res.status(e.status).json({ error: e.message || "Invalid request" });
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;

