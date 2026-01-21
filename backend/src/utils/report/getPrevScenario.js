/**
 * backend/src/utils/report/getPrevScenario.js
 *
 * Loads the previous academic year scenario (same school) + its inputs_json.
 *
 * Export async function:
 *   getPrevScenario({ pool, schoolId, academicYear })
 *
 * Return:
 *   { scenarioRow, inputsJson } | null
 */

function computePrevAcademicYear(academicYear) {
  const raw = String(academicYear || "").trim();

  // Preferred format: "YYYY-YYYY"
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const prevStart = start - 1;
      const prevEnd = end - 1;
      if (prevStart > 0 && prevEnd > 0) return `${prevStart}-${prevEnd}`;
    }
    return null;
  }

  // Fallback: "YYYY" => treat as start year and return "(YYYY-1)-YYYY"
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const start = Number(single[1]);
    const prevStart = start - 1;
    if (Number.isFinite(prevStart) && prevStart > 0) return `${prevStart}-${start}`;
    return null;
  }

  return null;
}

async function getPrevScenario({ pool, schoolId, academicYear }) {
  if (!pool) throw new Error("getPrevScenario requires pool");
  const sid = Number(schoolId);
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("getPrevScenario invalid schoolId");

  const prevAcademicYear = computePrevAcademicYear(academicYear);
  if (!prevAcademicYear) return null;

  const [scenarioRows] = await pool.query(
    "SELECT * FROM school_scenarios WHERE school_id=? AND academic_year=? LIMIT 1",
    [sid, prevAcademicYear]
  );

  const scenarioRow = Array.isArray(scenarioRows) ? scenarioRows[0] : null;
  if (!scenarioRow) return null;

  const [inputRows] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=? LIMIT 1",
    [scenarioRow.id]
  );

  const inputsJson = Array.isArray(inputRows) ? inputRows[0]?.inputs_json ?? null : null;

  return {
    scenarioRow,
    inputsJson,
  };
}

module.exports = {
  getPrevScenario,
};
