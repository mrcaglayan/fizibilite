const PREFIX = "fizizbilite";

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

export function keySelectedScenarioId(schoolId) {
  return `${PREFIX}:school:${schoolId}:ui:school.selectedScenarioId`;
}

export function readSelectedScenarioId(schoolId) {
  return safeRead(keySelectedScenarioId(schoolId), null);
}

export function writeSelectedScenarioId(schoolId, scenarioId) {
  safeWrite(keySelectedScenarioId(schoolId), scenarioId);
}

export function keyLastVisitedPath(schoolId, scenarioId) {
  return `${PREFIX}:school:${schoolId}:scenario:${scenarioId}:ui:school.lastVisitedPath`;
}

export function readLastVisitedPath(schoolId, scenarioId) {
  return safeRead(keyLastVisitedPath(schoolId, scenarioId), "");
}

export function writeLastVisitedPath(schoolId, scenarioId, subPath) {
  safeWrite(keyLastVisitedPath(schoolId, scenarioId), subPath);
}
