// backend/src/routes/approvalBatches.js

const express = require("express");
const { getPool } = require("../db");
const { requireAuth, requireAssignedCountry, requireRole } = require("../middleware/auth");
const { computeScenarioWorkflowStatus } = require("../utils/scenarioWorkflow");
const {
  listAccessibleSchools,
  buildStaleSourceGuard,
  buildProgressByScenarioId,
  buildScenarioSplitInfo,
  ensureScenarioKpis,
} = require("../utils/countryApprovalBatch");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeYearBasis(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "start" || raw === "start_year" || raw === "startyear") return "start";
  if (raw === "end" || raw === "end_year" || raw === "endyear") return "end";
  return "academic";
}

function normalizeBaseYear(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})$/);
  return match ? match[1] : null;
}

function parseAcademicYearParts(value) {
  const raw = String(value || "").trim();
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const startYear = Number(range[1]);
    const endYear = Number(range[2]);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return { startYear: String(startYear), endYear: String(endYear) };
    }
  }
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const startYear = Number(single[1]);
    if (Number.isFinite(startYear)) return { startYear: String(startYear), endYear: String(startYear) };
  }
  return { startYear: null, endYear: null };
}

async function buildCountryBatchPreview(pool, user, countryId, academicYear, yearBasis = "academic") {
  const schools = await listAccessibleSchools(pool, user);
  const schoolIds = schools.map((s) => Number(s.id)).filter((id) => Number.isFinite(id));
  const nameById = new Map(schools.map((s) => [String(s.id), s.name]));

  const guard = await buildStaleSourceGuard(pool, schoolIds);

  if (!schoolIds.length) {
    return {
      rows: [],
      guard,
      canSubmit: false,
      candidateRows: [],
    };
  }

  const basis = normalizeYearBasis(yearBasis);
  let yearClause = "academic_year = :academic_year";
  const params = { ids: schoolIds };
  if (basis === "start") {
    yearClause = "(academic_year = :year OR REPLACE(academic_year, ' ', '') LIKE CONCAT(:year, '-%'))";
    params.year = academicYear;
  } else if (basis === "end") {
    yearClause = "(academic_year = :year OR REPLACE(academic_year, ' ', '') LIKE CONCAT('%-', :year))";
    params.year = academicYear;
  } else {
    params.academic_year = academicYear;
  }

  const [scenarioRows] = await pool.query(
    `SELECT id, school_id, name, academic_year, status, sent_at, created_at, checked_at,
            input_currency, fx_usd_to_local, local_currency_code
     FROM school_scenarios
     WHERE school_id IN (:ids) AND ${yearClause}
     ORDER BY school_id ASC, COALESCE(checked_at, created_at) DESC, id DESC`,
    params
  );
  const rows = Array.isArray(scenarioRows) ? scenarioRows : [];

  const latestBySchoolId = new Map();
  const approvedBySchoolId = new Map();
  rows.forEach((row) => {
    const key = String(row.school_id);
    if (!latestBySchoolId.has(key)) latestBySchoolId.set(key, row);
    if (
      !approvedBySchoolId.has(key) &&
      String(row.status || "") === "approved" &&
      row.sent_at == null
    ) {
      approvedBySchoolId.set(key, row);
    }
  });

  const displayScenarioBySchoolId = new Map();
  schools.forEach((school) => {
    const key = String(school.id);
    const scenario = approvedBySchoolId.get(key) || latestBySchoolId.get(key) || null;
    if (scenario) displayScenarioBySchoolId.set(key, scenario);
  });
  const displayScenarioRows = Array.from(displayScenarioBySchoolId.values());
  const progressByScenarioId = await buildProgressByScenarioId(pool, user.country_id, displayScenarioRows);
  const splitInfoByScenarioId = await buildScenarioSplitInfo(pool, displayScenarioRows);

  const outputRows = schools.map((school) => {
    const key = String(school.id);
    const candidate = approvedBySchoolId.get(key) || null;
    const scenario = displayScenarioBySchoolId.get(key) || null;

    if (!scenario) {
      return {
        schoolId: Number(school.id),
        schoolName: nameById.get(key) || "",
        scenarioId: null,
        scenarioName: null,
        academicYear,
        status: null,
        progress: null,
        sentAt: null,
        splitStatus: "none",
        isSourceScenario: false,
        eligible: false,
        reasons: ["Senaryo yok"],
      };
    }

    const status = String(scenario.status || "");
    const reasons = [];
    let progress = null;
    let splitStatus = "none";
    let isSourceScenario = false;

    const pct = progressByScenarioId.get(String(scenario.id));
    if (pct != null) {
      progress = Number.isFinite(pct) ? pct : 0;
    }
    if (!Number.isFinite(progress) || Number(progress) < 100) {
      reasons.push("Ilerleme %100 degil");
    }
    if (!candidate && status !== "approved") {
      reasons.push("Kontrol edilmedi");
    }
    if (scenario.sent_at != null || status === "sent_for_approval") {
      reasons.push("Merkeze iletildi");
    }
    const splitInfo = splitInfoByScenarioId.get(String(scenario.id)) || {
      splitStatus: "none",
      isSourceScenario: false,
    };
    splitStatus = splitInfo.splitStatus;
    isSourceScenario = splitInfo.isSourceScenario;
    if (splitInfo.splitStatus === "stale") reasons.push("Gider dagitimi guncel degil");

    return {
      schoolId: Number(school.id),
      schoolName: nameById.get(key) || "",
      scenarioId: candidate ? Number(candidate.id) : Number(scenario.id),
      scenarioName: scenario.name,
      academicYear: scenario.academic_year || academicYear,
      status: scenario.status,
      input_currency: scenario.input_currency || null,
      fx_usd_to_local: scenario.fx_usd_to_local ?? null,
      local_currency_code: scenario.local_currency_code || null,
      progress,
      sentAt: scenario.sent_at,
      splitStatus,
      isSourceScenario,
      eligible: reasons.length === 0,
      reasons,
    };
  });

  const canSubmit =
    outputRows.length > 0 &&
    outputRows.every((row) => row.eligible) &&
    !guard.bulkDisabledDueToStaleSource;

  return {
    rows: outputRows,
    guard,
    canSubmit,
  };
}

router.post(
  "/:countryId/approval-batches/preview",
  requireRole(["manager", "accountant"]),
  async (req, res) => {
    try {
      const countryId = toNumber(req.params.countryId);
      if (!countryId) return res.status(400).json({ error: "Invalid countryId" });
      if (Number(req.user.country_id) !== Number(countryId)) {
        return res.status(403).json({ error: "Access denied for country" });
      }

      const yearBasis = normalizeYearBasis(req.body?.yearBasis ?? req.body?.year_basis);
      const academicYearRaw = String(req.body?.academicYear || "").trim();
      if (!academicYearRaw) return res.status(400).json({ error: "academicYear is required" });
      let academicYear = academicYearRaw;
      if (yearBasis !== "academic") {
        const baseYear = normalizeBaseYear(academicYearRaw);
        if (!baseYear) return res.status(400).json({ error: "academicYear must be YYYY for base-year mode" });
        academicYear = baseYear;
      }

      const pool = getPool();
      const preview = await buildCountryBatchPreview(pool, req.user, countryId, academicYear, yearBasis);

      return res.json({
        canSubmit: preview.canSubmit,
        bulkDisabledDueToStaleSource: preview.guard.bulkDisabledDueToStaleSource,
        staleSources: preview.guard.staleSources,
        rows: preview.rows,
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

router.get(
  "/:countryId/approval-batches/years",
  requireRole(["manager", "accountant"]),
  async (req, res) => {
    try {
      const countryId = toNumber(req.params.countryId);
      if (!countryId) return res.status(400).json({ error: "Invalid countryId" });
      if (Number(req.user.country_id) !== Number(countryId)) {
        return res.status(403).json({ error: "Access denied for country" });
      }

      const yearBasis = normalizeYearBasis(req.query?.yearBasis ?? req.query?.year_basis);
      const pool = getPool();
      const [rows] = await pool.query(
        `SELECT DISTINCT sc.academic_year
         FROM school_scenarios sc
         JOIN schools s ON s.id = sc.school_id
         WHERE s.country_id=:cid
           AND NOT (sc.status='approved' AND sc.sent_at IS NOT NULL)
         ORDER BY sc.academic_year DESC`,
        { cid: countryId }
      );
      const rawYears = (Array.isArray(rows) ? rows : [])
        .map((row) => String(row?.academic_year || "").trim())
        .filter((val) => val);
      if (yearBasis === "academic") {
        return res.json({ years: rawYears });
      }
      const baseSet = new Set();
      rawYears.forEach((val) => {
        const { startYear, endYear } = parseAcademicYearParts(val);
        const key = yearBasis === "start" ? startYear : endYear;
        if (key) baseSet.add(String(key));
      });
      const years = Array.from(baseSet).sort((a, b) => Number(b) - Number(a));

      return res.json({ years });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

router.post(
  "/:countryId/approval-batches",
  requireRole(["manager", "accountant"]),
  async (req, res) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      const countryId = toNumber(req.params.countryId);
      if (!countryId) return res.status(400).json({ error: "Invalid countryId" });
      if (Number(req.user.country_id) !== Number(countryId)) {
        return res.status(403).json({ error: "Access denied for country" });
      }
      const yearBasis = normalizeYearBasis(req.body?.yearBasis ?? req.body?.year_basis);
      const academicYearRaw = String(req.body?.academicYear || "").trim();
      if (!academicYearRaw) return res.status(400).json({ error: "academicYear is required" });
      let academicYear = academicYearRaw;
      if (yearBasis !== "academic") {
        const baseYear = normalizeBaseYear(academicYearRaw);
        if (!baseYear) return res.status(400).json({ error: "academicYear must be YYYY for base-year mode" });
        academicYear = baseYear;
      }

      const [[openRow]] = await pool.query(
        `SELECT 1 FROM country_approval_batches
         WHERE country_id=:cid AND academic_year=:ay AND year_basis=:yb AND status='sent_for_approval'
         LIMIT 1`,
        { cid: countryId, ay: academicYear, yb: yearBasis }
      );
      if (openRow) {
        return res.status(409).json({ error: "Country approval batch already open for this academic year" });
      }

      const preview = await buildCountryBatchPreview(pool, req.user, countryId, academicYear, yearBasis);
      if (preview.guard.bulkDisabledDueToStaleSource) {
        return res.status(409).json({
          error: "Country approval batch blocked due to stale source scenarios",
          bulkDisabledDueToStaleSource: true,
          staleSources: preview.guard.staleSources,
        });
      }
      if (!preview.rows.length || !preview.canSubmit) {
        return res.status(409).json({
          error: "Not all schools are eligible for approval",
          rows: preview.rows,
        });
      }

      await conn.beginTransaction();

      const [batchRes] = await conn.query(
        `INSERT INTO country_approval_batches
          (country_id, academic_year, year_basis, status, created_by)
         VALUES
          (:country_id, :academic_year, :year_basis, 'sent_for_approval', :created_by)`,
        {
          country_id: countryId,
          academic_year: academicYear,
          year_basis: yearBasis,
          created_by: req.user.id,
        }
      );
      const batchId = batchRes?.insertId;
      if (!batchId) throw new Error("Failed to create approval batch");

      const results = [];
      for (const row of preview.rows) {
        if (!row.eligible || !row.scenarioId) continue;
        const scenarioId = Number(row.scenarioId);
        const schoolId = Number(row.schoolId);

        try {
          await computeScenarioWorkflowStatus(conn, scenarioId);
        } catch (_) {
          // ignore status recompute errors
        }

        const [[reloaded]] = await conn.query(
          "SELECT id, school_id, academic_year, status, sent_at, input_currency, fx_usd_to_local, local_currency_code FROM school_scenarios WHERE id=:sid",
          { sid: scenarioId }
        );
        if (!reloaded || reloaded.status !== "approved" || reloaded.sent_at != null) {
          results.push({ scenarioId, ok: false, reasons: ["Kontrol edilmedi"] });
          throw new Error("Scenario no longer eligible");
        }

        try {
          await ensureScenarioKpis(conn, reloaded, req.user.id);
        } catch (err) {
          results.push({ scenarioId, ok: false, reasons: [err?.message || "KPI hesaplanamadi"] });
          throw err;
        }

        await conn.query(
          `INSERT INTO country_approval_batch_items
            (batch_id, scenario_id, school_id, is_source)
           VALUES
            (:batch_id, :scenario_id, :school_id, :is_source)`,
          {
            batch_id: batchId,
            scenario_id: scenarioId,
            school_id: schoolId,
            is_source: row.isSourceScenario ? 1 : 0,
          }
        );

        await conn.query(
          `UPDATE school_scenarios
           SET status='sent_for_approval',
               sent_at=CURRENT_TIMESTAMP,
               sent_by=:uid,
               checked_at=COALESCE(checked_at, CURRENT_TIMESTAMP),
               checked_by=COALESCE(checked_by, :uid)
           WHERE id=:sid`,
          { uid: req.user.id, sid: scenarioId }
        );
        await conn.query(
          `INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id)
           VALUES (:sid, 'submit', NULL, :uid)`,
          { sid: scenarioId, uid: req.user.id }
        );

        results.push({ scenarioId, ok: true, reasons: [] });
      }

      await conn.commit();
      return res.json({
        batchId,
        academicYear,
        countryId,
        scenarioCount: results.filter((r) => r.ok).length,
        results,
      });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {
        // ignore rollback errors
      }
      if (e?.status) return res.status(e.status).json({ error: e.message });
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
