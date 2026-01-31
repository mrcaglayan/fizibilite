// backend/src/routes/expenseDistributions.js

const express = require("express");
const { getPool } = require("../db");
const {
  computeIncomeFromGelirler,
  computeStudentsFromGrades,
  calculateDiscounts,
  calculateSchoolFeasibility,
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
const SALARY_KEYS = new Set([
  "turkPersonelMaas",
  "turkDestekPersonelMaas",
  "yerelPersonelMaas",
  "yerelDestekPersonelMaas",
  "internationalPersonelMaas",
]);
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

function computeSalaryFromIkY1(ik) {
  const yearIK = ik?.years?.y1 ? ik.years.y1 : ik || {};
  const unitCosts = yearIK?.unitCosts || {};
  const headcountsByLevel = yearIK?.headcountsByLevel || {};
  const levelKeys = Object.keys(headcountsByLevel || {});
  const roles = [
    "turk_mudur",
    "turk_mdyard",
    "turk_egitimci",
    "turk_temsil",
    "yerel_yonetici_egitimci",
    "yerel_destek",
    "yerel_ulke_temsil_destek",
    "int_yonetici_egitimci",
  ];

  const roleAnnual = {};
  for (const role of roles) {
    let count = 0;
    for (const lvl of levelKeys) {
      count += safeNum(headcountsByLevel?.[lvl]?.[role]);
    }
    roleAnnual[role] = safeNum(unitCosts?.[role]) * count;
  }

  return {
    turkPersonelMaas:
      safeNum(roleAnnual.turk_mudur) +
      safeNum(roleAnnual.turk_mdyard) +
      safeNum(roleAnnual.turk_egitimci),
    turkDestekPersonelMaas: safeNum(roleAnnual.turk_temsil),
    yerelPersonelMaas: safeNum(roleAnnual.yerel_yonetici_egitimci),
    yerelDestekPersonelMaas:
      safeNum(roleAnnual.yerel_destek) + safeNum(roleAnnual.yerel_ulke_temsil_destek),
    internationalPersonelMaas: safeNum(roleAnnual.int_yonetici_egitimci),
  };
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
  const totalStudents = computeStudentsFromGrades(grades).totalStudents;
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

function normalizeYearBasis(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "start" || raw === "start_year" || raw === "startyear") return "start";
  if (raw === "end" || raw === "end_year" || raw === "endyear") return "end";
  return "academic";
}

function parseAcademicYearParts(value) {
  const raw = String(value || "").trim();
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const startYear = Number(range[1]);
    const endYear = Number(range[2]);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return { startYear: String(startYear), endYear: String(endYear), normalized: `${startYear}-${endYear}` };
    }
  }
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const year = Number(single[1]);
    if (Number.isFinite(year)) return { startYear: String(year), endYear: String(year), normalized: String(year) };
  }
  return { startYear: null, endYear: null, normalized: raw || null };
}

async function assertNoOpenCountryBatch(pool, countryId, academicYear) {
  const { startYear, endYear, normalized } = parseAcademicYearParts(academicYear);
  const filters = [];
  const params = { cid: countryId };
  if (normalized) {
    filters.push("(year_basis='academic' AND academic_year=:ay)");
    filters.push("(year_basis IS NULL AND academic_year=:ay)");
    params.ay = normalized;
  }
  if (startYear) {
    filters.push("(year_basis='start' AND academic_year=:start_year)");
    params.start_year = startYear;
  }
  if (endYear) {
    filters.push("(year_basis='end' AND academic_year=:end_year)");
    params.end_year = endYear;
  }
  if (!filters.length) return;
  const [[row]] = await pool.query(
    `SELECT 1
     FROM country_approval_batches
     WHERE country_id=:cid AND status='sent_for_approval'
       AND (${filters.join(" OR ")})
     LIMIT 1`,
    params
  );
  if (row) {
    const error = new Error("Country approval batch is open for this academic year; expense split changes are locked.");
    error.status = 409;
    throw error;
  }
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

  const requestedTargetIds = pickUniqueScenarioIds(targetScenarioIds);
  let uniqueTargetIds = requestedTargetIds.filter((id) => String(id) !== String(sourceScenarioId));
  if (requestedTargetIds.length !== uniqueTargetIds.length) {
    warnings.push("Kaynak senaryo hedef listesinden çikarildi.");
  }
  if (uniqueTargetIds.length) {
    const [sourceRows] = await pool.query(
      `SELECT DISTINCT source_scenario_id
       FROM expense_distribution_sets
       WHERE source_scenario_id IN (:ids)`,
      { ids: uniqueTargetIds }
    );
    const sourceIdSet = new Set(
      (Array.isArray(sourceRows) ? sourceRows : [])
        .map((row) => String(row?.source_scenario_id))
        .filter((id) => id)
    );
    if (sourceIdSet.size) {
      uniqueTargetIds = uniqueTargetIds.filter((id) => !sourceIdSet.has(String(id)));
      warnings.push("Gider paylastirma kaynagi olan senaryolar hedef listesinden cikarildi.");
    }
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

  const salaryPools = computeSalaryFromIkY1(inputs?.ik);
  const pools = cleanExpenseKeys.map((key) => {
    let poolAmount = 0;
    if (OPERATING_KEYS.has(key)) {
      if (SALARY_KEYS.has(key)) {
        poolAmount = safeNum(salaryPools?.[key]);
      } else {
        poolAmount = safeNum(inputs?.giderler?.isletme?.items?.[key]);
      }
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

  // IMPORTANT:
  // We derive basis values directly from inputs_json so users don't need to click "Hesapla".
  // scenario_kpis is only refreshed when "Hesapla" runs, which can make splits and the stale indicator incorrect.
  const includedIds = Array.from(
    new Set(includedTargets.map((t) => Number(t.scenarioId)).filter((n) => Number.isFinite(n) && n > 0))
  );

  const inputsByScenario = new Map();
  if (includedIds.length) {
    const [rows] = await pool.query(
      `SELECT scenario_id, inputs_json
       FROM scenario_inputs
       WHERE scenario_id IN (:ids)`,
      { ids: includedIds }
    );
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const sid = Number(r.scenario_id);
      if (!Number.isFinite(sid)) return;
      inputsByScenario.set(String(sid), parseInputsJson(r.inputs_json));
    });
  }

  const basisMetricsCache = new Map();
  const getBasisMetrics = (scenarioId) => {
    const sid = Number(scenarioId);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    if (basisMetricsCache.has(sid)) return basisMetricsCache.get(sid);
    const inputs = inputsByScenario.get(String(sid));
    if (!inputs) {
      basisMetricsCache.set(sid, null);
      return null;
    }
    try {
      const results = calculateSchoolFeasibility(inputs, {});
      const years = results && typeof results === "object" && results.years && typeof results.years === "object" ? results.years : { y1: results };
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

  const basisKind = String(basis || "").toLowerCase();
  const targetsWithBasis = includedTargets.map((row) => {
    const metrics = getBasisMetrics(row.scenarioId);
    const m = metrics?.[basisYearKey] || metrics?.y1;
    let basisValue = 0;
    if (m) {
      basisValue = basisKind === "revenue" ? safeNum(m.netCiro) : safeNum(m.students);
    } else {
      warnings.push(`Girdi bulunamadi / hesaplanamadi: senaryo ${row.scenarioId} (${basisYearKey})`);
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
 * GET /expense-distributions/targets?academicYear=YYYY-YYYY&yearBasis=academic|start|end
 */
router.get("/expense-distributions/targets", async (req, res) => {
  try {
    const academicYearRaw = String(req.query?.academicYear ?? req.query?.academic_year ?? "").trim();
    if (!academicYearRaw) return res.status(400).json({ error: "academicYear is required" });
    const yearBasis = normalizeYearBasis(req.query?.yearBasis ?? req.query?.year_basis);
    let academicYear = academicYearRaw;
    if (yearBasis === "academic") {
      academicYear = normalizeAcademicYear(academicYearRaw);
    } else {
      const baseYear = normalizeAcademicYear(academicYearRaw);
      if (!/^\d{4}$/.test(baseYear)) {
        return res.status(400).json({ error: "academicYear must be YYYY for base-year mode" });
      }
      academicYear = baseYear;
    }

    // By default, exclude closed schools from the target picker.
    // (Admins can include them explicitly, matching /schools behavior.)
    const includeClosed = String(req.query?.includeClosed || "") === "1";
    if (includeClosed && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can include closed schools" });
    }

    let yearClause = "sc.academic_year = :academic_year";
    const params = { country_id: req.user.country_id };
    if (yearBasis === "start") {
      yearClause = "(sc.academic_year = :year OR REPLACE(sc.academic_year, ' ', '') LIKE CONCAT(:year, '-%'))";
      params.year = academicYear;
    } else if (yearBasis === "end") {
      yearClause = "(sc.academic_year = :year OR REPLACE(sc.academic_year, ' ', '') LIKE CONCAT('%-', :year))";
      params.year = academicYear;
    } else {
      params.academic_year = academicYear;
    }

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
       WHERE s.country_id = :country_id
          AND ${yearClause}
          AND NOT EXISTS (
            SELECT 1 FROM expense_distribution_sets eds
            WHERE eds.source_scenario_id = sc.id
          )
          ${includeClosed ? "" : "AND s.status = 'active'"}
       ORDER BY s.name ASC, sc.name ASC`,
      params
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:schoolId/scenarios/:scenarioId/expense-split/last-scope
 *
 * Returns the last applied expense split scope for a source scenario.
 */
router.get(
  "/schools/:schoolId/scenarios/:scenarioId/expense-split/last-scope",
  requirePermission("scenario.expense_split", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      if (!Number.isFinite(schoolId) || !Number.isFinite(scenarioId)) {
        return res.status(400).json({ error: "Invalid schoolId or scenarioId" });
      }

      const pool = getPool();
      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: "School not found" });

      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const [[row]] = await pool.query(
        `SELECT id, basis, basis_year_key, scope_json, created_at
         FROM expense_distribution_sets
         WHERE source_scenario_id=:sid
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        { sid: scenarioId }
      );

      if (!row) return res.json({ scope: null });

      let scope = null;
      if (row.scope_json) {
        if (typeof row.scope_json === "string") {
          try {
            scope = JSON.parse(row.scope_json);
          } catch (_) {
            scope = null;
          }
        } else if (typeof row.scope_json === "object") {
          scope = row.scope_json;
        }
      }

      const normalizedScope = scope && typeof scope === "object" ? scope : {};
      return res.json({
        distributionId: row.id,
        createdAt: row.created_at,
        scope: {
          basis: String(normalizedScope.basis || row.basis || "").toLowerCase() || null,
          basisYearKey: String(normalizedScope.basisYearKey || row.basis_year_key || "").toLowerCase() || null,
          expenseKeys: Array.isArray(normalizedScope.expenseKeys) ? normalizedScope.expenseKeys : [],
          targetScenarioIds: Array.isArray(normalizedScope.targetScenarioIds) ? normalizedScope.targetScenarioIds : [],
        },
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

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

      await assertNoOpenCountryBatch(pool, req.user.country_id, scenario.academic_year);

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

        // Snapshots used to detect if a distribution becomes stale later.
        // (We store these here to avoid rounding drift from summing allocations.)
        poolAmounts: Object.fromEntries(
          preview.pools.map((p) => [p.expenseKey, roundTo(p.poolAmount, 6)])
        ),
        targetBasisValues: Object.fromEntries(
          preview.targets.map((t) => [String(t.targetScenarioId), roundTo(t.basisValue, 6)])
        ),
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

/**
 * POST /schools/:schoolId/scenarios/:scenarioId/expense-split/revert
 *
 * Reverts targets from the latest expense distribution set for a source scenario.
 */
router.post(
  "/schools/:schoolId/scenarios/:scenarioId/expense-split/revert",
  requirePermission("scenario.expense_split", "write", { schoolIdParam: "schoolId" }),
  async (req, res) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      const schoolId = Number(req.params.schoolId);
      const scenarioId = Number(req.params.scenarioId);
      const targetScenarioIds = Array.isArray(req.body?.targetScenarioIds)
        ? req.body.targetScenarioIds
        : null;

      if (!Number.isFinite(schoolId) || !Number.isFinite(scenarioId)) {
        return res.status(400).json({ error: "Invalid schoolId or scenarioId" });
      }
      if (!targetScenarioIds || targetScenarioIds.length === 0) {
        return res.status(400).json({ error: "targetScenarioIds must be a non-empty array" });
      }

      const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
      if (!school) return res.status(404).json({ error: "School not found" });

      const scenario = await assertScenarioInSchool(pool, scenarioId, schoolId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      await assertNoOpenCountryBatch(pool, req.user.country_id, scenario.academic_year);

      const [[latest]] = await pool.query(
        `SELECT id, created_at
         FROM expense_distribution_sets
         WHERE source_scenario_id=:sid
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        { sid: scenarioId }
      );
      if (!latest) return res.status(404).json({ error: "No distribution set found" });

      const ids = pickUniqueScenarioIds(targetScenarioIds);
      const [existingRows] = await pool.query(
        `SELECT target_scenario_id
         FROM expense_distribution_targets
         WHERE distribution_id=:did AND target_scenario_id IN (:ids)`,
        { did: latest.id, ids: ids.length ? ids : [0] }
      );
      const existingIds = (Array.isArray(existingRows) ? existingRows : []).map((r) =>
        Number(r.target_scenario_id)
      );
      if (!existingIds.length) {
        return res.status(400).json({ error: "Selected targets not found in latest distribution set" });
      }

      await conn.beginTransaction();
      await conn.query(
        `DELETE FROM expense_distribution_allocations
         WHERE distribution_id=:did AND target_scenario_id IN (:ids)`,
        { did: latest.id, ids: existingIds }
      );
      await conn.query(
        `DELETE FROM expense_distribution_targets
         WHERE distribution_id=:did AND target_scenario_id IN (:ids)`,
        { did: latest.id, ids: existingIds }
      );

      const [[remaining]] = await conn.query(
        "SELECT COUNT(*) AS cnt FROM expense_distribution_targets WHERE distribution_id=:did",
        { did: latest.id }
      );
      const remainingCount = Number(remaining?.cnt || 0);
      let deletedSet = false;
      if (remainingCount <= 0) {
        await conn.query("DELETE FROM expense_distribution_sets WHERE id=:did", { did: latest.id });
        deletedSet = true;
      }

      await conn.commit();
      return res.json({
        ok: true,
        distributionId: latest.id,
        removedTargetScenarioIds: existingIds,
        deletedSet,
      });
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

