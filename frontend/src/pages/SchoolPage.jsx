// frontend/src/pages/SchoolPage.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import { api } from "../api";
import { getGradeOptions, normalizeKademeConfig, summarizeGradesByKademe } from "../utils/kademe";
import { computeScenarioProgress } from "../utils/scenarioProgress";
import { useScenarioUiState, useScenarioUiString } from "../hooks/useScenarioUIState";
import {
  readLastVisitedPath,
  readSelectedScenarioId,
  writeLastVisitedPath,
  writeSelectedScenarioId,
  writeGlobalLastRouteSegment,
} from "../utils/schoolNavStorage";
import { getProgramType, mapBaseKademeToVariant, normalizeProgramType } from "../utils/programType";



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

  // selected scenario meta + previous year report
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [prevReport, setPrevReport] = useState(null);
  const [prevScenarioMeta, setPrevScenarioMeta] = useState(null);

  // norm
  const [norm, setNorm] = useState(null);
  const [progressConfig, setProgressConfig] = useState(null);

  // scenarios
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(() => readSelectedScenarioId(schoolId));
  const [pendingTabAfterSelect, setPendingTabAfterSelect] = useState(null);
  // inputs
  const [inputs, setInputs] = useState(null);
  const [inputsSaving, setInputsSaving] = useState(false);
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
  const [detailedReportMode, setDetailedReportMode] = useScenarioUiString("school.detailedReportMode", "detailed", { scope: uiScopeKey });
  const activeRouteSegment = useMemo(() => {
    const base = `/schools/${schoolId}/`;
    if (!location.pathname.startsWith(base)) return "";
    return location.pathname.slice(base.length).split("/")[0] || "";
  }, [location.pathname, schoolId]);
  const tab = ROUTE_TO_TAB[activeRouteSegment] || "";
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

  const scenarioProgress = useMemo(
    () => computeScenarioProgress({ inputs, norm, config: progressConfig, scenario: selectedScenario }),
    [inputs, norm, progressConfig, selectedScenario]
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

      const n = await api.getNormConfig(schoolId);
      setNorm(n);
      setBaselineNorm(n ? structuredClone(n) : null);
      clearDirtyPrefix("norm.");

      setBootLoadingLabel("Senaryolar kontrol ediliyor...");
      const sc = await api.listScenarios(schoolId);
      setScenarios(sc);
      if (selectedScenarioId != null) {
        const exists = sc.some((x) => String(x.id) === String(selectedScenarioId));
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
        clearDirtyPrefix("inputs.");
        return;
      }
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
    if (!selectedScenarioId) return;
    if (!ensurePrevRealFxForLocal("Hesaplama")) return;
    if (!options.skipPlanValidation && !ensurePlanningStudentsForY2Y3("Hesaplama")) return;
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

  async function handleExport() {
    if (!selectedScenarioId) return;
    setErr("");
    try {
      await api.downloadXlsx(schoolId, selectedScenarioId, reportCurrency);
    } catch (e) {
      setErr(e.message || "Download failed");
    }
  }

  async function handleExportPdf() {
    if (!selectedScenarioId) return;
    setErr("");
    setExportingPdf(true);
    try {
      await api.downloadPdf(schoolId, selectedScenarioId, reportCurrency);
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
  const markDirty = useCallback(
    (path, value) => {
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
    },
    [inputsLocked, getBaselineValue]
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
      if (inputsDirty) {
        event.preventDefault();
        // Chrome requires returnValue to be set.
        event.returnValue = "";
      }
    };

    // Register the event listener when there are unsaved changes.
    if (inputsDirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    // Cleanup: always remove the listener to avoid multiple handlers
    // and to ensure we do not prompt when there are no dirty inputs.
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [inputsDirty]);

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
      window.__fsUnsavedChanges = inputsDirty;
    } catch (_) {
      // In non-browser environments `window` may not exist.
    }
    return () => {
      try {
        // Clear the flag on unmount or when navigating away from this page.
        window.__fsUnsavedChanges = false;
      } catch (_) { }
    };
  }, [inputsDirty]);
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
        for (const k of keys) {
          markDirty(`inputs.giderler.isletme.items.${k}`, Number(patch?.[k] || 0));
        }
        return next;
      });
    },
    [inputsLocked, markDirty]
  );
  const handlePlanningGradesChange = React.useCallback(
    (v) => {
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
    [applyTuitionStudentCounts]
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
                  {calculating ? "Hesaplaniyor..." : calculateLabel}
                </button>

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

  function renderTopbarMetaAndActions() {


    const hasReport = Boolean(report);
    const calculateLabel = inputsDirty ? "Kaydet & Hesapla" : hasReport ? "Yeniden Hesapla" : "Hesapla";
    const exportLabel = exportingPdf ? "PDF hazirlaniyor..." : "Disa Aktar";
    const showExportButton = tab === "report" || hasReport;

    return (
      <div className="school-page school-page--portal school-topbar-inline">
        {/* pills (status/year/last saved/last calc) */}
        <div className="school-topbar-sub">

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
                  {inputsDirty
                    ? `Son kayit: ${formatRelative(lastSavedAt)} (degisiklik var)`
                    : `Kaydedildi: ${formatRelative(lastSavedAt)}`}
                </span>
              ) : null}

              {lastCalculatedAt ? (
                <span className="school-pill is-muted">Hesaplandi: {formatRelative(lastCalculatedAt)}</span>
              ) : null}
            </>
          ) : null}
        </div>

        {/* actions (same buttons + same classes) */}
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
                  {calculating ? "Hesaplaniyor..." : calculateLabel}
                </button>

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

  const outletContextValue = {
    schoolId,
    school,
    me,
    inputs,
    setField,
    norm,
    setNorm,
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

      {outlet?.headerPortalEl
        ? createPortal(renderTopbarMetaAndActions(), outlet.headerPortalEl)
        : (
          <div className="sticky-stack school-nav">
            {renderInputsHeader()}
          </div>
        )}

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
    </div>
  );
}

