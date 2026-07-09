const PROGRAM_TYPES = {
  LOCAL: "local",
  INTERNATIONAL: "international",
};

const ALLOWED_PROGRAM_TYPES = new Set(Object.values(PROGRAM_TYPES));

function normalizeProgramType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (ALLOWED_PROGRAM_TYPES.has(raw)) return raw;
  return PROGRAM_TYPES.LOCAL;
}

function getProgramType(inputs = {}, scenario = null) {
  const programFromInputs =
    inputs?.temelBilgiler?.programType ?? inputs?.programType ?? inputs?.program_type;
  if (programFromInputs) {
    return normalizeProgramType(programFromInputs);
  }
  const programFromScenario = scenario?.program_type || scenario?.programType;
  if (programFromScenario) return normalizeProgramType(programFromScenario);
  return PROGRAM_TYPES.LOCAL;
}

function isKademeKeyVisible(key, programType = PROGRAM_TYPES.LOCAL) {
  const type = normalizeProgramType(programType);
  if (!key) return true;
  if (key === "okulOncesi") return true;
  if (key.endsWith("Yerel")) return type === PROGRAM_TYPES.LOCAL;
  if (key.endsWith("Int")) return type === PROGRAM_TYPES.INTERNATIONAL;
  return true;
}

function mapBaseKademeToVariant(baseKademe, programType = PROGRAM_TYPES.LOCAL) {
  const type = normalizeProgramType(programType);
  if (baseKademe === "okulOncesi") return "okulOncesi";
  const suffix = type === PROGRAM_TYPES.INTERNATIONAL ? "Int" : "Yerel";
  return `${baseKademe}${suffix}`;
}

function getVariantKeysForProgramType(programType = PROGRAM_TYPES.LOCAL) {
  const type = normalizeProgramType(programType);
  return new Set([
    "okulOncesi",
    `ilkokul${type === PROGRAM_TYPES.INTERNATIONAL ? "Int" : "Yerel"}`,
    `ortaokul${type === PROGRAM_TYPES.INTERNATIONAL ? "Int" : "Yerel"}`,
    `lise${type === PROGRAM_TYPES.INTERNATIONAL ? "Int" : "Yerel"}`,
  ]);
}

module.exports = {
  PROGRAM_TYPES,
  normalizeProgramType,
  getProgramType,
  isKademeKeyVisible,
  mapBaseKademeToVariant,
  getVariantKeysForProgramType,
};
