//backend/src/utils/permissionService.js

const { getPool } = require("../db");

/**
 * Fetch the list of permissions granted to a user.
 *
 * Each permission consists of a resource/action pair and optional scope values.
 * Permissions are granted via the `user_permissions` table and joined
 * through the `permissions` table.  Results include:
 *   { resource, action, scope_country_id, scope_school_id }
 *
 * @param {object} pool A mysql2 promise pool instance
 * @param {number} userId The user identifier
 * @returns {Promise<Array<{resource:string, action:string, scope_country_id:number|null, scope_school_id:number|null}>>}
 */
async function getUserPermissions(pool, userId) {
  const [rows] = await pool.query(
    `SELECT p.resource AS resource, p.action AS action, up.scope_country_id AS scope_country_id, up.scope_school_id AS scope_school_id
     FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = :user_id`,
    { user_id: userId }
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Determine whether a permission resource definition matches the requested resource.
 *
 * Supports exact match and wildcard prefix matching.  When the stored
 * `userPermResource` ends with `.*`, any `requestedResource` with the same
 * prefix up to the dot will match.
 *
 * Examples:
 *   matchResource('page.temel_bilgiler', 'page.temel_bilgiler') -> true
 *   matchResource('section.temel_bilgiler.*', 'section.temel_bilgiler.okul_egitim') -> true
 *   matchResource('page.temel_bilgiler', 'section.temel_bilgiler.okul_egitim') -> false
 *
 * @param {string} userPermResource The stored resource string (may include wildcard .* suffix)
 * @param {string} requestedResource The resource being requested
 * @returns {boolean}
 */
function matchResource(userPermResource, requestedResource) {
  if (!userPermResource || !requestedResource) return false;
  if (userPermResource === requestedResource) return true;
  if (userPermResource.endsWith(".*")) {
    const prefix = userPermResource.slice(0, -2);
    // A wildcard covers both the base resource and any subresources.  For
    // example, 'section.temel_bilgiler.*' should match both
    // 'section.temel_bilgiler' and 'section.temel_bilgiler.okul_egitim'.
    if (requestedResource === prefix) return true;
    const normalized = prefix.endsWith(".") ? prefix : prefix + ".";
    return requestedResource.startsWith(normalized);
  }
  return false;
}

/**
 * Evaluate whether a user has a given permission.
 *
 * Permission is granted if:
 *   - An entry in `perms` matches both the requested `action` and resource
 *     (exact or via wildcard via `matchResource`).
 *   - For scope constraints:
 *       • If `scope_country_id` is not null, it must equal the provided `countryId`.
 *       • If `scope_school_id` is not null, it must equal the provided `schoolId`.
 *       • If both are null, the permission applies globally.
 *
 * @param {Array<Object>} perms List of permission objects from `getUserPermissions`
 * @param {object} args
 * @param {string} args.resource The requested resource string
 * @param {string} args.action The requested action (e.g. 'write')
 * @param {number|null} args.countryId The user's country id from JWT or context
 * @param {number|null} args.schoolId The school id being acted upon (can be null)
 * @returns {boolean}
 */
function hasPermission(perms, { resource, action, countryId, schoolId }) {
  if (!Array.isArray(perms) || !resource || !action) return false;
  for (const perm of perms) {
    // Only consider this permission if the action matches or a higher‑level action satisfies
    // the requested action.  A 'write' permission implicitly grants 'read' access to the
    // same resource, but a 'read' permission does not grant 'write'.
    const permAction = String(perm.action);
    const reqAction = String(action);
    // Skip if the requested action is not directly matched and not implicitly allowed
    if (permAction !== reqAction) {
      // Allow a write permission when a read is requested
      if (!(reqAction === 'read' && permAction === 'write')) {
        continue;
      }
    }
    if (!matchResource(String(perm.resource), String(resource))) continue;
    // Scope: if the permission has a country_id, require match
    if (perm.scope_country_id != null) {
      if (countryId == null || Number(perm.scope_country_id) !== Number(countryId)) continue;
    }
    // Scope: if the permission has a school_id, require match
    if (perm.scope_school_id != null) {
      if (schoolId == null || Number(perm.scope_school_id) !== Number(schoolId)) continue;
    }
    return true;
  }
  return false;
}

module.exports = {
  getUserPermissions,
  matchResource,
  hasPermission,
};