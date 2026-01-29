// backend/src/utils/scenarioProfile.js

const KADEME_BASE_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"];

function safeParseInputs(inputsObj) {
  if (!inputsObj) return {};
  if (typeof inputsObj === "object") return inputsObj;
  if (typeof inputsObj === "string") {
    try {
      const parsed = JSON.parse(inputsObj);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function isHeadquarterScenarioFromInputs(inputsObj) {
  const inputs = safeParseInputs(inputsObj);
  const kademeler = inputs?.temelBilgiler?.kademeler;
  if (!kademeler || typeof kademeler !== "object") return false;
  return KADEME_BASE_KEYS.every((key) => kademeler?.[key]?.enabled === false);
}

module.exports = { isHeadquarterScenarioFromInputs };
