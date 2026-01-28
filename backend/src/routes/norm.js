//backend/src/routes/norm.js


const express = require("express");
const { getPool } = require("../db");
const { requireAuth, requireAssignedCountry, requireSchoolPermission } = require("../middleware/auth");
const { invalidateScenarioProgress } = require("../utils/scenarioProgressCache");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

const GRADE_KEYS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const YEAR_KEYS = ["y1", "y2", "y3"];
const DEFAULT_MAX_HOURS = 24;

function buildEmptyCurriculum() {
  const empty = {};
  GRADE_KEYS.forEach((g) => (empty[g] = {}));
  return empty;
}

function sanitizeCurriculum(curr) {
  const out = buildEmptyCurriculum();
  if (!curr || typeof curr !== "object") return out;

  for (const g of GRADE_KEYS) {
    const gradeObj = curr[g];
    if (!gradeObj || typeof gradeObj !== "object") continue;
    for (const [subject, v] of Object.entries(gradeObj)) {
      const key = String(subject || "").trim();
      if (!key) continue;
      const num = Number(v);
      out[g][key] = Number.isFinite(num) && num >= 0 ? num : 0;
    }
  }
  return out;
}

function hasGradeKeys(obj) {
  if (!obj || typeof obj !== "object") return false;
  return GRADE_KEYS.some((g) => Object.prototype.hasOwnProperty.call(obj, g));
}

function normalizeNormYears({ years, teacherWeeklyMaxHours, curriculumWeeklyHours, fallbackMaxHours }) {
  const baseHoursRaw = Number(teacherWeeklyMaxHours ?? fallbackMaxHours);
  const baseHours = Number.isFinite(baseHoursRaw) && baseHoursRaw > 0 ? baseHoursRaw : DEFAULT_MAX_HOURS;
  const baseCurr = sanitizeCurriculum(curriculumWeeklyHours);

  const yearSource =
    years && typeof years === "object" && years.years && typeof years.years === "object"
      ? years.years
      : years && typeof years === "object"
        ? years
        : curriculumWeeklyHours &&
            typeof curriculumWeeklyHours === "object" &&
            curriculumWeeklyHours.years &&
            typeof curriculumWeeklyHours.years === "object"
          ? curriculumWeeklyHours.years
          : curriculumWeeklyHours && typeof curriculumWeeklyHours === "object" && YEAR_KEYS.some((y) => y in curriculumWeeklyHours)
            ? curriculumWeeklyHours
            : null;

  const outYears = {};
  YEAR_KEYS.forEach((y) => {
    const src = yearSource?.[y] || {};
    const hoursRaw = Number(src?.teacherWeeklyMaxHours ?? baseHours);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : baseHours;
    const currSource = src?.curriculumWeeklyHours || (hasGradeKeys(src) ? src : baseCurr);
    outYears[y] = {
      teacherWeeklyMaxHours: hours,
      curriculumWeeklyHours: sanitizeCurriculum(currSource),
    };
  });

  return { years: outYears };
}

async function assertSchoolInUserCountry(pool, schoolId, countryId) {
  const [[s]] = await pool.query(
    "SELECT id, status FROM schools WHERE id=:id AND country_id=:country_id",
    { id: schoolId, country_id: countryId }
  );
  return s || null;
}

/**
 * GET /schools/:schoolId/norm-config
 */
router.get(
  "/schools/:schoolId/norm-config",
  // Require read access to the Norm page for the given school
  requireSchoolPermission('page.norm', 'read', 'schoolId'),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioIdRaw = req.query?.scenarioId;
    const scenarioId = scenarioIdRaw != null ? Number(scenarioIdRaw) : null;
    if (scenarioIdRaw != null && !Number.isFinite(scenarioId)) {
      return res.status(400).json({ error: "Invalid scenarioId" });
    }
    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });

    let row = null;
    if (scenarioId) {
      const [[scenario]] = await pool.query(
        "SELECT id FROM school_scenarios WHERE id=:id AND school_id=:school_id",
        { id: scenarioId, school_id: schoolId }
      );
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      const [[scenarioRow]] = await pool.query(
        "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_at FROM scenario_norm_configs WHERE scenario_id=:id",
        { id: scenarioId }
      );
      row = scenarioRow || null;
    }
    if (!row) {
      const [[schoolRow]] = await pool.query(
        "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_at FROM school_norm_configs WHERE school_id=:school_id",
        { school_id: schoolId }
      );
      row = schoolRow || null;
    }

    if (!row) {
      // should not happen, but handle
      const emptyYears = normalizeNormYears({ fallbackMaxHours: DEFAULT_MAX_HOURS, curriculumWeeklyHours: null });
      return res.json({
        ...emptyYears,
        teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
        curriculumWeeklyHours: emptyYears.years.y1.curriculumWeeklyHours,
        updatedAt: null,
      });
    }

    const normalized = normalizeNormYears({
      teacherWeeklyMaxHours: row.teacher_weekly_max_hours,
      curriculumWeeklyHours: row.curriculum_weekly_hours_json,
      fallbackMaxHours: DEFAULT_MAX_HOURS,
    });
    const y1 = normalized.years.y1;

    return res.json({
      ...normalized,
      teacherWeeklyMaxHours: y1.teacherWeeklyMaxHours,
      curriculumWeeklyHours: y1.curriculumWeeklyHours,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
  }
);

/**
 * PUT /schools/:schoolId/norm-config
 * Body: { teacherWeeklyMaxHours, curriculumWeeklyHours }
 */
router.put(
  "/schools/:schoolId/norm-config",
  // Require write permission to the Norm page for the given school
  requireSchoolPermission('page.norm', 'write', 'schoolId'),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    const scenarioIdRaw = req.query?.scenarioId;
    const scenarioId = scenarioIdRaw != null ? Number(scenarioIdRaw) : null;
    if (scenarioIdRaw != null && !Number.isFinite(scenarioId)) {
      return res.status(400).json({ error: "Invalid scenarioId" });
    }
    const payload = req.body || {};
    const normalized = normalizeNormYears({
      years: payload.years,
      teacherWeeklyMaxHours: payload.teacherWeeklyMaxHours,
      curriculumWeeklyHours: payload.curriculumWeeklyHours,
      fallbackMaxHours: DEFAULT_MAX_HOURS,
    });

    for (const y of YEAR_KEYS) {
      const hours = Number(normalized?.years?.[y]?.teacherWeeklyMaxHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: "teacherWeeklyMaxHours must be a positive number" });
      }
    }

    const pool = getPool();
    const school = await assertSchoolInUserCountry(pool, schoolId, req.user.country_id);
    if (!school) return res.status(404).json({ error: "School not found" });
    if (school.status === "closed" && req.user.role !== "admin") {
      return res.status(403).json({ error: "School is closed." });
    }

    if (scenarioId) {
      const [[scenario]] = await pool.query(
        "SELECT id FROM school_scenarios WHERE id=:id AND school_id=:school_id",
        { id: scenarioId, school_id: schoolId }
      );
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      await pool.query(
        "INSERT INTO scenario_norm_configs (scenario_id, teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_by) " +
          "VALUES (:id, :h, :j, :u) " +
          "ON DUPLICATE KEY UPDATE teacher_weekly_max_hours=VALUES(teacher_weekly_max_hours), " +
          "curriculum_weekly_hours_json=VALUES(curriculum_weekly_hours_json), " +
          "updated_by=VALUES(updated_by)",
        {
          h: normalized.years.y1.teacherWeeklyMaxHours,
          j: JSON.stringify({ years: normalized.years }),
          u: req.user.id,
          id: scenarioId,
        }
      );

      try {
        await invalidateScenarioProgress(pool, scenarioId);
      } catch (_) {
        // ignore cache invalidation failures
      }

      return res.json({ ok: true });
    }

    await pool.query(
      "INSERT INTO school_norm_configs (school_id, teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_by) " +
        "VALUES (:id, :h, :j, :u) " +
        "ON DUPLICATE KEY UPDATE teacher_weekly_max_hours=VALUES(teacher_weekly_max_hours), " +
        "curriculum_weekly_hours_json=VALUES(curriculum_weekly_hours_json), " +
        "updated_by=VALUES(updated_by)",
      {
        h: normalized.years.y1.teacherWeeklyMaxHours,
        j: JSON.stringify({ years: normalized.years }),
        u: req.user.id,
        id: schoolId,
      }
    );

    try {
      const [rows] = await pool.query(
        "SELECT id FROM school_scenarios WHERE school_id=:school_id",
        { school_id: schoolId }
      );
      if (Array.isArray(rows)) {
        for (const row of rows) {
          await invalidateScenarioProgress(pool, row.id);
        }
      }
    } catch (_) {
      // ignore cache invalidation failures
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
  }
);

module.exports = router;
