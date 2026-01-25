// Utility functions for reading and writing selected scenario IDs and last
// visited routes per school/scenario. These are persisted in
// `window.localStorage` under specific keys. Storing the last visited
// route enables the UI to remember which page a user was viewing when they
// navigate to the school/scenario selector and to return them there upon
// completing a selection.

/**
 * Read the selected scenario ID for a given school from local storage.
 *
 * @param {number|string} schoolId - The school identifier. If null or
 *   undefined, this returns null.
 * @returns {string|null} The selected scenario ID as a string, or null if
 *   none is stored.
 */
export function readSelectedScenarioId(schoolId) {
  if (schoolId == null) return null;
  try {
    const key = `selectedScenario:${schoolId}`;
    const value = window.localStorage.getItem(key);
    return value != null ? value : null;
  } catch (_) {
    return null;
  }
}

/**
 * Persist the selected scenario ID for a given school in local storage.
 *
 * @param {number|string} schoolId - The school identifier. If null or undefined,
 *   this function does nothing.
 * @param {number|string|null} scenarioId - The scenario identifier to store. If
 *   null, the stored value is removed.
 */
export function writeSelectedScenarioId(schoolId, scenarioId) {
  if (schoolId == null) return;
  try {
    const key = `selectedScenario:${schoolId}`;
    if (scenarioId == null || scenarioId === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(scenarioId));
    }
  } catch (_) {
    // ignore write failures
  }
}

/**
 * Read the last visited route segment for a given school and scenario. The
 * segment corresponds to the part of the path after `/schools/{id}/`. For
 * example, "temel-bilgiler" or "kapasite". If no entry exists, this returns
 * null.
 *
 * @param {number|string} schoolId - The school identifier. Required.
 * @param {number|string} scenarioId - The scenario identifier. Required.
 * @returns {string|null} The last visited route segment, or null.
 */
export function readLastVisitedPath(schoolId, scenarioId) {
  if (schoolId == null) return null;
  // Use a special key for the "none" scenario when scenarioId is null or undefined.
  const scenarioKey = scenarioId != null ? String(scenarioId) : "none";
  try {
    const key = `lastVisited:${schoolId}:${scenarioKey}`;
    const value = window.localStorage.getItem(key);
    return value != null ? value : null;
  } catch (_) {
    return null;
  }
}

/**
 * Persist the last visited route segment for a given school and scenario.
 *
 * @param {number|string} schoolId - The school identifier. Required.
 * @param {number|string} scenarioId - The scenario identifier. Required.
 * @param {string} segment - The route segment (e.g. "temel-bilgiler").
 */
export function writeLastVisitedPath(schoolId, scenarioId, segment) {
  if (schoolId == null || !segment) return;
  const scenarioKey = scenarioId != null ? String(scenarioId) : "none";
  try {
    const key = `lastVisited:${schoolId}:${scenarioKey}`;
    window.localStorage.setItem(key, String(segment));
  } catch (_) {
    // ignore write failures
  }
}

/**
 * Store the globally last visited route segment. This value is not scoped
 * to any school or scenario and is used when switching between schools
 * and scenarios so that the same sidebar page is shown.
 *
 * @param {string} segment - The route segment (e.g., "gelirler").
 */
export function writeGlobalLastRouteSegment(segment) {
  if (!segment) return;
  try {
    window.localStorage.setItem("globalLastRouteSegment", segment);
  } catch (_) {
    // ignore errors
  }
}

/**
 * Read the globally last visited route segment. Returns null if none exists.
 */
export function readGlobalLastRouteSegment() {
  try {
    const seg = window.localStorage.getItem("globalLastRouteSegment");
    return seg != null ? seg : null;
  } catch (_) {
    return null;
  }
}

/**
 * Persist the last active school ID. This allows the UI to retain knowledge
 * of which school was last being viewed, even when navigating to unrelated
 * pages (e.g. profile or admin). When navigating away from a school page
 * and returning later, this identifier can be used to restore context.
 *
 * @param {string|number} schoolId - The school identifier to store.
 */
export function writeLastActiveSchoolId(schoolId) {
  if (schoolId == null) return;
  try {
    window.localStorage.setItem("lastActiveSchoolId", String(schoolId));
  } catch (_) {
    // ignore errors
  }
}

/**
 * Retrieve the last active school ID. Returns null if not set.
 */
export function readLastActiveSchoolId() {
  try {
    const val = window.localStorage.getItem("lastActiveSchoolId");
    return val != null ? val : null;
  } catch (_) {
    return null;
  }
}