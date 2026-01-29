// backend/src/utils/scenarioWorkflow.js

/**
 * Helper functions to compute and update the workflow status of a school scenario
 * based on the states of its required work items.  A scenario progresses
 * through the following statuses:
 *   - revision_requested: if any required item has state 'needs_revision'
 *   - approved: if and only if all required items exist and are 'approved'
 *   - in_review: when at least one required item has been submitted or is in
 *     progress but not all are approved.  When none of the required items
 *     exist (i.e. the scenario has not been worked on), the scenario may
 *     remain in the default 'draft' state; callers may choose to treat
 *     this as 'in_review' for simplicity.
 *
 * The BASE_REQUIRED_WORK_IDS constant defines the stable identifiers for the
 * modules that must be completed in order for a scenario to be considered
 * ready.  The order and names here must remain in sync with the frontend
 * and any hard-coded strings elsewhere in the application.  See the
 * README or workflow specification for further details.
 */

const BASE_REQUIRED_WORK_IDS = [
  'temel_bilgiler',
  'kapasite',
  'norm.ders_dagilimi',
  'ik.local_staff',
  'gelirler.unit_fee',
  'giderler.isletme',
];

const { isHeadquarterScenarioFromInputs } = require("./scenarioProfile");

function safeParseInputs(inputsRaw) {
  if (!inputsRaw) return {};
  if (typeof inputsRaw === "object") return inputsRaw;
  if (typeof inputsRaw === "string") {
    try {
      const parsed = JSON.parse(inputsRaw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function getRequiredWorkIdsForInputs(inputsObj) {
  const inputs = safeParseInputs(inputsObj);
  if (isHeadquarterScenarioFromInputs(inputs)) {
    return ['ik.local_staff', 'gelirler.unit_fee', 'giderler.isletme'];
  }
  return BASE_REQUIRED_WORK_IDS.slice();
}

async function getRequiredWorkIdsForScenario(pool, scenarioId) {
  const [[row]] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
    { id: scenarioId }
  );
  const inputs = safeParseInputs(row?.inputs_json);
  return getRequiredWorkIdsForInputs(inputs);
}

/**
 * Compute the desired workflow status for the specified scenario.  The
 * function fetches all work item states for the scenario, filters to
 * required items, and determines the appropriate status.  It will then
 * update the `school_scenarios.status` column if the value differs from
 * the computed status.  Callers should pass a mysql2 promise pool.
 *
 * @param {object} pool A mysql2 promise pool
 * @param {number} scenarioId The scenario identifier
 * @returns {Promise<string|null>} The newly applied status, or null if unchanged
 */
async function computeScenarioWorkflowStatus(pool, scenarioId) {
  const REQUIRED = await getRequiredWorkIdsForScenario(pool, scenarioId);
  // Load all work items for this scenario
  const [rows] = await pool.query(
    `SELECT work_id, state FROM scenario_work_items WHERE scenario_id=:sid`,
    { sid: scenarioId }
  );
  // Map work_id -> state for required work ids
  const stateMap = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const wid = String(row.work_id);
      if (REQUIRED.includes(wid)) {
        stateMap.set(wid, String(row.state || ''));
      }
    }
  }
  // Determine the new status
  let newStatus = 'in_review';
  // If none of the required items have been started, leave as draft/in_review
  if (stateMap.size === 0) {
    newStatus = 'draft';
  }
  // If any required item is in needs_revision, scenario is revision_requested
  for (const state of stateMap.values()) {
    if (state === 'needs_revision') {
      newStatus = 'revision_requested';
      break;
    }
  }
  // If none needed revision and all required items are approved
  if (newStatus !== 'revision_requested') {
    // Count approved states
    let approvedCount = 0;
    for (const wid of REQUIRED) {
      const s = stateMap.get(wid);
      if (s === 'approved') approvedCount++;
    }
    if (approvedCount === REQUIRED.length) {
      newStatus = 'approved';
    } else {
      // At least one item exists: remain in_review
      newStatus = stateMap.size > 0 ? 'in_review' : 'draft';
    }
  }
  // Fetch current status
  const [[scenario]] = await pool.query(
    `SELECT status FROM school_scenarios WHERE id=:sid`,
    { sid: scenarioId }
  );
  const currentStatus = scenario ? String(scenario.status || '') : '';
  if (currentStatus !== newStatus) {
    // Update scenario status
    await pool.query(
      `UPDATE school_scenarios SET status=:status WHERE id=:sid`,
      { status: newStatus, sid: scenarioId }
    );
    return newStatus;
  }
  return null;
}

module.exports = {
  BASE_REQUIRED_WORK_IDS,
  getRequiredWorkIdsForInputs,
  getRequiredWorkIdsForScenario,
  computeScenarioWorkflowStatus,
};
