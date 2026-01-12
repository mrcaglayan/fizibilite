const { DEFAULT_PROGRESS_CONFIG } = require("./scenarioProgress");

function parseJsonValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}

async function getProgressConfig(pool, countryId) {
  const id = Number(countryId);
  if (!Number.isFinite(id)) return DEFAULT_PROGRESS_CONFIG();

  const [[row]] = await pool.query(
    "SELECT config_json FROM progress_requirements WHERE country_id=:country_id",
    { country_id: id }
  );
  if (!row) return DEFAULT_PROGRESS_CONFIG();

  const parsed = parseJsonValue(row.config_json);
  if (!parsed || typeof parsed !== "object") return DEFAULT_PROGRESS_CONFIG();
  if (!parsed.sections || typeof parsed.sections !== "object") return DEFAULT_PROGRESS_CONFIG();
  return parsed;
}

module.exports = { getProgressConfig, parseJsonValue };
