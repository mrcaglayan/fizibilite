import {
  DEFAULT_PROGRESS_CONFIG,
  buildProgressCatalog,
  isNonEmptyString,
  safeGet,
  toNum,
} from "./progressCatalog";

function isFilled(value, type) {
  if (type === "string") return isNonEmptyString(value);
  if (type === "boolean") return value === true;
  const n = toNum(value);
  return n > 0;
}

function normalizeConfig(config) {
  const defaults = DEFAULT_PROGRESS_CONFIG();
  const input = config && typeof config === "object" ? config : {};
  const sectionsInput = input.sections && typeof input.sections === "object" ? input.sections : {};
  const out = { version: defaults.version, sections: {} };

  Object.keys(defaults.sections).forEach((id) => {
    const base = defaults.sections[id] || {};
    const incoming = sectionsInput[id] && typeof sectionsInput[id] === "object" ? sectionsInput[id] : {};
    out.sections[id] = {
      enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : base.enabled !== false,
      mode: typeof incoming.mode === "string" && incoming.mode ? incoming.mode : base.mode,
      min: incoming.min != null ? Number(incoming.min) : base.min,
      selectedFields:
        incoming.selectedFields && typeof incoming.selectedFields === "object" ? incoming.selectedFields : {},
    };
  });

  return out;
}

export function computeScenarioProgress({ inputs, norm, config } = {}) {
  const catalog = buildProgressCatalog({ inputs, norm });
  const normalizedConfig = normalizeConfig(config);

  const sectionsById = new Map(catalog.sections.map((s) => [s.id, s]));
  const sectionResults = new Map();
  let totalUnits = 0;
  let doneUnits = 0;

  catalog.sections.forEach((section) => {
    const cfg = normalizedConfig.sections[section.id] || {};
    if (cfg.enabled === false) {
      sectionResults.set(section.id, { enabled: false });
      return;
    }

    const requiresKademe = section.requiresKademe === true;
    const hasKademeSelection = catalog.context?.hasKademeSelection;
    if (requiresKademe && !hasKademeSelection) {
      sectionResults.set(section.id, {
        enabled: true,
        done: false,
        doneUnits: 0,
        totalUnits: 1,
        missingReasons: ["Kademeler secilmedi"],
      });
      totalUnits += 1;
      return;
    }

    const fieldIds = Array.isArray(section.fields) ? section.fields : [];
    const selectedIds = fieldIds.filter((id) => cfg.selectedFields?.[id] !== false);
    const applicable = selectedIds
      .map((id) => catalog.fieldsById[id])
      .filter(Boolean)
      .filter((field) => {
        if (typeof field.appliesIf !== "function") return true;
        try {
          return field.appliesIf(inputs, norm) !== false;
        } catch (_) {
          return true;
        }
      });

    const filled = [];
    const missing = [];

    applicable.forEach((field) => {
      let value = null;
      try {
        value = field.getValue ? field.getValue(inputs, norm) : null;
      } catch (_) {
        value = null;
      }
      const ok = isFilled(value, field.type);
      if (ok) filled.push(field);
      else missing.push(field);
    });

    const filledCount = filled.length;
    const mode = String(cfg.mode || section.modeDefault || "ALL").toUpperCase();
    const minRequired = Number.isFinite(Number(cfg.min)) ? Number(cfg.min) : section.minDefault;

    if (mode === "MIN") {
      const min = Math.max(1, Number.isFinite(minRequired) ? minRequired : 1);
      const done = filledCount >= min;
      const doneCount = Math.min(filledCount, min);
      sectionResults.set(section.id, {
        enabled: true,
        done,
        doneUnits: doneCount,
        totalUnits: min,
        missingReasons: done ? [] : [`En az ${min} alan`],
      });
      totalUnits += min;
      doneUnits += doneCount;
      return;
    }

    const total = applicable.length;
    if (total === 0) {
      if (section.allowEmpty === false) {
        sectionResults.set(section.id, {
          enabled: true,
          done: false,
          doneUnits: 0,
          totalUnits: 1,
          missingReasons: [section.label || "Eksik"],
        });
        totalUnits += 1;
      } else {
        sectionResults.set(section.id, {
          enabled: true,
          done: true,
          doneUnits: 0,
          totalUnits: 0,
          missingReasons: [],
        });
      }
      return;
    }

    const done = filledCount === total;
    const missingReasons = done
      ? []
      : missing.map((field) => field.label).filter(Boolean);

    sectionResults.set(section.id, {
      enabled: true,
      done,
      doneUnits: filledCount,
      totalUnits: total,
      missingReasons,
    });
    totalUnits += total;
    doneUnits += filledCount;
  });

  const tabs = catalog.tabs.map((tab) => {
    const sections = tab.sectionIds || [];
    const enabledSections = sections
      .map((id) => ({ id, result: sectionResults.get(id), def: sectionsById.get(id) }))
      .filter((s) => s.result && s.result.enabled !== false);

    let tabTotal = 0;
    let tabDone = 0;
    const missingLines = [];
    let allDone = true;

    enabledSections.forEach((s) => {
      const res = s.result || {};
      if (!res.done) allDone = false;
      const t = Number(res.totalUnits || 0);
      const d = Number(res.doneUnits || 0);
      if (t > 0) {
        tabTotal += t;
        tabDone += d;
      }
      if (Array.isArray(res.missingReasons) && res.missingReasons.length) {
        missingLines.push(...res.missingReasons);
      }
    });

    const pct = tabTotal ? Math.round((tabDone / tabTotal) * 100) : 0;
    const missingPreview = missingLines.length ? missingLines.join(" / ") : "";

    return {
      key: tab.key,
      label: tab.label,
      pct,
      done: allDone,
      missingPreview,
      missingLines,
    };
  });

  const pct = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0;
  const missingDetailsLines = tabs
    .filter((t) => !t.done)
    .map((t) => {
      const reasons = t.missingPreview || "Eksik alanlar";
      return `${t.label}: ${reasons}`;
    });

  const completedCount = tabs.filter((t) => t.done).length;
  const totalCount = tabs.length;

  return {
    pct,
    completedCount,
    totalCount,
    tabs,
    missingDetailsLines,
  };
}

export { safeGet, toNum, isNonEmptyString };
