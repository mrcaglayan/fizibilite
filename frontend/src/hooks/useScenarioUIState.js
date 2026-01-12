import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Per school + per scenario persistence.
// We scope by current URL (pathname + search). In your app, this URL already contains
// schoolId and scenarioId (either in params or querystring), so each school/scenario
// gets its own remembered UI state.

const DEFAULT_PREFIX = "fizizbilite";

function safeRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function useScenarioScopeKey(prefix = DEFAULT_PREFIX, scopeOverride) {
  const loc = useLocation();
  return useMemo(() => {
    const override = typeof scopeOverride === "string" ? scopeOverride.trim() : "";
    const scope = override || (loc.pathname + (loc.search || ""));
    return prefix + ":" + scope;
  }, [prefix, scopeOverride, loc.pathname, loc.search]);
}

/**
 * Generic persisted state hook (localStorage), scoped by current scenario URL.
 *
 * NOTE: We intentionally avoid writing to a *new* scope key until we've loaded that
 * key's stored value. This prevents "old state" from being written into a newly
 * navigated scenario.
 */
export function useScenarioUiState(name, defaultValue, { prefix = DEFAULT_PREFIX, scope } = {}) {
  const scopeKey = useScenarioScopeKey(prefix, scope);
  const storageKey = useMemo(() => `${scopeKey}:ui:${name}`, [scopeKey, name]);

  const loadedKeyRef = useRef(null);

  const [state, setState] = useState(() => safeRead(storageKey, defaultValue));

  // Load when the scope (school/scenario) changes
  useEffect(() => {
    loadedKeyRef.current = storageKey;
    setState(safeRead(storageKey, defaultValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist changes (only after we loaded for this key)
  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    safeWrite(storageKey, state);
  }, [storageKey, state]);

  return [state, setState, storageKey];
}

export function useScenarioUiFlag(name, defaultValue = false, opts) {
  const [v, setV] = useScenarioUiState(name, !!defaultValue, opts);
  const setFlag = (next) => setV(!!(typeof next === "function" ? next(v) : next));
  return [!!v, setFlag];
}

export function useScenarioUiString(name, defaultValue = "", opts) {
  const [v, setV] = useScenarioUiState(name, String(defaultValue ?? ""), opts);
  const setStr = (next) => setV(String(typeof next === "function" ? next(v) : next));
  return [String(v ?? ""), setStr];
}

export function useScenarioUiNumber(name, defaultValue = 0, opts) {
  const [v, setV] = useScenarioUiState(name, Number(defaultValue ?? 0), opts);
  const setNum = (next) => {
    const raw = typeof next === "function" ? next(v) : next;
    const n = Number(raw);
    setV(Number.isFinite(n) ? n : 0);
  };
  return [Number(v ?? 0), setNum];
}
