//backend/src/routes/schools.js

const express = require("express");
const { getPool } = require("../db");
const {
  requireAuth,
  requireAssignedCountry,
  requireSchoolContextAccess,
  requireSchoolPermission,
  requireAnySchoolRead,
  requirePermission,
} = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

/**
 * GET /schools
 * Returns schools for user's country (user can have many schools)
 */
router.get("/", async (req, res) => {
  try {
    const includeClosed = String(req.query?.includeClosed || "") === "1";
    if (includeClosed && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can include closed schools" });
    }
    const pool = getPool();
    const results = [];
    if (String(req.user.role) === 'principal') {
      // Principals see only schools they are assigned to
      const where = [
        'sur.user_id = :uid',
        "sur.role = 'principal'",
        's.id = sur.school_id',
      ];
      if (!includeClosed) {
        where.push("s.status = 'active'");
      }
      if (req.user.country_id != null) {
        where.push('s.country_id = :country_id');
      }
      const [rows] = await pool.query(
        `SELECT s.id, s.name, s.country_id,
                c.name AS country_name, c.code AS country_code,
                s.status, s.created_by, s.created_at,
                s.closed_at, s.closed_by, s.updated_at, s.updated_by
         FROM schools s
         JOIN countries c ON c.id = s.country_id
         JOIN school_user_roles sur ON sur.school_id = s.id
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at DESC`,
        { uid: req.user.id, country_id: req.user.country_id }
      );
      return res.json(rows);
    } else {
      // Other roles see all schools in their country
      const where = ['s.country_id = :country_id'];
      if (!includeClosed) {
        where.push("s.status = 'active'");
      }
      const [rows] = await pool.query(
        `SELECT s.id, s.name, s.country_id,
                c.name AS country_name, c.code AS country_code,
                s.status, s.created_by, s.created_at,
                s.closed_at, s.closed_by, s.updated_at, s.updated_by
         FROM schools s
         JOIN countries c ON c.id = s.country_id
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at DESC`,
        { country_id: req.user.country_id }
      );
      return res.json(rows);
    }
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools
 * Body: { name }
 */
router.post("/", requirePermission("school.create", "write"), async (req, res) => {
  try {
    const { name } = req.body || {};
    const trimmed = String(name || "").trim();
    if (!trimmed) return res.status(400).json({ error: "name is required" });
    if (!req.user.country_id) {
      return res.status(400).json({ error: "Country assignment required" });
    }

    const pool = getPool();
    const [[existing]] = await pool.query(
      "SELECT id FROM schools WHERE country_id=:country_id AND name=:name",
      { country_id: req.user.country_id, name: trimmed }
    );
    if (existing) return res.status(409).json({ error: "School already exists for this country" });
    const [r] = await pool.query(
      "INSERT INTO schools (country_id, name, created_by, status) VALUES (:country_id, :name, :created_by, 'active')",
      { country_id: req.user.country_id, name: trimmed, created_by: req.user.id }
    );

    // Create a default norm config row (empty curriculum)
    const buildEmptyCurr = () => {
      const curr = {};
      ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].forEach((g) => (curr[g] = {}));
      return curr;
    };
    const emptyYears = {
      y1: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurr() },
      y2: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurr() },
      y3: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurr() },
    };
    await pool.query(
      "INSERT INTO school_norm_configs (school_id, teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_by) VALUES (:school_id, 24, :json, :updated_by)",
      { school_id: r.insertId, json: JSON.stringify({ years: emptyYears }), updated_by: req.user.id }
    );

    return res.json({ id: r.insertId, name: trimmed, country_id: req.user.country_id, status: "active" });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:id
 *
 * Requires read permission on the Temel Bilgiler page for the given school.
 */
router.get(
  "/:id",
  // Grant access if the user has at least one read/write permission within this school.
  // Using requireAnySchoolRead prevents inadvertently blocking users who only
  // possess section-level permissions on other modules.  Users without any
  // permissions will still be denied.
  requireAnySchoolRead('id'),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pool = getPool();
    // Verify user has access to this school: principals must be assigned; others must match country
    if (String(req.user.role) === 'principal') {
      const [[row]] = await pool.query(
        `SELECT s.id, s.name, s.country_id,
                c.name AS country_name, c.code AS country_code,
                s.status, s.created_by, s.created_at,
                s.closed_at, s.closed_by, s.updated_at, s.updated_by
         FROM schools s
         JOIN countries c ON c.id = s.country_id
         JOIN school_user_roles sur ON sur.school_id = s.id
         WHERE s.id = :id AND sur.user_id = :uid AND sur.role = 'principal'
               AND (:country_id IS NULL OR s.country_id = :country_id)`,
        { id, uid: req.user.id, country_id: req.user.country_id }
      );
      if (!row) return res.status(404).json({ error: 'School not found' });
      return res.json(row);
    } else {
      const [[school]] = await pool.query(
        `SELECT s.id, s.name, s.country_id,
                c.name AS country_name, c.code AS country_code,
                s.status, s.created_by, s.created_at,
                s.closed_at, s.closed_by, s.updated_at, s.updated_by
         FROM schools s
         JOIN countries c ON c.id = s.country_id
         WHERE s.id = :id AND s.country_id = :country_id`,
        { id, country_id: req.user.country_id }
      );
      if (!school) return res.status(404).json({ error: 'School not found' });
      return res.json(school);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
  }
});

/**
 * DELETE /schools/:id
 * Deletes a school unless it has submitted/approved scenarios.
 */
router.delete("/:id", async (req, res) => {
  return res.status(405).json({ error: "Schools cannot be deleted; close it instead." });
});

module.exports = router;
