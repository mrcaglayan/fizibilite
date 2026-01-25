
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
// Import additional icons for better visual cues on the action buttons.
// FaCheck is used for indicating selected rows. FaCheckCircle will represent
// approval actions and FaTrash will represent deletion actions on the toolbar.
import { FaCheck, FaCheckCircle, FaTrash } from "react-icons/fa";
import { api } from "../api";
import {
  getDefaultKademeConfig,
  getKademeDefinitions,
  getGradeOptions,
  normalizeKademeConfig,
} from "../utils/kademe";
import { PROGRAM_TYPES, normalizeProgramType } from "../utils/programType";
import {
  readSelectedScenarioId,
  writeSelectedScenarioId,
  readGlobalLastRouteSegment,
} from "../utils/schoolNavStorage";

const COPY_SELECT_TABS = [
  {
    key: "temel",
    label: "Temel Bilgiler",
    sections: [
      { id: "temel.core", label: "Kademeler + Program" },
      { id: "temel.pricing", label: "Enflasyon + Ucret Artis Oranlari + Ucret Hesaplama Ayari" },
      { id: "temel.schoolInfo", label: "Yetkililer + Okul/Egitim Bilgileri" },
      { id: "temel.discountsMeta", label: "IK Mevcut + Burs/Indirim Ogrenci Sayilari" },
      { id: "temel.competitors", label: "Rakip Analizi" },
      { id: "temel.performance", label: "Performans + Degerlendirme" },
    ],
  },
  {
    key: "kapasite",
    label: "Kapasite",
    sections: [{ id: "kapasite.all", label: "Kapasite (tumu)" }],
  },
  {
    key: "norm",
    label: "Norm",
    sections: [
      { id: "norm.planned", label: "Planlanan donem bilgileri" },
      { id: "norm.current", label: "Mevcut donem bilgileri" },
      { id: "norm.lessonY1", label: "Ders dagilimi (yalnizca Y1)" },
    ],
  },
  {
    key: "hr",
    label: "IK (HR)",
    sections: [{ id: "hr.ik", label: "IK Plan (tumu)" }],
  },
  {
    key: "gelirler",
    label: "Gelirler",
    sections: [{ id: "income.gelirler", label: "Gelirler (tumu)" }],
  },
  {
    key: "giderler",
    label: "Giderler",
    sections: [
      { id: "expenses.giderler", label: "Giderler (tumu)" },
      { id: "expenses.discounts", label: "BURS VE INDIRIMLER / YIL" },
    ],
  },
];

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

function getAllCopySectionIds() {
  return COPY_SELECT_TABS.flatMap((tab) => tab.sections.map((section) => section.id));
}

function enforceIkGiderlerPair(selection) {
  const next = { ...(selection || {}) };
  const ikSelected = !!next["hr.ik"];
  const giderlerSelected = !!next["expenses.giderler"];
  if (ikSelected !== giderlerSelected) {
    const nextValue = ikSelected || giderlerSelected;
    next["hr.ik"] = nextValue;
    next["expenses.giderler"] = nextValue;
  }
  return next;
}

function buildDefaultCopySelection(presetKey = "all") {
  const sectionIds = getAllCopySectionIds();
  const selection = Object.fromEntries(sectionIds.map((id) => [id, false]));
  if (presetKey === "all") {
    sectionIds.forEach((id) => {
      selection[id] = true;
    });
  } else if (presetKey === "structure") {
    ["temel.core", "kapasite.all", "norm.planned", "norm.lessonY1"].forEach((id) => {
      selection[id] = true;
    });
  } else if (presetKey === "financial") {
    ["temel.core", "income.gelirler", "expenses.discounts", "hr.ik", "expenses.giderler"].forEach((id) => {
      selection[id] = true;
    });
  }
  return enforceIkGiderlerPair(selection);
}

function filterInputsForCopyBySelection(srcInputs, selection) {
  const sel = selection || {};
  const keep = (id) => !!sel[id];
  const next = structuredClone(srcInputs || {});
  const buildDefaultGrades = () =>
    getGradeOptions().map((g) => ({ grade: g, branchCount: 0, studentsPerBranch: 0 }));
  const srcGradesYears =
    srcInputs?.gradesYears && typeof srcInputs.gradesYears === "object" ? srcInputs.gradesYears : {};
  const srcGrades = Array.isArray(srcInputs?.grades) ? srcInputs.grades : null;
  const y1Source = Array.isArray(srcGradesYears?.y1)
    ? srcGradesYears.y1
    : Array.isArray(srcGrades)
      ? srcGrades
      : buildDefaultGrades();
  const keepPlanned = keep("norm.planned");
  const keepLessonY1 = keep("norm.lessonY1");
  const y2Source = Array.isArray(srcGradesYears?.y2)
    ? srcGradesYears.y2
    : keepLessonY1
      ? y1Source
      : buildDefaultGrades();
  const y3Source = Array.isArray(srcGradesYears?.y3)
    ? srcGradesYears.y3
    : keepLessonY1
      ? y1Source
      : buildDefaultGrades();
  next.temelBilgiler = next.temelBilgiler || {};

  if (!keep("temel.core")) {
    delete next.temelBilgiler.kademeler;
    delete next.temelBilgiler.programType;
  }

  if (!keep("temel.pricing")) {
    delete next.temelBilgiler.inflation;
    delete next.temelBilgiler.ucretArtisOranlari;
    delete next.temelBilgiler.okulUcretleriHesaplama;
  }

  if (!keep("temel.schoolInfo")) {
    delete next.temelBilgiler.yetkililer;
    delete next.temelBilgiler.okulEgitimBilgileri;
  }

  if (!keep("temel.discountsMeta")) {
    delete next.temelBilgiler.ikMevcut;
    delete next.temelBilgiler.bursIndirimOgrenciSayilari;
  }

  if (!keep("temel.competitors")) {
    delete next.temelBilgiler.rakipAnalizi;
  }

  if (!keep("temel.performance")) {
    delete next.temelBilgiler.performans;
    delete next.temelBilgiler.degerlendirme;
  }
  if (next.temelBilgiler?.performans && typeof next.temelBilgiler.performans === "object") {
    delete next.temelBilgiler.performans.gerceklesen;
  }

  if (!keep("kapasite.all")) {
    delete next.kapasite;
    delete next.schoolCapacity;
  }

  if (!keep("norm.current")) {
    delete next.gradesCurrent;
  }

  if (!keepPlanned && !keepLessonY1) {
    delete next.gradesYears;
    delete next.grades;
  } else {
    const y1 = keepLessonY1 ? structuredClone(y1Source) : structuredClone(buildDefaultGrades());
    const y2 = keepPlanned ? structuredClone(y2Source) : structuredClone(buildDefaultGrades());
    const y3 = keepPlanned ? structuredClone(y3Source) : structuredClone(buildDefaultGrades());
    next.gradesYears = { y1, y2, y3 };
    if (keepLessonY1) {
      next.grades = structuredClone(y1);
    } else {
      delete next.grades;
    }
  }

  if (!keep("hr.ik")) {
    delete next.ik;
  }

  if (!keep("income.gelirler")) {
    delete next.gelirler;
  }

  if (!keep("expenses.giderler")) {
    delete next.giderler;
  }

  if (!keep("expenses.discounts")) {
    delete next.discounts;
  }

  return next;
}

function convertInputsUsdToLocalForCopy(inputs, fx) {
  const rate = Number(fx);
  if (!Number.isFinite(rate) || rate <= 0) return inputs;

  const mulMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return Math.round(n * rate * 100) / 100;
  };

  if (inputs?.gelirler) {
    const g = inputs.gelirler;

    const convertRows = (rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((r) => {
        if (!r || typeof r !== "object") return;
        if ("unitFee" in r) r.unitFee = mulMoney(r.unitFee);
        if ("amount" in r) r.amount = mulMoney(r.amount);
      });
    };

    convertRows(g?.tuition?.rows);
    convertRows(g?.nonEducationFees?.rows);
    convertRows(g?.dormitory?.rows);
    convertRows(g?.otherInstitutionIncome?.rows);

    if (g?.governmentIncentives != null) {
      g.governmentIncentives = mulMoney(g.governmentIncentives);
    }
  }

  if (inputs?.giderler && typeof inputs.giderler === "object") {
    Object.values(inputs.giderler).forEach((grp) => {
      if (!grp || typeof grp !== "object") return;
      if (!grp.items || typeof grp.items !== "object") return;
      Object.keys(grp.items).forEach((k) => {
        grp.items[k] = mulMoney(grp.items[k]);
      });
    });
  }

  if (inputs?.ik?.years && typeof inputs.ik.years === "object") {
    Object.values(inputs.ik.years).forEach((yearObj) => {
      if (!yearObj || typeof yearObj !== "object") return;
      if (!yearObj.unitCosts || typeof yearObj.unitCosts !== "object") return;
      Object.keys(yearObj.unitCosts).forEach((k) => {
        yearObj.unitCosts[k] = mulMoney(yearObj.unitCosts[k]);
      });
    });
  }

  if (Array.isArray(inputs?.discounts)) {
    inputs.discounts.forEach((d) => {
      if (!d || typeof d !== "object") return;
      if (String(d.mode || "").toLowerCase() === "amount") {
        d.value = mulMoney(d.value);
      }
    });
  }

  const tb = inputs?.temelBilgiler;
  if (tb) {
    if (tb?.inflation?.currentSeasonAvgFee != null) {
      tb.inflation.currentSeasonAvgFee = mulMoney(tb.inflation.currentSeasonAvgFee);
    }

    if (tb?.rakipAnalizi && typeof tb.rakipAnalizi === "object") {
      Object.values(tb.rakipAnalizi).forEach((obj) => {
        if (!obj || typeof obj !== "object") return;
        ["a", "b", "c"].forEach((k) => {
          if (k in obj) obj[k] = mulMoney(obj[k]);
        });
      });
    }

    if (tb?.performans?.gerceklesen && typeof tb.performans.gerceklesen === "object") {
      Object.keys(tb.performans.gerceklesen).forEach((k) => {
        tb.performans.gerceklesen[k] = mulMoney(tb.performans.gerceklesen[k]);
      });
    }
  }

  return inputs;
}

function convertInputsLocalToUsdForCopy(inputs, fx) {
  const rate = Number(fx);
  if (!Number.isFinite(rate) || rate <= 0) return inputs;
  return convertInputsUsdToLocalForCopy(inputs, 1 / rate);
}

function InlineSpinner({ size = 12 }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid rgba(0,0,0,0.18)",
        borderTopColor: "rgba(0,0,0,0.65)",
        display: "inline-block",
        animation: "schoolSpin .8s linear infinite",
      }}
    />
  );
}

function applyIkSalariesToGiderler(inInputs) {
  const src = inInputs || {};
  const ik = src.ik || {};
  const yearIK = ik?.years?.y1 ? ik.years.y1 : ik;

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
}

function normalizeCapacityInputs(src) {
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
}

function normalizeTemelBilgilerInputs(src) {
  const s = src || {};
  const t = s.temelBilgiler && typeof s.temelBilgiler === "object" ? s.temelBilgiler : {};
  const next = structuredClone(s);

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
}

function normalizeGradesInputs(src) {
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
    if (a.length !== b.length) return false;
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
}

function getScenarioStatusMeta(status) {
  switch (status) {
    case "draft":
      return { label: "Taslak", cls: "is-draft" };
    case "submitted":
      return { label: "Gonderildi", cls: "is-submitted" };
    case "revision_requested":
      return { label: "Revizyon Istendi", cls: "is-revision" };
    case "approved":
      return { label: "Onaylandi", cls: "is-approved" };
    default:
      return { label: status || "-", cls: "is-unknown" };
  }
}

export default function SelectPage() {
  const navigate = useNavigate();
  const outlet = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [schools, setSchools] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);
  const [selectedScenarioIdLocal, setSelectedScenarioIdLocal] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [inputs, setInputs] = useState(null);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioPeriod, setNewScenarioPeriod] = useState("split");
  const [newScenarioStartYear, setNewScenarioStartYear] = useState(DEFAULT_START_YEAR);
  const [newScenarioEndYear, setNewScenarioEndYear] = useState(DEFAULT_END_YEAR);
  const [newScenarioKademeler, setNewScenarioKademeler] = useState(getDefaultKademeConfig());
  const [newScenarioInputCurrency, setNewScenarioInputCurrency] = useState("USD");
  const [newScenarioLocalCurrencyCode, setNewScenarioLocalCurrencyCode] = useState("");
  const [newScenarioFxUsdToLocal, setNewScenarioFxUsdToLocal] = useState("");
  const [newScenarioProgramType, setNewScenarioProgramType] = useState(null);
  const [newScenarioStep, setNewScenarioStep] = useState(0);
  const [scenarioWizardOpen, setScenarioWizardOpen] = useState(false);
  const [scenarioWizardMode, setScenarioWizardMode] = useState("create");
  const [scenarioWizardScenario, setScenarioWizardScenario] = useState(null);
  const [scenarioWizardLoading, setScenarioWizardLoading] = useState(false);
  const [scenarioWizardSaving, setScenarioWizardSaving] = useState(false);

  const [scenarioSort, setScenarioSort] = useState({ key: null, dir: "asc" });
  const [submittingScenarioId, setSubmittingScenarioId] = useState(null);
  const [copyingScenarioId, setCopyingScenarioId] = useState(null);
  const [deletingScenarioId, setDeletingScenarioId] = useState(null);
  const [deleteConfirmScenarioId, setDeleteConfirmScenarioId] = useState(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyModalError, setCopyModalError] = useState("");
  const [copySelection, setCopySelection] = useState(null);
  const [copySelectionMsg, setCopySelectionMsg] = useState("");
  const [copyTargetCurrency, setCopyTargetCurrency] = useState("USD");
  const [copyLocalCurrencyCode, setCopyLocalCurrencyCode] = useState("");
  const [copyPlannedFxUsdToLocal, setCopyPlannedFxUsdToLocal] = useState("");
  const [copyFxUsdToLocal, setCopyFxUsdToLocal] = useState("");
  const [calculating, setCalculating] = useState(false);

  const copySelectionMsgTimerRef = useRef(null);

  useEffect(() => {
    if (!outlet?.setHeaderMeta) return;
    outlet.setHeaderMeta({
      title: "Okul & Senaryo Sec",
      subtitle: "Okul ve senaryoyu secip Uygula'ya basin.",
      centered: true,
    });
    return () => {
      outlet.clearHeaderMeta?.();
    };
  }, [outlet]);

  const loadSchools = useCallback(async () => {
    setErr("");
    setLoadingSchools(true);
    try {
      const rows = await api.listSchools();
      setSchools(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message || "Okullar yuklenemedi.");
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    const raw = searchParams.get("schoolId");
    const paramId = Number(raw || 0);
    if (!raw || !Number.isFinite(paramId)) return;
    if (!schools.length) return;
    if (!schools.some((s) => String(s.id) === String(paramId))) return;
    setSelectedSchoolId((prev) => (String(prev) === String(paramId) ? prev : paramId));
  }, [searchParams, schools]);

  const handleSelectSchool = useCallback(
    (schoolId) => {
      const isDifferent = String(selectedSchoolId) !== String(schoolId);
      if (isDifferent) {
        setSelectedScenarioIdLocal(null);
        setSelectedScenario(null);
        setInputs(null);
        setReport(null);
      }
      setSelectedSchoolId(schoolId);
      if (isDifferent) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("schoolId", String(schoolId));
          return next;
        });
      }
    },
    [selectedSchoolId, setSearchParams]
  );

  useEffect(() => {
    if (!selectedSchoolId) {
      setScenarios([]);
      setSelectedScenarioIdLocal(null);
      setSelectedScenario(null);
      setInputs(null);
      setReport(null);
      return;
    }

    setSelectedScenarioIdLocal(null);
    setSelectedScenario(null);
    setInputs(null);
    setReport(null);

    let active = true;
    setErr("");
    setLoadingScenarios(true);
    async function loadScenarios() {
      try {
        const sc = await api.listScenarios(selectedSchoolId);
        if (!active) return;
        const rows = Array.isArray(sc) ? sc : [];
        setScenarios(rows);
        setSelectedScenarioIdLocal((prev) => {
          const exists = rows.some((s) => String(s.id) === String(prev));
          if (exists) return prev;
          const stored = readSelectedScenarioId(selectedSchoolId);
          if (stored != null && rows.some((s) => String(s.id) === String(stored))) return stored;
          return null;
        });
      } catch (e) {
        if (!active) return;
        setErr(e.message || "Senaryolar yuklenemedi.");
        setScenarios([]);
      } finally {
        if (active) setLoadingScenarios(false);
      }
    }

    loadScenarios();
    return () => {
      active = false;
    };
  }, [selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId || !selectedScenarioIdLocal) {
      setSelectedScenario(null);
      setInputs(null);
      setReport(null);
      return;
    }

    let active = true;
    setErr("");
    async function loadScenario() {
      try {
        const data = await api.getScenarioInputs(selectedSchoolId, selectedScenarioIdLocal);
        if (!active) return;
        setSelectedScenario(data?.scenario || null);
        const raw = data?.inputs;
        const normalized =
          raw && typeof raw === "object"
            ? normalizeGradesInputs(normalizeTemelBilgilerInputs(normalizeCapacityInputs(raw)))
            : raw;
        setInputs(normalized);
        setReport(null);
      } catch (e) {
        if (!active) return;
        setErr(e.message || "Senaryo yuklenemedi.");
      }
    }

    loadScenario();
    return () => {
      active = false;
    };
  }, [selectedSchoolId, selectedScenarioIdLocal]);

  const refreshScenarios = useCallback(async () => {
    if (!selectedSchoolId) return null;
    try {
      const sc = await api.listScenarios(selectedSchoolId);
      const rows = Array.isArray(sc) ? sc : [];
      setScenarios(rows);
      return rows;
    } catch (_) {
      return null;
    }
  }, [selectedSchoolId]);

  const kademeDefs = useMemo(() => getKademeDefinitions(), []);
  const gradeOptions = useMemo(() => getGradeOptions(), []);

  const draftStartYear = normalizeYearInput(newScenarioStartYear);
  const draftEndYear = normalizeYearInput(newScenarioEndYear);
  const draftAcademicYear = formatAcademicYear(newScenarioPeriod, newScenarioStartYear, newScenarioEndYear);
  const draftRangeOk = newScenarioPeriod === "full" || (draftStartYear != null && draftEndYear === draftStartYear + 1);
  const yearConflict = useMemo(() => {
    if (!draftAcademicYear) return false;
    const excludeId =
      scenarioWizardMode === "edit"
        ? Number(scenarioWizardScenario?.id || selectedScenarioIdLocal || 0)
        : null;
    return scenarios.some(
      (s) =>
        String(s?.academic_year || "").trim() === String(draftAcademicYear).trim() &&
        (excludeId == null || Number(s?.id) !== excludeId)
    );
  }, [draftAcademicYear, scenarios, scenarioWizardMode, scenarioWizardScenario?.id, selectedScenarioIdLocal]);

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
  const scenarioStepTotal = 6;
  const scenarioStepLabels = [
    "Donem Turu",
    "Para Birimi",
    "Program Turu",
    "Yil",
    "Kademeler",
    "Senaryo Adi",
  ];
  const scenarioStepOk = [
    true,
    currencyStepOk,
    Boolean(newScenarioProgramType),
    Boolean(draftAcademicYear) && draftRangeOk && !yearConflict,
    hasEnabledKademe,
    draftReady,
  ];

  const scenarioOpsBusy = Boolean(
    copyingScenarioId ||
    submittingScenarioId ||
    deletingScenarioId ||
    scenarioWizardSaving ||
    scenarioWizardLoading
  );
  const busyRowId = copyingScenarioId ?? submittingScenarioId ?? deletingScenarioId ?? null;
  const selectedRowScenario = useMemo(
    () => scenarios.find((s) => String(s.id) === String(selectedScenarioIdLocal)) || null,
    [scenarios, selectedScenarioIdLocal]
  );
  const sortedScenarios = useMemo(() => {
    if (!scenarioSort.key) return scenarios;
    const indexed = scenarios.map((s, idx) => ({ s, idx }));
    const dirMul = scenarioSort.dir === "asc" ? 1 : -1;

    const getYearParts = (ay) => {
      const m = String(ay || "").match(/(\d{4})(?:\s*-\s*(\d{4}))?/);
      const a = m ? Number(m[1]) : 0;
      const b = m && m[2] ? Number(m[2]) : a;
      return [a || 0, b || 0];
    };

    const getCurrencyCode = (s) =>
      String(s.input_currency || "USD").toUpperCase() === "LOCAL"
        ? String(s.local_currency_code || "LOCAL").toUpperCase()
        : "USD";

    const getStatusLabel = (status) => {
      switch (status) {
        case "submitted":
          return "Gonderildi";
        case "revision_requested":
          return "Revizyon Istendi";
        case "approved":
          return "Onaylandi";
        default:
          return "Taslak";
      }
    };

    indexed.sort((a, b) => {
      const A = a.s;
      const B = b.s;
      let res = 0;

      switch (scenarioSort.key) {
        case "name":
          res = String(A.name || "").localeCompare(String(B.name || ""), "tr", {
            sensitivity: "base",
            numeric: true,
          });
          break;
        case "year": {
          const [a1, a2] = getYearParts(A.academic_year);
          const [b1, b2] = getYearParts(B.academic_year);
          res = a1 - b1 || a2 - b2;
          break;
        }
        case "currency":
          res = getCurrencyCode(A).localeCompare(getCurrencyCode(B), "tr", {
            sensitivity: "base",
            numeric: true,
          });
          break;
        case "status":
          res = getStatusLabel(A.status).localeCompare(getStatusLabel(B.status), "tr", {
            sensitivity: "base",
            numeric: true,
          });
          break;
        case "date":
          res = new Date(A.created_at).getTime() - new Date(B.created_at).getTime();
          break;
        default:
          res = 0;
      }

      if (res === 0) res = a.idx - b.idx;
      return res * dirMul;
    });

    return indexed.map((item) => item.s);
  }, [scenarios, scenarioSort]);
  const toggleScenarioSort = (key) => {
    setScenarioSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };
  const getSortAria = (key) => {
    if (scenarioSort.key !== key) return "none";
    return scenarioSort.dir === "asc" ? "ascending" : "descending";
  };
  const sortIcon = (key) => {
    if (scenarioSort.key !== key) return <span className="sort-icon is-idle">?</span>;
    return <span className="sort-icon">{scenarioSort.dir === "asc" ? "?" : "?"}</span>;
  };

  const copySectionIds = useMemo(() => getAllCopySectionIds(), []);
  const selectedCopyCount = copySelection
    ? copySectionIds.reduce((sum, id) => sum + (copySelection[id] ? 1 : 0), 0)
    : 0;
  const selIk = !!copySelection?.["hr.ik"];
  const selGiderler = !!copySelection?.["expenses.giderler"];
  const isIkGiderlerValid = selIk === selGiderler;
  const sourceCurrency = String(selectedScenario?.input_currency || "USD").toUpperCase();
  const inputCurrencyCode =
    selectedScenario?.input_currency === "LOCAL"
      ? selectedScenario.local_currency_code || "LOCAL"
      : "USD";
  const isLocalScenario = selectedScenario?.input_currency === "LOCAL";
  const prevRealFxValue = Number(inputs?.temelBilgiler?.performans?.prevYearRealizedFxUsdToLocal || 0);
  const prevRealFxMissing = isLocalScenario && !(Number.isFinite(prevRealFxValue) && prevRealFxValue > 0);

  const toolbarLocked =
    selectedRowScenario?.status === "submitted" || selectedRowScenario?.status === "approved";
  const canEditToolbar = Boolean(selectedRowScenario) && !toolbarLocked;
  const canDeleteToolbar = Boolean(selectedRowScenario) && !toolbarLocked;
  const canSubmitToolbar =
    Boolean(selectedRowScenario) &&
    (selectedRowScenario.status === "draft" || selectedRowScenario.status === "revision_requested");
  const canCopyToolbar = Boolean(selectedRowScenario) && inputs;
  const toolbarIsCopying =
    selectedRowScenario && String(copyingScenarioId) === String(selectedRowScenario.id);
  const toolbarIsSubmitting =
    selectedRowScenario && String(submittingScenarioId) === String(selectedRowScenario.id);
  const toolbarIsDeleting =
    selectedRowScenario && String(deletingScenarioId) === String(selectedRowScenario.id);

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
      if (!newScenarioProgramType) return "Program Turu secilmelidir.";
    }
    if (step === 3) {
      if (!draftAcademicYear) return "Lutfen gecerli bir akademik yil girin.";
      if (!draftRangeOk) return "Bitis yili, baslangic yilindan 1 fazla olmali.";
      if (yearConflict) return "Bu yil turu icin zaten bir senaryo var. Lutfen baska bir yil secin.";
    }
    if (step === 4 && !hasEnabledKademe) return "En az bir kademe secmelisiniz.";
    if (step === 5 && !newScenarioName.trim()) return "Senaryo adi zorunludur.";
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
    setNewScenarioProgramType(null);
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
    if (!selectedSchoolId) {
      setErr("Once okul secin.");
      return;
    }
    setErr("");
    resetScenarioWizard();
    setScenarioWizardMode("create");
    setScenarioWizardScenario(null);
    setScenarioWizardOpen(true);
  }

  async function openScenarioWizardEdit(scenarioId) {
    if (!selectedSchoolId) return;
    setErr("");
    const targetScenario = scenarios.find((s) => String(s.id) === String(scenarioId));
    if (targetScenario && (targetScenario.status === "submitted" || targetScenario.status === "approved")) {
      setErr("Senaryo onayda veya onaylandi, duzenlenemez.");
      return;
    }
    setSelectedScenarioIdLocal(scenarioId);
    setScenarioWizardMode("edit");
    setScenarioWizardScenario(null);
    setScenarioWizardOpen(true);
    setScenarioWizardLoading(true);
    setNewScenarioStep(0);
    try {
      const data = await api.getScenarioInputs(selectedSchoolId, scenarioId);
      const scenario = data?.scenario;
      if (!scenario) throw new Error("Senaryo bulunamadi.");
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
      setNewScenarioProgramType(scenario.program_type || PROGRAM_TYPES.LOCAL);
    } catch (e) {
      setErr(e.message || "Senaryo yuklenemedi.");
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
    if (!selectedSchoolId) return;
    const name = newScenarioName.trim();
    if (!name) return;
    if (!draftAcademicYear) {
      setErr("Lutfen gecerli bir akademik yil girin.");
      return;
    }
    if (!draftRangeOk) {
      setErr("Bitis yili, baslangic yilindan 1 fazla olmali.");
      return;
    }
    if (yearConflict) {
      setErr("Bu yil turu icin zaten bir senaryo var. Lutfen baska bir yil secin.");
      return;
    }
    if (!hasEnabledKademe) {
      setErr("En az bir kademe secmelisiniz.");
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
      const scenarioProgramType = newScenarioProgramType || PROGRAM_TYPES.LOCAL;
      const kademeConfig = normalizeKademeConfig(newScenarioKademeler);
      const created = await api.createScenario(selectedSchoolId, {
        name,
        academicYear: draftAcademicYear,
        kademeConfig,
        inputCurrency: newScenarioInputCurrency,
        localCurrencyCode: newScenarioInputCurrency === "LOCAL" ? normalizedLocalCode : null,
        fxUsdToLocal: newScenarioInputCurrency === "LOCAL" ? newScenarioFxUsdToLocal : null,
        programType: scenarioProgramType,
      });
      await refreshScenarios();
      setSelectedScenarioIdLocal(created.id);
      setScenarioWizardOpen(false);
      setNewScenarioStep(0);
    } catch (e) {
      setErr(e.message || "Senaryo olusturulamadi.");
    } finally {
      setScenarioWizardSaving(false);
    }
  }

  async function updateScenario() {
    if (!selectedSchoolId || !scenarioWizardScenario?.id) return;
    const name = newScenarioName.trim();
    if (!name) return;
    if (!draftAcademicYear) {
      setErr("Lutfen gecerli bir akademik yil girin.");
      return;
    }
    if (!draftRangeOk) {
      setErr("Bitis yili, baslangic yilindan 1 fazla olmali.");
      return;
    }
    if (yearConflict) {
      setErr("Bu yil turu icin zaten bir senaryo var. Lutfen baska bir yil secin.");
      return;
    }
    if (!hasEnabledKademe) {
      setErr("En az bir kademe secmelisiniz.");
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
      const scenarioProgramType = newScenarioProgramType || PROGRAM_TYPES.LOCAL;
      const kademeConfig = normalizeKademeConfig(newScenarioKademeler);
      await api.updateScenario(selectedSchoolId, scenarioWizardScenario.id, {
        name,
        academicYear: draftAcademicYear,
        kademeConfig,
        programType: scenarioProgramType,
        localCurrencyCode:
          scenarioWizardScenario?.input_currency === "LOCAL" ? normalizedLocalCode : undefined,
        fxUsdToLocal:
          scenarioWizardScenario?.input_currency === "LOCAL" ? newScenarioFxUsdToLocal : undefined,
      });
      await refreshScenarios();
      setSelectedScenarioIdLocal(scenarioWizardScenario.id);
      setSelectedScenario((prev) =>
        prev && prev.id === scenarioWizardScenario.id
          ? {
            ...prev,
            name,
            academic_year: draftAcademicYear,
            program_type: scenarioProgramType,
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
        next.temelBilgiler.programType = scenarioProgramType;
        return next;
      });
      setScenarioWizardOpen(false);
      setNewScenarioStep(0);
    } catch (e) {
      setErr(e.message || "Senaryo guncellenemedi.");
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

  const parseFxInput = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return NaN;
    const normalized = raw.replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return NaN;
    const num = Number.parseFloat(match[0]);
    return Number.isFinite(num) ? num : NaN;
  };

  const showCopySelectionMsg = (message) => {
    if (copySelectionMsgTimerRef.current) {
      clearTimeout(copySelectionMsgTimerRef.current);
    }
    setCopySelectionMsg(message);
    copySelectionMsgTimerRef.current = setTimeout(() => {
      setCopySelectionMsg("");
    }, 2000);
  };

  const applyPresetSelection = (presetKey) => {
    setCopySelection(buildDefaultCopySelection(presetKey));
    setCopySelectionMsg("");
  };

  const toggleCopySelection = (id, value) => {
    if (scenarioOpsBusy) return;
    setCopySelection((prev) => {
      const base = prev || buildDefaultCopySelection("all");
      const next = { ...base };
      if (id === "hr.ik" || id === "expenses.giderler") {
        next["hr.ik"] = value;
        next["expenses.giderler"] = value;
        showCopySelectionMsg(`IK ve Giderler birlikte ${value ? "secildi" : "kaldirildi"}.`);
      } else {
        next[id] = value;
      }
      return enforceIkGiderlerPair(next);
    });
  };

  const setCopyTabSelectionAll = (tabKey, value) => {
    if (scenarioOpsBusy) return;
    const tab = COPY_SELECT_TABS.find((entry) => entry.key === tabKey);
    if (!tab) return;
    setCopySelection((prev) => {
      const base = prev || buildDefaultCopySelection("all");
      const next = { ...base };
      tab.sections.forEach((section) => {
        next[section.id] = value;
      });
      return enforceIkGiderlerPair(next);
    });
  };

  function openCopyScenarioModal() {
    if (!selectedScenarioIdLocal || !selectedScenario || !inputs) return;
    if (copyingScenarioId) return;
    setErr("");
    setCopyModalError("");
    setCopySelection(buildDefaultCopySelection("all"));
    setCopySelectionMsg("");
    setCopyTargetCurrency(sourceCurrency === "LOCAL" ? "LOCAL" : "USD");
    setCopyLocalCurrencyCode("");
    setCopyPlannedFxUsdToLocal("");
    setCopyFxUsdToLocal("");
    setCopyModalOpen(true);
  }

  function closeCopyScenarioModal() {
    setCopyModalOpen(false);
    setCopyModalError("");
  }

  async function confirmCopyScenarioModal() {
    if (!copySelection) return;
    if (copyingScenarioId) return;
    const selection = enforceIkGiderlerPair(copySelection);

    const targetCurrency = String(copyTargetCurrency || sourceCurrency).toUpperCase();
    let localCurrencyCodeValue = null;
    let plannedFxUsdToLocalValue = null;
    let copyFxUsdToLocalValue = null;

    if (sourceCurrency === "USD" && targetCurrency === "LOCAL") {
      const normalizedLocalCode = String(copyLocalCurrencyCode || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10);
      if (!CURRENCY_CODE_REGEX.test(normalizedLocalCode)) {
        setCopyModalError("Local para birimi kodu gecersiz.");
        return;
      }
      const plannedFxNumber = parseFxInput(copyPlannedFxUsdToLocal);
      if (!Number.isFinite(plannedFxNumber) || plannedFxNumber <= 0) {
        setCopyModalError("Gecerli bir kur girilmelidir.");
        return;
      }
      const copyFxNumber = parseFxInput(copyFxUsdToLocal);
      if (!Number.isFinite(copyFxNumber) || copyFxNumber <= 0) {
        setCopyModalError("Gecerli bir kopyalama kuru girilmelidir.");
        return;
      }
      localCurrencyCodeValue = normalizedLocalCode;
      plannedFxUsdToLocalValue = plannedFxNumber;
      copyFxUsdToLocalValue = copyFxNumber;
    }

    if (sourceCurrency === "LOCAL" && targetCurrency === "USD") {
      const copyFxNumber = parseFxInput(copyFxUsdToLocal);
      if (!Number.isFinite(copyFxNumber) || copyFxNumber <= 0) {
        setCopyModalError("Gecerli bir kopyalama kuru girilmelidir.");
        return;
      }
      copyFxUsdToLocalValue = copyFxNumber;
    }

    closeCopyScenarioModal();
    await copySelectedScenario({
      targetCurrency,
      localCurrencyCode: localCurrencyCodeValue,
      plannedFxUsdToLocal: plannedFxUsdToLocalValue,
      copyFxUsdToLocal: copyFxUsdToLocalValue,
      selection,
    });
  }

  async function copySelectedScenario(copyOptions = {}) {
    if (!selectedScenarioIdLocal || !selectedScenario || !inputs) return;
    if (copyingScenarioId) return;
    if (!selectedScenario.academic_year) {
      setErr("Akademik yil bulunamadi.");
      return;
    }

    setErr("");
    const selection = enforceIkGiderlerPair(copyOptions?.selection || buildDefaultCopySelection("all"));
    if (!!selection["hr.ik"] !== !!selection["expenses.giderler"]) {
      toast.warn("IK ve Giderler birlikte secilmelidir.");
      return;
    }
    const targetCurrency = String(copyOptions?.targetCurrency || sourceCurrency).toUpperCase();
    let localCurrencyCode = copyOptions?.localCurrencyCode ?? null;
    let plannedFxUsdToLocal = copyOptions?.plannedFxUsdToLocal ?? null;
    let copyFxUsdToLocal = copyOptions?.copyFxUsdToLocal ?? null;
    let plannedFxParsed = parseFxInput(plannedFxUsdToLocal);
    let copyFxParsed = parseFxInput(copyFxUsdToLocal);

    if (sourceCurrency === "LOCAL" && targetCurrency === "LOCAL") {
      localCurrencyCode = localCurrencyCode ?? selectedScenario.local_currency_code ?? "";
      plannedFxUsdToLocal = plannedFxUsdToLocal ?? selectedScenario.fx_usd_to_local;
      plannedFxParsed = parseFxInput(plannedFxUsdToLocal);
    }

    if (sourceCurrency === "LOCAL" && targetCurrency === "USD") {
      copyFxUsdToLocal = copyFxUsdToLocal ?? selectedScenario.fx_usd_to_local;
      copyFxParsed = parseFxInput(copyFxUsdToLocal);
      if (!Number.isFinite(copyFxParsed) || copyFxParsed <= 0) {
        toast.warn("Gecerli bir kopyalama kuru girilmelidir.");
        return;
      }
    }

    if (sourceCurrency === "USD" && targetCurrency === "LOCAL") {
      if (!localCurrencyCode || !CURRENCY_CODE_REGEX.test(localCurrencyCode)) {
        toast.warn("Local para birimi kodu gecersiz.");
        return;
      }
      if (!Number.isFinite(plannedFxParsed) || plannedFxParsed <= 0) {
        toast.warn("Gecerli bir kur girilmelidir.");
        return;
      }
      if (!Number.isFinite(copyFxParsed) || copyFxParsed <= 0) {
        toast.warn("Gecerli bir kopyalama kuru girilmelidir.");
        return;
      }
    }

    setCopyingScenarioId(selectedScenarioIdLocal);
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

      const shouldCopyCore = !!selection["temel.core"];
      const kademeConfig = normalizeKademeConfig(
        shouldCopyCore ? inputs?.temelBilgiler?.kademeler || getDefaultKademeConfig() : getDefaultKademeConfig()
      );
      const programType = shouldCopyCore
        ? selectedScenario?.program_type || PROGRAM_TYPES.LOCAL
        : PROGRAM_TYPES.LOCAL;
      const fxForCreate =
        targetCurrency === "LOCAL" && Number.isFinite(plannedFxParsed) && plannedFxParsed > 0
          ? plannedFxParsed
          : null;
      const created = await api.createScenario(selectedSchoolId, {
        name: copyName,
        academicYear: candidateYear,
        kademeConfig,
        inputCurrency: targetCurrency,
        localCurrencyCode: targetCurrency === "LOCAL" ? localCurrencyCode || "" : null,
        fxUsdToLocal: fxForCreate,
        programType,
      });

      let clonedInputs = filterInputsForCopyBySelection(inputs, selection);
      if (selection["hr.ik"] && selection["expenses.giderler"]) {
        clonedInputs = applyIkSalariesToGiderler(clonedInputs);
      }
      clonedInputs = normalizeTemelBilgilerInputs(clonedInputs);
      clonedInputs = normalizeCapacityInputs(clonedInputs);
      clonedInputs = normalizeGradesInputs(clonedInputs);

      if (sourceCurrency === "USD" && targetCurrency === "LOCAL") {
        clonedInputs = convertInputsUsdToLocalForCopy(clonedInputs, copyFxParsed);
        clonedInputs.temelBilgiler = clonedInputs.temelBilgiler || {};
        clonedInputs.temelBilgiler.performans = clonedInputs.temelBilgiler.performans || {};
        clonedInputs.temelBilgiler.performans.prevYearRealizedFxUsdToLocal = Number(copyFxParsed);
      }

      if (sourceCurrency === "LOCAL" && targetCurrency === "USD") {
        clonedInputs = convertInputsLocalToUsdForCopy(clonedInputs, copyFxParsed);
        clonedInputs.temelBilgiler = clonedInputs.temelBilgiler || {};
        clonedInputs.temelBilgiler.performans = clonedInputs.temelBilgiler.performans || {};
        clonedInputs.temelBilgiler.performans.prevYearRealizedFxUsdToLocal = Number(copyFxParsed);
      }

      await api.saveScenarioInputs(selectedSchoolId, created.id, clonedInputs);

      await refreshScenarios();
      setSelectedScenarioIdLocal(created.id);
      toast.success("Senaryo kopyalandi.");
    } catch (e) {
      setErr(e.message || "Scenario copy failed");
    } finally {
      setCopyingScenarioId(null);
    }
  }

  function openDeleteScenarioModal(scenarioId) {
    if (!scenarioId || scenarioOpsBusy) return;
    setDeleteConfirmScenarioId(scenarioId);
  }

  async function confirmDeleteScenario() {
    if (!deleteConfirmScenarioId) return;
    const scenarioId = deleteConfirmScenarioId;
    setDeleteConfirmScenarioId(null);
    await deleteScenario(scenarioId);
  }

  async function deleteScenario(scenarioId) {
    if (!selectedSchoolId || !scenarioId) return;
    if (scenarioOpsBusy) return;
    const target = scenarios.find((s) => String(s.id) === String(scenarioId));
    if (!target) return;
    if (target.status === "submitted" || target.status === "approved") {
      setErr("Senaryo onayda veya onaylandi, silinemez.");
      return;
    }

    setErr("");
    setDeletingScenarioId(scenarioId);
    try {
      await api.deleteScenario(selectedSchoolId, scenarioId);
      const sc = await refreshScenarios();
      if (Array.isArray(sc)) {
        if (!sc.length) {
          setSelectedScenarioIdLocal(null);
          setInputs(null);
          setReport(null);
        } else if (!sc.some((s) => String(s.id) === String(selectedScenarioIdLocal))) {
          setSelectedScenarioIdLocal(sc[0].id);
        }
      }
      toast.success("Senaryo silindi.");
    } catch (e) {
      setErr(e.message || "Senaryo silinemedi.");
    } finally {
      setDeletingScenarioId(null);
    }
  }

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
    toast.warn(message, {
      toastId,
      position: "bottom-right",
      autoClose: false,
      closeOnClick: false,
      draggable: true,
      icon: "!",
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
    if (!inputs) return true;

    const totals = getPlannedStudentTotalsByYear(inputs);
    const missing = [];
    if (!(totals.y2 > 0)) missing.push("Y2");
    if (!(totals.y3 > 0)) missing.push("Y3");
    if (!missing.length) return true;

    const msg =
      `${actionLabel} yapilamaz: Norm > Planlanan Donem Bilgileri bolumunde ` +
      `${missing.join(" ve ")} toplam ogrenci 0 gorunuyor. Lutfen Y2/Y3 ogrenci sayilarini girin.`;

    setErr("");
    showBlockingToast(msg, "norm-y2y3-missing");
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
    return false;
  }

  async function calculate(options = {}) {
    if (!selectedSchoolId || !selectedScenarioIdLocal) return;
    if (!ensurePrevRealFxForLocal("Hesaplama")) return;
    if (!options.skipPlanValidation && !ensurePlanningStudentsForY2Y3("Hesaplama")) return;
    setCalculating(true);
    setErr("");
    try {
      const data = await api.calculateScenario(selectedSchoolId, selectedScenarioIdLocal);
      setReport(data.results);
    } catch (e) {
      setErr(e.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
  }

  async function submitScenarioForApproval(scenarioId) {
    if (!selectedSchoolId || !scenarioId || scenarioId !== selectedScenarioIdLocal) return;
    if (!ensurePrevRealFxForLocal("Onaya gonderme")) return;
    if (!ensurePlanningStudentsForY2Y3("Onaya gonderme")) return;
    if (submittingScenarioId) return;

    setErr("");
    setSubmittingScenarioId(scenarioId);
    try {
      const shouldCalculate = !report;
      if (shouldCalculate) {
        await calculate({ keepTab: true });
      }
      const data = await api.submitScenario(selectedSchoolId, scenarioId);
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

  const deleteConfirmScenario =
    deleteConfirmScenarioId != null
      ? scenarios.find((s) => String(s.id) === String(deleteConfirmScenarioId))
      : null;
  const deleteConfirmLabel = deleteConfirmScenario?.name
    ? `"${deleteConfirmScenario.name}"`
    : "Senaryo";
  const deleteConfirmMessage =
    deleteConfirmScenarioId != null &&
      String(deleteConfirmScenarioId) === String(selectedScenarioIdLocal) &&
      scenarios.length <= 1
      ? `${deleteConfirmLabel} son senaryo. Silerseniz senaryo secimi temizlenir.`
      : `${deleteConfirmLabel} silinecek. Devam edilsin mi?`;

  const handleApply = () => {
    if (!selectedSchoolId || !selectedScenarioIdLocal) return;
    // Persist the selected scenario. Regardless of which scenario the user
    // chooses, navigate to the globally last viewed sidebar page. This ensures
    // that when switching schools or scenarios the user lands on the same
    // section (e.g. Gelirler). If no global route has been recorded, default
    // to the "temel-bilgiler" page.
    writeSelectedScenarioId(selectedSchoolId, selectedScenarioIdLocal);
    const seg = readGlobalLastRouteSegment() || "temel-bilgiler";
    navigate(`/schools/${selectedSchoolId}/${seg}`, { replace: true });
  };

  return (
    <div className="container">
      <ToastContainer position="bottom-right" autoClose={3500} newestOnTop closeOnClick pauseOnFocusLoss pauseOnHover hideProgressBar theme="dark" />
      <style>{`@keyframes schoolSpin{to{transform:rotate(360deg)}}`}</style>

      {err ? (
        <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
          {err}
        </div>
      ) : null}

      {deleteConfirmScenarioId ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Senaryo Sil</div>
            <div className="small">{deleteConfirmMessage}</div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setDeleteConfirmScenarioId(null)} disabled={scenarioOpsBusy}>
                Iptal
              </button>
              <button className="btn danger" onClick={confirmDeleteScenario} disabled={scenarioOpsBusy}>
                Sil
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copyModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div
            className="modal"
            style={{
              width: "min(980px, 96vw)",
              maxHeight: "86vh",
              overflowY: "auto",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>Senaryo Kopyalama</div>
              <button className="btn" onClick={closeCopyScenarioModal} disabled={scenarioOpsBusy}>
                Kapat
              </button>
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Yeni senaryo icin para birimini secin.
            </div>

            {copyModalError ? (
              <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
                {copyModalError}
              </div>
            ) : null}

            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Para Birimi</div>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <label className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="copy-currency"
                    checked={copyTargetCurrency === "USD"}
                    onChange={() => {
                      setCopyTargetCurrency("USD");
                      setCopyModalError("");
                    }}
                  />
                  <span>USD</span>
                </label>
                <label className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="copy-currency"
                    checked={copyTargetCurrency === "LOCAL"}
                    onChange={() => {
                      setCopyTargetCurrency("LOCAL");
                      setCopyModalError("");
                    }}
                  />
                  <span>LOCAL</span>
                </label>
              </div>
            </div>

            {sourceCurrency === "USD" && copyTargetCurrency === "LOCAL" ? (
              <div style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <div className="small" style={{ fontWeight: 700 }}>Local currency code</div>
                  <input
                    className="input sm"
                    list="local-currency-codes-copy"
                    placeholder="TRY"
                    value={copyLocalCurrencyCode}
                    onChange={(e) =>
                      setCopyLocalCurrencyCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                      )
                    }
                  />
                  <datalist id="local-currency-codes-copy">
                    {LOCAL_CURRENCY_OPTIONS.map((code) => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                </div>

                <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 10 }}>
                  <span>1 USD =</span>
                  <input
                    className="input sm"
                    type="number"
                    step="0.000001"
                    value={copyPlannedFxUsdToLocal}
                    onChange={(e) => setCopyPlannedFxUsdToLocal(e.target.value)}
                  />
                  <span>{copyLocalCurrencyCode || "LOCAL"}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Planlanan kur (senaryo ayarlari icin).
                </div>

                <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 10 }}>
                  <span>Kopyalama kuru:</span>
                  <input
                    className="input sm"
                    type="number"
                    step="0.000001"
                    value={copyFxUsdToLocal}
                    onChange={(e) => setCopyFxUsdToLocal(e.target.value)}
                  />
                  <span>{copyLocalCurrencyCode || "LOCAL"}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Kopyalama kuruna gore tum rakamlar cevrilir.
                </div>
              </div>
            ) : null}

            {sourceCurrency === "LOCAL" && copyTargetCurrency === "USD" ? (
              <div style={{ marginTop: 12 }}>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span>1 USD =</span>
                  <input
                    className="input sm"
                    type="number"
                    step="0.000001"
                    value={copyFxUsdToLocal}
                    onChange={(e) => setCopyFxUsdToLocal(e.target.value)}
                  />
                  <span>{inputCurrencyCode}</span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Kopyalama kuru (LOCAL -&gt; USD).
                </div>
              </div>
            ) : null}

            {copySelectionMsg ? (
              <div className="small" style={{ marginTop: 10, color: "#0369a1" }}>
                {copySelectionMsg}
              </div>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>Kopyalanacak Bolumler</div>
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <div className="small muted">Secili: {selectedCopyCount}</div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => applyPresetSelection("all")}
                    disabled={scenarioOpsBusy}
                  >
                    Tumu
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => applyPresetSelection("structure")}
                    disabled={scenarioOpsBusy}
                  >
                    Yapisi
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => applyPresetSelection("financial")}
                    disabled={scenarioOpsBusy}
                  >
                    Finans
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                {COPY_SELECT_TABS.map((tab) => (
                  <div key={tab.key} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>{tab.label}</div>
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "2px 6px", fontSize: 12 }}
                          onClick={() => setCopyTabSelectionAll(tab.key, true)}
                          disabled={scenarioOpsBusy}
                        >
                          Tumu
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "2px 6px", fontSize: 12 }}
                          onClick={() => setCopyTabSelectionAll(tab.key, false)}
                          disabled={scenarioOpsBusy}
                        >
                          Temizle
                        </button>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {tab.sections.map((section) => (
                        <label key={section.id} className="row" style={{ gap: 6, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!copySelection?.[section.id]}
                            onChange={(e) => toggleCopySelection(section.id, e.target.checked)}
                            disabled={scenarioOpsBusy}
                          />
                          <span className="small">{section.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={closeCopyScenarioModal} disabled={scenarioOpsBusy}>
                Iptal
              </button>
              <button
                className="btn primary"
                onClick={confirmCopyScenarioModal}
                disabled={scenarioOpsBusy || copyingScenarioId || !copySelection || !isIkGiderlerValid}
              >
                {copyingScenarioId ? (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <InlineSpinner />
                    <span>Kopyalaniyor...</span>
                  </span>
                ) : (
                  "Tamam"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scenarioWizardOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal scenario-wizard-modal">
            <div className="scenario-wizard-header">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700 }}>
                  {scenarioWizardMode === "edit" ? "Senaryo Kurulumunu Duzenle" : "Yeni Senaryo Kurulumu"}
                </div>
                <button
                  className="btn"
                  onClick={closeScenarioWizard}
                  disabled={scenarioWizardSaving || scenarioWizardLoading}
                >
                  Kapat
                </button>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {scenarioWizardMode === "edit"
                  ? "Senaryo ayarlarini guncelleyip kaydedebilirsiniz."
                  : "Adim adim kurulum tamamlayin."}
              </div>
            </div>
            <div className="scenario-wizard-body">
              {err ? (
                <div className="card" style={{ marginTop: 10, background: "#fff1f2", borderColor: "#fecaca" }}>
                  {err}
                </div>
              ) : null}

              {scenarioWizardLoading ? (
                <div className="card" style={{ marginTop: 12 }}>Yukleniyor...</div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>Kurulum Adimi</div>
                    <div className="small">{`Adim ${newScenarioStep + 1} / ${scenarioStepTotal}: ${scenarioStepLabels[newScenarioStep]}`}</div>
                  </div>

                  {newScenarioStep === 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Donem Turu</div>
                      <div className="row" style={{ gap: 12, alignItems: "center" }}>
                        <label className="row" style={{ gap: 6, alignItems: "center" }}>
                          <input
                            type="radio"
                            name="scenario-period"
                            checked={newScenarioPeriod === "full"}
                            onChange={() => setNewScenarioPeriod("full")}
                          />
                          <span>Tam Yil (tek yil)</span>
                        </label>
                        <label className="row" style={{ gap: 6, alignItems: "center" }}>
                          <input
                            type="radio"
                            name="scenario-period"
                            checked={newScenarioPeriod === "split"}
                            onChange={() => setNewScenarioPeriod("split")}
                          />
                          <span>Yil ortasinda baslar, sonraki yil biter</span>
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
                              FX rate must be &gt; 0.
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
                      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Program Turu</div>
                      <div className="row" style={{ gap: 12 }}>
                        {[
                          {
                            key: PROGRAM_TYPES.LOCAL,
                            label: "Yerel",
                            hint: "Yerel kademeleri planlayin",
                          },
                          {
                            key: PROGRAM_TYPES.INTERNATIONAL,
                            label: "International",
                            hint: "Uluslararasi kademeleri planlayin",
                          },
                        ].map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            className={`btn ${newScenarioProgramType === option.key ? "primary" : "ghost"}`}
                            aria-pressed={newScenarioProgramType === option.key}
                            onClick={() => setNewScenarioProgramType(option.key)}
                          >
                            <div style={{ fontWeight: 700 }}>{option.label}</div>
                            <div className="small" style={{ opacity: 0.75 }}>{option.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {newScenarioStep === 3 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Yil</div>
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
                        Akademik yil: {draftAcademicYear || "-"}
                        {newScenarioPeriod === "split" && draftAcademicYear && !draftRangeOk ? (
                          <span style={{ color: "#b91c1c", marginLeft: 8 }}>
                            Bitis yili, baslangic yilindan 1 fazla olmali.
                          </span>
                        ) : null}
                        {draftAcademicYear && yearConflict ? (
                          <span style={{ color: "#b91c1c", marginLeft: 8 }}>
                            Bu yil turu icin zaten bir senaryo var.
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {newScenarioStep === 4 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Kademeler</div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Kademe</th>
                            <th style={{ width: 120 }}>Aktif</th>
                            <th style={{ width: 160 }}>Baslangic</th>
                            <th style={{ width: 160 }}>Bitis</th>
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
                        <div className="small" style={{ color: "#b91c1c" }}>En az bir kademe secmelisiniz.</div>
                      ) : null}
                    </div>
                  )}

                  {newScenarioStep === 5 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Senaryo Adi</div>
                      <div className="row">
                        <input
                          className="input"
                          placeholder="Senaryo adi"
                          value={newScenarioName}
                          onChange={(e) => setNewScenarioName(e.target.value)}
                        />
                      </div>
                      {!newScenarioName.trim() ? (
                        <div className="small" style={{ color: "#b91c1c", marginTop: 6 }}>Senaryo adi zorunludur.</div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
            {!scenarioWizardLoading ? (
              <div className="scenario-wizard-footer">
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
                  {scenarioWizardSaving ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <InlineSpinner />
                      <span>{scenarioWizardMode === "edit" ? "Kaydediliyor..." : "Olusturuluyor..."}</span>
                    </span>
                  ) : (
                    newScenarioStep < scenarioStepTotal - 1
                      ? "Ileri"
                      : scenarioWizardMode === "edit"
                        ? "Kaydet"
                        : "Bitir"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="row select-page-tables"
        style={{ gap: 12, alignItems: "stretch", marginTop: 12, flexWrap: "wrap" }}
      >
        <div className="card select-table-card" style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Okullar</div>
          {loadingSchools ? (
            <div className="small">Yukleniyor...</div>
          ) : (
            <div className="select-table-body">
              <table className="table select-school-table">
                <colgroup>
                  <col />
                  <col style={{ width: 96 }} />
                </colgroup>
              <thead>
                <tr>
                  <th>Okul</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {schools.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="small">Okul bulunamadi.</td>
                  </tr>
                ) : (
                  schools.map((s) => {
                    const isSelected = String(selectedSchoolId) === String(s.id);
                    return (
                      <tr
                        key={s.id}
                        className={isSelected ? "scenario-row is-selected" : "scenario-row"}
                        // Provide a pointer cursor for the whole row to indicate interactivity. Clicking the row or any
                        // cell will select the school.
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          handleSelectSchool(s.id);
                        }}
                      >
                        <td
                          // Attach click handlers to the cells to ensure the event always fires even if the row-level
                          // handler is somehow not triggered due to event propagation quirks.
                          onClick={(e) => {
                            // Prevent this click from bubbling twice. Reset scenario-related state if the school changes.
                            e.stopPropagation();
                            handleSelectSchool(s.id);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <b>{s.name}</b>
                        </td>
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectSchool(s.id);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          {/* Replace the button with a simple indicator. When the row is selected it shows a check icon and
                              "Secildi" (selected); otherwise it shows "Seç" to indicate it can be selected. */}
                          {isSelected ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <FaCheck />
                              <span>Secildi</span>
                            </span>
                          ) : (
                            <span className="small muted">Seç</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card select-table-card" style={{ flex: "2 1 420px", minWidth: 320 }}>
          {/* Header for the scenarios list. The "Yeni Senaryo" button has been moved into the scenario toolbar
              below so it appears alongside the other scenario actions. */}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Senaryolar</div>
          </div>

          {!selectedSchoolId ? (
            <div className="small muted" style={{ marginTop: 10 }}>Once okul secin.</div>
          ) : (
            <>
              <div className="scenario-toolbar" style={{ marginTop: 10 }}>
                {/* Yeni Senaryo button moved here to be the first action in the toolbar. It remains disabled when
                    no school is selected or an operation is in progress. */}
                <button
                  type="button"
                  className="btn primary"
                  onClick={openScenarioWizardCreate}
                  disabled={!selectedSchoolId || scenarioOpsBusy}
                  title="Yeni Senaryo"
                >
                  <span className="btn-inner">
                    <span>Yeni Senaryo</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!selectedRowScenario) return;
                    openScenarioWizardEdit(selectedRowScenario.id);
                  }}
                  disabled={!canEditToolbar || scenarioOpsBusy}
                  title="Planlamayi Duzenle"
                >
                  <span className="btn-inner">
                    <span>Planlamayi Duzenle</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={openCopyScenarioModal}
                  disabled={!canCopyToolbar || calculating || scenarioOpsBusy}
                  title="Kopyala"
                >
                  <span className="btn-inner">
                    {toolbarIsCopying ? <InlineSpinner /> : null}
                    <span>Kopyala</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    if (!selectedRowScenario) return;
                    submitScenarioForApproval(selectedRowScenario.id);
                  }}
                  disabled={!canSubmitToolbar || calculating || scenarioOpsBusy}
                  title="Onaya Gonder"
                >
                  <span className="btn-inner">
                    {/* Show a spinner while submitting; otherwise show an approval icon. */}
                    {toolbarIsSubmitting ? <InlineSpinner /> : <FaCheckCircle style={{ marginRight: 4 }} />}
                    <span>Onaya Gonder</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (!selectedRowScenario) return;
                    openDeleteScenarioModal(selectedRowScenario.id);
                  }}
                  disabled={!canDeleteToolbar || calculating || scenarioOpsBusy}
                  title="Sil"
                >
                  <span className="btn-inner">
                    {/* Show a spinner while deleting; otherwise show a trash icon. */}
                    {toolbarIsDeleting ? <InlineSpinner /> : <FaTrash style={{ marginRight: 4 }} />}
                    <span>Sil</span>
                  </span>
                </button>
              </div>
              <div className="select-table-body select-table-body-gap">
                <table className="table scenario-table">
                <thead>
                  <tr>
                    <th aria-sort={getSortAria("name")}>
                      <button
                        type="button"
                        className="sort-th"
                        onClick={() => toggleScenarioSort("name")}
                        aria-label="Sirala: Ad"
                      >
                        <span>Ad</span>
                        {sortIcon("name")}
                      </button>
                    </th>
                    <th aria-sort={getSortAria("year")}>
                      <button
                        type="button"
                        className="sort-th"
                        onClick={() => toggleScenarioSort("year")}
                        aria-label="Sirala: Yil"
                      >
                        <span>Yil</span>
                        {sortIcon("year")}
                      </button>
                    </th>
                    <th aria-sort={getSortAria("currency")}>
                      <button
                        type="button"
                        className="sort-th"
                        onClick={() => toggleScenarioSort("currency")}
                        aria-label="Sirala: Para Birimi"
                      >
                        <span>Para Birimi</span>
                        {sortIcon("currency")}
                      </button>
                    </th>
                    <th aria-sort={getSortAria("status")}>
                      <button
                        type="button"
                        className="sort-th"
                        onClick={() => toggleScenarioSort("status")}
                        aria-label="Sirala: Durum"
                      >
                        <span>Durum</span>
                        {sortIcon("status")}
                      </button>
                    </th>
                    <th aria-sort={getSortAria("date")}>
                      <button
                        type="button"
                        className="sort-th"
                        onClick={() => toggleScenarioSort("date")}
                        aria-label="Sirala: Tarih"
                      >
                        <span>Tarih</span>
                        {sortIcon("date")}
                      </button>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingScenarios ? (
                    <tr>
                      <td colSpan="6" className="small">Yukleniyor...</td>
                    </tr>
                  ) : scenarios.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="small">Henuz senaryo yok.</td>
                    </tr>
                  ) : (
                    sortedScenarios.map((s) => {
                      const statusMeta = getScenarioStatusMeta(s.status);
                      const isSelected = String(selectedScenarioIdLocal) === String(s.id);
                      const isThisRowBusy = String(s.id) === String(busyRowId);
                      const isOtherRowDisabled = scenarioOpsBusy && busyRowId && !isThisRowBusy;
                      const disableThisRowActions = scenarioOpsBusy;
                      const currencyLabel =
                        s.input_currency === "LOCAL"
                          ? `${s.local_currency_code || "LOCAL"} (LOCAL)`
                          : "USD";
                      return (
                        <tr
                          key={s.id}
                          className={isSelected ? "scenario-row is-selected" : "scenario-row"}
                          // Apply opacity and pointer-event rules as before. Also set cursor to pointer when
                          // selection is possible. When another row is busy or this row is disabled/selected, the
                          // cursor remains default and clicking does nothing.
                          style={{
                            opacity: isOtherRowDisabled ? 0.5 : 1,
                            pointerEvents: isOtherRowDisabled ? "none" : "auto",
                            cursor:
                              isSelected || disableThisRowActions || isOtherRowDisabled ? "default" : "pointer",
                          }}
                          onClick={() => {
                            if (isSelected || disableThisRowActions || isOtherRowDisabled) return;
                            setSelectedScenarioIdLocal(s.id);
                          }}
                        >
                          <td>
                            <b className="scenario-name" title={s.name}>
                              {s.name}
                            </b>
                          </td>
                          <td>{s.academic_year}</td>
                          <td>{currencyLabel}</td>
                          <td>
                            <span className={`status-badge ${statusMeta.cls}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="small">{new Date(s.created_at).toLocaleString()}</td>
                          <td>
                            <div className="scenario-row-actions">
                              {/* Instead of a selectable button, show a simple indicator. When the row is
                                  selected, display a check icon and "Secildi"; otherwise show "Seç". */}
                              {isSelected ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <FaCheck />
                                  <span>Secildi</span>
                                </span>
                              ) : (
                                <span>Seç</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button
          className="btn primary"
          onClick={handleApply}
          disabled={!selectedSchoolId || !selectedScenarioIdLocal}
        >
          Uygula
        </button>
      </div>
    </div>
  );
}
