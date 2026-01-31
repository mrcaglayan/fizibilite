// frontend/src/pages/SchoolPage.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import { api } from "../api";
import Tooltip from "../components/ui/Tooltip";
import { can } from "../utils/permissions";
import { getGradeOptions, normalizeKademeConfig, summarizeGradesByKademe } from "../utils/kademe";
import { computeScenarioProgress } from "../utils/scenarioProgress";
import { useScenarioUiState, useScenarioUiString } from "../hooks/useScenarioUIState";
import { FaCalculator, FaCheckCircle, FaFileExport, FaPaperPlane, FaSave } from "react-icons/fa";
import {
  readLastVisitedPath,
  readSelectedScenarioId,
  writeLastVisitedPath,
  writeSelectedScenarioId,
  writeGlobalLastRouteSegment,
  writeScenarioFlags,
} from "../utils/schoolNavStorage";
import { getProgramType, mapBaseKademeToVariant, normalizeProgramType } from "../utils/programType";
import { isHeadquarterScenario } from "../utils/scenarioProfile";

// Helper: Convert dirty input paths to permission resource keys for modifiedResources.
// It strips a leading 'inputs.' prefix (if present), converts camelCase
// tokens to snake_case, and returns page-level and section-level resources.
// Example: 'inputs.gelirler.unitFee' → ['page.gelirler','section.gelirler.unit_fee'].
/**
 * Convert a dirty input path into a list of permission resources.  The
 * function returns at most two resources: a page‑level resource (always)
 * and, when a known mapping exists, a section‑level resource.  It
 * normalizes camelCase tokens to snake_case and applies custom
 * section mappings to ensure that generated section keys align with the
 * backend permissions catalog.  Unknown sections fall back to page‑level
 * only.
 *
 * For example:
 *   'inputs.gelirler.tuition.rows.0.amount' → ['page.gelirler','section.gelirler.unit_fee']
 *   'inputs.temelBilgiler.performans.degerlendirme' → ['page.temel_bilgiler','section.temel_bilgiler.performans']
 *   'inputs.ik.years.y1' → ['page.ik','section.ik.local_staff']
 *
 * The SECTION_KEY_MAPPING constant below defines mappings from second‑level
 * keys to canonical section names per page.  A wildcard '*' entry may be
 * used to map any key to a default section.  A mapping value of null
 * indicates that no section‑level resource should be generated for that key.
 *
 * @param {string} path Dirty input path (e.g. 'inputs.gelirler.tuition.rows.0.amount')
 * @returns {string[]} List of permission resource keys
 */
function pathToResources(path) {
  const result = [];
  if (!path) return result;
  const tokens = String(path).split('.');
  // Strip a leading 'inputs.' prefix to isolate the module and section keys.
  if (tokens.length > 0 && tokens[0] === 'inputs') {
    tokens.shift();
  }
  if (tokens.length === 0) return result;
  // Special-case: grades inputs are edited inside the Norm page, so map them to Norm permissions.
  const gradeInputPages = new Set(["gradesYears", "gradesCurrent", "grades", "grades_years", "grades_current"]);
  if (gradeInputPages.has(tokens[0])) {
    result.push("section.norm.ders_dagilimi");
    return result;
  }
  // Normalize the module (page) token from camelCase to snake_case.
  const pageRaw = tokens[0];
  let page = pageRaw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const PAGE_ALIASES = {
    grades_years: "grades_plan",
    grades_current: "grades_plan",
    grades: "grades_plan",
  };
  if (Object.prototype.hasOwnProperty.call(PAGE_ALIASES, page)) {
    page = PAGE_ALIASES[page];
  }
  if (!page) return result;
  // If a section token exists, map it to a canonical section resource key.  If
  // mapping yields a non-null value, return only the section-level resource.
  // Otherwise, fall back to the page-level resource.  This avoids sending
  // both the page and section resources for the same change, which would
  // incorrectly require the user to have write access on both resources.
  if (tokens.length >= 2) {
    const sectionRaw = tokens[1];
    const sectionSnake = sectionRaw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const SECTION_KEY_MAPPING = {
      temel_bilgiler: {
        inflation: 'inflation',
        ucret_artis_oranlari: 'inflation',
        okul_ucretleri_hesaplama: 'inflation',
        ik_mevcut: 'ik_mevcut',
        burs_indirim_ogrenci_sayilari: 'burs_ogr',
        burs_ogr: 'burs_ogr',
        rakip_analizi: 'rakip',
        rakip: 'rakip',
        performans: 'performans',
        degerlendirme: 'performans',
        okul_egitim_bilgileri: 'okul_egitim',
        yetkililer: null,
        kademeler: null,
        program_type: null,
      },
      gelirler: {
        '*': 'unit_fee',
      },
      giderler: {
        '*': 'isletme',
      },
      ik: {
        '*': 'local_staff',
      },
      discounts: {
        '*': 'discounts',
      },
      norm: {
        '*': 'ders_dagilimi',
      },
      grades_plan: {
        '*': 'plan',
      },
      kapasite: {
        '*': 'caps',
      },
    };
    const pageMap = SECTION_KEY_MAPPING[page];
    let mapped = null;
    if (pageMap) {
      if (Object.prototype.hasOwnProperty.call(pageMap, sectionSnake)) {
        mapped = pageMap[sectionSnake];
      } else if (Object.prototype.hasOwnProperty.call(pageMap, '*')) {
        mapped = pageMap['*'];
      } else {
        // If no explicit mapping exists, use the normalized section name directly.
        mapped = sectionSnake;
      }
    } else {
      // For pages with no mapping defined, use the normalized section name.
      mapped = sectionSnake;
    }
    if (mapped) {
      // When a section-level mapping exists (mapped !== null), return only
      // the section-level resource.  Do not include the page-level resource
      // because a section write implicitly requires only section permission.
      result.push(`section.${page}.${mapped}`);
      return result;
    }
  }
  // Fall back to the page-level resource if no section mapping applies.
  result.push(`page.${page}`);
  return result;
}

function isScenarioLocked(scenario) {
  const status = String(scenario?.status || "draft");
  const submittedAt = scenario?.submitted_at != null;
  const sentAt = scenario?.sent_at != null;
  return (
    status === "sent_for_approval" ||
    status === "submitted" ||
    (status === "approved" && sentAt) ||
    (status === "in_review" && submittedAt)
  );
}



const INPUT_HEADER_TABS = new Set(["basics", "kapasite", "income", "expenses", "norm", "hr", "detailedReport", "report"]);
const TAB_TO_ROUTE = {
  basics: "temel-bilgiler",
  kapasite: "kapasite",
  norm: "norm",
  hr: "ik",
  income: "gelirler",
  expenses: "giderler",
  detailedReport: "detayli-rapor",
  report: "rapor",
};
const ROUTE_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_ROUTE).map(([key, value]) => [value, key]));
const TAB_TO_WORK_ID = {
  basics: "temel_bilgiler",
  kapasite: "kapasite",
  norm: "norm.ders_dagilimi",
  hr: "ik.local_staff",
  income: "gelirler.unit_fee",
  expenses: "giderler.isletme",
};
const HQ_REQUIRED_WORK_IDS = new Set(["ik.local_staff", "gelirler.unit_fee", "giderler.isletme"]);

function parseAcademicYear(academicYear) {
  const s = String(academicYear || "").trim();
  const range = s.match(/(\d{4})\s*-\s*(\d{4})/);
  if (range) {
    const startYear = Number(range[1]);
    const endYear = Number(range[2]);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return { startYear, endYear };
    }
  }
  const single = s.match(/^(\d{4})$/);
  if (single) {
    const startYear = Number(single[1]);
    if (Number.isFinite(startYear)) return { startYear, endYear: startYear };
  }
  return { startYear: null, endYear: null };
}

function pctValue(tab) {
  const n = Number(tab?.pct);
  return Number.isFinite(n) ? n : 0;
}

function mergeMissingLines(a, b) {
  const out = [];
  const seen = new Set();
  [a, b].forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((line) => {
      const val = String(line || "").trim();
      if (!val || seen.has(val)) return;
      seen.add(val);
      out.push(val);
    });
  });
  return out.slice(0, 15);
}

function findArrayItemIndex(arr, part) {
  if (!Array.isArray(arr)) return -1;
  const byKey = arr.findIndex(
    (item) => item && typeof item === "object" && "key" in item && String(item.key) === part
  );
  if (byKey !== -1) return byKey;
  const byName = arr.findIndex(
    (item) => item && typeof item === "object" && "name" in item && String(item.name) === part
  );
  if (byName !== -1) return byName;
  const byGrade = arr.findIndex(
    (item) => item && typeof item === "object" && "grade" in item && String(item.grade) === part
  );
  if (byGrade !== -1) return byGrade;
  const idx = Number(part);
  if (Number.isInteger(idx) && String(idx) === part && idx >= 0 && idx < arr.length) return idx;
  return -1;
}

function setValueAtPath(obj, parts, value) {
  if (!obj || !Array.isArray(parts) || !parts.length) return false;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cur == null) return false;
    if (Array.isArray(cur)) {
      const idx = findArrayItemIndex(cur, part);
      if (idx < 0) return false;
      if (cur[idx] == null || typeof cur[idx] !== "object") cur[idx] = {};
      cur = cur[idx];
      continue;
    }
    if (typeof cur !== "object") return false;
    if (cur[part] == null || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) {
    const idx = findArrayItemIndex(cur, last);
    if (idx < 0) return false;
    cur[idx] = value;
    return true;
  }
  if (cur == null || typeof cur !== "object") return false;
  cur[last] = value;
  return true;
}

export default function SchoolPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutletContext();
  const schoolId = Number(id);

  const [school, setSchool] = useState(null);
  const [err, setErr] = useState("");

  // user profile (region, country, etc.)
  const [me, setMe] = useState(null);

  useEffect(() => {
    const base = "Feasibility Studio";
    document.title = school?.name ? `${school.name} · ${base}` : `School · ${base}`;
  }, [school?.name]);

  // Selected scenario meta and related state must be defined before
  // they are referenced in refreshWorkItems and submitWorkItem.
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [prevReport, setPrevReport] = useState(null);
  const [prevScenarioMeta, setPrevScenarioMeta] = useState(null);
  // Work items list for the currently selected scenario.  Each entry
  // represents a module (e.g. gelirler.unit_fee) and tracks its
  // workflow state.  When the selected scenario changes the list is
  // reloaded from the server.  Principals and HR users can submit
  // modules for review via submitWorkItem, which will refresh this list.
  const [workItems, setWorkItems] = useState([]);
  const [workItemsLoaded, setWorkItemsLoaded] = useState(false);
  const [requiredWorkIds, setRequiredWorkIds] = useState([]);
  const [scenarioMetaLoaded, setScenarioMetaLoaded] = useState(false);
  const [reviewingWorkItem, setReviewingWorkItem] = useState(false);

  // scenarios
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(() => readSelectedScenarioId(schoolId));
  const [pendingTabAfterSelect, setPendingTabAfterSelect] = useState(null);


  // Refresh the work items for the current scenario.  This helper
  // fetches the work item list from the backend and updates state.
  // It is memoized on schoolId and selectedScenario.id to avoid
  // unnecessary re-renders.  When no scenario is selected, it
  // clears the list.
  const refreshWorkItems = useCallback(async () => {
    const sid = selectedScenario?.id;
    if (!sid || !schoolId) {
      setWorkItems([]);
      setWorkItemsLoaded(false);
      setRequiredWorkIds([]);
      return;
    }
    try {
      const data = await api.listWorkItems(schoolId, sid);
      setWorkItems(Array.isArray(data?.workItems) ? data.workItems : []);
      setRequiredWorkIds(Array.isArray(data?.requiredWorkIds) ? data.requiredWorkIds : []);
      setWorkItemsLoaded(true);
    } catch (_) {
      // ignore errors, keep existing list
      setRequiredWorkIds([]);
      setWorkItemsLoaded(true);
    }
  }, [schoolId, selectedScenario?.id]);

  // Refresh scenario metadata (status/sent_at/checked_at) without touching inputs/report.
  const refreshScenarioMeta = useCallback(async () => {
    if (!schoolId) return;
    setScenarioMetaLoaded(false);
    try {
      const data = await api.listScenarios(schoolId, {
        limit: 50,
        offset: 0,
        fields: "brief",
        order: "created_at:desc",
      });
      const list = Array.isArray(data?.items) ? data.items : [];
      setScenarios(list);
      const scenarioId = selectedScenarioId ?? selectedScenario?.id;
      if (scenarioId != null) {
        const nextScenario = list.find((item) => String(item?.id) === String(scenarioId));
        if (nextScenario) {
          setSelectedScenario((prev) => (prev ? { ...prev, ...nextScenario } : nextScenario));
        }
      }
      setScenarioMetaLoaded(true);
    } catch (_) {
      // ignore errors, keep existing meta
      setScenarioMetaLoaded(false);
    }
  }, [schoolId, selectedScenarioId, selectedScenario?.id]);

  // Submit a work item for review.  Accepts a workId string.  On
  // success the work items are refreshed and a toast is shown.
  const submitWorkItem = useCallback(
    async (workId) => {
      const sid = selectedScenario?.id;
      if (!sid || !schoolId || !workId) return;
      try {
        await api.submitWorkItem(schoolId, sid, workId);
        await refreshWorkItems();
        await refreshScenarioMeta();
        toast.success("Modül gönderildi.");
      } catch (e) {
        toast.error(e.message || "Gönderme başarısız");
      }
    },
    [schoolId, selectedScenario?.id, refreshWorkItems, refreshScenarioMeta]
  );


  // Fetch work items whenever the selected scenario changes.  If there
  // is no scenario selected the list is cleared.  The refreshWorkItems
  // dependency ensures that any changes to schoolId or scenario id are
  // respected.
  useEffect(() => {
    if (!selectedScenario?.id) {
      setWorkItems([]);
      setWorkItemsLoaded(false);
      setScenarioMetaLoaded(false);
      return;
    }
    setWorkItemsLoaded(false);
    setScenarioMetaLoaded(false);
    refreshWorkItems();
  }, [selectedScenario?.id, refreshWorkItems]);

  // removed duplicate declarations for selectedScenario, prevReport,
  // prevScenarioMeta, and workItems. These are now defined earlier
  // before they are used in callbacks.

  // norm
  const [norm, setNorm] = useState(null);
  const [progressConfig, setProgressConfig] = useState(null);

  // inputs
  const [inputs, setInputs] = useState(null);
  const [inputsSaving, setInputsSaving] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState(() => new Set());
  const [baselineInputs, setBaselineInputs] = useState(null);
  const [baselineNorm, setBaselineNorm] = useState(null);
  const clearDirtyPrefix = useCallback((prefix) => {
    setDirtyPaths((prev) => {
      if (!prev.size) return prev;
      let changed = false;
      const next = new Set();
      for (const path of prev) {
        if (path.startsWith(prefix)) {
          changed = true;
          continue;
        }
        next.add(path);
      }
      return changed ? next : prev;
    });
  }, []);
  const hasDirtyPrefix = useCallback(
    (prefix) => {
      for (const path of dirtyPaths) {
        if (path === prefix || path.startsWith(prefix)) return true;
      }
      return false;
    },
    [dirtyPaths]
  );
  // report
  const [report, setReport] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [lastCalculatedAt, setLastCalculatedAt] = useState(null);
  const [nowTick, setNowTick] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const reportExportRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  // Page boot loading (used to show a spinner while auto-starting the scenario wizard)
  const [bootLoading, setBootLoading] = useState(true);
  const [bootLoadingLabel, setBootLoadingLabel] = useState("Okul açiliyor...");

  useEffect(() => {
    setSelectedScenarioId(readSelectedScenarioId(schoolId));
  }, [schoolId]);

  const uiScopeKey = useMemo(
    () => `school:${schoolId}:scenario:${selectedScenarioId ?? "none"}`,
    [schoolId, selectedScenarioId]
  );
  const [reportCurrency, setReportCurrency] = useScenarioUiState("report.currency", "usd", { scope: uiScopeKey });
  const reportCurrencyDefaultedForRef = useRef(null);
  const [reportMode, setReportMode] = useScenarioUiState("report.mode", "original", { scope: uiScopeKey });
  const [reportModeLoading, setReportModeLoading] = useState(false);
  const [detailedReportMode, setDetailedReportMode] = useScenarioUiString("school.detailedReportMode", "detailed", { scope: uiScopeKey });
  const activeRouteSegment = useMemo(() => {
    const base = `/schools/${schoolId}/`;
    if (!location.pathname.startsWith(base)) return "";
    return location.pathname.slice(base.length).split("/")[0] || "";
  }, [location.pathname, schoolId]);
  const tab = ROUTE_TO_TAB[activeRouteSegment] || "";
  const activeWorkId = TAB_TO_WORK_ID[tab] || null;
  const activeWorkItem = useMemo(() => {
    if (!activeWorkId || !Array.isArray(workItems)) return null;
    return workItems.find((item) => String(item?.work_id) === String(activeWorkId)) || null;
  }, [activeWorkId, workItems]);
  const activeWorkState = activeWorkItem?.state ? String(activeWorkItem.state) : "not_started";
  const moduleLocked = ["submitted", "approved"].includes(activeWorkState);
  const setTab = React.useCallback(
    (nextTab) => {
      const segment = TAB_TO_ROUTE[nextTab];
      if (!segment) return;
      navigate(`/schools/${schoolId}/${segment}`);
    },
    [navigate, schoolId]
  );

  useEffect(() => {
    // Persist the current route segment for the given school and scenario. When
    // no scenario is selected (`selectedScenarioId` is null) the helper will
    // store the path under a "none" scenario key. This ensures that we
    // remember the last page even before a scenario is chosen.
    if (!ROUTE_TO_TAB[activeRouteSegment]) return;
    writeLastVisitedPath(schoolId, selectedScenarioId, activeRouteSegment);
  }, [activeRouteSegment, schoolId, selectedScenarioId]);

  // Persist the current route segment globally so that when switching between
  // schools or scenarios the user returns to the same sidebar page. This is
  // independent of school or scenario context.
  useEffect(() => {
    if (!ROUTE_TO_TAB[activeRouteSegment]) return;
    writeGlobalLastRouteSegment(activeRouteSegment);
  }, [activeRouteSegment]);

  useEffect(() => {
    // When the user loads the base school path (e.g. `/schools/4`), redirect to
    // the last visited route for the current school and scenario. If no
    // scenario is selected we still look up the "none" scenario key. If
    // nothing is recorded, default to the basics tab.
    const base = `/schools/${schoolId}`;
    if (location.pathname !== base && location.pathname !== `${base}/`) return;
    const last = readLastVisitedPath(schoolId, selectedScenarioId);
    const targetSegment = last || TAB_TO_ROUTE.basics;
    const target = `${base}/${targetSegment}`;
    navigate(target, { replace: true });
  }, [location.pathname, navigate, schoolId, selectedScenarioId]);

  useEffect(() => {
    setBootLoading(true);
    setBootLoadingLabel("Okul açiliyor...");
  }, [schoolId]);

  useEffect(() => {
    if (!pendingTabAfterSelect) return;
    if (!selectedScenarioId) return;
    if (String(selectedScenarioId) !== String(pendingTabAfterSelect.scenarioId)) return;
    setTab(pendingTabAfterSelect.tab);
    setPendingTabAfterSelect(null);
  }, [pendingTabAfterSelect, selectedScenarioId, setTab]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClick = (event) => {
      const el = exportMenuRef.current;
      if (!el || el.contains(event.target)) return;
      setExportOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [exportOpen]);


  const scenarioYears = parseAcademicYear(selectedScenario?.academic_year);
  const baseYear = scenarioYears.startYear;
  const inputCurrencyCode =
    selectedScenario?.input_currency === "LOCAL"
      ? (selectedScenario.local_currency_code || "LOCAL")
      : "USD";
  const isLocalScenario = selectedScenario?.input_currency === "LOCAL";
  const prevRealFxValue = Number(inputs?.temelBilgiler?.performans?.prevYearRealizedFxUsdToLocal || 0);
  const prevRealFxMissing = isLocalScenario && !(Number.isFinite(prevRealFxValue) && prevRealFxValue > 0);

  const programType = useMemo(() => getProgramType(inputs, selectedScenario), [inputs, selectedScenario]);
  const permissionScope = useMemo(() => {
    const countryId = school?.country_id ?? me?.country_id ?? null;
    return { schoolId, countryId };
  }, [schoolId, school?.country_id, me?.country_id]);
  const canReadNorm = useMemo(() => {
    try {
      return can(me, "page.norm", "read", permissionScope);
    } catch {
      return false;
    }
  }, [me, permissionScope]);
  const canWriteGiderler = useMemo(() => {
    try {
      if (can(me, "section.giderler.isletme", "write", permissionScope)) return true;
      return can(me, "page.giderler", "write", permissionScope);
    } catch {
      return false;
    }
  }, [me, permissionScope]);
  const ignoreNormProgress = !norm && !canReadNorm;

  const scenarioProgress = useMemo(
    () => computeScenarioProgress({ inputs, norm, config: progressConfig, scenario: selectedScenario }),
    [inputs, norm, progressConfig, selectedScenario]
  );
  const isHQ = useMemo(() => isHeadquarterScenario(inputs), [inputs]);
  useEffect(() => {
    if (schoolId && selectedScenarioId && inputs) {
      writeScenarioFlags(schoolId, selectedScenarioId, { isHeadquarter: isHQ });
    }
  }, [schoolId, selectedScenarioId, inputs, isHQ]);
  const progMap = useMemo(
    () => Object.fromEntries((scenarioProgress?.tabs || []).map((t) => [t.key, t])),
    [scenarioProgress]
  );
  const normAvgPct = useMemo(() => {
    const a = pctValue(progMap.gradesPlan);
    const b = ignoreNormProgress ? a : pctValue(progMap.norm);
    return Math.round((a + b) / 2);
  }, [progMap, ignoreNormProgress]);
  const expensesAvgPct = useMemo(() => {
    const a = pctValue(progMap.giderler);
    if (isHQ) return a;
    // Use the new discounts key instead of the legacy indirimler key.  If the
    // discounts tab is missing, default to 0 for the percentage value.
    const b = pctValue(progMap.discounts);
    return Math.round((a + b) / 2);
  }, [progMap, isHQ]);
  const normMissingLines = useMemo(
    () => mergeMissingLines(progMap.gradesPlan?.missingLines, progMap.norm?.missingLines),
    [progMap]
  );
  const expensesMissingLines = useMemo(
    () =>
      isHQ
        ? Array.isArray(progMap.giderler?.missingLines)
          ? progMap.giderler.missingLines
          : []
        : mergeMissingLines(progMap.giderler?.missingLines, progMap.discounts?.missingLines),
    [progMap, isHQ]
  );

  const fetchScenarioReport = useCallback(
    async (mode) => {
      if (!selectedScenarioId) return;
      const nextMode = String(mode || "original");
      setReportModeLoading(true);
      setErr("");
      try {
        const data = await api.getScenarioReport(schoolId, selectedScenarioId, nextMode);
        setReport(data?.results || null);
      } catch (e) {
        setErr(e.message || "Report fetch failed");
      } finally {
        setReportModeLoading(false);
      }
    },
    [schoolId, selectedScenarioId]
  );

  const handleReportModeChange = useCallback(
    async (mode) => {
      const nextMode = String(mode || "original");
      if (nextMode === reportMode && report) return;
      setReportMode(nextMode);
      await fetchScenarioReport(nextMode);
    },
    [fetchScenarioReport, reportMode, report, setReportMode]
  );
  useEffect(() => {
    if (!outlet?.setHeaderMeta) return;
    outlet.setHeaderMeta({
      title: school?.name ? school.name : "Okul",
      subtitle: selectedScenario
        ? `${selectedScenario.name}${selectedScenario.academic_year ? ` • ${selectedScenario.academic_year}` : ""}`
        : "Senaryo seçin",
      hideDefault: false,
      centered: true,
    });
    return () => {
      outlet.clearHeaderMeta?.();
    };
  }, [outlet, selectedScenario, school?.name]);

  // A) Helper: HR(IK) -> Expenses(Isletme) 5 salary rows auto patch (uses 1.Yil / y1)
  const applyIkSalariesToGiderler = useCallback((inInputs) => {
    const src = inInputs || {};
    const ik = src.ik || {};
    const yearIK = ik?.years?.y1 ? ik.years.y1 : ik; // legacy support

    const unitCosts = yearIK?.unitCosts || {};
    const headcountsByLevel = yearIK?.headcountsByLevel || {};

    const roles = [
      "turk_mudur",
      "turk_mdyard",
      "turk_egitimci",
      "turk_temsil",
      "yerel_yonetici_egitimci",
      "yerel_destek",
      "yerel_ulke_temsil_destek",
      "int_yonetici_egitimci",
    ];

    const levelKeys = Object.keys(headcountsByLevel || {});
    const levels = levelKeys.length
      ? levelKeys
      : [
          "okulOncesi",
          "ilkokulYerel",
          "ilkokulInt",
          "ortaokulYerel",
          "ortaokulInt",
          "liseYerel",
          "liseInt",
        ];

    const roleAnnual = {};
    for (const r of roles) {
      let count = 0;
      for (const lvl of levels) count += Number(headcountsByLevel?.[lvl]?.[r] || 0);
      roleAnnual[r] = Number(unitCosts?.[r] || 0) * count;
    }

    const patch = {
      turkPersonelMaas:
        (roleAnnual.turk_mudur || 0) +
        (roleAnnual.turk_mdyard || 0) +
        (roleAnnual.turk_egitimci || 0),
      turkDestekPersonelMaas: roleAnnual.turk_temsil || 0,
      yerelPersonelMaas: roleAnnual.yerel_yonetici_egitimci || 0,
      yerelDestekPersonelMaas:
        (roleAnnual.yerel_destek || 0) + (roleAnnual.yerel_ulke_temsil_destek || 0),
      internationalPersonelMaas: roleAnnual.int_yonetici_egitimci || 0,
    };

    const prevItems = src?.giderler?.isletme?.items || {};
    const keys = Object.keys(patch);

    let changed = false;
    for (const k of keys) {
      const a = Number(prevItems?.[k] || 0);
      const b = Number(patch?.[k] || 0);
      if (Math.abs(a - b) > 1e-6) {
        changed = true;
        break;
      }
    }
    if (!changed) return src;

    const next = structuredClone(src);
    next.giderler = next.giderler || {};
    next.giderler.isletme = next.giderler.isletme || {};
    next.giderler.isletme.items = next.giderler.isletme.items || {};
    for (const k of keys) next.giderler.isletme.items[k] = Number(patch[k] || 0);
    return next;
  }, []);

  const normalizeCapacityInputs = useCallback((src) => {
    const safeNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const s = src || {};
    const legacy = safeNum(s.schoolCapacity);

    const cap = s.kapasite && typeof s.kapasite === "object" ? s.kapasite : {};
    const years = cap.years && typeof cap.years === "object" ? cap.years : {};

    const y1 = safeNum(years.y1 != null ? years.y1 : legacy);
    const y2 = safeNum(years.y2 != null ? years.y2 : y1);
    const y3 = safeNum(years.y3 != null ? years.y3 : y1);

    const currentStudents = safeNum(cap.currentStudents);
    const byKademe = cap.byKademe && typeof cap.byKademe === "object" ? cap.byKademe : {};

    const needsPatch =
      "schoolCapacity" in s ||
      !s.kapasite ||
      typeof s.kapasite !== "object" ||
      !cap.years ||
      typeof cap.years !== "object" ||
      safeNum(cap?.years?.y1) !== y1 ||
      safeNum(cap?.years?.y2) !== y2 ||
      safeNum(cap?.years?.y3) !== y3 ||
      safeNum(cap?.currentStudents) !== currentStudents ||
      !cap.byKademe ||
      typeof cap.byKademe !== "object";

    if (!needsPatch) return s;

    const next = structuredClone(s);
    next.kapasite = {
      ...(cap || {}),
      currentStudents,
      years: { y1, y2, y3 },
      byKademe,
    };
    if ("schoolCapacity" in next) delete next.schoolCapacity;
    return next;
  }, []);


  const normalizeTemelBilgilerInputs = (src) => {
    const s = src || {};
    const t = s.temelBilgiler && typeof s.temelBilgiler === "object" ? s.temelBilgiler : {};
    const next = structuredClone(s);

    // inflation defaults
    const inf = t.inflation && typeof t.inflation === "object" ? t.inflation : {};
    const toFinite = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    next.temelBilgiler = {
      inflation: {
        ...inf,
        expenseDeviationPct: toFinite(inf.expenseDeviationPct),
        y2023: toFinite(inf.y2023),
        y2024: toFinite(inf.y2024),
        y2025: toFinite(inf.y2025),
        y1: toFinite(inf.y1),
        y2: toFinite(inf.y2),
        y3: toFinite(inf.y3),
        currentSeasonAvgFee: toFinite(inf.currentSeasonAvgFee),
      },
      yetkililer: t.yetkililer || { mudur: "", ulkeTemsilcisi: "", raporuHazirlayan: "" },
      okulEgitimBilgileri: t.okulEgitimBilgileri || {
        egitimBaslamaTarihi: "",
        zorunluEgitimDonemleri: "",
        birDersSuresiDakika: 0,
        gunlukDersSaati: 0,
        haftalikDersSaatiToplam: 0,
        sabahciOglenci: "",
        ogretmenHaftalikDersOrt: 0,
        gecisSinaviBilgisi: "",
        uygulananProgram: "",
      },
      kademeler: normalizeKademeConfig(t.kademeler),
      programType: normalizeProgramType(t.programType),
      okulUcretleriHesaplama: typeof t.okulUcretleriHesaplama === "boolean" ? t.okulUcretleriHesaplama : true,
      ucretArtisOranlari: t.ucretArtisOranlari || {
        okulOncesi: 0,
        ilkokulYerel: 0,
        ilkokulInt: 0,
        ortaokulYerel: 0,
        ortaokulInt: 0,
        liseYerel: 0,
        liseInt: 0,
      },
      ikMevcut: t.ikMevcut || {
        turkPersonelYoneticiEgitimci: 0,
        turkPersonelTemsilcilik: 0,
        yerelKadroluEgitimci: 0,
        yerelUcretliVakaterEgitimci: 0,
        yerelDestek: 0,
        yerelTemsilcilik: 0,
        international: 0,
      },
      bursIndirimOgrenciSayilari: t.bursIndirimOgrenciSayilari || {
        magisBasariBursu: 0,
        maarifYetenekBursu: 0,
        ihtiyacBursu: 0,
        okulBasariBursu: 0,
        tamEgitimBursu: 0,
        barinmaBursu: 0,
        turkceBasariBursu: 0,
        uluslararasiYukumlulukIndirimi: 0,
        vakifCalisaniIndirimi: 0,
        kardesIndirimi: 0,
        erkenKayitIndirimi: 0,
        pesinOdemeIndirimi: 0,
        kademeGecisIndirimi: 0,
        temsilIndirimi: 0,
        kurumIndirimi: 0,
        istisnaiIndirim: 0,
        yerelMevzuatIndirimi: 0,
      },
      rakipAnalizi: t.rakipAnalizi || {
        okulOncesi: { a: 0, b: 0, c: 0 },
        ilkokul: { a: 0, b: 0, c: 0 },
        ortaokul: { a: 0, b: 0, c: 0 },
        lise: { a: 0, b: 0, c: 0 },
      },
      performans: t.performans || {
        gerceklesen: { ogrenciSayisi: 0, gelirler: 0, giderler: 0, karZarar: 0, bursVeIndirimler: 0 },
      },
      degerlendirme: typeof t.degerlendirme === "string" ? t.degerlendirme : "",
    };

    return next;
  };

  const normalizeGradesInputs = useCallback((src) => {
    const s = src || {};
    const defaultGrades = getGradeOptions().map((g) => ({ grade: g, branchCount: 0, studentsPerBranch: 0 }));
    const baseGrades = Array.isArray(s.grades) ? s.grades : defaultGrades;
    const years = s.gradesYears && typeof s.gradesYears === "object" ? s.gradesYears : {};

    const y1 = Array.isArray(years.y1) ? years.y1 : baseGrades;
    const y2 = Array.isArray(years.y2) ? years.y2 : y1;
    const y3 = Array.isArray(years.y3) ? years.y3 : y1;

    const normalizeRow = (row) => ({
      grade: String(row?.grade ?? ""),
      branchCount: Number(row?.branchCount ?? 0),
      studentsPerBranch: Number(row?.studentsPerBranch ?? 0),
    });

    const toMap = (list) => {
      const m = new Map();
      (Array.isArray(list) ? list : []).forEach((row) => {
        const r = normalizeRow(row);
        if (!r.grade) return;
        m.set(r.grade, r);
      });
      return m;
    };

    const areGradesEqual = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      const ma = toMap(a);
      const mb = toMap(b);
      if (ma.size !== mb.size) return false;
      for (const [grade, ra] of ma.entries()) {
        const rb = mb.get(grade);
        if (!rb) return false;
        if (Number(ra.branchCount) !== Number(rb.branchCount)) return false;
        if (Number(ra.studentsPerBranch) !== Number(rb.studentsPerBranch)) return false;
      }
      return true;
    };

    const needsPatch =
      !s.gradesYears ||
      !Array.isArray(s.grades) ||
      !Array.isArray(years.y1) ||
      !Array.isArray(years.y2) ||
      !Array.isArray(years.y3) ||
      !areGradesEqual(s.grades, y1);

    if (!needsPatch) return s;

    const next = structuredClone(s);
    next.gradesYears = {
      y1: structuredClone(y1),
      y2: structuredClone(y2),
      y3: structuredClone(y3),
    };
    next.grades = structuredClone(next.gradesYears.y1);
    return next;
  }, []);

  const applyTuitionStudentCounts = useCallback((src) => {
    const s = src && typeof src === "object" ? src : {};
    const grades = s?.gradesYears?.y1 || s?.grades || [];
    const sums = summarizeGradesByKademe(grades, s?.temelBilgiler?.kademeler);
    const programType = getProgramType(s);
    const variantCounts = {
      okulOncesi: Number(sums.okulOncesi || 0),
      ilkokulYerel: 0,
      ilkokulInt: 0,
      ortaokulYerel: 0,
      ortaokulInt: 0,
      liseYerel: 0,
      liseInt: 0,
    };
    variantCounts[mapBaseKademeToVariant("ilkokul", programType)] = Number(sums.ilkokul || 0);
    variantCounts[mapBaseKademeToVariant("ortaokul", programType)] = Number(sums.ortaokul || 0);
    variantCounts[mapBaseKademeToVariant("lise", programType)] = Number(sums.lise || 0);

    const syncRows = (rows, getCount) => {
      if (!Array.isArray(rows)) return { rows, changed: false };
      let changed = false;
      const nextRows = rows.map((r) => {
        const key = String(r?.key ?? "");
        const nextCount = getCount(key);
        if (nextCount == null) return r;
        const current = Number(r?.studentCount ?? 0);
        if (Math.abs(current - nextCount) < 1e-6) return r;
        changed = true;
        return { ...r, studentCount: nextCount };
      });
      return { rows: changed ? nextRows : rows, changed };
    };

    const tuitionSync = syncRows(s?.gelirler?.tuition?.rows, (key) =>
      Object.prototype.hasOwnProperty.call(variantCounts, key) ? variantCounts[key] : null
    );

    if (!tuitionSync.changed) return s;

    const next = structuredClone(s);
    next.gelirler = next.gelirler || {};
    if (tuitionSync.changed) {
      next.gelirler.tuition = next.gelirler.tuition || {};
      next.gelirler.tuition.rows = tuitionSync.rows;
    }
    return next;
  }, []);


  async function loadAll() {
    setErr("");
    setBootLoading(true);
    setBootLoadingLabel("Okul açiliyor...");
    try {
      const s = await api.getSchool(schoolId);
      setSchool(s);

      // load current user profile (region/country)
      try {
        const meInfo = await api.getMe();
        setMe(meInfo);
      } catch (_) {
        // ignore (e.g., token missing)
      }

      setBootLoadingLabel("Senaryolar kontrol ediliyor...");
      const sc = await api.listScenarios(schoolId, {
        limit: 50,
        offset: 0,
        fields: "brief",
        order: "created_at:desc",
      });
      const rows = Array.isArray(sc?.items) ? sc.items : [];
      setScenarios(rows);
      if (selectedScenarioId != null) {
        const exists = rows.some((x) => String(x.id) === String(selectedScenarioId));
        if (!exists) {
          writeSelectedScenarioId(schoolId, null);
          setSelectedScenarioId(null);
        }
      }
      setBootLoading(false);

    } catch (e) {
      setErr(e.message || "Failed to load school");
      setBootLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadProgressConfig() {
      try {
        const data = await api.getProgressRequirements();
        if (!active) return;
        setProgressConfig(data?.config || data || null);
      } catch (_) {
        if (!active) return;
        setProgressConfig(null);
      }
    }
    loadProgressConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    loadAll(); /* eslint-disable-next-line */
  }, [schoolId]);

  useEffect(() => {
    async function loadScenario() {
      if (!selectedScenarioId) {
        setSelectedScenario(null);
        setInputs(null);
        setBaselineInputs(null);
        setReport(null);
        setPrevReport(null);
        setPrevScenarioMeta(null);
        setNorm(null);
        setBaselineNorm(null);
        clearDirtyPrefix("inputs.");
        clearDirtyPrefix("norm.");
        return;
      }
      setErr("");
      setReport(null);
      setLastSavedAt(null);
      setLastCalculatedAt(null);
      try {
        const data = await api.getScenarioContext(schoolId, selectedScenarioId);

        // IMPORTANT FIX:
        setSelectedScenario(data?.scenario || null);

        // IMPORTANT FIX:
        // If backend returns null/undefined inputs, don't convert it to {}.
        const raw = data?.inputs;
        const normalized =
          raw && typeof raw === "object"
            ? normalizeGradesInputs(normalizeTemelBilgilerInputs(normalizeCapacityInputs(raw)))
            : raw;
        setInputs(normalized);
        setBaselineInputs(normalized && typeof normalized === "object" ? structuredClone(normalized) : normalized);
        clearDirtyPrefix("inputs.");

        const n = data?.norm ?? null;
        setNorm(n);
        setBaselineNorm(n ? structuredClone(n) : null);
        clearDirtyPrefix("norm.");
      } catch (e) {
        setErr(e.message || "Failed to load scenario inputs");
      }
    }
    loadScenario();
  }, [
    schoolId,
    selectedScenarioId,
    clearDirtyPrefix,
    normalizeCapacityInputs,
    normalizeGradesInputs,
  ]);

  useEffect(() => {
    if (!selectedScenarioId) {
      reportCurrencyDefaultedForRef.current = null;
      return;
    }
    const scenarioId = selectedScenario?.id;
    if (!scenarioId || String(scenarioId) !== String(selectedScenarioId)) return;

    const isLocal =
      selectedScenario?.input_currency === "LOCAL" &&
      Number(selectedScenario?.fx_usd_to_local) > 0 &&
      selectedScenario?.local_currency_code;
    const scenarioKey = String(scenarioId);

    if (reportCurrencyDefaultedForRef.current !== scenarioKey) {
      setReportCurrency(isLocal ? "local" : "usd");
      reportCurrencyDefaultedForRef.current = scenarioKey;
      return;
    }

    if (!isLocal && reportCurrency !== "usd") {
      setReportCurrency("usd");
    }
  }, [
    selectedScenarioId,
    selectedScenario?.id,
    selectedScenario?.input_currency,
    selectedScenario?.fx_usd_to_local,
    selectedScenario?.local_currency_code,
    reportCurrency,
    setReportCurrency,
  ]);

  // Load previous year's report (used in TEMEL BILGILER: performans planlanan)
  useEffect(() => {
    async function loadPrev() {
      try {
        setPrevReport(null);
        setPrevScenarioMeta(null);
        const year = selectedScenario?.academic_year;
        if (!year || !scenarios?.length) return;

        const { startYear, endYear } = parseAcademicYear(year);
        if (!startYear) return;
        const prevStartYear = startYear - 1;
        const prevEndYear = (endYear ?? startYear) - 1;

        const prevScenario = scenarios.find((s) => {
          const parsed = parseAcademicYear(s?.academic_year);
          return parsed.startYear === prevStartYear && parsed.endYear === prevEndYear;
        });
        if (!prevScenario) return;

        setPrevScenarioMeta(prevScenario);
        const data = await api.calculateScenario(schoolId, prevScenario.id);
        setPrevReport(data?.results || null);
      } catch (_) {
        setPrevReport(null);
      }
    }
    loadPrev();
  }, [schoolId, selectedScenario?.academic_year, scenarios]);

  const scenarioLocked = isScenarioLocked(selectedScenario);
  const inputsLocked = scenarioLocked || moduleLocked;

  const saveNormConfig = useCallback(async () => {
    if (!norm || !selectedScenarioId) return;
    const payload = norm?.years
      ? { years: norm.years }
      : {
        teacherWeeklyMaxHours: norm.teacherWeeklyMaxHours,
        curriculumWeeklyHours: norm.curriculumWeeklyHours,
      };
    await api.saveNormConfig(schoolId, selectedScenarioId, payload);
    const n = await api.getNormConfig(schoolId, selectedScenarioId);
    setNorm(n);
    setBaselineNorm(n ? structuredClone(n) : null);
    clearDirtyPrefix("norm.");
  }, [norm, selectedScenarioId, schoolId, clearDirtyPrefix]);

  // B) Save inputs with HR->Expenses salary patch applied + Capacity normalization
  const saveInputs = useCallback(async () => {
    if (!selectedScenarioId || !inputs) return false;
    if (inputsLocked) {
      setErr(scenarioLocked ? "Senaryo kilitli. Inceleme bekleniyor." : "Modul kilitli. Inceleme bekleniyor.");
      return false;
    }
    const shouldSaveInputs = hasDirtyPrefix("inputs.");
    const shouldSaveNorm = hasDirtyPrefix("norm.");
    if (!shouldSaveInputs && !shouldSaveNorm) return true;
    setInputsSaving(true);
    setErr("");
    try {
      if (shouldSaveInputs) {
        let patched = applyIkSalariesToGiderler(inputs);
        patched = normalizeCapacityInputs(patched);
        patched = normalizeGradesInputs(patched);
        patched = applyTuitionStudentCounts(patched);

        if (patched !== inputs) setInputs(patched);

        // Build the list of modified permission resources from the dirty input paths.  Only
        // consider dirty paths that affect scenario inputs (prefixed with "inputs.").  Dirty
        // paths under the "norm." prefix are handled separately when saving the norm config.
        const modifiedResourcesSet = new Set();
        const inputDirty = [];
        for (const p of dirtyPaths) {
          const pathStr = String(p || '');
          if (!pathStr.startsWith('inputs.')) continue;
          inputDirty.push(pathStr);
          for (const r of pathToResources(pathStr)) {
            modifiedResourcesSet.add(r);
          }
        }
        const modifiedResources = Array.from(modifiedResourcesSet);
        await api.saveScenarioInputs(
          schoolId,
          selectedScenarioId,
          patched,
          modifiedResources,
          inputDirty
        );
        setBaselineInputs(patched && typeof patched === "object" ? structuredClone(patched) : patched);
        clearDirtyPrefix("inputs.");
      }

      if (shouldSaveNorm) {
        await saveNormConfig();
      }
      setLastSavedAt(Date.now());
      return true;
    } catch (e) {
      const fallback =
        shouldSaveInputs && shouldSaveNorm
          ? "Save failed"
          : shouldSaveNorm
            ? "Save norm failed"
            : "Save inputs failed";
      setErr(e.message || fallback);
      return false;
    } finally {
      setInputsSaving(false);
    }
  }, [
    applyIkSalariesToGiderler,
    applyTuitionStudentCounts,
    normalizeCapacityInputs,
    normalizeGradesInputs,
    selectedScenarioId,
    inputs,
    inputsLocked,
    scenarioLocked,
    hasDirtyPrefix,
    dirtyPaths,
    schoolId,
    clearDirtyPrefix,
    saveNormConfig,
  ]);


  // --- Guard: prevent calculating / submitting if Y2 & Y3 planned student totals are missing ---
  function sumPlannedStudents(grades) {
    const list = Array.isArray(grades) ? grades : [];
    let sum = 0;
    for (const row of list) {
      const n = Number(row?.studentsPerBranch ?? 0);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }

  function getPlannedStudentTotalsByYear(srcInputs) {
    const s = srcInputs && typeof srcInputs === "object" ? srcInputs : {};
    const years = s.gradesYears && typeof s.gradesYears === "object" ? s.gradesYears : {};
    return {
      y1: sumPlannedStudents(Array.isArray(years.y1) ? years.y1 : s.grades),
      y2: sumPlannedStudents(years.y2),
      y3: sumPlannedStudents(years.y3),
    };
  }


  function showBlockingToast(message, toastId = "blocking-toast") {
    // Small bottom-right notification (does not affect page layout)
    toast.warn(message, {
      toastId,
      position: "bottom-right",
      autoClose: false,
      closeOnClick: false,
      draggable: true,
      icon: "??",
      style: {
        background: "rgba(15, 23, 42, 0.96)",
        color: "#f8fafc",
        border: "1px solid rgba(251, 191, 36, 0.35)",
        boxShadow: "0 18px 40px rgba(0,0,0,.28)",
        borderRadius: 14,
      },
    });
  }

  function ensurePlanningStudentsForY2Y3(actionLabel = "Islem") {
    // If inputs are not loaded yet, don't block here (other guards will handle it)
    if (!inputs) return true;
    if (isHQ) return true;

    const totals = getPlannedStudentTotalsByYear(inputs);
    const missing = [];
    if (!(totals.y2 > 0)) missing.push("Y2");
    if (!(totals.y3 > 0)) missing.push("Y3");
    if (!missing.length) return true;

    const msg =
      `${actionLabel} yapilamaz: Norm > Planlanan Donem Bilgileri bolumunde ` +
      `${missing.join(" ve ")} toplam ogrenci 0 gorunuyor. Lutfen Y2/Y3 ogrenci sayilarini girin.`;

    // Do NOT set page-level err here (it breaks layout). Use toast only.
    setErr("");
    showBlockingToast(msg, "norm-y2y3-missing");

    if (tab !== "norm") setTab("norm");
    return false;
  }

  function ensurePrevRealFxForLocal(actionLabel = "Islem") {
    if (!inputs) return true;
    if (!isLocalScenario) return true;
    if (!prevRealFxMissing) return true;

    const msg =
      `${actionLabel} yapilamaz: Temel Bilgiler > Performans alanindaki ` +
      `"Onceki Donem Ortalama Kur (Gerceklesen)" girilmelidir.`;

    setErr("");
    showBlockingToast(msg, "prev-realized-fx-missing");
    if (tab !== "basics") setTab("basics");
    return false;
  }


  async function calculate(options = {}) {
    if (!selectedScenarioId) return false;
    if (!ensurePrevRealFxForLocal("Hesaplama")) return false;
    if (!options.skipPlanValidation && !ensurePlanningStudentsForY2Y3("Hesaplama")) return false;
    setCalculating(true);
    setErr("");
    let ok = false;
    try {
      const data = await api.calculateScenario(schoolId, selectedScenarioId);
      if (reportMode === "distributed") {
        await fetchScenarioReport("distributed");
      } else {
        setReport(data.results);
      }
      if (!options.keepTab) setTab("report");
      setLastCalculatedAt(Date.now());
      if (typeof window !== "undefined") {
        // Debug hook: inspect KPI calc payload/results in devtools
        console.log("[kpi] calculate ok", {
          scenarioId: selectedScenarioId,
          hasResults: Boolean(data?.results),
        });
      }
      ok = true;
    } catch (e) {
      setErr(e.message || "Calculation failed");
      if (typeof window !== "undefined") {
        console.log("[kpi] calculate failed", {
          scenarioId: selectedScenarioId,
          error: e?.message || e,
        });
      }
    } finally {
      setCalculating(false);
    }
    return ok;
  }

  async function handleExport() {
    if (!selectedScenarioId) return;
    setErr("");
    try {
      await api.downloadXlsx(schoolId, selectedScenarioId, reportCurrency, reportMode);
    } catch (e) {
      setErr(e.message || "Download failed");
    }
  }

  async function handleExportPdf() {
    if (!selectedScenarioId) return;
    setErr("");
    setExportingPdf(true);
    try {
      await api.downloadPdf(schoolId, selectedScenarioId, reportCurrency, reportMode);
    } catch (e) {
      setErr(e.message || "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  }

  function setField(path, value) {
    if (inputsLocked) return;
    const next = structuredClone(inputs || {});
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = obj[keys[i]] || {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setInputs(next);
  }

  function areSetsEqual(a, b) {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  function valuesEqual(a, b) {
    if (a == null && b == null) return true;
    if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
    if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
    return Object.is(a, b);
  }

  function getValueAtPath(obj, parts) {
    let cur = obj;
    for (const part of parts) {
      if (cur == null) return undefined;

      if (Array.isArray(cur)) {
        const byKey = cur.find((item) => item && typeof item === "object" && "key" in item && String(item.key) === part);
        if (byKey) {
          cur = byKey;
          continue;
        }

        const byName = cur.find((item) => item && typeof item === "object" && "name" in item && String(item.name) === part);
        if (byName) {
          cur = byName;
          continue;
        }

        const byGrade = cur.find((item) => item && typeof item === "object" && "grade" in item && String(item.grade) === part);
        if (byGrade) {
          cur = byGrade;
          continue;
        }

        const idx = Number(part);
        if (Number.isInteger(idx) && String(idx) === part) {
          cur = cur[idx];
          continue;
        }

        return undefined;
      }

      if (typeof cur !== "object") return undefined;
      cur = cur[part];
    }
    return cur;
  }

  // ...existing code...
  const getBaselineValue = useCallback(
    (path) => {
      if (!path) return undefined;
      const parts = path.split(".");
      if (!parts.length) return undefined;
      if (parts[0] === "inputs") {
        const val = getValueAtPath(baselineInputs, parts.slice(1));
        if (val !== undefined) return val;

        const last = parts[parts.length - 1];

        // If field ends with Y2/Y3 try base field fallback (e.g. unitCostY2 -> unitCost)
        if (last.endsWith("Y2") || last.endsWith("Y3")) {
          const suffix = last.endsWith("Y2") ? "Y2" : "Y3";
          const baseField = last.slice(0, -2);
          const baseVal = getValueAtPath(baselineInputs, parts.slice(1, -1).concat(baseField));
          if (baseVal !== undefined) {
            // For unitCost-like fields, return the inflation-adjusted derived value so UI matches display logic
            if (baseField === "unitCost" || baseField.startsWith("unitCost")) {
              const infl = getValueAtPath(baselineInputs, ["temelBilgiler", "inflation"]) || {};
              const y2f = 1 + Number(infl?.y2 || 0);
              const y3f = y2f * (1 + Number(infl?.y3 || 0));
              return suffix === "Y2" ? Number(baseVal) * y2f : Number(baseVal) * y3f;
            }
            // Other Y2/Y3 fields (studentCountY2, ratioY2, valueY2, etc.) fall back to base field
            return baseVal;
          }
        }

        // studentCountY2/Y3 fallback -> studentCount
        if ((last === "studentCountY2" || last === "studentCountY3") && baselineInputs) {
          const parent = getValueAtPath(baselineInputs, parts.slice(1, -1));
          if (parent && typeof parent === "object") {
            const sc = parent.studentCount;
            if (sc != null) return sc;
          }
        }

        // kapasite / year fallbacks handled elsewhere above; generic years fallback:
        const yearsIdx = parts.indexOf("years");
        if (yearsIdx >= 0 && parts.length > yearsIdx + 1 && baselineInputs) {
          const yearKey = parts[yearsIdx + 1]; // e.g. 'y1','y2','y3'
          if (yearKey === "y2" || yearKey === "y3") {
            const altParts = [...parts];
            altParts[yearsIdx + 1] = "y1";
            const altVal = getValueAtPath(baselineInputs, altParts.slice(1));
            if (altVal !== undefined) {
              if (parts.includes("ik") && parts.includes("unitCosts")) {
                const ratio = getValueAtPath(baselineInputs, ["ik", "unitCostRatio"]);
                const r = Number(ratio);
                if (Number.isFinite(r)) {
                  const base = Number(altVal);
                  const multiplier = yearKey === "y2" ? r : r * r;
                  return Number.isFinite(base) ? base * multiplier : undefined;
                }
              }
              return altVal;
            }
          }
        }

        // ik specific fallbacks:
        if (parts.slice(1, 3).join(".") === "ik.years" && baselineInputs) {
          if (parts.includes("unitCostRatio")) {
            const u = getValueAtPath(baselineInputs, ["ik", "unitCostRatio"]);
            if (u !== undefined) return u;
            return 1;
          }
          const leafCandidates = ["unitCosts", "headcountsByLevel"];
          if (leafCandidates.some((c) => parts.includes(c))) {
            return 0;
          }
        }

        // generic kapasite fallbacks (years.cur/y1/y2/y3 etc.)
        if ((last === "y1" || last === "y2" || last === "y3") && baselineInputs) {
          const parent = getValueAtPath(baselineInputs, parts.slice(1, -1));
          if (parent && typeof parent === "object" && parent.y1 != null) return parent.y1;

          const byIdx = parts.indexOf("byKademe");
          if (byIdx >= 1 && parts.length > byIdx + 1) {
            const lvlKey = parts[byIdx + 1];
            const per = getValueAtPath(baselineInputs, ["kapasite", "byKademe", lvlKey, "caps", "y1"]);
            if (per !== undefined) return per;
          }

          const yearsY1 = getValueAtPath(baselineInputs, ["kapasite", "years", "y1"]);
          if (yearsY1 !== undefined) return yearsY1;
        }

        // cur fallback for kapasite -> per-kademe caps.cur or kapasite.currentStudents
        if (last === "cur" && baselineInputs) {
          const byIdx = parts.indexOf("byKademe");
          if (byIdx >= 1 && parts.length > byIdx + 1) {
            const lvlKey = parts[byIdx + 1];
            const per = getValueAtPath(baselineInputs, ["kapasite", "byKademe", lvlKey, "caps", "cur"]);
            if (per !== undefined) return per;
          }
          const curAll = getValueAtPath(baselineInputs, ["kapasite", "currentStudents"]);
          if (curAll !== undefined) return curAll;
        }

        return undefined;
      }
      if (parts[0] === "norm") return getValueAtPath(baselineNorm, parts.slice(1));
      return undefined;
    },
    [baselineInputs, baselineNorm]
  );
  // ...existing code...

  const inputsDirty = hasDirtyPrefix("inputs.") || hasDirtyPrefix("norm.");
  const submitActiveWorkItem = useCallback(async () => {
    if (!activeWorkId) return;
    if (inputsDirty) {
      const ok = await saveInputs();
      if (!ok) return;
    }
    await submitWorkItem(activeWorkId);
  }, [activeWorkId, inputsDirty, saveInputs, submitWorkItem]);
  const reviewActiveWorkItem = useCallback(
    async (action = "approve") => {
      if (!activeWorkId || !selectedScenario?.id) return;
      if (reviewingWorkItem) return;
      setReviewingWorkItem(true);
      try {
        await api.reviewWorkItem(schoolId, selectedScenario.id, activeWorkId, { action });
        toast.success(action === "approve" ? "Onaylandı" : "Revize istendi");
        await refreshWorkItems();
        await refreshScenarioMeta();
      } catch (e) {
        toast.error(e?.message || "İşlem başarısız");
      } finally {
        setReviewingWorkItem(false);
      }
    },
    [activeWorkId, selectedScenario?.id, reviewingWorkItem, schoolId, refreshWorkItems, refreshScenarioMeta]
  );
  const role = String(me?.role || "");
  const isAccountant = role === "accountant";
  const suppressUnsavedWarning =
    activeWorkId && activeWorkState === "submitted" && role && !isAccountant;
  const warnUnsavedChanges = inputsDirty && !suppressUnsavedWarning;
  const moduleLockReason =
    activeWorkState === "submitted"
      ? "Modul incelemede"
      : activeWorkState === "approved"
        ? "Modul onaylandi"
        : "Modul kilitli";
  const inputsLockedReason = scenarioLocked
    ? "Senaryo kilitli"
    : moduleLocked
      ? moduleLockReason
      : "";
  const isActiveRequired = activeWorkId
    ? (requiredWorkIds.length
      ? requiredWorkIds.includes(activeWorkId)
      : (isHQ ? HQ_REQUIRED_WORK_IDS.has(activeWorkId) : true))
    : false;
  const canSubmitWorkItem =
    activeWorkId &&
    isActiveRequired &&
    !scenarioLocked &&
    ["not_started", "in_progress", "needs_revision"].includes(activeWorkState);
  const markDirty = useCallback(
    (path, value) => {
      if (!path) return;
      if (inputsLocked && (path.startsWith("inputs.") || path.startsWith("norm."))) return;
      if (path.startsWith("inputs.")) {
        setInputs((prev) => {
          if (!prev) return prev;
          const parts = path.split(".");
          const current = getValueAtPath(prev, parts.slice(1));
          if (valuesEqual(current, value)) return prev;
          const next = structuredClone(prev);
          const ok = setValueAtPath(next, parts.slice(1), value);
          return ok ? next : prev;
        });
      }
      const baselineValue = getBaselineValue(path);
      const same = valuesEqual(value, baselineValue);
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        if (same) next.delete(path);
        else next.add(path);
        return areSetsEqual(prev, next) ? prev : next;
      });
    },
    [inputsLocked, getBaselineValue, setInputs]
  );

  // --------------------------------------------------------------
  // Warn the user when navigating away with unsaved changes.
  //
  // React Router does not automatically prompt the user when leaving
  // a page with unsaved changes. To ensure users do not lose their
  // work, hook into the native `beforeunload` event. When there are
  // dirty inputs (i.e. the user has modified fields that have not
  // yet been saved), we register a `beforeunload` handler that
  // prevents the default navigation and sets the `returnValue` on
  // the event. Browsers display a generic confirmation dialog to
  // confirm whether the user really wants to leave the page.
  //
  // Without this handler the browser will navigate away silently
  // resulting in lost changes. By registering the handler only
  // when there are unsaved changes and cleaning it up when there
  // are none, we avoid unnecessary prompts.
  useEffect(() => {
    // Handler for the `beforeunload` event. This fires when the
    // user attempts to close or navigate away from the page (e.g.
    // by closing the tab, refreshing or navigating to another URL).
    const handleBeforeUnload = (event) => {
      // If there are unsaved changes, prevent the unload and set
      // `returnValue` to an empty string. The exact message is
      // ignored by most modern browsers, but setting this triggers
      // the confirmation dialog.
      if (warnUnsavedChanges) {
        event.preventDefault();
        // Chrome requires returnValue to be set.
        event.returnValue = "";
      }
    };

    // Register the event listener when there are unsaved changes.
    if (warnUnsavedChanges) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    // Cleanup: always remove the listener to avoid multiple handlers
    // and to ensure we do not prompt when there are no dirty inputs.
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [warnUnsavedChanges]);

  // --------------------------------------------------------------
  // Expose a global flag for unsaved changes.
  //
  // When navigating between different sections of the application (e.g. via
  // sidebar links) we need to know if there are unsaved changes in the
  // current School page. We write a boolean flag on the `window` object
  // whenever the `inputsDirty` state changes so that other components such
  // as the sidebar navigation can read this value and display a prompt if
  // necessary. When the component unmounts, we clear the flag.
  useEffect(() => {
    try {
      window.__fsUnsavedChanges = warnUnsavedChanges;
    } catch (_) {
      // In non-browser environments `window` may not exist.
    }
    return () => {
      try {
        // Clear the flag on unmount or when navigating away from this page.
        window.__fsUnsavedChanges = false;
      } catch (_) { }
    };
  }, [warnUnsavedChanges]);
  const handleIkSalaryComputed = React.useCallback(
    (salaryByYear) => {
      if (inputsLocked) return;
      const patch = salaryByYear?.y1 || {};
      const keys = [
        "turkPersonelMaas",
        "turkDestekPersonelMaas",
        "yerelPersonelMaas",
        "yerelDestekPersonelMaas",
        "internationalPersonelMaas",
      ];

      setInputs((prev) => {
        const p = prev || {};
        const prevItems = p?.giderler?.isletme?.items || {};

        let changed = false;
        for (const k of keys) {
          const a = Number(prevItems?.[k] || 0);
          const b = Number(patch?.[k] || 0);
          if (Math.abs(a - b) > 1e-6) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;

        const next = structuredClone(p);
        next.giderler = next.giderler || {};
        next.giderler.isletme = next.giderler.isletme || {};
        next.giderler.isletme.items = next.giderler.isletme.items || {};
        for (const k of keys) next.giderler.isletme.items[k] = Number(patch?.[k] || 0);
        if (canWriteGiderler) {
          // Derived salary totals should not require Giderler write permission
          // for HR users; only mark dirty when the user can write expenses.
          for (const k of keys) {
            markDirty(`inputs.giderler.isletme.items.${k}`, Number(patch?.[k] || 0));
          }
        }
        return next;
      });
    },
    [inputsLocked, markDirty, canWriteGiderler]
  );
  const handlePlanningGradesChange = React.useCallback(
    (v) => {
      if (inputsLocked) return;
      if (!v || typeof v !== "object") return;
      setInputs((prev) => {
        const p = prev || {};
        let next = structuredClone(p);
        next.gradesYears = v;
        if (Array.isArray(v.y1)) next.grades = structuredClone(v.y1);
        next = applyTuitionStudentCounts(next);
        return next;
      });
    },
    [applyTuitionStudentCounts, inputsLocked]
  );
  const setNormSafe = useCallback(
    (updater) => {
      if (inputsLocked) return;
      setNorm((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [inputsLocked, setNorm]
  );
  const showInputsHeader = INPUT_HEADER_TABS.has(tab);
  const exportDisabled = inputsSaving || calculating || exportingPdf || !report;
  const formatRelative = (ms) => {
    if (!ms) return "";
    const diff = Math.max(0, (nowTick || Date.now()) - ms);
    if (diff < 60000) return "az once";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk once`;
    return `${Math.floor(diff / 3600000)} saat once`;
  };

  // Determine the display label and style for a scenario based on its
  // workflow status and timestamps.  When a scenario is approved but
  // has not yet been forwarded to the central office (sent_at is null),
  // it is considered “Kontrol edildi”.  Once sent_at is set, the
  // scenario is locked and considered “Onaylandı”.  The draft state
  // optionally distinguishes “Hazırlanıyor” when progress exists, but
  // falls back to “Taslak” otherwise.
  useEffect(() => {
    if (exportDisabled) setExportOpen(false);
  }, [exportDisabled]);



  function getScenarioStageLabel(s, progressPct) {
    if (!s) return null;
    const status = String(s.status || "draft");
    // Show "Taslak" when no progress; "Hazırlanıyor" when progress exists
    if (status === "draft") {
      const pct = Number(progressPct);
      if (Number.isFinite(pct) && pct > 0) return "Hazırlanıyor";
      return "Taslak";
    }
    if (status === "in_review") return "İncelemede";
    if (status === "revision_requested") return "Revize istendi";
    if (status === "sent_for_approval" || status === "submitted") return "Merkeze iletildi";
    if (status === "approved") {
      // Sent_at indicates final approval
      if (s.sent_at) return "Onaylandı";
      return "Kontrol edildi";
    }
    return "Taslak";
  }
  function getScenarioStageClass(label) {
    switch (label) {
      case "Revize istendi":
        return "is-bad";
      case "Merkeze iletildi":
      case "İncelemede":
      case "Hazırlanıyor":
        return "is-warn";
      case "Kontrol edildi":
      case "Onaylandı":
        return "is-ok";
      case "Taslak":
      default:
        return "is-muted";
    }
  }
  function getWorkItemStageLabel(state) {
    switch (String(state || "not_started")) {
      case "approved":
        return "Kontrol edildi";
      case "needs_revision":
        return "Revize istendi";
      case "submitted":
        return "İncelemede";
      case "in_progress":
        return "Hazırlanıyor";
      default:
        return "Taslak";
    }
  }
  function getModuleStatusClass(state, scenarioStatus, scenarioSentAt) {
    if (scenarioStatus === "approved" && scenarioSentAt) {
      return "is-final";
    }
    if (["sent_for_approval", "submitted"].includes(String(scenarioStatus || ""))) {
      return "is-forwarded";
    }
    switch (String(state || "not_started")) {
      case "needs_revision":
        return "is-revision";
      case "approved":
        return "is-approved";
      case "submitted":
        return "is-review";
      case "in_progress":
      case "not_started":
      default:
        return "is-draft";
    }
  }

  function renderStickyFooter() {
    if (!showInputsHeader) return null;
    // Build module progress segments.  Each segment uses the pct from progMap
    // and averages for the combined "norm" and "gider" modules.
    const moduleKeyToWorkId = {
      temel: "temel_bilgiler",
      kapasite: "kapasite",
      norm: "norm.ders_dagilimi",
      ik: "ik.local_staff",
      gelir: "gelirler.unit_fee",
      gider: "giderler.isletme",
    };
    const getModuleWorkState = (moduleKey) => {
      if (!moduleKey) return "not_started";
      if (!workItemsLoaded) return "not_started";
      const workId = moduleKeyToWorkId[moduleKey];
      if (!workId) return "not_started";
      const item = Array.isArray(workItems)
        ? workItems.find((w) => String(w?.work_id) === String(workId))
        : null;
      return item?.state ? String(item.state) : "not_started";
    };
    const footerModules = [];
    const optionalSuffix = " (Opsiyonel)";
    if (progMap && progMap.temelBilgiler) {
      footerModules.push({
        key: "temel",
        label: isHQ ? `Temel${optionalSuffix}` : "Temel",
        labelShort: "Temel",
        pct: pctValue(progMap.temelBilgiler),
        done: progMap.temelBilgiler.done === true,
        isOptional: isHQ,
      });
    }
    if (progMap && progMap.kapasite) {
      footerModules.push({
        key: "kapasite",
        label: isHQ ? `Kapasite${optionalSuffix}` : "Kapasite",
        labelShort: "Kap",
        pct: pctValue(progMap.kapasite),
        done: progMap.kapasite.done === true,
        isOptional: isHQ,
      });
    }
    // Combine gradesPlan and norm into a single "Norm" segment.  Use normAvgPct for pct.
    const normDone = ignoreNormProgress
      ? (progMap?.gradesPlan?.done === true || progMap?.gradesPlan?.done === undefined)
      : (progMap?.gradesPlan?.done === true || progMap?.gradesPlan?.done === undefined) &&
        (progMap?.norm?.done === true || progMap?.norm?.done === undefined);
    footerModules.push({
      key: "norm",
      label: isHQ ? `Norm${optionalSuffix}` : "Norm",
      labelShort: "Norm",
      pct: Number.isFinite(normAvgPct) ? normAvgPct : 0,
      done: normDone,
      isOptional: isHQ,
    });
    if (progMap && progMap.ik) {
      footerModules.push({
        key: "ik",
        label: "IK",
        labelShort: "IK",
        pct: pctValue(progMap.ik),
        done: progMap.ik.done === true,
      });
    }
    if (progMap && progMap.gelirler) {
      footerModules.push({
        key: "gelir",
        label: "Gelir",
        labelShort: "Gel",
        pct: pctValue(progMap.gelirler),
        done: progMap.gelirler.done === true,
      });
    }
    // Combine giderler and discounts into a single "Gider" segment.  Use expensesAvgPct.
    const giderDone = isHQ
      ? (progMap?.giderler?.done === true || progMap?.giderler?.done === undefined)
      : (progMap?.giderler?.done === true || progMap?.giderler?.done === undefined) &&
        (progMap?.discounts?.done === true || progMap?.discounts?.done === undefined);
    footerModules.push({
      key: "gider",
      label: "Gider",
      labelShort: "Gid",
      pct: Number.isFinite(expensesAvgPct) ? expensesAvgPct : 0,
      done: giderDone,
    });
    const requiredModules = footerModules.filter((m) => !m.isOptional);
    const allModulesDone = requiredModules.every((m) => m.done);
    // Determine scenario progress pct for label heuristics
    const scenarioProgressPct = selectedScenario?.progress_pct;
    // Determine status pills: scenario-first when workflow advanced beyond draft,
    // but prefer module-level "approved/revision" states.
    const scenarioStageLabel = selectedScenario ? getScenarioStageLabel(selectedScenario, scenarioProgressPct) : null;
    const scenarioDisplayLabel =
      scenarioStageLabel &&
      ["İncelemede", "Revize istendi", "Merkeze iletildi", "Kontrol edildi", "Onaylandı"].includes(
        scenarioStageLabel
      )
        ? scenarioStageLabel
        : null;
    const scenarioDisplayClass = scenarioDisplayLabel ? getScenarioStageClass(scenarioDisplayLabel) : null;
    const workItemLabel = workItemsLoaded && activeWorkId ? getWorkItemStageLabel(activeWorkState) : null;
    const workItemClass = workItemLabel ? getScenarioStageClass(workItemLabel) : null;
    const hasActiveWorkLabel = Boolean(activeWorkId && workItemLabel);

    let scenarioTooltip = null;
    if (scenarioDisplayLabel === "Kontrol edildi" && selectedScenario?.checked_at) {
      const d = new Date(selectedScenario.checked_at);
      scenarioTooltip = `Kontrol: ${Number.isFinite(d.getTime()) ? d.toLocaleString() : ""}`;
    } else if (scenarioDisplayLabel === "Merkeze iletildi" && selectedScenario?.sent_at) {
      const d = new Date(selectedScenario.sent_at);
      scenarioTooltip = `İletildi: ${Number.isFinite(d.getTime()) ? d.toLocaleString() : ""}`;
    } else if (scenarioDisplayLabel === "Onaylandı" && selectedScenario?.reviewed_at) {
      const d = new Date(selectedScenario.reviewed_at);
      scenarioTooltip = `Onay: ${Number.isFinite(d.getTime()) ? d.toLocaleString() : ""}`;
    }

    let primaryPill = null;
    let secondaryPill = null;

    const scenarioIsFinal = scenarioDisplayLabel === "Merkeze iletildi" || scenarioDisplayLabel === "Onaylandı";
    const allowScenarioPill =
      scenarioIsFinal || !activeWorkId || (workItemsLoaded && scenarioMetaLoaded);
    const scenarioPillLabel = allowScenarioPill ? scenarioDisplayLabel : null;
    const scenarioPillClass = allowScenarioPill ? scenarioDisplayClass : null;
    const scenarioPillTooltip = allowScenarioPill ? scenarioTooltip : null;

    if (scenarioIsFinal && scenarioPillLabel) {
      primaryPill = { label: scenarioPillLabel, className: scenarioPillClass, tooltip: scenarioPillTooltip };
    } else if (hasActiveWorkLabel) {
      primaryPill = { label: workItemLabel, className: workItemClass };
      const suppressScenarioPill =
        (scenarioPillLabel === "Revize istendi" && activeWorkState !== "needs_revision") ||
        (scenarioPillLabel === "Kontrol edildi" && activeWorkState === "needs_revision") ||
        (scenarioPillLabel === "İncelemede" && activeWorkState === "approved");
      if (scenarioPillLabel && scenarioPillLabel !== workItemLabel && !suppressScenarioPill) {
        secondaryPill = { label: scenarioPillLabel, className: scenarioPillClass, tooltip: scenarioPillTooltip };
      }
    } else if (scenarioPillLabel) {
      primaryPill = { label: scenarioPillLabel, className: scenarioPillClass, tooltip: scenarioPillTooltip };
      if (workItemLabel && workItemLabel !== scenarioPillLabel) {
        secondaryPill = { label: workItemLabel, className: workItemClass };
      }
    } else if (workItemLabel) {
      primaryPill = { label: workItemLabel, className: workItemClass };
    }
    // Determine footer meta text
    const footerMetaBits = [];
    if (lastSavedAt) footerMetaBits.push(`Kaydedildi ${formatRelative(lastSavedAt)}`);
    if (lastCalculatedAt) footerMetaBits.push(`Hesaplandı ${formatRelative(lastCalculatedAt)}`);
    let showDebug = false;
    try {
      showDebug = window?.localStorage?.getItem("fs_debug_kpi") === "1";
    } catch (_) {
      showDebug = false;
    }
    if (showDebug) {
      const debugBits = [
        `calc:${calculating ? "1" : "0"}`,
        `lastCalc:${lastCalculatedAt ? new Date(lastCalculatedAt).toLocaleTimeString() : "none"}`,
        `report:${report ? "yes" : "no"}`,
      ];
      footerMetaBits.push(`DEBUG ${debugBits.join(" • ")}`);
    }
    const footerMetaText = footerMetaBits.join(" • ");
    const hasFooterMeta = Boolean(footerMetaText);
    // Determine primary action
    // We compute role-aware capability flags above.  The final action
    // selection must respect the following priority order:
    // 1. Admin "Onayla" > 2. Accountant/Manager "Merkeze ilet" > 3. Principal/HR "Gönder".
    const role = String(me?.role || "");
    // Build scope options for permission checks.  Include the countryId if
    // available (via the loaded school or current user) so that
    // country-scoped permissions can match.  Without a countryId, a
    // permission entry with a non-null scope_country_id will not match.
    const countryIdForScope = school?.country_id ?? me?.country_id ?? null;
    const scopeOpts = { schoolId, countryId: countryIdForScope };
    const scenarioStatus = selectedScenario?.status;
    const hasScenario = selectedScenario && selectedScenario.id;
    // Helper to check permission using can()
    const userCan = (res, action) => {
      try {
        return can(me, res, action, scopeOpts);
      } catch {
        return false;
      }
    };
    const moduleKeyToTab = {
      temel: "basics",
      kapasite: "kapasite",
      norm: "norm",
      ik: "hr",
      gelir: "income",
      gider: "expenses",
    };
    const moduleKeyToPageKey = {
      temel: "temel_bilgiler",
      kapasite: "kapasite",
      norm: "norm",
      ik: "ik",
      gelir: "gelirler",
      gider: "giderler",
    };
    const canNavigateModule = (moduleKey) => {
      const pageKey = moduleKeyToPageKey[moduleKey];
      if (!pageKey) return false;
      if (userCan(`page.${pageKey}`, "read")) return true;
      const perms = Array.isArray(me?.permissions) ? me.permissions : [];
      const countryId = scopeOpts.countryId;
      return perms.some((perm) => {
        if (perm.action !== "read" && perm.action !== "write") return false;
        const res = String(perm.resource || "");
        if (!res.startsWith(`section.${pageKey}.`)) return false;
        const permCountry = perm.scope_country_id != null ? Number(perm.scope_country_id) : null;
        const permSchool = perm.scope_school_id != null ? Number(perm.scope_school_id) : null;
        if (permCountry != null && countryId != null && Number(permCountry) !== Number(countryId)) return false;
        if (permSchool != null && schoolId != null && Number(permSchool) !== Number(schoolId)) return false;
        if (permSchool != null && schoolId == null) return false;
        if (permCountry != null && countryId == null) return false;
        return true;
      });
    };
    // Determine if user can perform scenario-level or module-level actions
    // Scenario can only be sent when the active module is completed.
    // Map active work ID to internal module key and to page permission resource
    const workIdToKey = {
      "temel_bilgiler": "temel",
      "kapasite": "kapasite",
      "norm.ders_dagilimi": "norm",
      "ik.local_staff": "ik",
      "gelirler.unit_fee": "gelir",
      "giderler.isletme": "gider",
    };
    // Define the potential permission resources for each work item.  A module may
    // have both a page-level and a section-level resource; having write
    // permission on any of these resources allows the user to submit the
    // module.  The order is from most specific (section-level) to page-level.
    const workIdToWriteResources = {
      "temel_bilgiler": ["page.temel_bilgiler"],
      "kapasite": ["section.kapasite.caps", "page.kapasite"],
      "norm.ders_dagilimi": ["section.norm.ders_dagilimi", "page.norm"],
      "ik.local_staff": ["section.ik.local_staff", "page.ik"],
      "gelirler.unit_fee": ["section.gelirler.unit_fee", "page.gelirler"],
      "giderler.isletme": ["section.giderler.isletme", "page.giderler"],
    };
    const activeModuleKey = workIdToKey[String(activeWorkId || "")] || null;
    const activeModuleObj = footerModules.find((m) => m.key === activeModuleKey);
    const activeModuleDone = activeModuleObj ? activeModuleObj.done === true : false;
    // Determine whether the user may attempt to submit (at least show the button).
    // Principals/HR may submit when the scenario is in draft, in_review, or revision_requested.
    // We only check module write permission and activeWorkId when enabling the button.
    const canSubmitScenarioBase =
      hasScenario &&
      ["draft", "in_review", "revision_requested"].includes(scenarioStatus) &&
      (role === "principal" || role === "hr" || role === "manager" || role === "accountant");
    // Map active work ID to the corresponding page permission resource (if any)
    const writeResources = activeWorkId ? workIdToWriteResources[String(activeWorkId)] || [] : [];
    const userHasModuleWrite = writeResources.some((res) => {
      try {
        return userCan(res, "write");
      } catch {
        return false;
      }
    });
    // Full submit flag: base permission and active module completed
    // Determine if the user can actually submit the module right now.
    // Must have base submit rights, an active work item, write permission on that module, and the module must be completed.
    const canForwardScenario =
      hasScenario &&
      (role === "accountant" || role === "manager" || userCan("scenario.forward", "write")) &&
      scenarioStatus === "approved" &&
      !selectedScenario?.sent_at &&
      selectedScenario?.checked_at;
    const canApproveScenario =
      hasScenario &&
      (role === "admin" || userCan("admin.scenario.review", "write")) &&
      scenarioStatus === "sent_for_approval";
    const canReviewWorkItem =
      hasScenario &&
      activeWorkId &&
      activeWorkState === "submitted" &&
      (role === "admin" ||
        role === "manager" ||
        role === "accountant" ||
        userCan("page.manage_permissions", "read") ||
        userCan("page.manage_permissions", "write"));
    const reviewDisabled =
      reviewingWorkItem || inputsSaving || calculating || inputsDirty;
    let reviewTooltip = "Modülü onayla";
    if (inputsDirty) {
      reviewTooltip = "Önce değişiklikleri kaydedin.";
    } else if (inputsSaving) {
      reviewTooltip = "Kaydetme devam ediyor.";
    } else if (calculating) {
      reviewTooltip = "Hesaplama devam ediyor.";
    } else if (reviewingWorkItem) {
      reviewTooltip = "Onaylanıyor...";
    }

    // Calculate button permission: user must have write permissions on *all* modules
    // Define the list of module page resources that correspond to scenario modules.
    const moduleResources = [
      "page.temel_bilgiler",
      "page.kapasite",
      "page.norm",
      "page.ik",
      "page.gelirler",
      "page.giderler",
    ];
    const hasAllModuleWritePermissions = moduleResources.every((res) => {
      try {
        return can(me, res, "write", scopeOpts);
      } catch {
        return false;
      }
    });
    // Determine disabled reasons
    const primaryTooltipReasons = [];
    let primaryDisabled = true;
    let primaryLabel = "";
    let primaryIcon = null;
    let primaryOnClick = null;
    // We evaluate actions in priority: Admin > Manager > Principal.
    if (canApproveScenario) {
      // Admin final approval
      primaryLabel = "Onayla";
      primaryIcon = <FaCheckCircle aria-hidden="true" />;
      primaryDisabled = false;
      // Admin page rarely allows editing; still guard against concurrent save/calc
      if (inputsSaving) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Kaydetme devam ediyor.");
      }
      if (calculating) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Hesaplama devam ediyor.");
      }
      if (!primaryDisabled) {
        primaryOnClick = async () => {
          try {
            await api.adminReviewScenario(selectedScenario.id, { action: "approve" });
            toast.success("Onaylandı");
            await refreshWorkItems();
            await refreshScenarioMeta();
          } catch (e) {
            toast.error(e?.message || "Onay başarısız");
          }
        };
      }
    } else if (canForwardScenario) {
      // Accountant/manager forward to admin
      primaryLabel = "Merkeze ilet";
      primaryIcon = <FaPaperPlane aria-hidden="true" />;
      primaryDisabled = false;
      // disallow if modules incomplete or there are pending changes or locks
      if (!allModulesDone) {
        primaryDisabled = true;
        const incomplete = footerModules.filter((m) => !m.done && !m.isOptional);
        primaryTooltipReasons.push(
          "Tüm modüller tamamlanmalı: " +
            incomplete.map((m) => `${m.label} ${m.pct}%`).join(", ")
        );
      }
      if (inputsDirty) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Önce değişiklikleri kaydedin.");
      }
      if (inputsSaving) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Kaydetme devam ediyor.");
      }
      if (calculating) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Hesaplama devam ediyor.");
      }
      if (scenarioLocked) {
        primaryDisabled = true;
        primaryTooltipReasons.push("Senaryo kilitli.");
      }
      if (!primaryDisabled) {
        primaryOnClick = async () => {
          try {
            if (!ensurePrevRealFxForLocal("Hesaplama")) return;
            if (!ensurePlanningStudentsForY2Y3("Hesaplama")) return;
            // Save and recalc if needed
            if (inputsDirty) {
              const ok = await saveInputs();
              if (!ok) return;
            }
            // Always calculate before sending so KPIs are up to date
            const calcOk = await calculate({ keepTab: true });
            if (!calcOk) return;
            await api.sendForApproval(schoolId, selectedScenario.id);
            toast.success("Merkeze iletildi");
            await refreshWorkItems();
            await refreshScenarioMeta();
          } catch (e) {
            const reasons = Array.isArray(e?.data?.reasons) ? e.data.reasons.filter(Boolean) : [];
            if (e?.status === 409 && reasons.length) {
              toast.warn(`Merkeze iletilemez: ${reasons.join(", ")}`);
            } else {
              toast.error(e?.message || "İletme başarısız");
            }
          }
        };
      }
    } else if (canSubmitScenarioBase) {
      // Principal/HR submit to manager (module-level). Show button even if disabled.
      primaryLabel = "Gönder";
      primaryIcon = <FaPaperPlane aria-hidden="true" />;
      primaryDisabled = false;
      // Validate prerequisites for module submission.  If any check fails we still show
      // the button but keep it disabled with an explanatory tooltip.
      if (!activeWorkId) {
        primaryDisabled = true;
        primaryTooltipReasons.push("G?nderilecek bir mod?l yok.");
      }
      const isOptionalModule = activeWorkId && !isActiveRequired;
      if (isOptionalModule) {
        primaryDisabled = true;
        primaryTooltipReasons.push("HQ senaryoda bu mod?l opsiyonel; g?nderilmesi gerekmiyor.");
      } else {
        // User must have write permission on the active module's resource (page or section).
        if (activeWorkId && !userHasModuleWrite) {
          primaryDisabled = true;
          primaryTooltipReasons.push("Bu mod?l? g?nderme yetkiniz yok.");
        }
        // Module must be in a state that allows submission (not submitted or approved).
        if (activeWorkId && !canSubmitWorkItem) {
          primaryDisabled = true;
          primaryTooltipReasons.push(moduleLockReason || "Mod?l g?nderilemez");
        }
        // Module must be completed before sending.
        if (!activeModuleDone) {
          primaryDisabled = true;
          primaryTooltipReasons.push("Bu mod?l tamamlanmal?.");
        }
        // Cannot submit while there are unsaved changes.
        if (inputsDirty) {
          primaryDisabled = true;
          primaryTooltipReasons.push("?nce de?i?iklikleri kaydedin.");
        }
        if (inputsSaving) {
          primaryDisabled = true;
          primaryTooltipReasons.push("Kaydetme devam ediyor.");
        }
        if (calculating) {
          primaryDisabled = true;
          primaryTooltipReasons.push("Hesaplama devam ediyor.");
        }
        if (scenarioLocked) {
          primaryDisabled = true;
          primaryTooltipReasons.push("Senaryo kilitli.");
        }
      }
      if (!primaryDisabled && activeWorkId && userHasModuleWrite && canSubmitWorkItem && activeModuleDone) {
        // For module-level submission, submit only the active work item.
        primaryOnClick = async () => {
          await submitActiveWorkItem();
        };
      }
    }
    const primaryTooltip =
      primaryTooltipReasons.length > 0 ? primaryTooltipReasons.join(" • ") : undefined;
    // Determine calculate and export labels as before
    const hasReport = Boolean(report);
    const calculateLabel = inputsDirty ? "Kaydet & Hesapla" : hasReport ? "Yeniden Hesapla" : "Hesapla";
    const exportLabel = exportingPdf ? "PDF hazirlaniyor..." : "Disa Aktar";
    const showExportButton = tab === "report" || hasReport;
    return (
      <div className="school-sticky-footer" role="region" aria-label="Scenario actions">
        <div className="school-sticky-footer-inner">
          <div className="school-footer-left">
            {/* Status chips */}
            <div className="school-footer-pills" role="status" aria-live="polite">
              {primaryPill ? (
                <span className={`school-pill ${primaryPill.className}`} title={primaryPill.tooltip}>
                  {primaryPill.label}
                </span>
              ) : null}
              {secondaryPill ? (
                <span className={`school-pill ${secondaryPill.className}`} title={secondaryPill.tooltip}>
                  {secondaryPill.label}
                </span>
              ) : null}
              {inputs ? (
                <span
                  className={`school-pill is-warn ${inputsDirty ? "" : "is-placeholder"}`}
                  title={inputsDirty ? "Kaydedilmemiş değişiklikler var" : undefined}
                  aria-hidden={inputsDirty ? undefined : "true"}
                >
                  ● Değişiklik var
                </span>
              ) : null}
            </div>
            {inputs ? (
              <div
                className={`school-footer-meta small ${hasFooterMeta ? "" : "is-placeholder"}`}
                title={hasFooterMeta ? footerMetaText : undefined}
                aria-hidden={hasFooterMeta ? undefined : "true"}
              >
                {hasFooterMeta ? footerMetaText : "Kaydedildi"}
              </div>
            ) : null}
          </div>

      {inputs ? (
        <>
          {/* Middle section: progress bar sits in its own container between status and buttons */}
          <div className="school-footer-middle">
            <div className="module-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">
              {footerModules.map((m) => {
                const tabKey = moduleKeyToTab[m.key];
                const canNav = Boolean(tabKey && canNavigateModule(m.key));
                const isActive = activeModuleKey === m.key;
                const workState = getModuleWorkState(m.key);
                const statusClass = getModuleStatusClass(
                  workState,
                  selectedScenario?.status,
                  selectedScenario?.sent_at
                );
                const SegmentTag = canNav ? "button" : "div";
                return (
                  <SegmentTag
                    key={m.key}
                    type={canNav ? "button" : undefined}
                    onClick={canNav ? () => setTab(tabKey) : undefined}
                    className={`module-seg ${canNav ? "is-clickable" : ""} ${isActive ? "is-active" : ""}`}
                    title={`${m.label}: ${Math.round(m.pct)}% ${m.done ? "Tamamlandı" : "Eksik"}`}
                    aria-disabled={canNav ? undefined : "true"}
                  >
                    <div className="module-title">{m.labelShort}</div>
                    <div className="module-bar">
                      <div
                        className={`module-fill ${statusClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, Math.round(m.pct)))}%` }}
                      />
                      <span className="module-percent">{Math.round(m.pct)}%</span>
                    </div>
                  </SegmentTag>
                );
              })}
            </div>
          </div>
          {/* Right section: action buttons aligned to the far right */}
          <div className="school-footer-right">
            {canReviewWorkItem ? (
              <Tooltip lines={reviewTooltip ? [reviewTooltip] : []}>
                <button
                  type="button"
                  className="topbar-btn is-primary"
                  onClick={() => reviewActiveWorkItem("approve")}
                  disabled={reviewDisabled}
                  title={reviewTooltip}
                >
                  <FaCheckCircle aria-hidden="true" />
                  <span>{reviewingWorkItem ? "Onaylanıyor..." : "Onayla"}</span>
                </button>
              </Tooltip>
            ) : null}
            {primaryLabel ? (
              <Tooltip lines={primaryTooltip ? [primaryTooltip] : []}>
                <button
                  type="button"
                  className="topbar-btn is-primary"
                  onClick={primaryOnClick}
                  disabled={primaryDisabled}
                  title={primaryTooltip}
                >
                  {primaryIcon}
                  <span>{primaryLabel}</span>
                </button>
              </Tooltip>
            ) : null}
            <button
              type="button"
              className={"topbar-btn " + (inputsDirty && !inputsSaving ? "is-save" : "is-ghost")}
              onClick={saveInputs}
              disabled={!inputsDirty || inputsSaving || inputsLocked}
              title={
                inputsLocked
                  ? inputsLockedReason
                  : inputsDirty
                    ? "Değişiklikleri kaydet"
                    : "Kaydedilecek değişiklik yok"
              }
            >
              <FaSave aria-hidden="true" />
              <span>{inputsSaving ? "Kaydediliyor..." : inputsDirty ? "Kaydet" : "Kaydedildi"}</span>
            </button>

            {hasAllModuleWritePermissions ? (
              <button
                type="button"
                className="topbar-btn is-primary"
                onClick={async () => {
                  if (inputsSaving || calculating) return;
                  if (!ensurePrevRealFxForLocal("Hesaplama")) return;
                  if (!ensurePlanningStudentsForY2Y3("Hesaplama")) return;
                  if (inputsDirty) {
                    const ok = await saveInputs();
                    if (ok) await calculate();
                    return;
                  }
                  await calculate();
                }}
                disabled={inputsSaving || calculating}
                title={calculateLabel}
              >
                <FaCalculator aria-hidden="true" />
                <span>{calculating ? "Hesaplanıyor..." : calculateLabel}</span>
              </button>
            ) : null}

            {showExportButton ? (
              <div className="action-menu" ref={exportMenuRef}>
                <button
                  type="button"
                  className={`topbar-btn is-ghost ${exportingPdf ? "is-loading" : ""}`}
                  onClick={() => {
                    if (exportDisabled) return;
                    setExportOpen((prev) => !prev);
                  }}
                  disabled={exportDisabled}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  aria-busy={exportingPdf ? "true" : undefined}
                >
                  {exportingPdf ? <span className="pdf-export-spinner" aria-hidden="true" /> : null}
                  {!exportingPdf ? <FaFileExport aria-hidden="true" /> : null}
                  <span>{exportLabel}</span>
                </button>

                {exportOpen ? (
                  <div className="action-menu-panel action-menu-panel--up" role="menu">
                    <button
                      type="button"
                      className="action-menu-item"
                      onClick={() => {
                        setExportOpen(false);
                        handleExport();
                      }}
                      disabled={exportDisabled}
                      role="menuitem"
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      className="action-menu-item"
                      onClick={() => {
                        setExportOpen(false);
                        handleExportPdf();
                      }}
                      disabled={exportDisabled}
                      role="menuitem"
                    >
                      PDF (.pdf)
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="school-footer-right">
          <div className="school-footer-hint small">Önce bir senaryo seçin.</div>
        </div>
      )}
        </div>
      </div>
    );
  }

  const outletContextValue = {
    schoolId,
    school,
    me,
    inputs,
    setField,
    norm,
    setNorm: setNormSafe,
    handlePlanningGradesChange,
    dirtyPaths,
    markDirty,
    baseYear,
    programType,
    inputCurrencyCode,
    selectedScenario,
    prevReport,
    prevScenarioMeta,
    report,
    reportCurrency,
    setReportCurrency,
    reportMode,
    reportModeLoading,
    handleReportModeChange,
    detailedReportMode,
    setDetailedReportMode,
    reportExportRef,
    progMap,
    normAvgPct,
    expensesAvgPct,
    normMissingLines,
    expensesMissingLines,
    uiScopeKey,
    handleIkSalaryComputed,

    // Work item workflow context
    workItems,
    refreshWorkItems,
    submitWorkItem,
  };

  return (
    <div className="container school-page">
      <ToastContainer position="bottom-right" autoClose={3500} newestOnTop closeOnClick pauseOnFocusLoss pauseOnHover hideProgressBar theme="dark" />
      <style>{`@keyframes schoolSpin{to{transform:rotate(360deg)}}`}</style>
      {bootLoading ? (
        <div className="modal-backdrop" role="status" aria-live="polite" aria-busy="true">
          <div
            className="card"
            style={{
              width: "min(420px, 92vw)",
              padding: "18px 16px",
              textAlign: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                margin: "0 auto",
                borderRadius: "50%",
                border: "3px solid rgba(0,0,0,.15)",
                borderTopColor: "rgba(0,0,0,.75)",
                animation: "schoolSpin .8s linear infinite",
              }}
            />
            <div style={{ fontWeight: 800, marginTop: 12 }}>
              {bootLoadingLabel || "Yukleniyor..."}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Lutfen bekleyin...
            </div>
          </div>
        </div>
      ) : null}

      {err ? (
        <div
          className="card"
          style={{
            marginTop: 10,
            background: "#fff1f2",
            borderColor: "#fecaca",
          }}
        >
          {err}
        </div>
      ) : null}

      {!selectedScenarioId ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Okul & Senaryo Sec</div>
          <div className="small" style={{ marginTop: 6 }}>
            Bu bolumu acmak icin once okul ve senaryo secin.
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12 }}
            onClick={() => navigate(`/select?schoolId=${schoolId}`)}
          >
            Okul & Senaryo Sec
          </button>
        </div>
      ) : (
        <Outlet context={outletContextValue} />
      )}
      {renderStickyFooter()}
    </div>
  );
}

