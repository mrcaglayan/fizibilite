//backend/src/middleware/auth.js

const jwt = require("jsonwebtoken");
const { getPool } = require("../db");
const { getUserPermissions, hasPermission } = require("../utils/permissionService");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // payload should contain at least: { id, email, country_id, role }
    // optional: { region }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

function requireAssignedCountry(req, res, next) {
  if (req.user?.country_id == null) {
    return res.status(403).json({ error: "Country assignment required" });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, requireAssignedCountry };

/**
 * Require that the authenticated user has one of the specified roles.
 *
 * Usage: router.get('/admin', requireRole(['admin','hr']), (req,res) => { ... });
 * If the user's role is not in the allowed list, a 403 response is returned.
 *
 * @param {string[]|string} roles A role or array of roles to allow
 * @returns {Function} Express middleware
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req?.user || !allowed.includes(String(req.user.role))) {
      return res.status(403).json({ error: `Requires role: ${allowed.join(", ")}` });
    }
    return next();
  };
}

/**
 * Middleware to ensure the authenticated user has a specific permission on a resource.
 *
 * Admin users bypass permission checks. Non‑admin users must have a matching
 * entry in the user_permissions table for the given resource/action and
 * optional scope (country/school).
 *
 * Example usage:
 *   router.put('/schools/:schoolId/...', requirePermission('page.temel_bilgiler','write', { schoolIdParam: 'schoolId' }), handler);
 *
 * @param {string} resource The permission resource key (e.g. page.temel_bilgiler)
 * @param {string} action The action to require (e.g. write)
 * @param {object} [opts] Additional options for extracting scope
 * @param {string} [opts.schoolIdParam] Name of the route parameter containing the schoolId
 * @returns {Function} Express middleware
 */
function requirePermission(resource, action, opts = {}) {
  const { schoolIdParam } = opts;
  return async (req, res, next) => {
    try {
      // Only admin users bypass permission checks entirely.  Managers may
      // implicitly manage permissions when the resource is page.manage_permissions.
      const role = String(req?.user?.role || "");
      // Admin bypass
      if (role === 'admin') {
        return next();
      }
      // Special-case: managers automatically have write access to
      // page.manage_permissions (they manage users within their country).
      if (resource === 'page.manage_permissions' && role === 'manager') {
        // Only allow write or read actions; other actions not relevant
        if (action === 'write' || action === 'read') {
          return next();
        }
      }
      // Ensure we have a user and required fields
      if (!req?.user) return res.status(401).json({ error: 'Missing user' });
      // Load permissions onto req if not already present
      if (!req._permissions) {
        const pool = getPool();
        req._permissions = await getUserPermissions(pool, req.user.id);
      }
      const countryId = req.user?.country_id ?? null;
      let schoolId = null;
      if (schoolIdParam && req.params && req.params[schoolIdParam] != null) {
        const parsed = Number(req.params[schoolIdParam]);
        if (Number.isFinite(parsed)) schoolId = parsed;
      }
      const ok = hasPermission(req._permissions, { resource, action, countryId, schoolId });
      if (!ok) {
        return res.status(403).json({ error: `Missing ${action} permission for ${resource}` });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
    }
  };
}

/**
 * Middleware to ensure a user can access a particular school context.
 *
 * For principals, the user must be explicitly assigned to the school via
 * school_user_roles with role='principal'. Other non‑admin users must belong
 * to the same country as the school. Admins bypass these checks.
 *
 * Additionally, this middleware ensures the school exists and belongs to
 * the user's country. If not, a 404 response is returned.
 *
 * @param {string} schoolIdParam The name of the route parameter containing the schoolId
 * @returns {Function} Express middleware
 */
function requireSchoolContextAccess(schoolIdParam) {
  return async (req, res, next) => {
    try {
      // Only admin users bypass school context checks.  Managers and accountants
      // must belong to the same country and may access any school in that
      // country without explicit assignment.  Principals must be explicitly
      // assigned to the school via the school_user_roles table.  Users of
      // other roles (e.g. hr) may access schools in their country but are
      // not assigned to specific schools.
      const role = String(req?.user?.role || "");
      if (role === 'admin') {
        return next();
      }
      if (!req?.user) return res.status(401).json({ error: 'Missing user' });
      const userId = req.user.id;
      const userRole = String(req.user.role);
      const schoolIdRaw = req.params?.[schoolIdParam];
      const schoolId = Number(schoolIdRaw);
      if (!Number.isFinite(schoolId)) {
        return res.status(400).json({ error: 'Invalid school ID' });
      }
      const pool = getPool();
      // Verify the school exists and belongs to the user's country
      const [[schoolRow]] = await pool.query(
        `SELECT id, country_id FROM schools WHERE id=:id`,
        { id: schoolId }
      );
      if (!schoolRow) return res.status(404).json({ error: 'School not found' });
      if (req.user.country_id != null && Number(schoolRow.country_id) !== Number(req.user.country_id)) {
        // School exists but not in user's country
        return res.status(403).json({ error: 'Access denied: School not in your country' });
      }
      // Principals must be assigned to the school.  Other roles (manager,
      // accountant, etc.) are not assigned to specific schools but still
      // require same‑country match (already enforced above).
      if (userRole === 'principal') {
        const [[assignment]] = await pool.query(
          `SELECT 1 FROM school_user_roles WHERE user_id=:uid AND school_id=:sid AND role='principal'`,
          { uid: userId, sid: schoolId }
        );
        if (!assignment) {
          return res.status(403).json({ error: 'Access denied: Principal not assigned to this school' });
        }
      }
      // All checks passed: user may access this school context
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
    }
  };
}

/**
 * Require that the authenticated user has a specific permission scoped to a school.
 *
 * This middleware mirrors the hasPermission logic on the backend and is used to
 * enforce read/write access on page- or section-level resources.  Admins
 * bypass permission checks.  Non-admin users must have an entry in
 * user_permissions with a matching resource/action and a scope_country_id and/or
 * scope_school_id that matches the request context.
 *
 * Example usage:
 *   router.get('/schools/:id', requireSchoolPermission('page.temel_bilgiler','read','id'), handler);
 *
 * @param {string} resource Permission resource key to check (e.g. page.temel_bilgiler)
 * @param {string} action Action to require (e.g. read or write)
 * @param {string} [schoolIdParamName='schoolId'] Name of the route param containing the school ID
 * @returns {Function} Express middleware
 */
function requireSchoolPermission(resource, action, schoolIdParamName = 'schoolId') {
  return async (req, res, next) => {
    try {
      // Only enforce for authenticated users
      if (!req?.user) {
        return res.status(401).json({ error: 'Missing user' });
      }
      const role = String(req.user.role || '');
      // Admin users bypass permission checks entirely
      if (role === 'admin') {
        return next();
      }
      // Load permissions onto request if not already loaded
      if (!req._permissions) {
        const pool = getPool();
        req._permissions = await getUserPermissions(pool, req.user.id);
      }
      const countryId = req.user?.country_id ?? null;
      let schoolId = null;
      if (req.params && req.params[schoolIdParamName] != null) {
        const parsed = Number(req.params[schoolIdParamName]);
        if (Number.isFinite(parsed)) schoolId = parsed;
      }
      const ok = hasPermission(req._permissions, { resource, action, countryId, schoolId });
      if (!ok) {
        return res.status(403).json({ error: `Missing ${action} permission for ${resource}` });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
    }
  };
}

/**
 * Require that the authenticated user has at least one permission (read or
 * write) scoped to the given school.  This is used as a coarse gate for
 * school-level data endpoints (e.g. school details or scenario inputs).  If
 * the user has at least one read or write permission whose scope matches
 * the specified schoolId (or is global), access is granted.  Admin users
 * bypass the check entirely.  Managers and other roles must possess
 * explicit permissions on at least one resource within the school context.
 *
 * Example usage:
 *   router.get('/schools/:id', requireAnySchoolRead('id'), handler);
 *
 * @param {string} schoolIdParamName Name of the route param containing the school ID
 * @returns {Function} Express middleware
 */
function requireAnySchoolRead(schoolIdParamName = 'schoolId') {
  return async (req, res, next) => {
    try {
      // Unauthenticated users cannot proceed
      if (!req?.user) {
        return res.status(401).json({ error: 'Missing user' });
      }
      const role = String(req.user.role || '');
      // Admin users bypass permission checks
      if (role === 'admin') {
        return next();
      }
      // Load user permissions if not already loaded
      if (!req._permissions) {
        const pool = getPool();
        req._permissions = await getUserPermissions(pool, req.user.id);
      }
      // Determine the school and country context
      let schoolId = null;
      if (req.params && req.params[schoolIdParamName] != null) {
        const parsed = Number(req.params[schoolIdParamName]);
        if (Number.isFinite(parsed)) schoolId = parsed;
      }
      const countryId = req.user?.country_id ?? null;
      // Iterate through permissions and look for any entry with read/write
      // action and matching scope.  Write permissions also satisfy read.
      const perms = Array.isArray(req._permissions) ? req._permissions : [];
      for (const perm of perms) {
        const action = String(perm.action || '');
        // Consider read or write permissions
        if (action !== 'read' && action !== 'write') continue;
        const permCountry = perm.scope_country_id != null ? Number(perm.scope_country_id) : null;
        const permSchool = perm.scope_school_id != null ? Number(perm.scope_school_id) : null;
        // Scope checks: permission may be global (null) or match provided context
        if (permCountry != null && countryId != null && Number(permCountry) !== Number(countryId)) {
          continue;
        }
        if (permSchool != null && schoolId != null && Number(permSchool) !== Number(schoolId)) {
          continue;
        }
        // If permSchool is non-null but provided schoolId is null, skip
        if (permSchool != null && schoolId == null) continue;
        // If permCountry is non-null but provided countryId is null, skip
        if (permCountry != null && countryId == null) continue;
        // Found at least one matching permission
        return next();
      }
      return res.status(403).json({ error: 'Missing read permission for school' });
    } catch (err) {
      return res.status(500).json({ error: 'Server error', details: String(err?.message || err) });
    }
  };
}


// Export new middlewares along with existing ones
module.exports = {
  requireAuth,
  requireAdmin,
  requireAssignedCountry,
  requireRole,
  requirePermission,
  requireSchoolContextAccess,
  requireSchoolPermission,
  requireAnySchoolRead,
};
