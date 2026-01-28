const DEFAULT_NORM_MAX_HOURS = 24;
const NORM_YEAR_KEYS = ["y1", "y2", "y3"];
const NORM_GRADE_KEYS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function buildEmptyNormCurriculum() {
  const empty = {};
  NORM_GRADE_KEYS.forEach((g) => (empty[g] = {}));
  return empty;
}

function buildEmptyNormYears(maxHours = DEFAULT_NORM_MAX_HOURS) {
  return {
    y1: { teacherWeeklyMaxHours: maxHours, curriculumWeeklyHours: buildEmptyNormCurriculum() },
    y2: { teacherWeeklyMaxHours: maxHours, curriculumWeeklyHours: buildEmptyNormCurriculum() },
    y3: { teacherWeeklyMaxHours: maxHours, curriculumWeeklyHours: buildEmptyNormCurriculum() },
  };
}

function normalizeNormConfigRow(row) {
  const maxHoursRaw = Number(row?.teacher_weekly_max_hours);
  const baseHours = Number.isFinite(maxHoursRaw) && maxHoursRaw > 0 ? maxHoursRaw : DEFAULT_NORM_MAX_HOURS;
  const raw = row?.curriculum_weekly_hours_json;
  const yearSource =
    raw && typeof raw === "object" && raw.years && typeof raw.years === "object"
      ? raw.years
      : raw && typeof raw === "object" && NORM_YEAR_KEYS.some((y) => y in raw)
        ? raw
        : null;

  if (!yearSource) {
    const curriculum = raw && typeof raw === "object" ? raw : {};
    return { teacherWeeklyMaxHours: baseHours, curriculumWeeklyHours: curriculum };
  }

  const years = {};
  for (const y of NORM_YEAR_KEYS) {
    const src = yearSource?.[y] || {};
    const hoursRaw = Number(src?.teacherWeeklyMaxHours ?? baseHours);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : baseHours;
    const curr =
      src?.curriculumWeeklyHours && typeof src.curriculumWeeklyHours === "object"
        ? src.curriculumWeeklyHours
        : src && typeof src === "object"
          ? src
          : {};
    years[y] = { teacherWeeklyMaxHours: hours, curriculumWeeklyHours: curr };
  }

  return {
    years,
    teacherWeeklyMaxHours: years.y1.teacherWeeklyMaxHours,
    curriculumWeeklyHours: years.y1.curriculumWeeklyHours,
  };
}

async function getNormConfigRowForScenario(pool, schoolId, scenarioId) {
  if (!pool) throw new Error("getNormConfigRowForScenario requires pool");
  const sid = Number(schoolId);
  const scid = Number(scenarioId);
  if (!Number.isFinite(sid) || !Number.isFinite(scid)) return null;
  const [[scenarioRow]] = await pool.query(
    "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_at FROM scenario_norm_configs WHERE scenario_id=:id",
    { id: scid }
  );
  if (scenarioRow) return scenarioRow;
  const [[schoolRow]] = await pool.query(
    "SELECT teacher_weekly_max_hours, curriculum_weekly_hours_json, updated_at FROM school_norm_configs WHERE school_id=:id",
    { id: sid }
  );
  return schoolRow || null;
}

module.exports = {
  DEFAULT_NORM_MAX_HOURS,
  NORM_YEAR_KEYS,
  NORM_GRADE_KEYS,
  buildEmptyNormCurriculum,
  buildEmptyNormYears,
  normalizeNormConfigRow,
  getNormConfigRowForScenario,
};
