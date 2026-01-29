//backend/src/routes/schools.js

const express = require("express");
const crypto = require("crypto");
const { getPool } = require("../db");
const {
  requireAuth,
  requireAssignedCountry,
  requireSchoolContextAccess,
  requireSchoolPermission,
  requireAnySchoolRead,
  requirePermission,
} = require("../middleware/auth");
const { parseListParams } = require("../utils/listParams");
const { getScenarioProgressSnapshot } = require("../utils/scenarioProgressCache");

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
    let listParams;
    try {
      listParams = parseListParams(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        defaultOffset: 0,
        allowedOrderColumns: {
          id: "s.id",
          name: "s.name",
          created_at: "s.created_at",
        },
        defaultOrder: { column: "created_at", direction: "desc" },
      });
    } catch (err) {
      if (err?.status === 400) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const { limit, offset, fields, order, orderBy, isPagedOrSelective, hasOffsetParam } = listParams;
    const pool = getPool();
    const isPrincipal = String(req.user.role) === "principal";
    const columnsBrief = [
      "s.id",
      "s.name",
      "s.country_id",
      "s.status",
      "s.created_at",
    ];
    const columnsAll = [
      "s.id",
      "s.name",
      "s.country_id",
      "c.name AS country_name",
      "c.code AS country_code",
      "s.status",
      "s.created_by",
      "s.created_at",
      "s.closed_at",
      "s.closed_by",
      "s.updated_at",
      "s.updated_by",
    ];
    const columns = fields === "brief" ? columnsBrief : columnsAll;

    const joins = [];
    const where = [];
    const params = {};

    if (fields === "all") {
      joins.push("JOIN countries c ON c.id = s.country_id");
    }
    if (isPrincipal) {
      joins.push("JOIN school_user_roles sur ON sur.school_id = s.id");
      where.push("sur.user_id = :uid");
      where.push("sur.role = 'principal'");
      params.uid = req.user.id;
      if (req.user.country_id != null) {
        where.push("s.country_id = :country_id");
        params.country_id = req.user.country_id;
      }
    } else {
      where.push("s.country_id = :country_id");
      params.country_id = req.user.country_id;
    }
    if (!includeClosed) {
      where.push("s.status = 'active'");
    }

    const fromClause = `FROM schools s ${joins.join(" ")}`.trim();
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderClause = `ORDER BY ${orderBy || "s.created_at DESC"}`;

    if (!isPagedOrSelective && fields === "all") {
      const [rows] = await pool.query(
        `SELECT ${columns.join(", ")}
         ${fromClause}
         ${whereClause}
         ${orderClause}`,
        params
      );
      return res.json(rows);
    }

    const countSql = `SELECT COUNT(${isPrincipal ? "DISTINCT s.id" : "*"}) AS total ${fromClause} ${whereClause}`;
    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows?.[0]?.total ?? 0);

    const queryParams = { ...params };
    const limitClause = limit != null ? " LIMIT :limit" : "";
    if (limit != null) queryParams.limit = limit;
    const useOffset = hasOffsetParam || (limit != null && offset != null);
    const offsetClause = useOffset ? " OFFSET :offset" : "";
    if (useOffset) queryParams.offset = offset;

    const [rows] = await pool.query(
      `SELECT ${columns.join(", ")}
       ${fromClause}
       ${whereClause}
       ${orderClause}${limitClause}${offsetClause}`,
      queryParams
    );

    return res.json({
      schools: rows,
      total,
      limit: limit ?? null,
      offset: offset ?? 0,
      fields,
      order: order ? `${order.column}:${order.direction}` : null,
    });
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
 * GET /schools/progress?schoolIds=1,2,3
 *
 * Returns progress summaries for the latest active scenario in each school.
 */
router.get("/progress", async (req, res) => {
  try {
    const raw = String(req.query?.schoolIds || "").trim();
    if (!raw) return res.status(400).json({ error: "schoolIds is required" });

    const parsedIds = raw
      .split(",")
      .map((id) => Number(String(id || "").trim()))
      .filter((id) => Number.isFinite(id));
    const uniqueIds = Array.from(new Set(parsedIds));
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: "schoolIds is required" });
    }
    if (uniqueIds.length > 100) {
      return res.status(400).json({ error: "Too many schoolIds (max 100)" });
    }

    const pool = getPool();
    const isPrincipal = String(req.user.role) === "principal";
    let accessibleIds = [];
    if (isPrincipal) {
      const [rows] = await pool.query(
        `SELECT s.id
         FROM schools s
         JOIN school_user_roles sur ON sur.school_id = s.id
         WHERE sur.user_id = :uid AND sur.role = 'principal' AND s.id IN (:ids)`,
        { uid: req.user.id, ids: uniqueIds }
      );
      accessibleIds = Array.isArray(rows) ? rows.map((r) => Number(r.id)) : [];
    } else {
      const [rows] = await pool.query(
        "SELECT id FROM schools WHERE country_id = :country_id AND id IN (:ids)",
        { country_id: req.user.country_id, ids: uniqueIds }
      );
      accessibleIds = Array.isArray(rows) ? rows.map((r) => Number(r.id)) : [];
    }

    const accessibleSet = new Set(accessibleIds.map(String));
    const hasInaccessible = uniqueIds.some((id) => !accessibleSet.has(String(id)));
    if (hasInaccessible) {
      return res.status(403).json({ error: "One or more schools not accessible" });
    }

    const progressBySchoolId = {};
    let latestCalculatedMs = 0;

    for (const sid of uniqueIds) {
      try {
        const [[latestActive]] = await pool.query(
          `SELECT id, name, status, created_at
           FROM school_scenarios
           WHERE school_id=:sid AND status <> 'approved'
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          { sid }
        );

        if (!latestActive) {
          const [[countRow]] = await pool.query(
            "SELECT COUNT(*) AS total FROM school_scenarios WHERE school_id=:sid",
            { sid }
          );
          const total = Number(countRow?.total ?? 0);
          if (total === 0) {
            progressBySchoolId[sid] = { state: "empty", label: "Senaryo yok" };
          } else {
            progressBySchoolId[sid] = { state: "approved", label: "Tüm senaryolar onaylı" };
          }
          continue;
        }

        const snapshot = await getScenarioProgressSnapshot(pool, {
          schoolId: sid,
          scenarioId: latestActive.id,
          countryId: req.user.country_id,
        });
        const missingLines = Array.isArray(snapshot.progress?.missingDetailsLines)
          ? snapshot.progress.missingDetailsLines
          : [];
        const tooltipLines = missingLines.length ? ["Eksik:", ...missingLines] : ["Tüm tablolar tamamlandı"];
        progressBySchoolId[sid] = {
          state: "active",
          scenarioId: latestActive.id,
          pct: snapshot.progress?.pct ?? 0,
          tooltipLines,
        };
        const calcMs = snapshot.calculatedAt ? new Date(snapshot.calculatedAt).getTime() : 0;
        if (calcMs > latestCalculatedMs) latestCalculatedMs = calcMs;
      } catch (_) {
        progressBySchoolId[sid] = { state: "error", label: "İlerleme hesaplanamadı" };
      }
    }

    const payload = { progressBySchoolId };
    const payloadString = JSON.stringify(payload.progressBySchoolId);
    const etagValue = crypto.createHash("sha1").update(payloadString).digest("hex");
    const etag = `"${etagValue}"`;
    const lastModified = new Date(latestCalculatedMs || Date.now()).toUTCString();

    // School progress is used as a live indicator. Force revalidation on every
    // request so progress updates immediately after input saves.
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
    res.setHeader("Vary", "Authorization");
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    return res.json(payload);
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
