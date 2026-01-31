import {
  DEFAULT_PROGRESS_CONFIG,
  buildProgressCatalog,
  isNonEmptyString,
  safeGet,
  toNum,
} from "./progressCatalog";
import { isHeadquarterScenario } from "./scenarioProfile";

function isFilled(value, type) {
  if (type === "string") return isNonEmptyString(value);
  // For boolean fields we accept both true/false as "filled".
  // Only null/undefined should be treated as missing.
  if (type === "boolean") return typeof value === "boolean";
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

export function computeScenarioProgress({ inputs, norm, config, scenario } = {}) {
  const catalog = buildProgressCatalog({ inputs, norm, scenario });
  const normalizedConfig = normalizeConfig(config);
  const isHQ = isHeadquarterScenario(inputs);
  const HQ_INCLUDED_TABS = new Set(["ik", "gelirler", "giderler"]);

  const sectionsById = new Map(catalog.sections.map((s) => [s.id, s]));
  const sectionResults = new Map();
  let totalUnits = 0;
  let doneUnits = 0;
  let overallTotalUnits = 0;
  let overallDoneUnits = 0;

  catalog.sections.forEach((section) => {
    const cfg = normalizedConfig.sections[section.id] || {};
    if (cfg.enabled === false) {
      sectionResults.set(section.id, { enabled: false });
      return;
    }
    const includeInOverall = !isHQ || HQ_INCLUDED_TABS.has(section.tabKey);
    const addUnits = (total, done) => {
      totalUnits += total;
      doneUnits += done;
      if (includeInOverall) {
        overallTotalUnits += total;
        overallDoneUnits += done;
      }
    };

    const requiresKademe = section.requiresKademe === true;
    const hasKademeSelection = catalog.context?.hasKademeSelection;
    const noKademeMode = catalog.context?.noKademeMode === true;
    const kademeSelectedButEmpty =
      Boolean(hasKademeSelection) &&
      catalog.context?.enabledKademes &&
      catalog.context.enabledKademes.size === 0;
    if (requiresKademe && kademeSelectedButEmpty) {
      sectionResults.set(section.id, {
        enabled: true,
        done: true,
        doneUnits: 0,
        totalUnits: 0,
        missingReasons: [],
      });
      return;
    }
    if (requiresKademe && !hasKademeSelection) {
      sectionResults.set(section.id, {
        enabled: true,
        done: false,
        doneUnits: 0,
        totalUnits: 1,
        missingReasons: ["Kademeler secilmedi"],
      });
      addUnits(1, 0);
      return;
    }
    if (noKademeMode && section.id === "gelirler.unitFee") {
      sectionResults.set(section.id, {
        enabled: true,
        done: true,
        doneUnits: 0,
        totalUnits: 0,
        missingReasons: [],
      });
      return;
    }

    const fieldIds = Array.isArray(section.fields) ? section.fields : [];
    const selectedIds = fieldIds.filter((id) => cfg.selectedFields?.[id] !== false);
    if (selectedIds.length === 0) {
      if (section.allowEmpty === false) {
        sectionResults.set(section.id, {
          enabled: true,
          done: false,
          doneUnits: 0,
          totalUnits: 1,
          missingReasons: [section.label || "Eksik"],
        });
        addUnits(1, 0);
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
    const applicable = selectedIds
      .map((id) => catalog.fieldsById[id])
      .filter(Boolean)
      .filter((field) => {
        if (typeof field.appliesIf !== "function") return true;
        try {
          return field.appliesIf(inputs, norm, scenario) !== false;
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
    let mode = String(cfg.mode || section.modeDefault || "ALL").toUpperCase();
    let minRequired = Number.isFinite(Number(cfg.min)) ? Number(cfg.min) : section.minDefault;
    if (isHQ && section.id === "ik.localStaff") {
      mode = "MIN";
      minRequired = 1;
    }

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
      addUnits(min, doneCount);
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
        addUnits(1, 0);
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
    addUnits(total, filledCount);
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

    const pct = tabTotal
      ? Math.round((tabDone / tabTotal) * 100)
      : allDone
        ? 100
        : 0;
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

  const effectiveTotal = isHQ ? overallTotalUnits : totalUnits;
  const effectiveDone = isHQ ? overallDoneUnits : doneUnits;
  const pct = effectiveTotal ? Math.round((effectiveDone / effectiveTotal) * 100) : 100;
  const missingDetailsLines = tabs
    .filter((t) => !t.done)
    .filter((t) => (!isHQ ? true : HQ_INCLUDED_TABS.has(t.key)))
    .map((t) => {
      const reasons = t.missingPreview || "Eksik alanlar";
      return `${t.label}: ${reasons}`;
    });

  const visibleTabs = isHQ ? tabs.filter((t) => HQ_INCLUDED_TABS.has(t.key)) : tabs;
  const completedCount = visibleTabs.filter((t) => t.done).length;
  const totalCount = visibleTabs.length;

  return {
    pct,
    completedCount,
    totalCount,
    tabs,
    missingDetailsLines,
  };
}

export { safeGet, toNum, isNonEmptyString };
