// frontend/src/pages/SchoolPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FaCheck, FaCopy, FaEdit, FaPaperPlane, FaTrash } from "react-icons/fa";
import { api } from "../api";
import TabBadge from "../components/ui/TabBadge";
import Tooltip from "../components/ui/Tooltip";
import TabProgressHeatmap from "../components/ui/TabProgressHeatmap";
import IncomeEditor from "../components/IncomeEditor";
import ExpensesEditor from "../components/ExpensesEditor";
import NormConfigEditor from "../components/NormConfigEditor";
import ReportView from "../components/ReportView";
import HREditorIK from "../components/HREditorIK";
import CapacityEditor from "../components/CapacityEditor";
import TemelBilgilerEditor from "../components/TemelBilgilerEditor";
import {
  getDefaultKademeConfig,
  getKademeDefinitions,
  getGradeOptions,
  normalizeKademeConfig,
  summarizeGradesByKademe,
} from "../utils/kademe";
import { computeScenarioProgress } from "../utils/scenarioProgress";
import { useScenarioUiState, useScenarioUiString } from "../hooks/useScenarioUIState";



const TABS = [
  { key: "scenarios", label: "Senaryolar" },
  { key: "basics", label: "Temel Bilgiler" },
  { key: "kapasite", label: "Kapasite" },
  { key: "norm", label: "Norm" },
  { key: "hr", label: "İK (HR)" },
  { key: "income", label: "Gelirler" },
  { key: "expenses", label: "Giderler" },
  { key: "report", label: "Rapor" },
];

const UI_TAB_PROGRESS_KEYS = {
  basics: ["temelBilgiler"],
  kapasite: ["kapasite"],
  norm: ["gradesPlan", "norm"],
  hr: ["ik"],
  income: ["gelirler"],
  expenses: ["giderler", "indirimler"],
};

const INPUT_HEADER_TABS = new Set(["basics", "kapasite", "income", "expenses", "norm", "hr", "report"]);

const DEFAULT_START_YEAR = "2026";
const DEFAULT_END_YEAR = "2027";
const CURRENCY_CODE_REGEX = /^[A-Z0-9]{2,10}$/;
const LOCAL_CURRENCY_OPTIONS = ["USD", "EUR", "TRY", "GBP", "JPY", "CNY", "INR", "RUB", "AED", "SAR", "AFN"];

function normalizeYearInput(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}$/.test(s)) return null;
  return Number(s);
}

function formatAcademicYear(periodType, startYearValue, endYearValue) {
  const start = normalizeYearInput(startYearValue);
  if (!start) return "";
  if (periodType === "full") return String(start);
  const end = normalizeYearInput(endYearValue);
  if (!end) return "";
  return `${start}-${end}`;
}

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

function incrementAcademicYearString(academicYear) {
  const raw = String(academicYear || "").trim();
  const single = raw.match(/^(\d{4})$/);
  if (single) {
    const start = Number(single[1]);
    return Number.isFinite(start) ? String(start + 1) : "";
  }
  const range = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) return `${start + 1}-${end + 1}`;
  }
  return "";
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

export default function SchoolPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const schoolId = Number(id);

  const [school, setSchool] = useState(null);
  const [err, setErr] = useState("");

  // user profile (region, country, etc.)
  const [me, setMe] = useState(null);

  useEffect(() => {
    const base = "Feasibility Studio";
    document.title = school?.name ? `${school.name} · ${base}` : `School · ${base}`;
  }, [school?.name]);

  // selected scenario meta + previous year report
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [prevReport, setPrevReport] = useState(null);

  // norm
  const [norm, setNorm] = useState(null);
  const [progressConfig, setProgressConfig] = useState(null);

  // scenarios
  const [scenarios, setScenarios] = useState([]);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioPeriod, setNewScenarioPeriod] = useState("split");
  const [newScenarioStartYear, setNewScenarioStartYear] = useState(DEFAULT_START_YEAR);
  const [newScenarioEndYear, setNewScenarioEndYear] = useState(DEFAULT_END_YEAR);
  const [newScenarioKademeler, setNewScenarioKademeler] = useState(getDefaultKademeConfig());
  const [newScenarioInputCurrency, setNewScenarioInputCurrency] = useState("USD");
  const [newScenarioLocalCurrencyCode, setNewScenarioLocalCurrencyCode] = useState("");
  const [newScenarioFxUsdToLocal, setNewScenarioFxUsdToLocal] = useState("");
  const [newScenarioStep, setNewScenarioStep] = useState(0);
  const [scenarioWizardOpen, setScenarioWizardOpen] = useState(false);
  const [scenarioWizardMode, setScenarioWizardMode] = useState("create");
  const [scenarioWizardScenario, setScenarioWizardScenario] = useState(null);
  const [scenarioWizardLoading, setScenarioWizardLoading] = useState(false);
  const [scenarioWizardSaving, setScenarioWizardSaving] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useScenarioUiState(
    "school.selectedScenarioId",
    null,
    { scope: `school:${schoolId}` }
  );
  // inputs
  const [inputs, setInputs] = useState(null);
  const [inputsSaving, setInputsSaving] = useState(false);
  const [confirmTabChange, setConfirmTabChange] = useState(null);
  const [dirtyPaths, setDirtyPaths] = useState(() => new Set());
  const [baselineInputs, setBaselineInputs] = useState(null);
  const [baselineNorm, setBaselineNorm] = useState(null);
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
  const [submittingScenarioId, setSubmittingScenarioId] = useState(null);
  const [copyingScenarioId, setCopyingScenarioId] = useState(null);
  // --- Modern scrollable tabs helpers ---
  const tabsScrollRef = useRef(null);
  const [tabsScroll, setTabsScroll] = useState({ left: false, right: false });
  // Page boot loading (used to show a spinner while auto-starting the scenario wizard)
  const [bootLoading, setBootLoading] = useState(true);
  const [bootLoadingLabel, setBootLoadingLabel] = useState("Okul açılıyor...");

  const uiScopeKey = useMemo(
    () => `school:${schoolId}:scenario:${selectedScenarioId ?? "none"}`,
    [schoolId, selectedScenarioId]
  );
  const [reportCurrency, setReportCurrency] = useScenarioUiState("report.currency", "usd", { scope: uiScopeKey });
  const [tab, setTab] = useScenarioUiString("school.activeTab", "scenarios", { scope: uiScopeKey });
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("open") !== "1") return;
    setTab("scenarios");
    params.delete("open");
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate, setTab]);

  useEffect(() => {
    autoScenarioWizardOpenedRef.current = false;
    setBootLoading(true);
    setBootLoadingLabel("Okul açılıyor...");
  }, [schoolId]);

  // Auto-open "Yeni Senaryo" wizard once when the school has zero scenarios.
  // Reset when the schoolId changes.
  const autoScenarioWizardOpenedRef = useRef(false);

  useEffect(() => {
    autoScenarioWizardOpenedRef.current = false;
  }, [schoolId]);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;

    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setTabsScroll({ left, right });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);

    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, []);

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


  const scrollTabsBy = (dx) => {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  };


  const scenarioYears = parseAcademicYear(selectedScenario?.academic_year);
  const baseYear = scenarioYears.startYear;
  const draftStartYear = normalizeYearInput(newScenarioStartYear);
  const draftEndYear = normalizeYearInput(newScenarioEndYear);
  const draftAcademicYear = formatAcademicYear(newScenarioPeriod, newScenarioStartYear, newScenarioEndYear);
  const draftRangeOk = newScenarioPeriod === "full" || (draftStartYear != null && draftEndYear === draftStartYear + 1);
  const yearConflict = useMemo(() => {
    if (!draftAcademicYear) return false;
    const excludeId =
      scenarioWizardMode === "edit"
        ? Number(scenarioWizardScenario?.id || selectedScenarioId || 0)
        : null;
    return scenarios.some(
      (s) =>
        String(s?.academic_year || "").trim() === String(draftAcademicYear).trim() &&
        (excludeId == null || Number(s?.id) !== excludeId)
    );
  }, [draftAcademicYear, scenarios, scenarioWizardMode, scenarioWizardScenario?.id, selectedScenarioId]);

  const draftKademeConfig = useMemo(() => normalizeKademeConfig(newScenarioKademeler), [newScenarioKademeler]);
  const hasEnabledKademe = useMemo(
    () => Object.values(draftKademeConfig).some((row) => row && row.enabled),
    [draftKademeConfig]
  );
  const normalizedLocalCode = String(newScenarioLocalCurrencyCode || "").trim().toUpperCase();
  const localCodeOk = newScenarioInputCurrency !== "LOCAL" || CURRENCY_CODE_REGEX.test(normalizedLocalCode);
  const fxValue = Number(newScenarioFxUsdToLocal);
  const fxOk = newScenarioInputCurrency !== "LOCAL" || (Number.isFinite(fxValue) && fxValue > 0);
  const currencyStepOk = newScenarioInputCurrency === "USD" || (localCodeOk && fxOk);
  const draftReady =
    Boolean(newScenarioName.trim()) &&
    Boolean(draftAcademicYear) &&
    draftRangeOk &&
    !yearConflict &&
    hasEnabledKademe &&
    currencyStepOk;
  const scenarioStepTotal = 5;
  const scenarioStepLabels = ["Donem Turu", "Para Birimi", "Yil", "Kademeler", "Senaryo Adi"];
  const scenarioStepOk = [
    true,
    currencyStepOk,
    Boolean(draftAcademicYear) && draftRangeOk && !yearConflict,
    hasEnabledKademe,
    draftReady,
  ];
  const inputCurrencyCode =
    selectedScenario?.input_currency === "LOCAL"
      ? (selectedScenario.local_currency_code || "LOCAL")
      : "USD";

  const kademeDefs = useMemo(() => getKademeDefinitions(), []);
  const gradeOptions = useMemo(() => getGradeOptions(), []);

  const scenarioProgress = useMemo(
    () => computeScenarioProgress({ inputs, norm, config: progressConfig }),
    [inputs, norm, progressConfig]
  );
  const progMap = useMemo(
    () => Object.fromEntries((scenarioProgress?.tabs || []).map((t) => [t.key, t])),
    [scenarioProgress]
  );
  const normAvgPct = useMemo(() => {
    const a = pctValue(progMap.gradesPlan);
    const b = pctValue(progMap.norm);
    return Math.round((a + b) / 2);
  }, [progMap]);
  const expensesAvgPct = useMemo(() => {
    const a = pctValue(progMap.giderler);
    const b = pctValue(progMap.indirimler);
    return Math.round((a + b) / 2);
  }, [progMap]);
  const normMissingLines = useMemo(
    () => mergeMissingLines(progMap.gradesPlan?.missingLines, progMap.norm?.missingLines),
    [progMap]
  );
  const expensesMissingLines = useMemo(
    () => mergeMissingLines(progMap.giderler?.missingLines, progMap.indirimler?.missingLines),
    [progMap]
  );
  const tabHeaderPctMap = useMemo(
    () => ({
      basics: pctValue(progMap.temelBilgiler),
      kapasite: pctValue(progMap.kapasite),
      norm: normAvgPct,
      hr: pctValue(progMap.ik),
      income: pctValue(progMap.gelirler),
      expenses: expensesAvgPct,
    }),
    [progMap, normAvgPct, expensesAvgPct]
  );
  const uiTabProgress = useMemo(() => {
    const map = new Map();
    (scenarioProgress?.tabs || []).forEach((t) => map.set(t.key, t));
    const out = {};
    Object.entries(UI_TAB_PROGRESS_KEYS).forEach(([uiKey, keys]) => {
      let done = true;
      const missing = [];
      keys.forEach((key) => {
        const tab = map.get(key);
        if (!tab) {
          done = false;
          return;
        }
        if (!tab.done) {
          done = false;
          if (Array.isArray(tab.missingLines) && tab.missingLines.length) {
            missing.push(...tab.missingLines);
          } else if (tab.missingPreview) {
            missing.push(tab.missingPreview);
          }
        }
      });
      out[uiKey] = {
        done,
        missingReasons: Array.from(new Set(missing.filter(Boolean))),
      };
    });
    return out;
  }, [scenarioProgress]);
  const showScenarioProgress = Boolean(selectedScenarioId && inputs);

  // A) Helper: HR(İK) -> Expenses(İşletme) 5 salary rows auto patch (uses 1.Yıl / y1)
  const applyIkSalariesToGiderler = (inInputs) => {
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

    const levels = [
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
  };

  const normalizeCapacityInputs = (src) => {
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
  };


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
        gerceklesen: { ogrenciSayisi: 0, gelirler: 0, giderler: 0, karZararOrani: 0, bursVeIndirimler: 0 },
      },
      degerlendirme: typeof t.degerlendirme === "string" ? t.degerlendirme : "",
    };

    return next;
  };

  const normalizeGradesInputs = (src) => {
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
  };

  const applyTuitionStudentCounts = (src) => {
    const s = src && typeof src === "object" ? src : {};
    const grades = s?.gradesYears?.y1 || s?.grades || [];
    const sums = summarizeGradesByKademe(grades, s?.temelBilgiler?.kademeler);
    const map = {
      okulOncesi: Number(sums.okulOncesi || 0),
      ilkokulYerel: Number(sums.ilkokul || 0),
      ortaokulYerel: Number(sums.ortaokul || 0),
      liseYerel: Number(sums.lise || 0),
      ilkokulInt: 0,
      ortaokulInt: 0,
      liseInt: 0,
    };

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
      Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
    );

    if (!tuitionSync.changed) return s;

    const next = structuredClone(s);
    next.gelirler = next.gelirler || {};
    if (tuitionSync.changed) {
      next.gelirler.tuition = next.gelirler.tuition || {};
      next.gelirler.tuition.rows = tuitionSync.rows;
    }
    return next;
  };


  async function loadAll() {
    setErr("");
    setBootLoading(true);
    setBootLoadingLabel("Okul açılıyor...");
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

      const n = await api.getNormConfig(schoolId);
      setNorm(n);
      setBaselineNorm(n ? structuredClone(n) : null);
      clearDirtyPrefix("norm.");

      setBootLoadingLabel("Senaryolar kontrol ediliyor...");
      const sc = await api.listScenarios(schoolId);
      setScenarios(sc);
      if (sc.length === 0 && !autoScenarioWizardOpenedRef.current) {
        setBootLoadingLabel("Yeni senaryo başlatılıyor...");
        autoScenarioWizardOpenedRef.current = true;
        setTab("scenarios");
        openScenarioWizardCreate();
        setBootLoading(false);
        return;
      }



      if (sc.length) {
        const exists =
          selectedScenarioId != null && sc.some((x) => String(x.id) === String(selectedScenarioId));
        if (!exists) setSelectedScenarioId(sc[0].id);
      } setBootLoading(false);

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

  async function refreshScenarios() {
    try {
      const sc = await api.listScenarios(schoolId);
      setScenarios(sc);
      if (selectedScenarioId != null) {
        const current = sc.find((x) => String(x.id) === String(selectedScenarioId));
        if (current) {
          setSelectedScenario((prev) => ({ ...(prev || {}), ...current }));
        }
      }
      return sc;
    } catch (_) {
      return null;
    }
  }

  useEffect(() => {
    loadAll(); /* eslint-disable-next-line */
  }, [schoolId]);

  useEffect(() => {
    async function loadScenario() {
      if (!selectedScenarioId) return;
      setErr("");
      setReport(null);
      setLastSavedAt(null);
      setLastCalculatedAt(null);
      try {
        const data = await api.getScenarioInputs(schoolId, selectedScenarioId);

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
      } catch (e) {
        setErr(e.message || "Failed to load scenario inputs");
      }
    }
    loadScenario();
  }, [schoolId, selectedScenarioId]);

  useEffect(() => {
    const isLocal =
      selectedScenario?.input_currency === "LOCAL" &&
      Number(selectedScenario?.fx_usd_to_local) > 0 &&
      selectedScenario?.local_currency_code;
    if (!isLocal && reportCurrency !== "usd") {
      setReportCurrency("usd");
    }
  }, [selectedScenario?.input_currency, selectedScenario?.fx_usd_to_local, selectedScenario?.local_currency_code, reportCurrency, setReportCurrency]);

  function getPrevAcademicYear(academicYear) {
    const { startYear, endYear } = parseAcademicYear(academicYear);
    if (!startYear) return "";
    if (endYear && endYear !== startYear) return `${startYear - 1}-${endYear - 1}`;
    return String(startYear - 1);
  }

  // Load previous year's report (used in TEMEL BİLGİLER: performans planlanan)
  useEffect(() => {
    async function loadPrev() {
      try {
        setPrevReport(null);
        const year = selectedScenario?.academic_year;
        if (!year || !scenarios?.length) return;

        const prevYear = getPrevAcademicYear(year);
        if (!prevYear) return;

        const prevScenario = scenarios.find((s) => String(s.academic_year) === String(prevYear));
        if (!prevScenario) return;

        const data = await api.calculateScenario(schoolId, prevScenario.id);
        setPrevReport(data?.results || null);
      } catch (_) {
        setPrevReport(null);
      }
    }
    loadPrev();
  }, [schoolId, selectedScenario?.academic_year, scenarios]);

  const handleScenarioCurrencyChange = (next) => {
    setNewScenarioInputCurrency(next);
    if (next !== "LOCAL") {
      setNewScenarioLocalCurrencyCode("");
      setNewScenarioFxUsdToLocal("");
    }
  };

  function getScenarioStepError(step) {
    if (step === 1) {
      if (newScenarioInputCurrency === "LOCAL") {
        if (!localCodeOk) return "Local currency code zorunludur.";
        if (!fxOk) return "Kur degeri zorunlu ve 0'dan buyuk olmali.";
      }
    }
    if (step === 2) {
      if (!draftAcademicYear) return "Lütfen geçerli bir akademik yıl girin.";
      if (!draftRangeOk) return "Bitiş yılı, başlangıç yılından 1 fazla olmalı.";
      if (yearConflict) return "Bu yıl türü için zaten bir senaryo var. Lütfen başka bir yıl seçin.";
    }
    if (step === 3 && !hasEnabledKademe) return "En az bir kademe seçmelisiniz.";
    if (step === 4 && !newScenarioName.trim()) return "Senaryo adı zorunludur.";
    return "";
  }

  function goScenarioNext() {
    setErr("");
    if (scenarioWizardSaving) return;
    const msg = getScenarioStepError(newScenarioStep);
    if (msg) {
      setErr(msg);
      return;
    }
    if (newScenarioStep < scenarioStepTotal - 1) {
      setNewScenarioStep((prev) => Math.min(prev + 1, scenarioStepTotal - 1));
      return;
    }
    submitScenarioWizard();
  }

  function goScenarioBack() {
    setErr("");
    setNewScenarioStep((prev) => Math.max(0, prev - 1));
  }

  function resetScenarioWizard() {
    setNewScenarioName("");
    setNewScenarioPeriod("split");
    setNewScenarioStartYear(DEFAULT_START_YEAR);
    setNewScenarioEndYear(DEFAULT_END_YEAR);
    setNewScenarioKademeler(getDefaultKademeConfig());
    setNewScenarioInputCurrency("USD");
    setNewScenarioLocalCurrencyCode("");
    setNewScenarioFxUsdToLocal("");
    setNewScenarioStep(0);
  }

  function closeScenarioWizard() {
    setErr("");
    setScenarioWizardOpen(false);
    setScenarioWizardLoading(false);
    setScenarioWizardSaving(false);
    setNewScenarioStep(0);
  }

  function openScenarioWizardCreate() {
    setErr("");
    resetScenarioWizard();
    setScenarioWizardMode("create");
    setScenarioWizardScenario(null);
    setScenarioWizardOpen(true);
  }

  async function openScenarioWizardEdit(scenarioId) {
    setErr("");
    const targetScenario = scenarios.find((s) => String(s.id) === String(scenarioId));
    if (targetScenario && (targetScenario.status === "submitted" || targetScenario.status === "approved")) {
      setErr("Senaryo onayda veya onaylandi, duzenlenemez.");
      return;
    }
    setSelectedScenarioId(scenarioId);
    setScenarioWizardMode("edit");
    setScenarioWizardScenario(null);
    setScenarioWizardOpen(true);
    setScenarioWizardLoading(true);
    setNewScenarioStep(0);
    try {
      const data = await api.getScenarioInputs(schoolId, scenarioId);
      const scenario = data?.scenario;
      if (!scenario) throw new Error("Senaryo bulunamadı.");
      setScenarioWizardScenario(scenario);
      setNewScenarioName(scenario.name || "");
      const years = parseAcademicYear(scenario.academic_year);
      if (years.startYear && years.endYear && years.endYear !== years.startYear) {
        setNewScenarioPeriod("split");
        setNewScenarioStartYear(String(years.startYear));
        setNewScenarioEndYear(String(years.endYear));
      } else if (years.startYear) {
        setNewScenarioPeriod("full");
        setNewScenarioStartYear(String(years.startYear));
        setNewScenarioEndYear(String(years.startYear + 1));
      } else {
        setNewScenarioPeriod("split");
        setNewScenarioStartYear(DEFAULT_START_YEAR);
        setNewScenarioEndYear(DEFAULT_END_YEAR);
      }
      const existingKademe = data?.inputs?.temelBilgiler?.kademeler;
      setNewScenarioKademeler(
        existingKademe ? normalizeKademeConfig(existingKademe) : getDefaultKademeConfig()
      );
      const scenarioCurrency = scenario.input_currency || "USD";
      setNewScenarioInputCurrency(scenarioCurrency);
      setNewScenarioLocalCurrencyCode(scenario.local_currency_code || "");
      setNewScenarioFxUsdToLocal(
        scenario.fx_usd_to_local != null ? String(scenario.fx_usd_to_local) : ""
      );
    } catch (e) {
      setErr(e.message || "Senaryo yüklenemedi.");
      setScenarioWizardOpen(false);
    } finally {
      setScenarioWizardLoading(false);
    }
  }

  async function submitScenarioWizard() {
    if (scenarioWizardMode === "edit") {
      await updateScenario();
      return;
    }
    await createScenario();
  }

  async function createScenario() {
    const name = newScenarioName.trim();
    if (!name) return;
    if (!draftAcademicYear) {
      setErr("Lütfen geçerli bir akademik yıl girin.");
      return;
    }
    if (!draftRangeOk) {
      setErr("Bitiş yılı, başlangıç yılından 1 fazla olmalı.");
      return;
    }
    if (yearConflict) {
      setErr("Bu yıl türü için zaten bir senaryo var. Lütfen başka bir yıl seçin.");
      return;
    }
    if (!hasEnabledKademe) {
      setErr("En az bir kademe seçmelisiniz.");
      return;
    }
    if (newScenarioInputCurrency === "LOCAL") {
      if (!localCodeOk) {
        setErr("Local currency code zorunludur.");
        return;
      }
      if (!fxOk) {
        setErr("Kur degeri zorunlu ve 0'dan buyuk olmali.");
        return;
      }
    }
    setErr("");
    setScenarioWizardSaving(true);
    try {
      const kademeConfig = normalizeKademeConfig(newScenarioKademeler);
      const created = await api.createScenario(schoolId, {
        name,
        academicYear: draftAcademicYear,
        kademeConfig,
        inputCurrency: newScenarioInputCurrency,
        localCurrencyCode: newScenarioInputCurrency === "LOCAL" ? normalizedLocalCode : null,
        fxUsdToLocal: newScenarioInputCurrency === "LOCAL" ? newScenarioFxUsdToLocal : null,
      });
      setNewScenarioName("");
      const sc = await api.listScenarios(schoolId);
      setScenarios(sc);
      setSelectedScenarioId(created.id);
      setTab("basics");
      setScenarioWizardOpen(false);
      setNewScenarioStep(0);
    } catch (e) {
      setErr(e.message || "Senaryo oluşturulamadı.");
    } finally {
      setScenarioWizardSaving(false);
    }
  }

  async function updateScenario() {
    if (!scenarioWizardScenario?.id) return;
    const name = newScenarioName.trim();
    if (!name) return;
    if (!draftAcademicYear) {
      setErr("Lütfen geçerli bir akademik yıl girin.");
      return;
    }
    if (!draftRangeOk) {
      setErr("Bitiş yılı, başlangıç yılından 1 fazla olmalı.");
      return;
    }
    if (yearConflict) {
      setErr("Bu yıl türü için zaten bir senaryo var. Lütfen başka bir yıl seçin.");
      return;
    }
    if (!hasEnabledKademe) {
      setErr("En az bir kademe seçmelisiniz.");
      return;
    }
    if (scenarioWizardScenario?.input_currency === "LOCAL") {
      if (!localCodeOk) {
        setErr("Local currency code zorunludur.");
        return;
      }
      if (!fxOk) {
        setErr("Kur degeri zorunlu ve 0'dan buyuk olmali.");
        return;
      }
    }
    setErr("");
    setScenarioWizardSaving(true);
    try {
      const kademeConfig = normalizeKademeConfig(newScenarioKademeler);
      await api.updateScenario(schoolId, scenarioWizardScenario.id, {
        name,
        academicYear: draftAcademicYear,
        kademeConfig,
        localCurrencyCode:
          scenarioWizardScenario?.input_currency === "LOCAL" ? normalizedLocalCode : undefined,
        fxUsdToLocal:
          scenarioWizardScenario?.input_currency === "LOCAL" ? newScenarioFxUsdToLocal : undefined,
      });
      const sc = await api.listScenarios(schoolId);
      setScenarios(sc);
      setSelectedScenarioId(scenarioWizardScenario.id);
      setTab("basics");
      setSelectedScenario((prev) =>
        prev && prev.id === scenarioWizardScenario.id
          ? {
            ...prev,
            name,
            academic_year: draftAcademicYear,
            ...(scenarioWizardScenario?.input_currency === "LOCAL"
              ? { local_currency_code: normalizedLocalCode, fx_usd_to_local: fxValue }
              : {}),
          }
          : prev
      );
      setInputs((prev) => {
        if (!prev || typeof prev !== "object") return prev;
        const next = structuredClone(prev);
        next.temelBilgiler = next.temelBilgiler || {};
        next.temelBilgiler.kademeler = kademeConfig;
        return next;
      });
      setBaselineInputs((prev) => {
        if (!prev || typeof prev !== "object") return prev;
        const next = structuredClone(prev);
        next.temelBilgiler = next.temelBilgiler || {};
        next.temelBilgiler.kademeler = kademeConfig;
        return next;
      });
      clearDirtyPrefix("inputs.temelBilgiler.kademeler");
      setScenarioWizardOpen(false);
      setNewScenarioStep(0);
    } catch (e) {
      setErr(e.message || "Senaryo güncellenemedi.");
    } finally {
      setScenarioWizardSaving(false);
    }
  }

  const updateNewKademe = (key, patch) => {
    setNewScenarioKademeler((prev) => {
      const base = normalizeKademeConfig(prev);
      const next = { ...base, [key]: { ...base[key], ...patch } };
      return normalizeKademeConfig(next);
    });
  };

  async function saveNormConfig() {
    if (!norm) return;
    const payload = norm?.years
      ? { years: norm.years }
      : {
        teacherWeeklyMaxHours: norm.teacherWeeklyMaxHours,
        curriculumWeeklyHours: norm.curriculumWeeklyHours,
      };
    await api.saveNormConfig(schoolId, payload);
    const n = await api.getNormConfig(schoolId);
    setNorm(n);
    setBaselineNorm(n ? structuredClone(n) : null);
    clearDirtyPrefix("norm.");
  }

  // B) Save inputs with HR->Expenses salary patch applied + Capacity normalization
  async function saveInputs() {
    if (!selectedScenarioId || !inputs) return false;
    if (inputsLocked) {
      setErr("Scenario locked. Awaiting admin review.");
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

        await api.saveScenarioInputs(schoolId, selectedScenarioId, patched);
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
  }

  async function calculate(options = {}) {
    if (!selectedScenarioId) return;
    setCalculating(true);
    setErr("");
    try {
      const data = await api.calculateScenario(schoolId, selectedScenarioId);
      setReport(data.results);
      if (!options.keepTab) setTab("report");
      setLastCalculatedAt(Date.now());
    } catch (e) {
      setErr(e.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
  }

  async function submitScenarioForApproval(scenarioId) {
    if (!scenarioId || scenarioId !== selectedScenarioId) return;
    if (submittingScenarioId) return;

    setErr("");
    setSubmittingScenarioId(scenarioId);
    try {
      const shouldCalculate = inputsDirty || !report;
      if (inputsDirty) {
        const ok = await saveInputs();
        if (!ok) return;
      }
      if (shouldCalculate) {
        await calculate({ keepTab: true });
      }
      const data = await api.submitScenario(schoolId, scenarioId);
      toast.success("Senaryo onaya gonderildi.");
      if (data?.scenario) {
        setSelectedScenario((prev) => ({ ...(prev || {}), ...data.scenario }));
      }
      await refreshScenarios();
    } catch (e) {
      setErr(e.message || "Submit failed");
    } finally {
      setSubmittingScenarioId(null);
    }
  }

  async function copySelectedScenario() {
    if (!selectedScenarioId || !selectedScenario || !inputs) return;
    if (copyingScenarioId) return;
    if (!selectedScenario.academic_year) {
      setErr("Akademik yil bulunamadi.");
      return;
    }

    setErr("");
    setCopyingScenarioId(selectedScenarioId);
    try {
      const baseName = selectedScenario.name || "Senaryo";
      const copyName = `${baseName} (Kopya)`;
      let candidateYear = incrementAcademicYearString(selectedScenario.academic_year);
      if (!candidateYear) {
        throw new Error("Akademik yil formati gecersiz.");
      }
      let guard = 0;
      const hasAcademicYear = (yearStr) =>
        scenarios.some((s) => String(s?.academic_year || "").trim() === String(yearStr).trim());

      while (hasAcademicYear(candidateYear)) {
        candidateYear = incrementAcademicYearString(candidateYear);
        guard += 1;
        if (!candidateYear || guard > 20) {
          throw new Error("Uygun yeni akademik yil bulunamadi.");
        }
      }

      const kademeConfig = normalizeKademeConfig(
        inputs?.temelBilgiler?.kademeler || getDefaultKademeConfig()
      );
      const created = await api.createScenario(schoolId, {
        name: copyName,
        academicYear: candidateYear,
        kademeConfig,
        inputCurrency: selectedScenario.input_currency || "USD",
        localCurrencyCode:
          selectedScenario.input_currency === "LOCAL" ? selectedScenario.local_currency_code || "" : null,
        fxUsdToLocal:
          selectedScenario.input_currency === "LOCAL" ? selectedScenario.fx_usd_to_local : null,
      });

      let clonedInputs = structuredClone(inputs);
      clonedInputs = applyIkSalariesToGiderler(clonedInputs);
      clonedInputs = normalizeCapacityInputs(clonedInputs);
      clonedInputs = normalizeGradesInputs(clonedInputs);
      clonedInputs = normalizeTemelBilgilerInputs(clonedInputs);
      await api.saveScenarioInputs(schoolId, created.id, clonedInputs);

      await refreshScenarios();
      setSelectedScenarioId(created.id);
      setTab("basics");
      toast.success("Senaryo kopyalandi.");
    } catch (e) {
      setErr(e.message || "Scenario copy failed");
    } finally {
      setCopyingScenarioId(null);
    }
  }

  async function deleteScenario(scenarioId) {
    if (!scenarioId) return;
    const target = scenarios.find((s) => String(s.id) === String(scenarioId));
    if (!target) return;
    if (target.status === "submitted" || target.status === "approved") {
      setErr("Senaryo onayda veya onaylandi, silinemez.");
      return;
    }
    const hasDirty = scenarioId === selectedScenarioId && inputsDirty;
    const label = target.name ? `"${target.name}"` : "Senaryo";
    const ok = window.confirm(
      hasDirty
        ? `${label} silinsin mi? Kaydedilmemis degisiklikler kaybolacak.`
        : `${label} silinsin mi?`
    );
    if (!ok) return;

    setErr("");
    try {
      await api.deleteScenario(schoolId, scenarioId);
      const sc = await refreshScenarios();
      if (Array.isArray(sc)) {
        if (!sc.length) {
          setSelectedScenarioId(null);
          setInputs(null);
          setReport(null);
          setPrevReport(null);
          setTab("scenarios");
        } else if (!sc.some((s) => String(s.id) === String(selectedScenarioId))) {
          setSelectedScenarioId(sc[0].id);
        }
      }
      toast.success("Senaryo silindi.");
    } catch (e) {
      setErr(e.message || "Senaryo silinemedi.");
    }
  }

  async function handleExport() {
    if (!selectedScenarioId) return;
    setErr("");
    try {
      await api.downloadXlsx(schoolId, selectedScenarioId, reportCurrency);
    } catch (e) {
      setErr(e.message || "Download failed");
    }
  }

  const sanitizeFileName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let normalized = raw;
    if (typeof normalized.normalize === "function") {
      normalized = normalized.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    }
    return normalized
      .replace(/[^a-zA-Z0-9-_ ]+/g, " ")
      .trim()
      .replace(/\s+/g, "_");
  };

  const buildReportFileName = () => {
    const parts = [
      sanitizeFileName(school?.name),
      sanitizeFileName(selectedScenario?.name),
      "Rapor",
    ].filter(Boolean);
    const base = parts.join("_") || "Rapor";
    return `${base}.pdf`;
  };

  async function handleExportPdf() {
    if (!report) {
      setErr("Once hesaplama yapin.");
      return;
    }
    const target = reportExportRef.current;
    if (!target) {
      setErr("Rapor gorunumu hazir degil.");
      return;
    }

    setErr("");
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        scrollY: -window.scrollY,
        onclone: (cloneDoc) => {
          const root = cloneDoc.querySelector('[data-report-export="1"]');
          if (!root) return;
          const nodes = root.querySelectorAll("*");
          nodes.forEach((node) => {
            const style = cloneDoc.defaultView?.getComputedStyle(node);
            if (!style) return;
            const overflow = style.overflow;
            const overflowX = style.overflowX;
            const overflowY = style.overflowY;
            const shouldReset =
              overflow === "auto" ||
              overflow === "scroll" ||
              overflowX === "auto" ||
              overflowX === "scroll" ||
              overflowY === "auto" ||
              overflowY === "scroll";
            if (!shouldReset) return;
            node.style.overflow = "visible";
            node.style.overflowX = "visible";
            node.style.overflowY = "visible";
            node.style.maxHeight = "none";
          });
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(buildReportFileName());
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

  function requestTabChange(nextTab) {
    if (nextTab === tab) return;
    if (isTabDirty(tab)) {
      setConfirmTabChange({ nextTab });
      return;
    }
    setTab(nextTab);
  }

  function isTabDirty(key) {
    const prefixes = {
      basics: ["inputs.temelBilgiler."],
      kapasite: ["inputs.kapasite."],
      income: ["inputs.gelirler."],
      expenses: ["inputs.giderler.", "inputs.discounts."],
      hr: ["inputs.ik."],
      norm: ["norm.", "inputs.grades.", "inputs.gradesYears.", "inputs.gradesCurrent."],
    };

    const list = prefixes[key] || [];
    return list.some((prefix) => hasDirtyPrefix(prefix));
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

  function getBaselineValue(path) {
    if (!path) return undefined;
    const parts = path.split(".");
    if (!parts.length) return undefined;
    if (parts[0] === "inputs") return getValueAtPath(baselineInputs, parts.slice(1));
    if (parts[0] === "norm") return getValueAtPath(baselineNorm, parts.slice(1));
    return undefined;
  }

  function markDirty(path, value) {
    if (!path) return;
    if (inputsLocked && path.startsWith("inputs.")) return;
    const baselineValue = getBaselineValue(path);
    const same = valuesEqual(value, baselineValue);
    setDirtyPaths((prev) => {
      const next = new Set(prev);
      if (same) next.delete(path);
      else next.add(path);
      return areSetsEqual(prev, next) ? prev : next;
    });
  }

  function clearDirtyPrefix(prefix) {
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
  }

  function hasDirtyPrefix(prefix) {
    for (const path of dirtyPaths) {
      if (path === prefix || path.startsWith(prefix)) return true;
    }
    return false;
  }

  const inputsDirty = hasDirtyPrefix("inputs.") || hasDirtyPrefix("norm.");
  const inputsLocked = selectedScenario?.status === "submitted" || selectedScenario?.status === "approved";
  const showInputsHeader = INPUT_HEADER_TABS.has(tab);
  const exportDisabled = inputsSaving || calculating || exportingPdf || !report;
  const formatRelative = (ms) => {
    if (!ms) return "";
    const diff = Math.max(0, (nowTick || Date.now()) - ms);
    if (diff < 60000) return "az once";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk once`;
    return `${Math.floor(diff / 3600000)} saat once`;
  };

  const getScenarioStatusMeta = (status) => {
    switch (status) {
      case "submitted":
        return { label: "Onayda", className: "is-warn" };
      case "revision_requested":
        return { label: "Revize Istendi", className: "is-bad" };
      case "approved":
        return { label: "Onaylandi", className: "is-ok" };
      default:
        return { label: "Taslak", className: "is-muted" };
    }
  };

  useEffect(() => {
    if (exportDisabled) setExportOpen(false);
  }, [exportDisabled]);

  function renderInputsHeader() {
    const scenarioText = selectedScenario
      ? `${selectedScenario.name}${selectedScenario.academic_year ? ` • ${selectedScenario.academic_year}` : ""}`
      : "Senaryo seçilmedi";
    const hasReport = Boolean(report);
    const calculateLabel = inputsDirty ? "Kaydet & Hesapla" : hasReport ? "Yeniden Hesapla" : "Hesapla";
    const exportLabel = exportingPdf ? "PDF hazirlaniyor..." : "Disa Aktar";
    const showExportButton = tab === "report" || hasReport;

    return (
      <div className="school-topbar">
        <div className="school-topbar-left">
          <Link
            to="/schools"
            className="school-back-btn"
            title="Okullara Don"
            aria-label="Okullara Don"
          >
            <span aria-hidden>&lt;</span>
          </Link>

          <div className="school-topbar-text">
            <div className="school-topbar-title">{school?.name || "Okul"}</div>

            <div className="school-topbar-sub">
              <span className={"school-pill " + (selectedScenario ? "" : "is-muted")}>
                {scenarioText}
              </span>
              {selectedScenario ? (
                <span className={`school-pill ${getScenarioStatusMeta(selectedScenario.status).className}`}>
                  {getScenarioStatusMeta(selectedScenario.status).label}
                </span>
              ) : null}

              {showInputsHeader && inputs ? (
                <>
                  {inputsDirty ? (
                    <span className="school-pill is-warn">Kaydedilmedi</span>
                  ) : (
                    <span className="school-pill is-ok">Kaydedildi</span>
                  )}
                  {lastSavedAt ? (
                    <span className="school-pill is-muted">
                      {inputsDirty ? `Son kayit: ${formatRelative(lastSavedAt)} (degisiklik var)` : `Kaydedildi: ${formatRelative(lastSavedAt)}`}
                    </span>
                  ) : null}
                  {lastCalculatedAt ? (
                    <span className="school-pill is-muted">
                      Hesaplandi: {formatRelative(lastCalculatedAt)}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="school-topbar-right">
          {showInputsHeader ? (
            inputs ? (
              <div className="school-actions">
                <button
                  type="button"
                  className={"topbar-btn " + (inputsDirty && !inputsSaving ? "is-save" : "is-ghost")}
                  onClick={saveInputs}
                  disabled={!inputsDirty || inputsSaving || inputsLocked}
                  title={
                    inputsLocked
                      ? "Senaryo kilitli"
                      : inputsDirty
                        ? "Degisiklikleri kaydet"
                        : "Kaydedilecek degisiklik yok"
                  }
                >
                  {inputsSaving ? "Kaydediliyor..." : inputsDirty ? "Kaydet" : "Kaydedildi"}
                </button>

                <button
                  type="button"
                  className="topbar-btn is-primary"
                  onClick={async () => {
                    if (inputsSaving || calculating) return;
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
                  {calculating ? "Hesaplaniyor..." : calculateLabel}
                </button>

                {showExportButton ? (
                  <div className="action-menu" ref={exportMenuRef}>
                    <button
                      type="button"
                      className="topbar-btn is-ghost"
                      onClick={() => {
                        if (exportDisabled) return;
                        setExportOpen((prev) => !prev);
                      }}
                      disabled={exportDisabled}
                      aria-haspopup="menu"
                      aria-expanded={exportOpen}
                    >
                      {exportLabel}
                    </button>
                    {exportOpen ? (
                      <div className="action-menu-panel" role="menu">
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
            ) : (
              <div className="school-topbar-hint small">Once bir senaryo secin.</div>
            )
          ) : null}
        </div>
      </div>
    );
  }


  return (
    <div className="container school-page">
      <ToastContainer position="top-right" autoClose={3000} newestOnTop closeOnClick pauseOnFocusLoss pauseOnHover />
      {bootLoading && !scenarioWizardOpen ? (
        <div className="modal-backdrop" role="status" aria-live="polite" aria-busy="true">
          <style>{`@keyframes schoolSpin{to{transform:rotate(360deg)}}`}</style>

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
              {bootLoadingLabel || "Yükleniyor..."}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Lütfen bekleyin…
            </div>
          </div>
        </div>
      ) : null}

      {err && !scenarioWizardOpen ? (
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

      {confirmTabChange ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Unsaved Changes</div>
            <div className="small" style={{ marginBottom: 12 }}>
              You have unsaved changes. If you leave this tab, unsaved changes may be lost.
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirmTabChange(null)}>Stay</button>
              <button
                className="btn primary"
                onClick={() => {
                  const nextTab = confirmTabChange.nextTab;
                  setConfirmTabChange(null);
                  setTab(nextTab);
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scenarioWizardOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal" style={{ width: "min(760px, 100%)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>
                {scenarioWizardMode === "edit" ? "Senaryo Kurulumunu Düzenle" : "Yeni Senaryo Kurulumu"}
              </div>
              <button className="btn" onClick={closeScenarioWizard}>Kapat</button>
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              {scenarioWizardMode === "edit"
                ? "Senaryo ayarlarını güncelleyip kaydedebilirsiniz."
                : "Adım adım kurulum tamamlayın."}
            </div>

            {err ? (
              <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
                {err}
              </div>
            ) : null}

            {scenarioWizardLoading ? (
              <div className="card" style={{ marginTop: 12 }}>Yükleniyor...</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>Kurulum Adımı</div>
                  <div className="small">{`Adım ${newScenarioStep + 1} / ${scenarioStepTotal}: ${scenarioStepLabels[newScenarioStep]}`}</div>
                </div>

                {newScenarioStep === 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Dönem Türü</div>
                    <div className="row" style={{ gap: 12, alignItems: "center" }}>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="scenario-period"
                          checked={newScenarioPeriod === "full"}
                          onChange={() => setNewScenarioPeriod("full")}
                        />
                        <span>Tam Yıl (tek yıl)</span>
                      </label>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="scenario-period"
                          checked={newScenarioPeriod === "split"}
                          onChange={() => setNewScenarioPeriod("split")}
                        />
                        <span>Yıl ortasında başlar, sonraki yıl biter</span>
                      </label>
                    </div>
                  </div>
                )}

                {newScenarioStep === 1 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Para Birimi</div>
                    <div className="row" style={{ gap: 12, alignItems: "center" }}>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="scenario-currency"
                          checked={newScenarioInputCurrency === "USD"}
                          onChange={() => handleScenarioCurrencyChange("USD")}
                          disabled={scenarioWizardMode === "edit"}
                        />
                        <span>USD</span>
                      </label>
                      <label className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input
                          type="radio"
                          name="scenario-currency"
                          checked={newScenarioInputCurrency === "LOCAL"}
                          onChange={() => handleScenarioCurrencyChange("LOCAL")}
                          disabled={scenarioWizardMode === "edit"}
                        />
                        <span>Local currency</span>
                      </label>
                    </div>

                    {newScenarioInputCurrency === "LOCAL" && (
                      <div style={{ marginTop: 10 }}>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <div className="small" style={{ fontWeight: 700 }}>Local currency code</div>
                          <input
                            className="input sm"
                            list="local-currency-codes"
                            placeholder="TRY"
                            value={newScenarioLocalCurrencyCode}
                            onChange={(e) =>
                              setNewScenarioLocalCurrencyCode(
                                e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                              )
                            }
                          />
                          <datalist id="local-currency-codes">
                            {LOCAL_CURRENCY_OPTIONS.map((code) => (
                              <option key={code} value={code} />
                            ))}
                          </datalist>
                        </div>
                        {!localCodeOk ? (
                          <div className="small" style={{ color: "#b91c1c", marginTop: 6 }}>
                            Code 2-10 chars, A-Z0-9.
                          </div>
                        ) : null}

                        <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 10 }}>
                          <span>1 USD =</span>
                          <input
                            className="input sm"
                            type="number"
                            step="0.000001"
                            value={newScenarioFxUsdToLocal}
                            onChange={(e) => setNewScenarioFxUsdToLocal(e.target.value)}
                          />
                          <span>{normalizedLocalCode || "LOCAL"}</span>
                        </div>
                        {!fxOk ? (
                          <div className="small" style={{ color: "#b91c1c", marginTop: 6 }}>
                            FX rate must be {'>'} 0.
                          </div>
                        ) : null}
                        <div className="small muted" style={{ marginTop: 6 }}>
                          Kur formati: 1 USD = X LOCAL
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {newScenarioStep === 2 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Yıl</div>
                    {newScenarioPeriod === "full" ? (
                      <input
                        className="input sm"
                        placeholder={DEFAULT_START_YEAR}
                        value={newScenarioStartYear}
                        onChange={(e) => setNewScenarioStartYear(e.target.value)}
                      />
                    ) : (
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <input
                          className="input sm"
                          placeholder={DEFAULT_START_YEAR}
                          value={newScenarioStartYear}
                          onChange={(e) => setNewScenarioStartYear(e.target.value)}
                        />
                        <span className="muted">-</span>
                        <input
                          className="input sm"
                          placeholder={DEFAULT_END_YEAR}
                          value={newScenarioEndYear}
                          onChange={(e) => setNewScenarioEndYear(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Akademik yıl: {draftAcademicYear || "-"}
                      {newScenarioPeriod === "split" && draftAcademicYear && !draftRangeOk ? (
                        <span style={{ color: "#b91c1c", marginLeft: 8 }}>
                          Bitiş yılı, başlangıç yılından 1 fazla olmalı.
                        </span>
                      ) : null}
                      {draftAcademicYear && yearConflict ? (
                        <span style={{ color: "#b91c1c", marginLeft: 8 }}>
                          Bu yıl türü için zaten bir senaryo var.
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}

                {newScenarioStep === 3 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Kademeler</div>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Kademe</th>
                          <th style={{ width: 120 }}>Aktif</th>
                          <th style={{ width: 160 }}>Başlangıç</th>
                          <th style={{ width: 160 }}>Bitiş</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kademeDefs.map((def) => {
                          const row = draftKademeConfig[def.key];
                          return (
                            <tr key={def.key}>
                              <td style={{ fontWeight: 700 }}>{def.label}</td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={!!row?.enabled}
                                  onChange={(e) => updateNewKademe(def.key, { enabled: e.target.checked })}
                                />
                              </td>
                              <td>
                                <select
                                  className="input sm"
                                  value={row?.from || ""}
                                  onChange={(e) => updateNewKademe(def.key, { from: e.target.value })}
                                  disabled={!row?.enabled}
                                >
                                  {gradeOptions.map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="input sm"
                                  value={row?.to || ""}
                                  onChange={(e) => updateNewKademe(def.key, { to: e.target.value })}
                                  disabled={!row?.enabled}
                                >
                                  {gradeOptions.map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!hasEnabledKademe ? (
                      <div className="small" style={{ color: "#b91c1c" }}>En az bir kademe seçmelisiniz.</div>
                    ) : null}
                  </div>
                )}

                {newScenarioStep === 4 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Senaryo Adı</div>
                    <div className="row">
                      <input
                        className="input"
                        placeholder="Senaryo adı"
                        value={newScenarioName}
                        onChange={(e) => setNewScenarioName(e.target.value)}
                      />
                    </div>
                    {!newScenarioName.trim() ? (
                      <div className="small" style={{ color: "#b91c1c", marginTop: 6 }}>Senaryo adı zorunludur.</div>
                    ) : null}
                  </div>
                )}

                <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
                  <button
                    className="btn"
                    onClick={goScenarioBack}
                    disabled={newScenarioStep === 0 || scenarioWizardSaving}
                  >
                    Geri
                  </button>
                  <button
                    className="btn primary"
                    onClick={goScenarioNext}
                    disabled={scenarioWizardSaving || !scenarioStepOk[newScenarioStep]}
                  >
                    {newScenarioStep < scenarioStepTotal - 1
                      ? "İleri"
                      : scenarioWizardMode === "edit"
                        ? "Kaydet"
                        : "Bitir"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="sticky-stack school-nav">
        {renderInputsHeader()}
        {/* {selectedScenarioId ? (
          <ScenarioKpiStrip
            results={report}
            fallbackResults={report ? null : prevReport}
            inputsDirty={inputsDirty}
            lastSavedAt={lastSavedAt}
            lastCalculatedAt={lastCalculatedAt}
          />
        ) : null} */}

        <div className="school-tabs-wrap">
          <button
            type="button"
            className={"tab-scroll-btn " + (tabsScroll.left ? "" : "disabled")}
            onClick={() => scrollTabsBy(-260)}
            aria-label="Sekmeleri sola kaydır"
            title="Sola"
            disabled={!tabsScroll.left}
          >
            ‹
          </button>

          <div ref={tabsScrollRef} className="school-tabs-scroll" role="tablist" aria-label="Okul Sekmeleri">
            {TABS.map((t) => {
              const dirty = isTabDirty(t.key);
              const active = tab === t.key;


              const showBadge = showScenarioProgress && !["scenarios", "report"].includes(t.key);
              const tabProgress = showBadge
                ? uiTabProgress[t.key] || { done: true, missingReasons: [] }
                : { done: true, missingReasons: [] };
              const tabPct = showBadge ? tabHeaderPctMap[t.key] : null;
              const tabStyle = tabPct != null ? { "--tab-progress": `${Math.round(tabPct)}%` } : undefined;
              const tooltipLines = showBadge
                ? tabProgress.done
                  ? ["Tamamlandi"]
                  : [`Eksik: ${tabProgress.missingReasons.join(" / ")}`]
                : [];

              const buttonEl = (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className={"school-tab " + (active ? "is-active " : "") + (dirty ? "is-dirty" : "")}
                  style={tabStyle}
                  onClick={() => requestTabChange(t.key)}
                >
                  <span className="school-tab-label">{t.label}</span>
                  {showBadge ? <TabBadge done={tabProgress.done} /> : null}
                  {dirty ? <span className="school-tab-dot" title="Kaydedilmemis degisiklik" /> : null}
                </button>
              );

              return tooltipLines.length ? (
                <Tooltip key={t.key} lines={tooltipLines} className="tab-tooltip">
                  {buttonEl}
                </Tooltip>
              ) : (
                <React.Fragment key={t.key}>{buttonEl}</React.Fragment>
              );
            })}
          </div>

          <button
            type="button"
            className={"tab-scroll-btn " + (tabsScroll.right ? "" : "disabled")}
            onClick={() => scrollTabsBy(260)}
            aria-label="Sekmeleri sağa kaydır"
            title="Sağa"
            disabled={!tabsScroll.right}
          >
            ›
          </button>
        </div>
      </div>



      {tab === "scenarios" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Senaryolar</div>
              <div className="small">Her yıl türü için (2026 veya 2026-2027) tek senaryo oluşturabilirsiniz.</div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={openScenarioWizardCreate}>Yeni Senaryo</button>
            </div>
          </div>

          <table className="table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Yıl</th>
                <th>Para Birimi</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scenarios.length === 0 ? (
                <tr>
                  <td colSpan="6" className="small">
                    Henüz senaryo yok.
                  </td>
                </tr>
              ) : (
                scenarios.map((s) => {
                  const statusMeta = getScenarioStatusMeta(s.status);
                  const isSelected = selectedScenarioId === s.id;
                  const isLocked = s.status === "submitted" || s.status === "approved";
                  const canEdit = !isLocked;
                  const canDelete = !isLocked;
                  const canSubmit =
                    isSelected &&
                    (s.status === "draft" || s.status === "revision_requested");
                  const canCopy = isSelected && inputs;
                  const isSubmitting = submittingScenarioId === s.id;
                  const isCopying = copyingScenarioId === s.id;
                  const currencyLabel =
                    s.input_currency === "LOCAL"
                      ? `${s.local_currency_code || "LOCAL"} (LOCAL)`
                      : "USD";
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{s.academic_year}</td>
                      <td>{currencyLabel}</td>
                      <td>
                        <span className={`status-badge ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="small">{new Date(s.created_at).toLocaleString()}</td>
                      <td>
                        <div className="scenario-actions">
                          <button
                            type="button"
                            className={"btn scenario-action-btn " + (isSelected ? "primary" : "")}
                            onClick={() => setSelectedScenarioId(s.id)}
                            disabled={isSelected}
                            title={isSelected ? "Secili" : "Sec"}
                          >
                            <FaCheck />
                            <span>{isSelected ? "Secildi" : "Sec"}</span>
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              className="btn scenario-action-btn"
                              onClick={() => openScenarioWizardEdit(s.id)}
                              title="Planlamayi Duzenle"
                            >
                              <FaEdit />
                              <span>Planlamayi Duzenle</span>
                            </button>
                          ) : null}
                          {canCopy ? (
                            <button
                              type="button"
                              className="btn scenario-action-btn"
                              onClick={copySelectedScenario}
                              disabled={inputsSaving || calculating || isCopying}
                              title="Kopyala"
                            >
                              <FaCopy />
                              <span>{isCopying ? "Kopyalaniyor..." : "Kopyala"}</span>
                            </button>
                          ) : null}
                          {canSubmit ? (
                            <button
                              type="button"
                              className="btn primary scenario-action-btn"
                              onClick={() => submitScenarioForApproval(s.id)}
                              disabled={inputsSaving || calculating || isSubmitting}
                              title="Onaya Gonder"
                            >
                              <FaPaperPlane />
                              <span>{isSubmitting ? "Gonderiliyor..." : "Onaya Gonder"}</span>
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="btn danger scenario-action-btn"
                              onClick={() => deleteScenario(s.id)}
                              disabled={inputsSaving || calculating}
                              title="Sil"
                            >
                              <FaTrash />
                              <span>Sil</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "basics" && (
        <div style={{ marginTop: 12 }}>
          {inputs ? (
            <TabProgressHeatmap
              pct={pctValue(progMap.temelBilgiler)}
              title="Temel Bilgiler"
              missingLines={progMap.temelBilgiler?.missingLines}
              missingPreview={progMap.temelBilgiler?.missingPreview}
            >
              <TemelBilgilerEditor
                value={inputs.temelBilgiler}
                onChange={(v) => setField("temelBilgiler", v)}
                school={school}
                me={me}
                baseYear={baseYear}
                kapasite={inputs.kapasite}
                gradesCurrent={inputs.gradesCurrent}
                ik={inputs.ik}
                prevReport={prevReport}
                dirtyPaths={dirtyPaths}
                onDirty={markDirty}
              />
            </TabProgressHeatmap>
          ) : null}
        </div>
      )}

      {tab === "kapasite" && (
        <div style={{ marginTop: 12 }}>
          {inputs ? (
            <TabProgressHeatmap
              pct={pctValue(progMap.kapasite)}
              title="Kapasite"
              missingLines={progMap.kapasite?.missingLines}
              missingPreview={progMap.kapasite?.missingPreview}
            >
              <CapacityEditor
                school={school}
                me={me}
                baseYear={baseYear}
                kapasite={inputs.kapasite}
                plannedGrades={inputs.gradesYears || inputs.grades}
                currentGrades={inputs.gradesCurrent}
                kademeConfig={inputs.temelBilgiler?.kademeler}
                onChange={(v) => {
                  setField("kapasite", v);
                }}
                dirtyPaths={dirtyPaths}
                onDirty={markDirty}
              />
            </TabProgressHeatmap>
          ) : null}
        </div>
      )}


      {tab === "income" && (
        <div style={{ marginTop: 12 }}>
          {inputs ? (
            <TabProgressHeatmap
              pct={pctValue(progMap.gelirler)}
              title="Gelirler"
              missingLines={progMap.gelirler?.missingLines}
              missingPreview={progMap.gelirler?.missingPreview}
            >
              <IncomeEditor
                gelirler={inputs.gelirler}
                temelBilgiler={inputs.temelBilgiler}
                baseYear={baseYear}
                gradesYears={inputs.gradesYears}
                grades={inputs.gradesYears?.y1 || inputs.grades}
                discounts={inputs.discounts}
                currencyCode={inputCurrencyCode}
                onChange={(v) => {
                  setField("gelirler", v);
                }}
                dirtyPaths={dirtyPaths}
                onDirty={markDirty}
              />
            </TabProgressHeatmap>
          ) : null}
        </div>
      )}

      {tab === "expenses" && (
        <div style={{ marginTop: 12 }}>
          {inputs ? (
            <TabProgressHeatmap
              pct={expensesAvgPct}
              title="Giderler"
              missingLines={expensesMissingLines}
              missingPreview={expensesMissingLines.join(" / ")}
            >
              <ExpensesEditor
                baseYear={baseYear}
                giderler={inputs.giderler}
                temelBilgiler={inputs.temelBilgiler}
                ik={inputs.ik}
                grades={inputs.grades}
                gelirler={inputs.gelirler}
                discounts={inputs.discounts}
                currencyCode={inputCurrencyCode}
                onDiscountsChange={(v) => {
                  setField("discounts", v);
                }}
                onChange={(v) => {
                  setField("giderler", v);
                }}
                dirtyPaths={dirtyPaths}
                onDirty={markDirty}
                uiScopeKey={uiScopeKey}
              />
            </TabProgressHeatmap>
          ) : null}
        </div>
      )}

      {tab === "norm" && (
        <div style={{ marginTop: 12 }}>
          <TabProgressHeatmap
            pct={normAvgPct}
            title="Norm"
            missingLines={normMissingLines}
            missingPreview={normMissingLines.join(" / ")}
          >
            <NormConfigEditor
              value={norm || null}
              onChange={(v) => {
                setNorm((prev) => ({ ...(prev || {}), ...v }));
              }}
              lastUpdatedAt={norm?.updatedAt}
              planningGrades={inputs?.gradesYears || inputs?.grades}
              currentGrades={inputs?.gradesCurrent}
              onPlanningGradesChange={
                inputs
                  ? (v) => {
                    if (!v || typeof v !== "object") return;
                    setInputs((prev) => {
                      const p = prev || {};
                      let next = structuredClone(p);
                      next.gradesYears = v;
                      if (Array.isArray(v.y1)) next.grades = structuredClone(v.y1);
                      next = applyTuitionStudentCounts(next);
                      return next;
                    });
                  }
                  : null
              }
              onCurrentGradesChange={inputs ? (v) => setField("gradesCurrent", v) : null}
              kademeConfig={inputs?.temelBilgiler?.kademeler}
              dirtyPaths={dirtyPaths}
              onDirty={markDirty}
            />
          </TabProgressHeatmap>
        </div>
      )}

      {/* C) HR tab: auto compute salaries and inject into Expenses instantly (no copy button) */}
      {tab === "hr" && (
        <div style={{ marginTop: 12 }}>
          {inputs ? (
            <TabProgressHeatmap
              pct={pctValue(progMap.ik)}
              title="IK / HR"
              missingLines={progMap.ik?.missingLines}
              missingPreview={progMap.ik?.missingPreview}
            >
              <HREditorIK
                value={inputs.ik}
                kademeConfig={inputs.temelBilgiler?.kademeler}
                currencyCode={inputCurrencyCode}
                onChange={(v) => {
                  setField("ik", v);
                }}
                onSalaryComputed={(salaryByYear) => {
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
                    for (const k of keys) {
                      markDirty(`inputs.giderler.isletme.items.${k}`, Number(patch?.[k] || 0));
                    }
                    return next;
                  });
                }}
                dirtyPaths={dirtyPaths}
                onDirty={markDirty}
                uiScopeKey={uiScopeKey}
              />
            </TabProgressHeatmap>
          ) : null}
        </div>
      )}

      {tab === "report" && (
        <div style={{ marginTop: 12 }}>
          <div ref={reportExportRef} data-report-export="1" className="report-export">
            <ReportView
              results={report}
              currencyMeta={selectedScenario}
              reportCurrency={reportCurrency}
              onReportCurrencyChange={setReportCurrency}
            />
          </div>
        </div>
      )}
    </div>

  );
}

