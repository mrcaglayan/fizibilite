//backend/src/routes/admin.js

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { getPool } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { ensurePermissions } = require("../utils/ensurePermissions");
const { PERMISSIONS_CATALOG } = require("../utils/permissionsCatalog");
const { getUserPermissions } = require("../utils/permissionService");
const { getProgressConfig, parseJsonValue } = require("../utils/progressConfig");
const { REQUIRED_WORK_IDS } = require("../utils/scenarioWorkflow");

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

// Duplicated imports removed below; see above

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

const GRADE_KEYS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const ASSIGNMENT_ROLES = ["principal", "hr", "accountant"];
const MODULE_ALIASES = {
  "Norm İK (HR)": ["Norm", "İK (HR)"],
};
const MODULE_GROUP_MAP = {
  "Temel Bilgiler": ["Temel Bilgiler"],
  Kapasite: ["Kapasite"],
  Norm: ["Norm"],
  "İK (HR)": ["IK / HR"],
  "IK (HR)": ["IK / HR"],
  "IK / HR": ["IK / HR"],
  Gelirler: ["Gelirler"],
  Giderler: ["Giderler"],
};
const MODULE_GROUPS = new Set(Object.values(MODULE_GROUP_MAP).flat());
const MODULE_PERMISSION_ENTRIES = PERMISSIONS_CATALOG.filter((perm) =>
  MODULE_GROUPS.has(perm.group)
);
const MODULE_PERMISSION_RESOURCES = Array.from(
  new Set(MODULE_PERMISSION_ENTRIES.map((perm) => perm.resource))
);

function normalizeModules(value) {
  if (!Array.isArray(value)) return [];
  const expanded = [];
  value.forEach((item) => {
    const clean = String(item).trim();
    if (!clean) return;
    const alias = MODULE_ALIASES[clean];
    if (alias) {
      expanded.push(...alias);
      return;
    }
    expanded.push(clean);
  });
  return Array.from(new Set(expanded));
}

function parseModulesJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeModules(value);
  try {
    return normalizeModules(JSON.parse(value));
  } catch (_) {
    return [];
  }
}

function parseAssignmentsPayload(payload) {
  if (!Array.isArray(payload)) {
    return { error: "assignments must be an array" };
  }
  const byUserId = new Map();
  for (const item of payload) {
    const userId = Number(item?.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return { error: "Invalid userId in assignments" };
    }
    const role = String(item?.role || "").trim().toLowerCase();
    if (!ASSIGNMENT_ROLES.includes(role)) {
      return { error: "Invalid role in assignments" };
    }
    const modules = normalizeModules(item?.modules);
    const existing = byUserId.get(userId);
    if (existing && existing.role !== role) {
      return { error: `User ${userId} assigned multiple roles` };
    }
    byUserId.set(userId, { userId, role, modules });
  }
  return { assignments: Array.from(byUserId.values()) };
}

function getPermissionEntriesForModules(modules) {
  const groups = new Set();
  (modules || []).forEach((moduleName) => {
    const clean = String(moduleName || "").trim();
    if (!clean) return;
    const mapped = MODULE_GROUP_MAP[clean];
    if (!mapped) return;
    mapped.forEach((group) => groups.add(group));
  });
  if (groups.size === 0) return [];
  return MODULE_PERMISSION_ENTRIES.filter((perm) => groups.has(perm.group));
}

async function loadModulePermissionIds(pool) {
  if (MODULE_PERMISSION_RESOURCES.length === 0) {
    return { permIds: [], permIdByKey: new Map() };
  }
  const [rows] = await pool.query(
    "SELECT id, resource, action FROM permissions WHERE resource IN (:resources) AND action IN ('read', 'write')",
    { resources: MODULE_PERMISSION_RESOURCES }
  );
  const permIdByKey = new Map();
  const permIds = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = `${row.resource}|${row.action}`;
    permIdByKey.set(key, row.id);
    permIds.push(row.id);
  });
  return { permIds, permIdByKey };
}

function buildEmptyCurriculum() {
  const curr = {};
  GRADE_KEYS.forEach((g) => (curr[g] = {}));
  return curr;
}

function buildEmptyNormYears() {
  return {
    y1: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurriculum() },
    y2: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurriculum() },
    y3: { teacherWeeklyMaxHours: 24, curriculumWeeklyHours: buildEmptyCurriculum() },
  };
}

const YEAR_KEYS = ["y1", "y2", "y3"];

function normalizeIncludedYears(input) {
  if (Array.isArray(input)) {
    return YEAR_KEYS.filter((k) => input.includes(k));
  }
  if (typeof input === "string") {
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
    return YEAR_KEYS.filter((k) => parts.includes(k));
  }
  return [];
}

function parseAcademicYearFilter(value) {
  const v = String(value || "").trim();
  return v ? v : null;
}


function parseAcademicYearPrefix(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/\d{4}/); // first 4-digit year
  return m ? m[0] : raw;
}

function escapeLike(value) {
  // Escape LIKE wildcards so user input can't act as a pattern
  return String(value || "").replace(/[\\%_]/g, (m) => `\\${m}`);
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickCountryIdFromBody(body) {
  const b = body || {};
  const direct = b.country_id ?? b.countryId;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  return null;
}

async function resolveCountry(pool, body) {
  const id = pickCountryIdFromBody(body);
  if (id) {
    const [[c]] = await pool.query("SELECT id, name, code, region FROM countries WHERE id=:id", { id });
    return c || null;
  }
  const code = normalizeCode(body?.country_code ?? body?.countryCode ?? "");
  if (code) {
    const [[c]] = await pool.query("SELECT id, name, code, region FROM countries WHERE code=:code", { code });
    return c || null;
  }
  return null;
}

/**
 * GET /admin/countries
 * Returns all countries (admin only)
 */
router.get("/countries", async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, name, code, region FROM countries ORDER BY name ASC"
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/progress-requirements
 * Query: countryId (required)
 */
router.get("/progress-requirements", async (req, res) => {
  try {
    const countryId = toNumberOrNull(req.query?.countryId ?? req.query?.country_id);
    if (!countryId) return res.status(400).json({ error: "countryId is required" });

    const pool = getPool();
    const config = await getProgressConfig(pool, countryId);
    return res.json({ country_id: countryId, config });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /admin/progress-requirements
 * Query: countryId (required)
 * Body: { config }
 */
router.put("/progress-requirements", async (req, res) => {
  try {
    const countryId = toNumberOrNull(req.query?.countryId ?? req.query?.country_id);
    if (!countryId) return res.status(400).json({ error: "countryId is required" });

    const config = req.body?.config;
    if (!isPlainObject(config) || !isPlainObject(config.sections)) {
      return res.status(400).json({ error: "Invalid config payload" });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO progress_requirements (country_id, config_json, updated_by)
       VALUES (:country_id, :config_json, :updated_by)
       ON DUPLICATE KEY UPDATE
         config_json=VALUES(config_json),
         updated_by=VALUES(updated_by)`,
      {
        country_id: countryId,
        config_json: JSON.stringify(config),
        updated_by: req.user.id,
      }
    );

    const saved = await getProgressConfig(pool, countryId);
    return res.json({ country_id: countryId, config: saved });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /admin/progress-requirements/bulk
 * Body: { countryIds: number[], config }
 */
router.put("/progress-requirements/bulk", async (req, res) => {
  try {
    const rawIds = req.body?.countryIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: "countryIds must be a non-empty array" });
    }

    const uniqueIds = Array.from(
      new Set(
        rawIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!uniqueIds.length) {
      return res.status(400).json({ error: "No valid countryIds provided" });
    }

    if (uniqueIds.length > 500) {
      return res.status(400).json({ error: "Too many countryIds (max 500)" });
    }

    const config = req.body?.config;
    if (!isPlainObject(config) || !isPlainObject(config.sections)) {
      return res.status(400).json({ error: "Invalid config payload" });
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    const configJson = JSON.stringify(config);
    try {
      await conn.beginTransaction();
      for (const countryId of uniqueIds) {
        await conn.query(
          `INSERT INTO progress_requirements (country_id, config_json, updated_by)
           VALUES (:country_id, :config_json, :updated_by)
           ON DUPLICATE KEY UPDATE
             config_json=VALUES(config_json),
             updated_by=VALUES(updated_by)`,
          {
            country_id: countryId,
            config_json: configJson,
            updated_by: req.user.id,
          }
        );
      }
      await conn.commit();
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {
        // ignore rollback errors
      }
      throw err;
    } finally {
      conn.release();
    }

    return res.json({ updatedCount: uniqueIds.length, countryIds: uniqueIds });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/users
 * Query: unassigned=1 (optional)
 */
router.get("/users", async (req, res) => {
  try {
    const unassigned = String(req.query?.unassigned || "") === "1";
    const pool = getPool();
    const where = unassigned ? "WHERE u.country_id IS NULL" : "";
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.country_id, u.region, u.must_reset_password,
              c.name AS country_name, c.code AS country_code, c.region AS country_region
       FROM users u
       LEFT JOIN countries c ON c.id = u.country_id
       ${where}
       ORDER BY u.id DESC`
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /admin/users
 * Body: { full_name|fullName, email, password, role?, country_id|countryId|country_code|countryCode (optional) }
 */
router.post("/users", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    const fullNameRaw = String(req.body?.full_name ?? req.body?.fullName ?? "").trim();
    const fullName = fullNameRaw ? fullNameRaw : null;
    const role = String(req.body?.role || "user");

    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    // Validate that the requested role is one of the supported roles.  We allow
    // both legacy roles (admin, user) and the newly introduced roles
    // (principal, hr).  Using a constant array improves readability and
    // prevents accidental omission when adding future roles.
    const validRoles = ["admin", "user", "principal", "hr", "manager", "accountant"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const pool = getPool();

    const hasCountryInput =
      req.body?.country_id != null ||
      req.body?.countryId != null ||
      String(req.body?.country_code ?? req.body?.countryCode ?? "").trim();
    let country = null;
    if (hasCountryInput) {
      country = await resolveCountry(pool, req.body);
      if (!country) {
        return res.status(400).json({ error: "country_id or country_code is invalid" });
      }
    }
    const region = country?.region ?? null;

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email=:email", { email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const password_hash = await bcrypt.hash(String(password), 10);

    const [r] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, must_reset_password, country_id, role, region) VALUES (:full_name,:email,:password_hash,:must_reset_password,:country_id,:role,:region)",
      {
        full_name: fullName,
        email,
        password_hash,
        must_reset_password: 1,
        country_id: country?.id ?? null,
        role,
        region,
      }
    );

    return res.json({
      id: r.insertId,
      full_name: fullName,
      email,
      country_id: country?.id ?? null,
      country_name: country?.name ?? null,
      country_code: country?.code ?? null,
      role,
      region,
      must_reset_password: true,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

function generateTemporaryPassword(length = 12) {
  // Avoid ambiguous characters (0/O, 1/l/I) for easier sharing.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const bytes = crypto.randomBytes(Math.max(12, Number(length) || 12));
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * POST /admin/users/:id/reset-password
 * Resets a user's password and returns a temporary password (admin-only).
 * Body (optional): { password }  // if omitted, a strong random password is generated
 */
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });

    const customPasswordRaw = req.body?.password;
    const temporaryPassword =
      customPasswordRaw != null && String(customPasswordRaw).trim()
        ? String(customPasswordRaw)
        : generateTemporaryPassword(12);

    if (String(temporaryPassword).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const pool = getPool();
    const [[user]] = await pool.query("SELECT id, email FROM users WHERE id=:id", { id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const password_hash = await bcrypt.hash(String(temporaryPassword), 10);
    await pool.query(
      "UPDATE users SET password_hash=:password_hash, must_reset_password=1 WHERE id=:id",
      { id: userId, password_hash }
    );

    return res.json({
      ok: true,
      user_id: userId,
      email: user.email,
      temporary_password: temporaryPassword,
      must_reset_password: true,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /admin/countries
 * Body: { name, code, region }
 */
router.post("/countries", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const code = normalizeCode(req.body?.code ?? "");
    const region = String(req.body?.region ?? "").trim();

    if (!name || !code || !region) {
      return res.status(400).json({ error: "name, code, and region are required" });
    }

    const pool = getPool();
    const [r] = await pool.query(
      "INSERT INTO countries (name, code, region) VALUES (:name, :code, :region)",
      { name, code, region }
    );

    return res.json({ id: r.insertId, name, code, region });
  } catch (e) {
    if (String(e?.code) === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Country code already exists" });
    }
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/countries/:countryId/schools
 * Query: includeClosed=1 (optional)
 */
router.get("/countries/:countryId/schools", async (req, res) => {
  try {
    const countryId = Number(req.params.countryId);
    if (!Number.isFinite(countryId)) return res.status(400).json({ error: "Invalid country id" });

    const includeClosedParam = req.query?.includeClosed;
    const includeClosed =
      includeClosedParam == null ? true : String(includeClosedParam) === "1";

    const where = ["country_id = :country_id"];
    if (!includeClosed) where.push("status = 'active'");

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, country_id, status, created_by, created_at,
              closed_at, closed_by, updated_at, updated_by
       FROM schools
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC`,
      { country_id: countryId }
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /admin/countries/:countryId/schools
 * Body: { name }
 */
router.post("/countries/:countryId/schools", async (req, res) => {
  try {
    const countryId = Number(req.params.countryId);
    if (!Number.isFinite(countryId)) return res.status(400).json({ error: "Invalid country id" });

    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const pool = getPool();
    const [[existing]] = await pool.query(
      "SELECT id FROM schools WHERE country_id=:country_id AND name=:name",
      { country_id: countryId, name }
    );
    if (existing) return res.status(409).json({ error: "School already exists for this country" });

    const [r] = await pool.query(
      "INSERT INTO schools (country_id, name, created_by, status) VALUES (:country_id, :name, :created_by, 'active')",
      { country_id: countryId, name, created_by: req.user.id }
    );

    const emptyYears = buildEmptyNormYears();
    await pool.query(
      "INSERT INTO school_norm_configs (school_id, teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_by) VALUES (:school_id, 24, :json, :updated_by)",
      { school_id: r.insertId, json: JSON.stringify({ years: emptyYears }), updated_by: req.user.id }
    );

    return res.json({ id: r.insertId, name, country_id: countryId, status: "active" });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PATCH /admin/schools/:schoolId
 * Body: { name?, status? }
 */
router.patch("/schools/:schoolId", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });

    const nameRaw = req.body?.name;
    const statusRaw = req.body?.status;
    const hasName = nameRaw != null;
    const hasStatus = statusRaw != null;

    if (!hasName && !hasStatus) {
      return res.status(400).json({ error: "name or status is required" });
    }

    const pool = getPool();
    const [[school]] = await pool.query(
      "SELECT id, name, status FROM schools WHERE id=:id",
      { id: schoolId }
    );
    if (!school) return res.status(404).json({ error: "School not found" });

    const updates = [];
    const params = { id: schoolId, updated_by: req.user.id };

    if (hasName) {
      const trimmed = String(nameRaw ?? "").trim();
      if (!trimmed) return res.status(400).json({ error: "name is required" });
      if (trimmed !== school.name) {
        updates.push("name=:name");
        params.name = trimmed;
      }
    }

    if (hasStatus) {
      const status = String(statusRaw || "").trim();
      if (!["active", "closed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      if (status !== school.status) {
        updates.push("status=:status");
        params.status = status;
        if (status === "closed") {
          updates.push("closed_at=CURRENT_TIMESTAMP", "closed_by=:closed_by");
          params.closed_by = req.user.id;
        } else {
          updates.push("closed_at=NULL", "closed_by=NULL");
        }
      }
    }

    if (!updates.length) {
      return res.status(400).json({ error: "No changes requested" });
    }

    updates.push("updated_by=:updated_by");
    await pool.query(`UPDATE schools SET ${updates.join(", ")} WHERE id=:id`, params);

    const [[updated]] = await pool.query(
      `SELECT id, name, country_id, status, created_by, created_at,
              closed_at, closed_by, updated_at, updated_by
       FROM schools
       WHERE id=:id`,
      { id: schoolId }
    );
    return res.json(updated || null);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PATCH /admin/users/:id/country
 * Body: { country_id|countryId|country_code|countryCode }
 */
router.patch("/users/:id/country", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });

    const pool = getPool();
    const country = await resolveCountry(pool, req.body);
    if (!country) return res.status(400).json({ error: "country_id or country_code is required" });

    const [r] = await pool.query(
      "UPDATE users SET country_id=:country_id, region=:region WHERE id=:id",
      { id: userId, country_id: country.id, region: country.region || null }
    );
    if (!r.affectedRows) return res.status(404).json({ error: "User not found" });

    return res.json({
      id: userId,
      country_id: country.id,
      country_name: country.name,
      country_code: country.code,
      region: country.region || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * DELETE /admin/users/:id
 * Removes a user if they have no related records.
 */
router.delete("/users/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });

    const pool = getPool();
    const [[user]] = await pool.query("SELECT id, email FROM users WHERE id=:id", { id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const [[refs]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM schools WHERE created_by=:id) AS schools_created,
        (SELECT COUNT(*) FROM school_scenarios WHERE created_by=:id) AS scenarios_created,
        (SELECT COUNT(*) FROM school_norm_configs WHERE updated_by=:id) AS norm_updates,
        (SELECT COUNT(*) FROM scenario_inputs WHERE updated_by=:id) AS inputs_updates,
        (SELECT COUNT(*) FROM scenario_results WHERE calculated_by=:id) AS results_calculated`,
      { id: userId }
    );

    const total =
      Number(refs?.schools_created || 0) +
      Number(refs?.scenarios_created || 0) +
      Number(refs?.norm_updates || 0) +
      Number(refs?.inputs_updates || 0) +
      Number(refs?.results_calculated || 0);

    if (total > 0) {
      return res.status(409).json({
        error: "User has related records and cannot be deleted",
        details: refs,
      });
    }

    await pool.query("DELETE FROM users WHERE id=:id", { id: userId });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/scenarios/queue
 * Query: status (optional, empty = all), academicYear, region, countryId
 */
router.get("/scenarios/queue", async (req, res) => {
  try {
    const status = String(req.query?.status ?? "").trim();
    const academicYear = parseAcademicYearFilter(req.query?.academicYear);
    const region = String(req.query?.region || "").trim();
    const countryId = toNumberOrNull(req.query?.countryId ?? req.query?.country_id);

    const pool = getPool();
    const params = {};
    const where = [];
    if (status) {
      where.push("sc.status = :status");
      params.status = status;
    }
    if (academicYear) {
      where.push("sc.academic_year = :academic_year");
      params.academic_year = academicYear;
    }
    if (region) {
      where.push("c.region = :region");
      params.region = region;
    }
    if (countryId) {
      where.push("c.id = :country_id");
      params.country_id = countryId;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT
        sc.id AS scenario_id,
        sc.name AS scenario_name,
        sc.academic_year,
        sc.status,
        sc.submitted_at,
        sc.review_note,
        sc.reviewed_at,
        sc.input_currency,
        sc.local_currency_code,
        sc.fx_usd_to_local,
        sc.progress_pct,
        sc.progress_json,
        sc.progress_calculated_at,
        sc.sent_at,
        sc.sent_by,
        sc.checked_at,
        sc.checked_by,
        s.id AS school_id,
        s.name AS school_name,
        c.id AS country_id,
        c.name AS country_name,
        c.region AS country_region,
        k1.scenario_id AS y1_exists,
        k1.net_ciro AS y1_net_ciro,
        k1.net_result AS y1_net_result,
        k1.students_total AS y1_students_total,
        k2.scenario_id AS y2_exists,
        k2.net_ciro AS y2_net_ciro,
        k2.net_result AS y2_net_result,
        k2.students_total AS y2_students_total,
        k3.scenario_id AS y3_exists,
        k3.net_ciro AS y3_net_ciro,
        k3.net_result AS y3_net_result,
        k3.students_total AS y3_students_total
       FROM school_scenarios sc
       JOIN schools s ON s.id = sc.school_id
       JOIN countries c ON c.id = s.country_id
       LEFT JOIN scenario_kpis k1 ON k1.scenario_id = sc.id AND k1.year_key='y1'
       LEFT JOIN scenario_kpis k2 ON k2.scenario_id = sc.id AND k2.year_key='y2'
       LEFT JOIN scenario_kpis k3 ON k3.scenario_id = sc.id AND k3.year_key='y3'
       ${whereSql}
       ORDER BY sc.submitted_at DESC, sc.created_at DESC`,
      params
    );

    const data = rows.map((row) => {
      const progressJson = parseJsonValue(row.progress_json);
      return {
        scenario: {
          id: row.scenario_id,
          name: row.scenario_name,
          academic_year: row.academic_year,
          status: row.status,
          submitted_at: row.submitted_at,
          review_note: row.review_note,
          reviewed_at: row.reviewed_at,
          input_currency: row.input_currency,
          local_currency_code: row.local_currency_code,
          fx_usd_to_local: row.fx_usd_to_local,
          progress_pct: row.progress_pct != null ? Number(row.progress_pct) : null,
          progress_json: progressJson,
          progress_calculated_at: row.progress_calculated_at,
          sent_at: row.sent_at,
          sent_by: row.sent_by,
          checked_at: row.checked_at,
          checked_by: row.checked_by,
        },
        school: { id: row.school_id, name: row.school_name },
        country: { id: row.country_id, name: row.country_name, region: row.country_region },
        kpis: {
          y1: row.y1_exists
            ? { net_ciro: row.y1_net_ciro, net_result: row.y1_net_result, students_total: row.y1_students_total }
            : null,
          y2: row.y2_exists
            ? { net_ciro: row.y2_net_ciro, net_result: row.y2_net_result, students_total: row.y2_students_total }
            : null,
          y3: row.y3_exists
            ? { net_ciro: row.y3_net_ciro, net_result: row.y3_net_result, students_total: row.y3_students_total }
            : null,
        },
        missingKpis: {
          y1: !row.y1_exists,
          y2: !row.y2_exists,
          y3: !row.y3_exists,
        },
      };
    });

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PATCH /admin/scenarios/:scenarioId/review
 * Body: { action: "approve" | "revise", note?: string, includedYears?: ["y1","y2","y3"] }
 */
router.patch("/scenarios/:scenarioId/review", async (req, res) => {
  try {
    const scenarioId = Number(req.params.scenarioId);
    if (!Number.isFinite(scenarioId)) return res.status(400).json({ error: "Invalid scenario id" });

    const action = String(req.body?.action || "").trim();
    const note = String(req.body?.note || "").trim();
    if (!["approve", "revise"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const pool = getPool();
    const [[scenario]] = await pool.query(
      "SELECT id, school_id, academic_year, status FROM school_scenarios WHERE id=:id",
      { id: scenarioId }
    );
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    if (action === 'approve') {
      // Admin approval is only allowed after a manager forwards the scenario
      // via the send‑for‑approval endpoint.  At that point the status
      // becomes 'sent_for_approval'.
      if (scenario.status !== 'sent_for_approval') {
        return res.status(409).json({ error: 'Scenario must be sent for approval before admin approval' });
      }
      let includedYears = normalizeIncludedYears(req.body?.includedYears);
      if (!includedYears.length) includedYears = YEAR_KEYS.slice();
      const includedSet = includedYears.join(",");

      await pool.query(
        `UPDATE school_scenarios
         SET status='approved',
             reviewed_at=CURRENT_TIMESTAMP,
             reviewed_by=:u,
             review_note=:note
         WHERE id=:id`,
        { id: scenarioId, u: req.user.id, note: note || null }
      );

      await pool.query(
        `INSERT INTO school_reporting_scenarios
          (school_id, academic_year, scenario_id, included_years, approved_by, approved_at)
         VALUES
          (:school_id, :academic_year, :scenario_id, :included_years, :approved_by, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
          scenario_id=VALUES(scenario_id),
          included_years=VALUES(included_years),
          approved_by=VALUES(approved_by),
          approved_at=VALUES(approved_at)`,
        {
          school_id: scenario.school_id,
          academic_year: scenario.academic_year,
          scenario_id: scenarioId,
          included_years: includedSet,
          approved_by: req.user.id,
        }
      );

      await pool.query(
        "INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id) VALUES (:id,'approve',:note,:u)",
        { id: scenarioId, note: note || null, u: req.user.id }
      );
    } else {
      // Revision requests can be made on scenarios that have been sent to admins
      // or already approved.  For legacy compatibility we also allow submitted.
      if (!['sent_for_approval', 'approved', 'submitted'].includes(scenario.status)) {
        return res.status(409).json({ error: 'Scenario must be sent for approval or approved to request revision' });
      }
      if (!note) return res.status(400).json({ error: "note is required for revision requests" });
      // Expect revisionWorkIds from body
      const revisionWorkIdsRaw = req.body?.revisionWorkIds;
      if (!Array.isArray(revisionWorkIdsRaw) || revisionWorkIdsRaw.length === 0) {
        return res.status(400).json({ error: 'revisionWorkIds must be a non-empty array' });
      }
      // Normalize and validate work IDs
      const uniqueIds = Array.from(
        new Set(
          revisionWorkIdsRaw
            .map((id) => String(id || '').trim())
            .filter((id) => Boolean(id))
        )
      );
      // Ensure each is in REQUIRED_WORK_IDS
      for (const wid of uniqueIds) {
        if (!REQUIRED_WORK_IDS.includes(wid)) {
          return res.status(400).json({ error: `Invalid work id: ${wid}` });
        }
      }
      if (uniqueIds.length === 0) {
        return res.status(400).json({ error: 'revisionWorkIds must contain at least one valid work id' });
      }
      // Begin transaction to update scenario and work items atomically
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        // Update scenario: set revision_requested and clear sent/check fields
        await conn.query(
          `UPDATE school_scenarios
           SET status='revision_requested',
               reviewed_at=CURRENT_TIMESTAMP,
               reviewed_by=:u,
               review_note=:note,
               sent_at=NULL,
               sent_by=NULL,
               checked_at=NULL,
               checked_by=NULL
           WHERE id=:id`,
          { id: scenarioId, u: req.user.id, note }
        );
        // Remove reporting entries
        await conn.query(
          'DELETE FROM school_reporting_scenarios WHERE scenario_id=:id',
          { id: scenarioId }
        );
        // Log review event
        await conn.query(
          'INSERT INTO scenario_review_events (scenario_id, action, note, actor_user_id) VALUES (:id, :action, :note, :u)',
          { id: scenarioId, action: 'revise', note, u: req.user.id }
        );
        // Ensure all required work items exist.  Insert missing rows with default state 'approved'.
        for (const wid of REQUIRED_WORK_IDS) {
          await conn.query(
            `INSERT INTO scenario_work_items (scenario_id, work_id, state, updated_by)
             SELECT :sid, :wid, 'approved', :uid
             FROM DUAL
             WHERE NOT EXISTS (
               SELECT 1 FROM scenario_work_items WHERE scenario_id=:sid AND work_id=:wid
             )`,
            { sid: scenarioId, wid, uid: req.user.id }
          );
        }
        // Set all required work items to 'approved' by default (lock them)
        await conn.query(
          `UPDATE scenario_work_items
           SET state='approved', updated_by=?, updated_at=CURRENT_TIMESTAMP
           WHERE scenario_id=? AND work_id IN (?)`,
          [req.user.id, scenarioId, REQUIRED_WORK_IDS]
        );
        // Now set selected ones to 'needs_revision'
        await conn.query(
          `UPDATE scenario_work_items
           SET state='needs_revision', updated_by=?, updated_at=CURRENT_TIMESTAMP
           WHERE scenario_id=? AND work_id IN (?)`,
          [req.user.id, scenarioId, uniqueIds]
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
      }
      conn.release();
    }

    const [[updated]] = await pool.query(
      "SELECT id, name, academic_year, status, submitted_at, reviewed_at, review_note, input_currency, local_currency_code, fx_usd_to_local FROM school_scenarios WHERE id=:id",
      { id: scenarioId }
    );
    return res.json({ scenario: updated || null });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/reports/rollup?academicYear=...
 */
router.get("/reports/rollup", async (req, res) => {
  try {
    const yearPrefix = parseAcademicYearPrefix(req.query?.academicYear);
    if (!yearPrefix) return res.status(400).json({ error: "academicYear is required" });

    const academicYearLike = `${escapeLike(yearPrefix)}%`;
    const pool = getPool();
    const [mappings] = await pool.query(
      `SELECT
        srs.school_id,
        srs.academic_year,
        srs.scenario_id,
        srs.included_years,
        s.name AS school_name,
        c.id AS country_id,
        c.name AS country_name,
        c.region AS country_region
       FROM school_reporting_scenarios srs
       JOIN schools s ON s.id = srs.school_id
       JOIN countries c ON c.id = s.country_id
       WHERE srs.academic_year LIKE :academic_year_like ESCAPE '\\\\'`,
      { academic_year_like: academicYearLike }
    );

    const scenarioIds = mappings.map((m) => m.scenario_id);
    let kpiRows = [];
    if (scenarioIds.length) {
      const [rows] = await pool.query(
        `SELECT scenario_id, academic_year, year_key, net_ciro, net_income, total_expenses, net_result, students_total
         FROM scenario_kpis
         WHERE scenario_id IN (:ids)`,
        { ids: scenarioIds }
      );
      kpiRows = rows;
    }

    const kpiMap = new Map();
    kpiRows.forEach((row) => {
      if (!kpiMap.has(row.scenario_id)) kpiMap.set(row.scenario_id, new Map());
      kpiMap.get(row.scenario_id).set(row.year_key, {
        net_ciro: Number(row.net_ciro || 0),
        net_income: Number(row.net_income || 0),
        total_expenses: Number(row.total_expenses || 0),
        net_result: Number(row.net_result || 0),
        students_total: Number(row.students_total || 0),
      });
    });

    const emptyYearTotals = () => ({
      net_ciro: 0,
      net_income: 0,
      total_expenses: 0,
      net_result: 0,
      students_total: 0,
      profitMargin: null,
    });
    const emptyYears = () => ({ y1: emptyYearTotals(), y2: emptyYearTotals(), y3: emptyYearTotals() });

    const totals = emptyYears();
    const regionsMap = new Map();
    const missingKpis = [];

    const addTotals = (targetYears, yearKey, metrics) => {
      const year = targetYears[yearKey];
      if (!year) return;
      year.net_ciro += metrics.net_ciro;
      year.net_income += metrics.net_income;
      year.total_expenses += metrics.total_expenses;
      year.net_result += metrics.net_result;
      year.students_total += metrics.students_total;
    };

    const finalizeYears = (years) => {
      YEAR_KEYS.forEach((key) => {
        const year = years[key];
        if (!year) return;
        year.profitMargin = year.net_ciro > 0 ? year.net_result / year.net_ciro : null;
      });
    };

    mappings.forEach((mapping) => {
      const included = normalizeIncludedYears(mapping.included_years);
      const scenarioKpis = kpiMap.get(mapping.scenario_id) || new Map();
      const missingYears = [];

      const schoolYears = { y1: null, y2: null, y3: null };
      YEAR_KEYS.forEach((key) => {
        if (!included.includes(key)) {
          schoolYears[key] = null;
          return;
        }
        const metrics = scenarioKpis.get(key);
        if (!metrics) {
          missingYears.push(key);
          schoolYears[key] = null;
          return;
        }
        schoolYears[key] = {
          ...metrics,
          profitMargin: metrics.net_ciro > 0 ? metrics.net_result / metrics.net_ciro : null,
        };
        addTotals(totals, key, metrics);
      });

      if (missingYears.length) {
        missingKpis.push({
          school_id: mapping.school_id,
          scenario_id: mapping.scenario_id,
          missingYears,
        });
      }

      if (!regionsMap.has(mapping.country_region)) {
        regionsMap.set(mapping.country_region, {
          region: mapping.country_region,
          years: emptyYears(),
          countries: new Map(),
        });
      }
      const regionNode = regionsMap.get(mapping.country_region);

      if (!regionNode.countries.has(mapping.country_id)) {
        regionNode.countries.set(mapping.country_id, {
          id: mapping.country_id,
          name: mapping.country_name,
          years: emptyYears(),
          schools: [],
        });
      }
      const countryNode = regionNode.countries.get(mapping.country_id);

      YEAR_KEYS.forEach((key) => {
        const metrics = schoolYears[key];
        if (!metrics) return;
        addTotals(regionNode.years, key, metrics);
        addTotals(countryNode.years, key, metrics);
      });

      countryNode.schools.push({
        id: mapping.school_id,
        name: mapping.school_name,
        scenario_id: mapping.scenario_id,
        included_years: included,
        years: schoolYears,
      });
    });

    finalizeYears(totals);

    const regions = Array.from(regionsMap.values()).map((region) => {
      finalizeYears(region.years);
      const countries = Array.from(region.countries.values()).map((country) => {
        finalizeYears(country.years);
        return { ...country, schools: country.schools };
      });
      return { region: region.region, years: region.years, countries };
    });

    const [missingNoApproved] = await pool.query(
      `SELECT s.id, s.name, c.id AS country_id, c.name AS country_name, c.region AS country_region
       FROM schools s
       JOIN countries c ON c.id = s.country_id
       LEFT JOIN school_reporting_scenarios srs
         ON srs.school_id = s.id AND srs.academic_year LIKE :academic_year_like ESCAPE '\\\\'
       WHERE srs.school_id IS NULL
       ORDER BY c.region, c.name, s.name`,
      { academic_year_like: academicYearLike }
    );

    return res.json({
      academicYear: yearPrefix,
      totals,
      regions,
      missingNoApproved,
      missingKpis,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/reports/rollup.xlsx
 * Stub for XLSX export
 */
router.get("/reports/rollup.xlsx", async (req, res) => {
  return res.status(501).json({ error: "Rollup XLSX export not implemented yet" });
});

/**
 * PATCH /admin/users/:id/role
 * Body: { role }
 *
 * Allows an admin to change a user's role.  Valid roles are defined
 * by the application (admin, user, principal, hr).  Returns the
 * updated id and role on success.
 */
router.patch("/users/:id/role", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });
    const role = String(req.body?.role || "").trim();
    // List of allowed roles; update this array when adding new roles.  Includes
    // the manager/accountant roles.  Only admins may assign the manager role.
    const validRoles = ["admin", "user", "principal", "hr", "manager", "accountant"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    // Only admins can assign the manager or accountant roles.  Prevent
    // non-admins from assigning this high-level role.  This check should
    // precede updating the database.
    if ((role === "manager" || role === "accountant") && String(req.user.role) !== "admin") {
      return res.status(403).json({ error: "Only admins can assign manager/accountant roles" });
    }
    const pool = getPool();
    const [r] = await pool.query("UPDATE users SET role=:role WHERE id=:id", { role, id: userId });
    if (!r.affectedRows) return res.status(404).json({ error: "User not found" });
    return res.json({ id: userId, role });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/permissions/catalog
 *
 * Ensures all catalog permissions exist in the database and returns the
 * permissions grouped by their UI group labels.  Each group key
 * corresponds to the `group` property from the catalog and maps to
 * an array of permission definitions.
 */
router.get("/permissions/catalog", async (req, res) => {
  try {
    // Ensure all permissions in the catalog exist in the DB
    await ensurePermissions();
    // Group catalog entries by group
    const grouped = {};
    for (const perm of PERMISSIONS_CATALOG) {
      const grp = perm.group || "Other";
      if (!grouped[grp]) grouped[grp] = [];
      grouped[grp].push(perm);
    }
    return res.json(grouped);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/users/:id/permissions
 *
 * Returns the list of permissions assigned to a user.  Each item
 * includes the resource, action, and any scope identifiers.
 */
router.get("/users/:id/permissions", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });
    const pool = getPool();
    const perms = await getUserPermissions(pool, userId);
    return res.json(perms);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /admin/users/:id/permissions
 *
 * Replaces all permissions for a user.  The body must include a
 * `permissions` array where each entry contains `resource`, `action`,
 * and optionally `scope_country_id` and `scope_school_id`.  Any
 * existing permissions for the user are removed and replaced by the
 * provided list.  If a permission does not exist in the `permissions`
 * table it will be created.  Optionally ensures that scoped
 * permissions match the user's assigned country.
 */
router.put("/users/:id/permissions", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid user id" });
    const incoming = req.body?.permissions;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "permissions must be an array" });
    }
    const pool = getPool();
    // Ensure user exists and get their country
    const [[userRow]] = await pool.query("SELECT id, country_id FROM users WHERE id=:id", { id: userId });
    if (!userRow) return res.status(404).json({ error: "User not found" });
    const userCountry = userRow.country_id;
    // Build list of permission entries to insert
    const entries = [];
    for (const item of incoming) {
      const resource = String(item?.resource || "").trim();
      const action = String(item?.action || "").trim();
      if (!resource || !action) {
        return res.status(400).json({ error: "Each permission must include resource and action" });
      }
      let scopeCountryId = item?.scope_country_id;
      let scopeSchoolId = item?.scope_school_id;
      // Normalize scope values
      scopeCountryId = scopeCountryId != null ? Number(scopeCountryId) : null;
      scopeSchoolId = scopeSchoolId != null ? Number(scopeSchoolId) : null;
      if (scopeCountryId != null && !Number.isFinite(scopeCountryId)) scopeCountryId = null;
      if (scopeSchoolId != null && !Number.isFinite(scopeSchoolId)) scopeSchoolId = null;
      // Optionally validate that the country scope matches user's assigned country
      if (scopeCountryId != null && userCountry != null && Number(scopeCountryId) !== Number(userCountry)) {
        return res.status(400).json({ error: `scope_country_id ${scopeCountryId} does not match user's country ${userCountry}` });
      }
      // Ensure the permission exists in the permissions table
      let permId = null;
      const [[permRow]] = await pool.query(
        "SELECT id FROM permissions WHERE resource=:resource AND action=:action",
        { resource, action }
      );
      if (permRow) {
        permId = permRow.id;
      } else {
        const [ins] = await pool.query(
          "INSERT INTO permissions (resource, action) VALUES (:resource, :action)",
          { resource, action }
        );
        permId = ins.insertId;
      }
      entries.push({ permId, scopeCountryId, scopeSchoolId });
    }
    // Replace existing permissions within a transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Delete existing
      await conn.query("DELETE FROM user_permissions WHERE user_id=:uid", { uid: userId });
      // Insert new
      for (const row of entries) {
        await conn.query(
          "INSERT INTO user_permissions (user_id, permission_id, scope_country_id, scope_school_id) VALUES (:user_id,:permission_id,:scope_country_id,:scope_school_id)",
          {
            user_id: userId,
            permission_id: row.permId,
            scope_country_id: row.scopeCountryId,
            scope_school_id: row.scopeSchoolId,
          }
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    // Return updated permissions
    const updated = await getUserPermissions(pool, userId);
    return res.json({ id: userId, permissions: updated });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/schools/:schoolId/assignments
 *
 * Lists principal/HR assignments (with module responsibility) for a school.
 */
router.get("/schools/:schoolId/assignments", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT user_id, role, modules_json
       FROM school_user_roles
       WHERE school_id = :sid AND role IN ('principal', 'hr', 'accountant')`,
      { sid: schoolId }
    );
    const assignments = (Array.isArray(rows) ? rows : []).map((row) => ({
      userId: Number(row.user_id),
      role: row.role,
      modules: parseModulesJson(row.modules_json),
    }));
    return res.json(assignments);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /admin/schools/:schoolId/assignments
 * Body: { assignments: Array<{ userId, role, modules }> }
 *
 * Replaces principal/HR assignments (with module responsibility) for a school.
 */
router.put("/schools/:schoolId/assignments", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    const parsed = parseAssignmentsPayload(req.body?.assignments);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const assignments = parsed.assignments || [];
    const pool = getPool();
    const [[school]] = await pool.query(
      "SELECT id, country_id FROM schools WHERE id=:id",
      { id: schoolId }
    );
    if (!school) return res.status(404).json({ error: "School not found" });
    await ensurePermissions();
    const { permIds: modulePermIds, permIdByKey } = await loadModulePermissionIds(pool);
    const ids = Array.from(new Set(assignments.map((a) => a.userId)));
    let usersById = new Map();
    if (ids.length > 0) {
      const [users] = await pool.query(
        "SELECT id, role FROM users WHERE id IN (:ids)",
        { ids }
      );
      if (!Array.isArray(users) || users.length !== ids.length) {
        return res.status(400).json({ error: "One or more users not found" });
      }
      usersById = new Map(users.map((row) => [Number(row.id), row]));
      for (const assignment of assignments) {
        if (assignment.role !== "accountant") continue;
        const userRow = usersById.get(assignment.userId);
        if (!userRow || String(userRow.role) !== "accountant") {
          return res.status(400).json({ error: `User ${assignment.userId} is not an accountant` });
        }
      }
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existingRows] = await conn.query(
        "SELECT DISTINCT user_id FROM school_user_roles WHERE school_id=:sid AND role IN ('principal', 'hr', 'accountant')",
        { sid: schoolId }
      );
      const cleanupUserIds = new Set(
        (Array.isArray(existingRows) ? existingRows : []).map((row) => Number(row.user_id))
      );
      ids.forEach((uid) => cleanupUserIds.add(uid));
      await conn.query(
        "DELETE FROM school_user_roles WHERE school_id=:sid AND role IN ('principal', 'hr', 'accountant')",
        { sid: schoolId }
      );
      for (const assignment of assignments) {
        await conn.query(
          `INSERT INTO school_user_roles (school_id, user_id, role, assigned_by, modules_json)
           VALUES (:sid, :uid, :role, :assigned_by, :modules_json)`,
          {
            sid: schoolId,
            uid: assignment.userId,
            role: assignment.role,
            assigned_by: req.user.id,
            modules_json: JSON.stringify(assignment.modules || []),
          }
        );
        const userRow = usersById.get(assignment.userId);
        if (assignment.role !== "accountant" && userRow && String(userRow.role) !== assignment.role) {
          await conn.query("UPDATE users SET role=:role WHERE id=:id", {
            role: assignment.role,
            id: assignment.userId,
          });
        }
      }
      if (modulePermIds.length > 0 && cleanupUserIds.size > 0) {
        for (const uid of cleanupUserIds) {
          await conn.query(
            "DELETE FROM user_permissions WHERE user_id=:uid AND scope_school_id=:sid AND permission_id IN (:permIds)",
            { uid, sid: schoolId, permIds: modulePermIds }
          );
        }
      }
      for (const assignment of assignments) {
        const entries = getPermissionEntriesForModules(assignment.modules);
        if (!entries.length) continue;
        const keys = new Set(entries.map((entry) => `${entry.resource}|${entry.action}`));
        for (const key of keys) {
          const permId = permIdByKey.get(key);
          if (!permId) continue;
          await conn.query(
            "INSERT INTO user_permissions (user_id, permission_id, scope_country_id, scope_school_id) VALUES (:uid,:pid,:cid,:sid)",
            {
              uid: assignment.userId,
              pid: permId,
              cid: school.country_id ?? null,
              sid: schoolId,
            }
          );
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return res.json({ id: schoolId, assignments });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /admin/schools/:schoolId/principals
 *
 * Lists principal users assigned to a school. Returns user id, full_name
 * and email for each principal.
 */
router.get("/schools/:schoolId/principals", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email
       FROM school_user_roles sur
       JOIN users u ON u.id = sur.user_id
       WHERE sur.school_id = :sid AND sur.role = 'principal'`,
      { sid: schoolId }
    );
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /admin/schools/:schoolId/principals
 * Body: { userIds: number[] }
 *
 * Replaces the list of principals for a school.  Removes all existing
 * principal assignments and inserts new rows.  Optionally updates
 * each user's role to 'principal' if they are not already assigned that role.
 */
router.put("/schools/:schoolId/principals", async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    const userIds = req.body?.userIds;
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }
    // Filter and dedupe userIds
    const ids = Array.from(
      new Set(
        userIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        "SELECT user_id, modules_json FROM school_user_roles WHERE school_id=:sid AND role='principal'",
        { sid: schoolId }
      );
      const modulesByUserId = new Map(
        (Array.isArray(existing) ? existing : []).map((row) => [
          Number(row.user_id),
          row.modules_json,
        ])
      );
      // Remove existing principal assignments for this school
      await conn.query(
        "DELETE FROM school_user_roles WHERE school_id=:sid AND role='principal'",
        { sid: schoolId }
      );
      // Insert new assignments
      for (const uid of ids) {
        await conn.query(
          "INSERT INTO school_user_roles (school_id, user_id, role, assigned_by, modules_json) VALUES (:sid, :uid, 'principal', :assigned_by, :modules_json)",
          {
            sid: schoolId,
            uid,
            assigned_by: req.user.id,
            modules_json: modulesByUserId.get(uid) ?? null,
          }
        );
        // Optionally update user role to principal if not already
        const [[urow]] = await conn.query(
          "SELECT role FROM users WHERE id=:id",
          { id: uid }
        );
        if (urow && String(urow.role) !== 'principal') {
          await conn.query("UPDATE users SET role='principal' WHERE id=:id", { id: uid });
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return res.json({ id: schoolId, principalUserIds: ids });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

module.exports = router;
