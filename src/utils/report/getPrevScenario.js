/**
 * backend/src/utils/report/getPrevScenario.js
 *
 * Loads the previous academic year scenario (same school) + its inputs_json/results_json.
 *
 * Export async function:
 *   getPrevScenario({ pool, schoolId, academicYear })
 *
 * Return:
 *   { scenarioRow, inputsJson, resultsJson } | null
 */

function computePrevAcademicYear(academicYear) {
  const raw = String(academicYear || "").trim();

  // Formats: "YYYY-YYYY", "YYYY/YYYY", or "YYYY-YY"
  const range = raw.match(/^(\d{4})\s*([\-\/])\s*(\d{2,4})$/);
  if (range) {
    const start = Number(range[1]);
    const sep = range[2];
    const endRaw = range[3];
    const prevStart = Number.isFinite(start) ? start - 1 : NaN;
    if (!Number.isFinite(prevStart) || prevStart <= 0) return null;
    if (endRaw.length === 2) {
      const prevEndShort = String((prevStart + 1) % 100).padStart(2, "0");
      return `${prevStart}${sep}${prevEndShort}`;
    }
    const end = Number(endRaw);
    if (!Number.isFinite(end)) return null;
    const prevEnd = end - 1;
    if (prevEnd <= 0) return null;
    return `${prevStart}${sep}${prevEnd}`;
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

function extractAcademicStartYear(value) {
  const match = String(value || "").match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
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

  let scenarioRow = Array.isArray(scenarioRows) ? scenarioRows[0] : null;
  if (!scenarioRow) {
    const currentStart = extractAcademicStartYear(academicYear);
    if (!currentStart) return null;
    const [allRows] = await pool.query(
      "SELECT id, academic_year, input_currency, local_currency_code, fx_usd_to_local, program_type FROM school_scenarios WHERE school_id=?",
      [sid]
    );
    const candidates = Array.isArray(allRows)
      ? allRows
          .map((row) => ({
            row,
            startYear: extractAcademicStartYear(row?.academic_year),
          }))
          .filter((item) => Number.isFinite(item.startYear) && item.startYear < currentStart)
          .sort((a, b) => b.startYear - a.startYear)
      : [];
    scenarioRow = candidates[0]?.row || null;
    if (!scenarioRow) return null;
  }

  const [inputRows] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=? LIMIT 1",
    [scenarioRow.id]
  );

  const inputsJson = Array.isArray(inputRows) ? inputRows[0]?.inputs_json ?? null : null;

  const [resultRows] = await pool.query(
    "SELECT results_json FROM scenario_results WHERE scenario_id=? LIMIT 1",
    [scenarioRow.id]
  );
  const resultsJson = Array.isArray(resultRows) ? resultRows[0]?.results_json ?? null : null;

  return {
    scenarioRow,
    inputsJson,
    resultsJson,
  };
}

module.exports = {
  getPrevScenario,
};
