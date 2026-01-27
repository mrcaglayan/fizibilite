// frontend/src/utils/permissions.js

/**
 * Determine whether a permission resource matches a requested resource.
 *
 * Supports wildcard suffixes (e.g. "page.gelirler.*") such that the
 * permission resource covers the requested resource and any subresources.
 *
 * @param {string} requested The resource key being checked (e.g. "page.gelirler" or "section.giderler.isletme")
 * @param {string} candidate The permission resource from a user's permission entry
 * @returns {boolean} True if the candidate covers the requested resource
 */
function matchResource(requested, candidate) {
  if (!requested || !candidate) return false;
  const req = String(requested).trim();
  const cand = String(candidate).trim();
  if (!req || !cand) return false;
  if (cand === req) return true;
  // Wildcard on candidate: "page.giderler.*" matches anything starting with "page.giderler."
  if (cand.endsWith('.*')) {
    const base = cand.slice(0, -2);
    return req === base || req.startsWith(base + '.');
  }
  return false;
}

/**
 * Check if a user has the given action on a resource within the provided scope.
 *
 * - Admin users always return true.
 * - Write permissions imply read.
 * - Scope checks: a permission with a scope_country_id must match the provided
 *   countryId (or have null to be global).  Similarly, scope_school_id must
 *   match the provided schoolId when non-null.  A permission scoped to a
 *   specific school implicitly covers its country (both IDs must match).
 * - Resource matching supports wildcards on the user's permission (see matchResource).
 *
 * @param {Object} user The authenticated user object
 * @param {string} resource The resource key to check (e.g. "page.gelirler")
 * @param {string} action The required action ("read" or "write")
 * @param {Object} opts Optional scope: { countryId: number|null, schoolId: number|null }
 * @returns {boolean} True if the user has the required permission
 */
function can(user, resource, action, opts = {}) {
  if (!user || typeof user !== 'object') return false;
  const role = String(user.role || '');
  // Only admin users bypass permission checks.  Managers and accountants
  // must possess explicit permissions on the requested resource.  See
  // backend middleware for corresponding enforcement.
  if (role === 'admin') {
    return true;
  }
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  const { countryId = null, schoolId = null } = opts;
  for (const p of perms) {
    const permResource = p.resource;
    const permAction = p.action;
    const permCountry = p.scope_country_id != null ? Number(p.scope_country_id) : null;
    const permSchool = p.scope_school_id != null ? Number(p.scope_school_id) : null;
    // Action must match: write implies read
    if (String(action) === 'read') {
      if (permAction !== 'read' && permAction !== 'write') continue;
    } else if (String(action) === 'write') {
      if (permAction !== 'write') continue;
    } else {
      continue;
    }
    // Resource match
    if (!matchResource(resource, permResource)) continue;
    // Scope checks: permission may be global (null) or match provided context
    if (permCountry != null && countryId != null && Number(permCountry) !== Number(countryId)) {
      continue;
    }
    if (permSchool != null && schoolId != null && Number(permSchool) !== Number(schoolId)) {
      continue;
    }
    // If permSchool is non-null but provided schoolId is null, do not match
    if (permSchool != null && schoolId == null) continue;
    // If permCountry is non-null but provided countryId is null, do not match
    if (permCountry != null && countryId == null) continue;
    return true;
  }
  return false;
}

/**
 * Determine if the user has write access to at least one of the provided
 * resources.  Utilizes the `can()` helper internally.  Useful when a page
 * allows editing if the user can write to any relevant section.
 *
 * @param {Object} user
 * @param {string[]} resources A list of resource keys to check
 * @param {Object} opts Optional scope: { countryId, schoolId }
 * @returns {boolean}
 */
function canWriteAny(user, resources = [], opts = {}) {
  if (!Array.isArray(resources)) return false;
  return resources.some((r) => can(user, r, 'write', opts));
}

export { matchResource, can, canWriteAny };