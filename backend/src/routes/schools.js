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
  requireRole,
} = require("../middleware/auth");
const { parseListParams } = require("../utils/listParams");
const { getScenarioProgressSnapshot } = require("../utils/scenarioProgressCache");
const {
  computeExpenseSplitStaleFlags,
  computeExpenseSplitStaleByDistributionIds,
  getScenarioSplitParticipation,
} = require("../utils/expenseSplitStale");
const { computeScenarioWorkflowStatus } = require("../utils/scenarioWorkflow");

const router = express.Router();
router.use(requireAuth);
router.use(requireAssignedCountry);

function normalizeIdList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  );
}

async function listAccessibleSchools(pool, user) {
  const isPrincipal = String(user.role) === "principal";
  if (isPrincipal) {
    const [rows] = await pool.query(
      `SELECT s.id, s.name
       FROM schools s
       JOIN school_user_roles sur ON sur.school_id = s.id
       WHERE sur.user_id = :uid AND sur.role = 'principal' AND (:country_id IS NULL OR s.country_id = :country_id)`,
      { uid: user.id, country_id: user.country_id ?? null }
    );
    return Array.isArray(rows) ? rows : [];
  }

  const [rows] = await pool.query(
    "SELECT id, name FROM schools WHERE country_id = :country_id",
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

async function buildScenarioSplitInfo(pool, scenarioIds) {
  const ids = normalizeIdList(scenarioIds);
  const participationByScenarioId = new Map();
  const allDistributionIds = new Set();

  await Promise.all(
    ids.map(async (scenarioId) => {
      const participation = await getScenarioSplitParticipation(pool, scenarioId);
      participationByScenarioId.set(String(scenarioId), participation);
      participation.sourceDistributionIds.forEach((id) => allDistributionIds.add(id));
      participation.targetDistributionIds.forEach((id) => allDistributionIds.add(id));
    })
  );

  const staleByDist = await computeExpenseSplitStaleByDistributionIds(pool, Array.from(allDistributionIds));
  const splitInfoByScenarioId = new Map();

  ids.forEach((scenarioId) => {
    const participation = participationByScenarioId.get(String(scenarioId)) || {
      sourceDistributionIds: [],
      targetDistributionIds: [],
    };
    const allIds = [...participation.sourceDistributionIds, ...participation.targetDistributionIds];
    let splitStatus = "none";
    if (allIds.length) {
      splitStatus = allIds.some((id) => staleByDist.get(Number(id))) ? "stale" : "ok";
    }
    splitInfoByScenarioId.set(String(scenarioId), {
      splitStatus,
      isSourceScenario: participation.sourceDistributionIds.length > 0,
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
 * GET /schools/expense-split-stale?schoolIds=1,2,3
 *
 * Returns a map of schoolId -> true if any scenario in that school has a stale
 * "Gider Paylaştır" distribution.
 */
router.get("/expense-split-stale", async (req, res) => {
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

    const [scenarioRows] = await pool.query(
      `SELECT s.id, s.school_id
       FROM school_scenarios s
       WHERE s.school_id IN (:ids)
         AND EXISTS (
           SELECT 1 FROM expense_distribution_sets eds
           WHERE eds.source_scenario_id = s.id
         )`,
      { ids: uniqueIds }
    );

    const rows = Array.isArray(scenarioRows) ? scenarioRows : [];
    const scenarioList = rows.map((row) => ({
      id: row.id,
      school_id: row.school_id,
      expense_split_applied: true,
    }));

    const staleMap = scenarioList.length ? await computeExpenseSplitStaleFlags(pool, scenarioList) : new Map();
    const staleBySchoolId = {};
    scenarioList.forEach((row) => {
      const sid = Number(row.id);
      if (!Number.isFinite(sid)) return;
      if (staleMap.get(sid)) {
        staleBySchoolId[row.school_id] = true;
      }
    });

    return res.json({ staleBySchoolId });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /schools/bulk-send/preview
 *
 * Preview bulk send eligibility and stale guard.
 */
router.post(
  "/bulk-send/preview",
  requireRole(["manager", "accountant"]),
  async (req, res) => {
    try {
      const inputIds = normalizeIdList(req.body?.schoolIds);
      if (!inputIds.length) {
        return res.status(400).json({ error: "schoolIds is required" });
      }

      const pool = getPool();
      let accessible;
      try {
        accessible = await assertAccessibleSchoolIds(pool, req.user, inputIds);
      } catch (err) {
        const status = err?.status || 500;
        if (status === 400 || status === 403) {
          return res.status(status).json({ error: err.message });
        }
        throw err;
      }

      const { ids } = accessible;
      const guard = await buildStaleSourceGuard(pool, ids);

      const [approvedRows] = await pool.query(
        `SELECT sc.id, sc.school_id, sc.name, sc.academic_year, sc.status, sc.sent_at, sc.created_at, sc.checked_at
         FROM school_scenarios sc
         WHERE sc.school_id IN (:ids) AND sc.status = 'approved'
         ORDER BY sc.school_id ASC, COALESCE(sc.checked_at, sc.created_at) DESC, sc.id DESC`,
        { ids }
      );
      const rows = Array.isArray(approvedRows) ? approvedRows : [];
      const latestBySchoolId = new Map();
      rows.forEach((row) => {
        const key = String(row.school_id);
        if (!latestBySchoolId.has(key)) {
          latestBySchoolId.set(key, Number(row.id));
        }
      });

      const progressByScenarioId = await buildProgressByScenarioId(pool, req.user.country_id, rows);
      const splitInfoByScenarioId = await buildScenarioSplitInfo(
        pool,
        rows.map((row) => row.id)
      );

      const SENT_STATES = new Set(["sent_for_approval"]);
      const outputRows = rows.map((row) => {
        const scenarioId = Number(row.id);
        const schoolId = Number(row.school_id);
        const progress = progressByScenarioId.get(String(scenarioId)) ?? 0;
        const splitInfo = splitInfoByScenarioId.get(String(scenarioId)) || {
          splitStatus: "none",
          isSourceScenario: false,
        };
        const isLatestKontrolEdildi =
          Number(latestBySchoolId.get(String(schoolId))) === Number(scenarioId);

        const reasons = [];
        if (!isLatestKontrolEdildi) reasons.push("En guncel 'Kontrol edildi' senaryo degil");
        if (!Number.isFinite(progress) || Number(progress) < 100) reasons.push("Ilerleme %100 degil");
        if (row.sent_at != null || SENT_STATES.has(String(row.status || ""))) {
          reasons.push("Merkeze iletildi");
        }
        if (splitInfo.isSourceScenario) reasons.push("Kaynak senaryo");
        if (splitInfo.splitStatus === "stale") reasons.push("Gider dagitimi guncel degil");

        return {
          schoolId,
          schoolName: accessible.nameById.get(String(schoolId)) || "",
          scenarioId: scenarioId,
          scenarioName: row.name,
          yearText: row.academic_year,
          status: row.status,
          progress,
          sentAt: row.sent_at,
          splitStatus: splitInfo.splitStatus,
          isSourceScenario: splitInfo.isSourceScenario,
          isLatestKontrolEdildi,
          eligible: reasons.length === 0,
          reasons,
        };
      });

      return res.json({
        bulkDisabledDueToStaleSource: guard.bulkDisabledDueToStaleSource,
        staleSources: guard.staleSources,
        rows: outputRows,
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

/**
 * POST /schools/bulk-send/apply
 *
 * Applies bulk send after revalidating eligibility.
 */
router.post(
  "/bulk-send/apply",
  requireRole(["manager", "accountant"]),
  async (req, res) => {
    try {
      const scenarioIds = normalizeIdList(req.body?.scenarioIds);
      if (!scenarioIds.length) {
        return res.status(400).json({ error: "scenarioIds is required" });
      }

      const pool = getPool();
      const accessibleSchools = await listAccessibleSchools(pool, req.user);
      const accessibleSchoolIds = accessibleSchools.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
      const accessibleSet = new Set(accessibleSchoolIds.map(String));

      const guard = await buildStaleSourceGuard(pool, accessibleSchoolIds);
      if (guard.bulkDisabledDueToStaleSource) {
        return res.status(409).json({
          bulkDisabledDueToStaleSource: true,
          staleSources: guard.staleSources,
          results: [],
        });
      }

      const [scenarioRows] = await pool.query(
        `SELECT sc.id, sc.school_id, sc.name, sc.academic_year, sc.status, sc.sent_at, sc.created_at, sc.checked_at
         FROM school_scenarios sc
         WHERE sc.id IN (:ids)`,
        { ids: scenarioIds }
      );
      const rows = Array.isArray(scenarioRows) ? scenarioRows : [];
      const rowById = new Map(rows.map((row) => [String(row.id), row]));
      const schoolIds = Array.from(
        new Set(rows.map((row) => Number(row.school_id)).filter((id) => Number.isFinite(id)))
      );

      const [approvedRows] = await pool.query(
        `SELECT sc.id, sc.school_id, sc.name, sc.academic_year, sc.status, sc.sent_at, sc.created_at, sc.checked_at
         FROM school_scenarios sc
         WHERE sc.school_id IN (:ids) AND sc.status = 'approved'
         ORDER BY sc.school_id ASC, COALESCE(sc.checked_at, sc.created_at) DESC, sc.id DESC`,
        { ids: schoolIds.length ? schoolIds : [0] }
      );
      const approvedList = Array.isArray(approvedRows) ? approvedRows : [];
      const latestBySchoolId = new Map();
      approvedList.forEach((row) => {
        const key = String(row.school_id);
        if (!latestBySchoolId.has(key)) {
          latestBySchoolId.set(key, Number(row.id));
        }
      });

      const progressByScenarioId = await buildProgressByScenarioId(pool, req.user.country_id, rows);
      const splitInfoByScenarioId = await buildScenarioSplitInfo(pool, scenarioIds);

      const SENT_STATES = new Set(["sent_for_approval"]);
      const results = [];

      for (const scenarioId of scenarioIds) {
        const row = rowById.get(String(scenarioId));
        if (!row) {
          results.push({ scenarioId, ok: false, reasons: ["Senaryo bulunamadi"] });
          continue;
        }

        const schoolId = Number(row.school_id);
        if (!accessibleSet.has(String(schoolId))) {
          results.push({ scenarioId, ok: false, reasons: ["Okula erisim yok"] });
          continue;
        }

        const progress = progressByScenarioId.get(String(scenarioId)) ?? 0;
        const splitInfo = splitInfoByScenarioId.get(String(scenarioId)) || {
          splitStatus: "none",
          isSourceScenario: false,
        };
        const isLatestKontrolEdildi =
          Number(latestBySchoolId.get(String(schoolId))) === Number(scenarioId);

        const reasons = [];
        if (String(row.status || "") !== "approved") reasons.push("Kontrol edilmedi");
        if (!isLatestKontrolEdildi) reasons.push("En guncel 'Kontrol edildi' senaryo degil");
        if (!Number.isFinite(progress) || Number(progress) < 100) reasons.push("Ilerleme %100 degil");
        if (row.sent_at != null || SENT_STATES.has(String(row.status || ""))) {
          reasons.push("Merkeze iletildi");
        }
        if (splitInfo.isSourceScenario) reasons.push("Kaynak senaryo");
        if (splitInfo.splitStatus === "stale") reasons.push("Gider dagitimi guncel degil");

        if (reasons.length) {
          results.push({ scenarioId, ok: false, reasons });
          continue;
        }

        try {
          await computeScenarioWorkflowStatus(pool, scenarioId);
        } catch (_) {
          // ignore status recompute errors and continue with existing status check
        }

        const [[reloaded]] = await pool.query(
          "SELECT id, status, sent_at FROM school_scenarios WHERE id=:sid",
          { sid: scenarioId }
        );
        if (!reloaded || reloaded.status !== "approved" || reloaded.sent_at != null) {
          results.push({ scenarioId, ok: false, reasons: ["Kontrol edilmedi"] });
          continue;
        }

        await pool.query(
          `UPDATE school_scenarios
           SET status='sent_for_approval',
               sent_at=CURRENT_TIMESTAMP,
               sent_by=:uid,
               checked_at=COALESCE(checked_at, CURRENT_TIMESTAMP),
               checked_by=COALESCE(checked_by, :uid)
           WHERE id=:sid`,
          { uid: req.user.id, sid: scenarioId }
        );
        await pool.query(
          `INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id)
           VALUES (:sid, 'submit', NULL, :uid)`,
          { sid: scenarioId, uid: req.user.id }
        );

        results.push({ scenarioId, ok: true, reasons: [] });
      }

      return res.json({
        bulkDisabledDueToStaleSource: false,
        staleSources: [],
        results,
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

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
