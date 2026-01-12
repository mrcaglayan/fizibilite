//backend/src/routes/schools.js

const express = require("express");
const { getPool } = require("../db");
const { requireAuth, requireAssignedCountry } = require("../middleware/auth");

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
    const where = ["s.country_id = :country_id"];
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
       WHERE ${where.join(" AND ")}
       ORDER BY s.created_at DESC`,
      { country_id: req.user.country_id }
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools
 * Body: { name }
 */
router.post("/", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can create schools. Use Admin panel." });
    }

    const { name } = req.body || {};
    const trimmed = String(name || "").trim();
    if (!trimmed) return res.status(400).json({ error: "name is required" });
    if (!req.user.country_id) {
      return res.status(400).json({ error: "Admin must use Admin panel to create schools." });
    }

    const pool = getPool();
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

    return res.json({ id: r.insertId, name: trimmed });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /schools/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pool = getPool();
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

    if (!school) return res.status(404).json({ error: "School not found" });
    return res.json(school);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
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
