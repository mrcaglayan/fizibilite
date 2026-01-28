const { computeScenarioProgress, PROGRESS_ENGINE_VERSION } = require("./scenarioProgress");
const { getProgressConfig } = require("./progressConfig");
const { getNormConfigRowForScenario, normalizeNormConfigRow } = require("./normConfig");
const { getJson, setJson, del } = require("./redisClient");

function parseInputsJson(inputsRaw) {
  if (inputsRaw == null) return {};
  if (typeof inputsRaw === "string") {
    try {
      return JSON.parse(inputsRaw);
    } catch (err) {
      const error = new Error("Invalid inputs JSON");
      error.status = 400;
      throw error;
    }
  }
  if (typeof inputsRaw === "object") return inputsRaw;
  return {};
}

function toTimestampMs(value) {
  if (!value) return 0;
  const dt = new Date(value);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildRedisKey({ schoolId, scenarioId, inputsUpdatedAtMs, normUpdatedAtMs, configUpdatedAtMs }) {
  return `progress:${schoolId}:${scenarioId}:${inputsUpdatedAtMs}:${normUpdatedAtMs}:${configUpdatedAtMs}`;
}

function buildPointerKey({ schoolId, scenarioId }) {
  return `progress_latest_key:${schoolId}:${scenarioId}`;
}

async function getScenarioProgressSnapshot(pool, { schoolId, scenarioId, countryId }) {
  const sid = Number(schoolId);
  const scid = Number(scenarioId);
  if (!Number.isFinite(sid) || !Number.isFinite(scid)) {
    const err = new Error("Invalid school or scenario id");
    err.status = 400;
    throw err;
  }

  const [[scenario]] = await pool.query(
    `SELECT id, school_id, name, academic_year, status,
            input_currency, local_currency_code, fx_usd_to_local, program_type,
            progress_json, progress_calculated_at
     FROM school_scenarios
     WHERE id=:id AND school_id=:school_id`,
    { id: scid, school_id: sid }
  );
  if (!scenario) {
    const err = new Error("Scenario not found");
    err.status = 404;
    throw err;
  }

  const [[inputsRow]] = await pool.query(
    "SELECT updated_at FROM scenario_inputs WHERE scenario_id=:id",
    { id: scid }
  );
  if (!inputsRow) {
    const err = new Error("Inputs not found");
    err.status = 404;
    throw err;
  }

  let normUpdatedAt = null;
  const [[scenarioNorm]] = await pool.query(
    "SELECT updated_at FROM scenario_norm_configs WHERE scenario_id=:id",
    { id: scid }
  );
  if (scenarioNorm?.updated_at) {
    normUpdatedAt = scenarioNorm.updated_at;
  } else {
    const [[schoolNorm]] = await pool.query(
      "SELECT updated_at FROM school_norm_configs WHERE school_id=:id",
      { id: sid }
    );
    normUpdatedAt = schoolNorm?.updated_at ?? null;
  }

  const [[progressReq]] = await pool.query(
    "SELECT updated_at FROM progress_requirements WHERE country_id=:country_id",
    { country_id: countryId }
  );
  const configUpdatedAt = progressReq?.updated_at ?? null;

  const inputsUpdatedAt = inputsRow.updated_at;
  const calculatedAt = scenario.progress_calculated_at;

  const inputsUpdatedAtMs = toTimestampMs(inputsUpdatedAt);
  const normUpdatedAtMs = toTimestampMs(normUpdatedAt);
  const configUpdatedAtMs = toTimestampMs(configUpdatedAt);
  const calculatedAtMs = toTimestampMs(calculatedAt);

  const depsMax = Math.max(inputsUpdatedAtMs, normUpdatedAtMs, configUpdatedAtMs);
  let isStale = !calculatedAtMs || calculatedAtMs < depsMax;

  // If the progress engine version changed, force recomputation even if timestamps are unchanged.
  // This prevents old progress_json/progress_pct from sticking around after a deploy.
  let parsedDbProgress = null;
  if (!isStale && scenario.progress_json != null) {
    if (typeof scenario.progress_json === "string") {
      try {
        parsedDbProgress = JSON.parse(scenario.progress_json);
      } catch (_) {
        parsedDbProgress = null;
      }
    } else if (typeof scenario.progress_json === "object") {
      parsedDbProgress = scenario.progress_json;
    }

    const cachedVersion = Number(parsedDbProgress?.engineVersion ?? 0);
    if (!cachedVersion || cachedVersion !== PROGRESS_ENGINE_VERSION) {
      isStale = true;
      parsedDbProgress = null;
    }
  }

  const redisKey = buildRedisKey({
    schoolId: sid,
    scenarioId: scid,
    inputsUpdatedAtMs,
    normUpdatedAtMs,
    configUpdatedAtMs,
  });

  if (!isStale && scenario.progress_json != null) {
    const cachedRedis = await getJson(redisKey);
    const redisProgress = cachedRedis?.progress;
    const redisVersion = Number(redisProgress?.engineVersion ?? 0);
    if (redisProgress && redisVersion === PROGRESS_ENGINE_VERSION) {
      return {
        progress: redisProgress,
        cached: true,
        source: "redis",
        calculatedAt,
        inputsUpdatedAt,
        normUpdatedAt,
        configUpdatedAt,
      };
    }

    const progress = parsedDbProgress;
    if (progress) {
      return {
        progress,
        cached: true,
        source: "db",
        calculatedAt,
        inputsUpdatedAt,
        normUpdatedAt,
        configUpdatedAt,
      };
    }
  }

  const [[inputsRowFull]] = await pool.query(
    "SELECT inputs_json FROM scenario_inputs WHERE scenario_id=:id",
    { id: scid }
  );
  if (!inputsRowFull) {
    const err = new Error("Inputs not found");
    err.status = 404;
    throw err;
  }

  const normRow = await getNormConfigRowForScenario(pool, sid, scid);
  if (!normRow) {
    const err = new Error("Norm config missing for school");
    err.status = 400;
    throw err;
  }

  const inputs = parseInputsJson(inputsRowFull.inputs_json);
  const normConfig = normalizeNormConfigRow(normRow);
  const progressConfig = await getProgressConfig(pool, countryId);

  const progress = computeScenarioProgress({ inputs, norm: normConfig, config: progressConfig, scenario });

  await pool.query(
    `UPDATE school_scenarios
     SET progress_pct=:progress_pct,
         progress_json=:progress_json,
         progress_calculated_at=CURRENT_TIMESTAMP
     WHERE id=:id AND school_id=:school_id`,
    {
      id: scid,
      school_id: sid,
      progress_pct: progress ? progress.pct : null,
      progress_json: progress ? JSON.stringify(progress) : null,
    }
  );

  const [[updated]] = await pool.query(
    "SELECT progress_calculated_at FROM school_scenarios WHERE id=:id",
    { id: scid }
  );
  const nextCalculatedAt = updated?.progress_calculated_at || new Date();

  await setJson(redisKey, { progress }, { ttlSeconds: 600 });
  await setJson(buildPointerKey({ schoolId: sid, scenarioId: scid }), redisKey, { ttlSeconds: 600 });

  return {
    progress,
    cached: false,
    calculatedAt: nextCalculatedAt,
    inputsUpdatedAt,
    normUpdatedAt,
    configUpdatedAt,
  };
}

async function invalidateScenarioProgress(pool, scenarioId) {
  const scid = Number(scenarioId);
  if (!Number.isFinite(scid)) return;

  const [[row]] = await pool.query("SELECT school_id FROM school_scenarios WHERE id=:id", { id: scid });
  const schoolId = row?.school_id;

  await pool.query(
    "UPDATE school_scenarios SET progress_pct=NULL, progress_json=NULL, progress_calculated_at=NULL WHERE id=:id",
    { id: scid }
  );

  if (schoolId != null) {
    const pointerKey = buildPointerKey({ schoolId, scenarioId: scid });
    const latestKey = await getJson(pointerKey);
    if (latestKey) {
      await del(latestKey);
    }
    await del(pointerKey);
  }
}

module.exports = {
  getScenarioProgressSnapshot,
  invalidateScenarioProgress,
};
