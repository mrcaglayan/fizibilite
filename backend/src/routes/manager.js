// backend/src/routes/manager.js

const express = require("express");
const bcrypt = require("bcryptjs");
const { getPool } = require("../db");
const { ensurePermissions } = require("../utils/ensurePermissions");
const { PERMISSIONS_CATALOG } = require("../utils/permissionsCatalog");
const { getUserPermissions } = require("../utils/permissionService");
const { requireAuth, requireAssignedCountry, requirePermission } = require("../middleware/auth");

/**
 * Router for users who can manage permissions.  Access to all routes in this
 * router requires that the authenticated user has the `page.manage_permissions`
 * permission with the `write` action.  The manager role is intended to be
 * similar to admin but with the restriction that managers cannot assign the
 * 'manager' role to other users nor grant the manage_permissions permission
 * itself.
 */
const router = express.Router();

// Require authentication on all routes. Specific permissions are enforced per-route.
router.use(requireAuth);

/**
 * GET /manager/review-queue
 *
 * Returns a compact review queue for managers/accountants/admins (or users
 * with page.manage_permissions read/write). The response is an array of
 * { school, scenario, requiredItems, approvedCount } objects, mirroring the
 * frontend structure but produced in a single query.
 */
router.get("/review-queue", async (req, res) => {
  try {
    const role = String(req.user?.role || "");
    let allowAll = false;
    const allowedCountryIds = new Set();
    const allowedSchoolIds = new Set();

    if (["admin"].includes(role)) {
      allowAll = true;
    } else if (["manager", "accountant"].includes(role)) {
      if (!req.user?.country_id) {
        return res.status(400).json({ error: "Manager must be assigned to a country" });
      }
      allowedCountryIds.add(Number(req.user.country_id));
    } else {
      const pool = getPool();
      const perms = await getUserPermissions(pool, req.user.id);
      const filtered = Array.isArray(perms)
        ? perms.filter(
            (p) =>
              String(p.resource) === "page.manage_permissions" &&
              (String(p.action) === "read" || String(p.action) === "write")
          )
        : [];
      if (filtered.length === 0) return res.status(403).json({ error: "Review access denied" });
      for (const perm of filtered) {
        const permCountry = perm.scope_country_id != null ? Number(perm.scope_country_id) : null;
        const permSchool = perm.scope_school_id != null ? Number(perm.scope_school_id) : null;
        if (permSchool != null && Number.isFinite(permSchool)) {
          allowedSchoolIds.add(permSchool);
        }
        if (permCountry != null && Number.isFinite(permCountry)) {
          allowedCountryIds.add(permCountry);
        }
        if (permSchool == null && permCountry == null) {
          allowAll = true;
        }
      }
    }

    if (!allowAll && allowedCountryIds.size === 0 && allowedSchoolIds.size === 0) {
      return res.status(403).json({ error: "Review access denied" });
    }

    const REQUIRED_WORK_IDS = [
      "temel_bilgiler",
      "kapasite",
      "norm.ders_dagilimi",
      "ik.local_staff",
      "gelirler.unit_fee",
      "giderler.isletme",
    ];

    const pool = getPool();
    const where = [];
    const params = { workIds: REQUIRED_WORK_IDS };
    if (!allowAll) {
      const countryIds = Array.from(allowedCountryIds);
      const schoolIds = Array.from(allowedSchoolIds);
      if (countryIds.length && schoolIds.length) {
        where.push("(s.country_id IN (:countryIds) OR s.id IN (:schoolIds))");
        params.countryIds = countryIds;
        params.schoolIds = schoolIds;
      } else if (countryIds.length) {
        where.push("s.country_id IN (:countryIds)");
        params.countryIds = countryIds;
      } else if (schoolIds.length) {
        where.push("s.id IN (:schoolIds)");
        params.schoolIds = schoolIds;
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT
        s.id AS school_id,
        s.name AS school_name,
        sc.id AS scenario_id,
        sc.name AS scenario_name,
        sc.academic_year,
        sc.status,
        sc.submitted_at AS scenario_submitted_at,
        sc.sent_at AS scenario_sent_at,
        sc.checked_at AS scenario_checked_at,
        sc.checked_by AS scenario_checked_by,
        wi.work_id,
        wi.state AS work_state,
        wi.submitted_at AS work_submitted_at,
        wi.reviewed_at AS work_reviewed_at,
        wi.manager_comment
       FROM schools s
       JOIN school_scenarios sc ON sc.school_id = s.id
       LEFT JOIN scenario_work_items wi
         ON wi.scenario_id = sc.id
        AND wi.work_id IN (:workIds)
       ${whereSql}
       ORDER BY s.name ASC, sc.created_at DESC`,
      params
    );

    const scenarioMap = new Map();
    for (const row of rows) {
      const scenarioId = row.scenario_id;
      if (!scenarioMap.has(scenarioId)) {
        scenarioMap.set(scenarioId, {
          school: { id: row.school_id, name: row.school_name },
        scenario: {
          id: row.scenario_id,
          name: row.scenario_name,
          academic_year: row.academic_year,
          status: row.status,
          submitted_at: row.scenario_submitted_at,
          sent_at: row.scenario_sent_at,
          checked_at: row.scenario_checked_at,
          checked_by: row.scenario_checked_by,
        },
          _itemMap: {},
        });
      }
      if (row.work_id) {
        scenarioMap.get(scenarioId)._itemMap[row.work_id] = {
          work_id: row.work_id,
          state: row.work_state,
          submitted_at: row.work_submitted_at,
          reviewed_at: row.work_reviewed_at,
          manager_comment: row.manager_comment,
        };
      }
    }

    const results = [];
    for (const entry of scenarioMap.values()) {
      const itemMap = entry._itemMap || {};
      let approvedCount = 0;
      const requiredItems = REQUIRED_WORK_IDS.map((wid) => {
        const item = itemMap[wid] || null;
        if (item?.state === "approved") approvedCount += 1;
        return { workId: wid, item };
      });
      results.push({
        school: entry.school,
        scenario: entry.scenario,
        requiredItems,
        approvedCount,
      });
    }

    return res.json(results);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /manager/permissions/catalog
 *
 * Ensures all catalog permissions exist in the database and returns the
 * permissions grouped by their UI group labels.  Same shape as the
 * admin catalog.  Managers will see all permissions but cannot assign
 * the manage_permissions entries to other users.
 */
router.get("/permissions/catalog", requirePermission("page.manage_permissions", "write"), async (req, res) => {
  try {
    await ensurePermissions();
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
 * GET /manager/users
 *
 * Lists users within the manager's assigned country.  Managers may only
 * manage users in their own country.  Returns basic user info.
 */
router.get("/users", requirePermission("page.manage_permissions", "write"), async (req, res) => {
  try {
    const countryId = req.user?.country_id;
    if (!countryId) {
      return res.status(400).json({ error: "Manager must be assigned to a country" });
    }
    const pool = getPool();
    // Fetch only available columns from the users table.  Managers operate
    // within a single country, so we do not need to return country_name or
    // code here.  Should you require country details, join with the
    // countries table.
    const [rows] = await pool.query(
      `SELECT id, full_name, email, role, country_id
       FROM users
       WHERE country_id = :cid
       ORDER BY full_name ASC`,
      { cid: countryId }
    );
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * POST /manager/users
 *
 * Create a new user (principal or HR) in the caller's country. Requires
 * the user.create:write permission. The new user is always scoped to the
 * caller's country.
 */
router.post(
  "/users",
  requirePermission("user.create", "write"),
  requireAssignedCountry,
  async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");
      const fullNameRaw = String(req.body?.full_name ?? req.body?.fullName ?? "").trim();
      const fullName = fullNameRaw ? fullNameRaw : null;
      const role = String(req.body?.role || "").trim().toLowerCase();

      if (!email || !password) return res.status(400).json({ error: "email and password are required" });
      if (String(password).length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      const validRoles = ["principal", "hr"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role (principal or hr only)" });
      }

      const pool = getPool();
      const [[existing]] = await pool.query("SELECT id FROM users WHERE email=:email", { email });
      if (existing) return res.status(409).json({ error: "Email already registered" });

      const [[country]] = await pool.query(
        "SELECT id, name, code, region FROM countries WHERE id=:id",
        { id: req.user.country_id }
      );
      if (!country) return res.status(400).json({ error: "Country not found" });

      const password_hash = await bcrypt.hash(String(password), 10);
      const [r] = await pool.query(
        "INSERT INTO users (full_name, email, password_hash, must_reset_password, country_id, role, region) VALUES (:full_name,:email,:password_hash,:must_reset_password,:country_id,:role,:region)",
        {
          full_name: fullName,
          email,
          password_hash,
          must_reset_password: 1,
          country_id: country.id,
          role,
          region: country.region ?? null,
        }
      );

      return res.json({
        id: r.insertId,
        full_name: fullName,
        email,
        country_id: country.id,
        country_name: country.name ?? null,
        country_code: country.code ?? null,
        role,
        region: country.region ?? null,
        must_reset_password: true,
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
    }
  }
);

/**
 * GET /manager/users/:id/permissions
 *
 * Retrieves the permissions for a specific user.  Managers can only view
 * permissions for users within their country.  Returns a list of
 * { resource, action, scope_country_id, scope_school_id } objects.
 */
router.get("/users/:id/permissions", requirePermission("page.manage_permissions", "write"), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const pool = getPool();
    // Ensure user belongs to the manager's country
    const [[target]] = await pool.query(
      "SELECT id, country_id FROM users WHERE id=:id",
      { id: userId }
    );
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!req.user.country_id || Number(target.country_id) !== Number(req.user.country_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const perms = await getUserPermissions(pool, userId);
    return res.json(perms);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PUT /manager/users/:id/permissions
 *
 * Replaces all permissions for a user.  Managers cannot assign the
 * manage_permissions permission or any permission scoped to a different
 * country.  Additionally, managers cannot assign any permissions if
 * the user belongs to a different country.
 */
router.put("/users/:id/permissions", requirePermission("page.manage_permissions", "write"), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const incoming = req.body?.permissions;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "permissions must be an array" });
    }
    const pool = getPool();
    // Ensure target user exists and belongs to manager's country
    const [[userRow]] = await pool.query(
      "SELECT id, country_id FROM users WHERE id=:id",
      { id: userId }
    );
    if (!userRow) return res.status(404).json({ error: "User not found" });
    if (!req.user.country_id || Number(userRow.country_id) !== Number(req.user.country_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userCountry = userRow.country_id;
    // Build list of permission entries to insert
    const entries = [];
    for (const item of incoming) {
      const resource = String(item?.resource || "").trim();
      const action = String(item?.action || "").trim();
      if (!resource || !action) {
        return res.status(400).json({ error: "Each permission must include resource and action" });
      }
      // Managers may not assign the manage_permissions permission
      if (resource === "page.manage_permissions") {
        continue; // skip silently
      }
      let scopeCountryId = item?.scope_country_id;
      let scopeSchoolId = item?.scope_school_id;
      scopeCountryId = scopeCountryId != null ? Number(scopeCountryId) : null;
      scopeSchoolId = scopeSchoolId != null ? Number(scopeSchoolId) : null;
      if (scopeCountryId != null && !Number.isFinite(scopeCountryId)) scopeCountryId = null;
      if (scopeSchoolId != null && !Number.isFinite(scopeSchoolId)) scopeSchoolId = null;
      // Validate scope matches manager's country
      if (scopeCountryId != null && Number(scopeCountryId) !== Number(req.user.country_id)) {
        return res.status(400).json({ error: `scope_country_id ${scopeCountryId} does not match manager's country ${req.user.country_id}` });
      }
      if (scopeCountryId == null) {
        // If no country scope provided but manager has a country, set it to manager's country
        scopeCountryId = req.user.country_id;
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
    // Perform replacement in a transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM user_permissions WHERE user_id=:uid", { uid: userId });
      for (const row of entries) {
        await conn.query(
          "INSERT INTO user_permissions (user_id, permission_id, scope_country_id, scope_school_id) VALUES (:uid,:pid,:cid,:sid)",
          {
            uid: userId,
            pid: row.permId,
            cid: row.scopeCountryId,
            sid: row.scopeSchoolId,
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
    const updated = await getUserPermissions(pool, userId);
    return res.json({ id: userId, permissions: updated });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * PATCH /manager/users/:id/role
 *
 * Updates a user's role.  Managers cannot assign the 'admin' or 'manager'
 * role.  Only roles 'user', 'hr', and 'principal' are permitted.  The
 * target user must belong to the same country.
 */
router.patch("/users/:id/role", requirePermission("page.manage_permissions", "write"), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const role = String(req.body?.role || "").trim().toLowerCase();
    const validRoles = ["user", "hr", "principal"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const pool = getPool();
    // Ensure target user is in the manager's country
    const [[target]] = await pool.query(
      "SELECT id, country_id FROM users WHERE id=:id",
      { id: userId }
    );
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!req.user.country_id || Number(target.country_id) !== Number(req.user.country_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Update role
    const [r] = await pool.query(
      "UPDATE users SET role=:role WHERE id=:id",
      { role, id: userId }
    );
    if (!r.affectedRows) return res.status(404).json({ error: "User not found" });
    return res.json({ id: userId, role });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
});

/**
 * GET /manager/schools/:schoolId/principals
 *
 * Lists principal users assigned to a school within the manager's country.
 */
router.get(
  "/schools/:schoolId/principals",
  requirePermission("page.manage_permissions", "write"),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    // Ensure the school belongs to manager's country
    const pool = getPool();
    const [[school]] = await pool.query(
      "SELECT id, country_id FROM schools WHERE id=:id",
      { id: schoolId }
    );
    if (!school) return res.status(404).json({ error: "School not found" });
    if (!req.user.country_id || Number(school.country_id) !== Number(req.user.country_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
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
 * PUT /manager/schools/:schoolId/principals
 * Body: { userIds: number[] }
 *
 * Replaces the list of principals for a school.  Managers can only assign
 * principals within their own country.  They also cannot assign principals
 * who belong to a different country.  Existing principal assignments are
 * removed and replaced with the provided list.  Each assigned user's role
 * will be updated to 'principal' if not already.
 */
router.put(
  "/schools/:schoolId/principals",
  requirePermission("page.manage_permissions", "write"),
  async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    if (!Number.isFinite(schoolId)) return res.status(400).json({ error: "Invalid school id" });
    const userIds = req.body?.userIds;
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }
    // Filter and dedupe
    const ids = Array.from(new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
    const pool = getPool();
    // Ensure school belongs to manager's country
    const [[school]] = await pool.query(
      "SELECT id, country_id FROM schools WHERE id=:id",
      { id: schoolId }
    );
    if (!school) return res.status(404).json({ error: "School not found" });
    if (!req.user.country_id || Number(school.country_id) !== Number(req.user.country_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Validate that all userIds belong to the same country
    if (ids.length) {
      const [users] = await pool.query(
        "SELECT id, country_id FROM users WHERE id IN (:ids)",
        { ids }
      );
      for (const u of users) {
        if (Number(u.country_id) !== Number(req.user.country_id)) {
          return res.status(400).json({ error: `User ${u.id} is not in manager's country` });
        }
      }
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Remove existing assignments
      await conn.query(
        "DELETE FROM school_user_roles WHERE school_id=:sid AND role='principal'",
        { sid: schoolId }
      );
      // Insert new assignments
      for (const uid of ids) {
        await conn.query(
          "INSERT INTO school_user_roles (school_id, user_id, role, assigned_by) VALUES (:sid, :uid, 'principal', :by)",
          { sid: schoolId, uid, by: req.user.id }
        );
        // Update user role to principal if necessary
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
