const KADEME_BASE_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"];

export function isHeadquarterScenario(inputs) {
  const kademeler = inputs?.temelBilgiler?.kademeler;
  if (!kademeler || typeof kademeler !== "object") return false;
  return KADEME_BASE_KEYS.every((key) => kademeler?.[key]?.enabled === false);
}
