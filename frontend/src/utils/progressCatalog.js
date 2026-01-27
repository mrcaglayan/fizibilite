import { getGradeOptions, normalizeKademeConfig } from "./kademe";

const YEAR_KEYS = ["y1", "y2", "y3"];

const KADEME_BASE_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"];

const TUITION_ROWS = [
  { idKey: "okulOncesi", label: "Okul Oncesi", baseKey: "okulOncesi", yerelKey: "okulOncesi", intKey: "okulOncesi" },
  { idKey: "ilkokulYerel", label: "Ilkokul", baseKey: "ilkokul", yerelKey: "ilkokulYerel", intKey: "ilkokulInt" },
  { idKey: "ortaokulYerel", label: "Ortaokul", baseKey: "ortaokul", yerelKey: "ortaokulYerel", intKey: "ortaokulInt" },
  { idKey: "liseYerel", label: "Lise", baseKey: "lise", yerelKey: "liseYerel", intKey: "liseInt" },
];

const SCHOLAR_KEYS = [
  "magisBasariBursu",
  "maarifYetenekBursu",
  "ihtiyacBursu",
  "okulBasariBursu",
  "tamEgitimBursu",
  "barinmaBursu",
  "turkceBasariBursu",
  "uluslararasiYukumlulukIndirimi",
  "vakifCalisaniIndirimi",
  "kardesIndirimi",
  "erkenKayitIndirimi",
  "pesinOdemeIndirimi",
  "kademeGecisIndirimi",
  "temsilIndirimi",
  "kurumIndirimi",
  "istisnaiIndirim",
  "yerelMevzuatIndirimi",
];

const COMPETITOR_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"];

const IK_LEVEL_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", kademeKey: "okulOncesi", yerelKey: "okulOncesi", intKey: "okulOncesi" },
  { key: "ilkokulYerel", label: "Ilkokul", kademeKey: "ilkokul", yerelKey: "ilkokulYerel", intKey: "ilkokulInt" },
  { key: "ortaokulYerel", label: "Ortaokul", kademeKey: "ortaokul", yerelKey: "ortaokulYerel", intKey: "ortaokulInt" },
  { key: "liseYerel", label: "Lise", kademeKey: "lise", yerelKey: "liseYerel", intKey: "liseInt" },
];

const IK_LOCAL_ROLES = [
  { key: "yerel_yonetici_egitimci", label: "Yerel Yonetici ve Egitimci" },
  { key: "yerel_destek", label: "Yerel Destek" },
];

const GIDERLER_ITEMS = [
  "ulkeTemsilciligi",
  "genelYonetim",
  "kira",
  "emsalKira",
  "enerjiKantin",
  "disaridanHizmet",
  "egitimAracGerec",
  "finansalGiderler",
  "egitimAmacliHizmet",
  "temsilAgirlama",
  "ulkeIciUlasim",
  "ulkeDisiUlasim",
  "vergilerResmiIslemler",
  "vergiler",
  "demirbasYatirim",
  "rutinBakim",
  "pazarlamaOrganizasyon",
  "reklamTanitim",
  "tahsilEdilemeyenGelirler",
];

const TAB_DEFS = [
  {
    key: "temelBilgiler", label: "Temel Bilgiler", sectionIds: [
      "temel.okulEgitim",
      "temel.inflation",
      "temel.ikMevcut",
      "temel.bursOgr",
      "temel.rakip",
      "temel.performans",
    ]
  },
  { key: "kapasite", label: "Kapasite", sectionIds: ["kapasite.caps"] },
  { key: "gradesPlan", label: "Sinif/Sube Plani", sectionIds: ["gradesPlan.plan"] },
  { key: "norm", label: "Norm", sectionIds: ["norm.lessons"] },
  { key: "ik", label: "IK / HR", sectionIds: ["ik.localStaff"] },
  { key: "gelirler", label: "Gelirler", sectionIds: ["gelirler.unitFee"] },
  { key: "giderler", label: "Giderler", sectionIds: ["giderler.isletme"] },
  // Rename indirimler → discounts to match the normalized permission namespace
  { key: "discounts", label: "Indirimler", sectionIds: ["discounts.discounts"] },
];

const SECTION_DEFS = [
  { id: "temel.okulEgitim", tabKey: "temelBilgiler", label: "Okul Egitim Bilgileri", modeDefault: "ALL", minDefault: null },
  { id: "temel.inflation", tabKey: "temelBilgiler", label: "Enflasyon ve Parametreler", modeDefault: "ALL", minDefault: null },
  { id: "temel.ikMevcut", tabKey: "temelBilgiler", label: "IK Mevcut", modeDefault: "ALL", minDefault: null },
  { id: "temel.bursOgr", tabKey: "temelBilgiler", label: "Burs ve Indirimler (Ogrenci)", modeDefault: "MIN", minDefault: 1 },
  { id: "temel.rakip", tabKey: "temelBilgiler", label: "Rakip Analizi", modeDefault: "ALL", minDefault: null },
  { id: "temel.performans", tabKey: "temelBilgiler", label: "Performans (Onceki Donem)", modeDefault: "ALL", minDefault: null },
  { id: "kapasite.caps", tabKey: "kapasite", label: "Kapasite", modeDefault: "ALL", minDefault: null, requiresKademe: true },
  { id: "gradesPlan.plan", tabKey: "gradesPlan", label: "Planlanan Sinif/Sube", modeDefault: "ALL", minDefault: null, requiresKademe: true },
  { id: "norm.lessons", tabKey: "norm", label: "Ders Dagilimi", modeDefault: "MIN", minDefault: 3, requiresKademe: true, allowEmpty: false },
  { id: "ik.localStaff", tabKey: "ik", label: "IK Yerel", modeDefault: "ALL", minDefault: null },
  { id: "gelirler.unitFee", tabKey: "gelirler", label: "Birim Ucret", modeDefault: "MIN", minDefault: 1 },
  { id: "giderler.isletme", tabKey: "giderler", label: "Isletme Giderleri", modeDefault: "MIN", minDefault: 5 },
  // Section for discounts.  The id and tabKey follow the new discounts.* namespace.
  { id: "discounts.discounts", tabKey: "discounts", label: "Indirimler", modeDefault: "MIN", minDefault: 1 },
];

const OKUL_EGITIM_FIELDS = [
  { key: "egitimBaslamaTarihi", label: "Egitim baslama tarihi", type: "string" },
  { key: "zorunluEgitimDonemleri", label: "Zorunlu egitim donemleri", type: "string" },
  { key: "birDersSuresiDakika", label: "Bir ders suresi (dk)", type: "number" },
  { key: "gunlukDersSaati", label: "Gunluk ders saati", type: "number" },
  { key: "haftalikDersSaatiToplam", label: "Haftalik ders saati toplam", type: "number" },
  { key: "ogretmenHaftalikDersOrt", label: "Ogretmen haftalik ders ort", type: "number" },
  { key: "sabahciOglenci", label: "Sabahci/oglenci", type: "string" },
  { key: "uygulananProgram", label: "Uygulanan program", type: "string" },
  { key: "gecisSinaviBilgisi", label: "Gecis sinavi bilgisi", type: "string" },
];

const INFLATION_FIELDS = [
  { key: "expenseDeviationPct", label: "Gider sapma yuzdesi" },
  { key: "y2023", label: "Y2023 enflasyon" },
  { key: "y2024", label: "Y2024 enflasyon" },
  { key: "y2025", label: "Y2025 enflasyon" },
  { key: "y1", label: "Y1 enflasyon" },
  { key: "y2", label: "Y2 enflasyon" },
  { key: "y3", label: "Y3 enflasyon" },
  { key: "currentSeasonAvgFee", label: "Mevcut sezon ortalama ucret" },
];

const PERF_FIELDS = [
  { key: "prevYearRealizedFxUsdToLocal", label: "Onceki Donem Ortalama Kur (Gerceklesen)", type: "number" },
];

const IK_MEV_FIELDS = [
  { key: "yerelKadroluEgitimci", label: "Yerel kadrolu egitimci" },
  { key: "yerelDestek", label: "Yerel destek" },
];

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseHeadcountNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isNonEmptyString(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickHeadcountValue(yerelValue, intValue) {
  const yerelNum = parseHeadcountNumber(yerelValue);
  const intNum = parseHeadcountNumber(intValue);
  if (yerelNum == null && intNum == null) return null;
  if (yerelNum != null && intNum != null) return Math.max(yerelNum, intNum);
  return yerelNum != null ? yerelNum : intNum;
}

function pickTuitionValue(yerelValue, intValue) {
  return pickHeadcountValue(yerelValue, intValue);
}

function safeGet(obj, path, fallback) {
  let cur = obj;
  for (const key of path || []) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[key];
  }
  return cur == null ? fallback : cur;
}

function getTuitionUnitFee(inputsArg, key) {
  const rows = safeGet(inputsArg, ["gelirler", "tuition", "rows"], []);
  const list = Array.isArray(rows) ? rows : [];
  const match = list.find((r) => String(r?.key) === String(key));
  return match?.unitFee ?? null;
}

function buildKademeContext(inputs) {
  const raw = inputs?.temelBilgiler?.kademeler;
  const hasKademeSelection = raw && typeof raw === "object" && Object.keys(raw).length > 0;
  if (!hasKademeSelection) {
    return {
      hasKademeSelection: false,
      enabledKademes: new Set(),
      enabledGrades: new Set(),
      enabledLevels: new Set(),
      activeGrades: new Set(),
      isGradeActive: () => false,
    };
  }

  const normalized = normalizeKademeConfig(raw);
  const gradeOptions = getGradeOptions();
  const gradeIndex = new Map(gradeOptions.map((g, idx) => [g, idx]));
  const enabledKademes = new Set();
  const enabledGrades = new Set();
  KADEME_BASE_KEYS.forEach((key) => {
    const row = normalized[key];
    if (!row?.enabled) return;
    enabledKademes.add(key);
    const fromIdx = gradeIndex.get(row.from);
    const toIdx = gradeIndex.get(row.to);
    if (fromIdx == null || toIdx == null) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    for (let i = start; i <= end; i += 1) {
      enabledGrades.add(gradeOptions[i]);
    }
  });

  const enabledLevels = new Set(
    IK_LEVEL_DEFS.filter((lvl) => enabledKademes.has(lvl.kademeKey)).map((lvl) => lvl.key)
  );
  const activeGrades = new Set(enabledGrades);
  const isGradeActive = (grade) => {
    const key = String(grade ?? "").trim().toUpperCase();
    if (!key) return false;
    return activeGrades.has(key);
  };

  return { hasKademeSelection: true, enabledKademes, enabledGrades, enabledLevels, activeGrades, isGradeActive };
}

function collectNormSubjects(norm) {
  const out = new Set();
  if (!norm || typeof norm !== "object") return [];
  const years = norm?.years && typeof norm.years === "object" ? norm.years : null;
  const yearList = years ? YEAR_KEYS.map((y) => years?.[y]).filter(Boolean) : [norm];

  for (const year of yearList) {
    const curr = year?.curriculumWeeklyHours || {};
    for (const grade of Object.keys(curr || {})) {
      const subjects = curr?.[grade] || {};
      Object.keys(subjects || {}).forEach((key) => out.add(key));
    }
  }
  return Array.from(out);
}

function getNormSubjectHours(norm, subjectKey, enabledGrades) {
  if (!norm || typeof norm !== "object") return 0;
  const years = norm?.years && typeof norm.years === "object" ? norm.years : null;
  const yearList = years ? YEAR_KEYS.map((y) => years?.[y]).filter(Boolean) : [norm];

  let total = 0;
  for (const year of yearList) {
    const curr = year?.curriculumWeeklyHours || {};
    for (const grade of Object.keys(curr || {})) {
      if (enabledGrades.size && !enabledGrades.has(grade)) continue;
      total += toNum(curr?.[grade]?.[subjectKey]);
    }
  }
  return total;
}

function getPlanningGrades(inputs, yearKey) {
  const years = inputs?.gradesYears && typeof inputs.gradesYears === "object" ? inputs.gradesYears : null;
  const source = years?.years && typeof years.years === "object" ? years.years : years;
  const list = Array.isArray(source?.[yearKey]) ? source[yearKey] : null;
  if (list) return list;
  if (yearKey === "y1" && Array.isArray(inputs?.grades)) return inputs.grades;
  const fallback = Array.isArray(source?.y1) ? source.y1 : Array.isArray(inputs?.grades) ? inputs.grades : [];
  return fallback;
}

function getGradePlanValue(inputs, yearKey, grade, fieldKey) {
  const rows = getPlanningGrades(inputs, yearKey);
  const match = rows.find((r) => String(r?.grade) === String(grade));
  return match ? match[fieldKey] : null;
}

function makeField(id, label, type, getValue, appliesIf) {
  return { id, label, type, getValue, appliesIf };
}

export function DEFAULT_PROGRESS_CONFIG() {
  const sections = {};
  SECTION_DEFS.forEach((s) => {
    sections[s.id] = {
      enabled: true,
      mode: s.modeDefault,
      min: s.minDefault,
      selectedFields: {},
    };
  });
  return { version: 1, sections };
}

export function buildProgressCatalog({ inputs, norm, scenario } = {}) {
  const ctx = buildKademeContext(inputs);
  const fieldsById = {};
  const sections = SECTION_DEFS.map((s) => ({ ...s, fields: [] }));
  const sectionsById = new Map(sections.map((s) => [s.id, s]));

  const addField = (sectionId, field) => {
    if (!field || !field.id) return;
    if (fieldsById[field.id]) return;
    fieldsById[field.id] = field;
    const section = sectionsById.get(sectionId);
    if (section) section.fields.push(field.id);
  };

  OKUL_EGITIM_FIELDS.forEach((f) => {
    addField(
      "temel.okulEgitim",
      makeField(
        `temel.okulEgitim.${f.key}`,
        f.label,
        f.type,
        (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "okulEgitimBilgileri", f.key], null),
        () => true
      )
    );
  });

  INFLATION_FIELDS.forEach((f) => {
    addField(
      "temel.inflation",
      makeField(
        `temel.inflation.${f.key}`,
        f.label,
        "number",
        (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "inflation", f.key], null),
        () => true
      )
    );
  });

  PERF_FIELDS.forEach((f) => {
    addField(
      "temel.performans",
      makeField(
        `temel.performans.${f.key}`,
        f.label,
        f.type || "number",
        (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "performans", f.key], null),
        (_, __, scenarioArg) => {
          if (!scenarioArg || typeof scenarioArg !== "object") return true;
          return String(scenarioArg.input_currency || "").toUpperCase() === "LOCAL";
        }
      )
    );
  });

  IK_MEV_FIELDS.forEach((f) => {
    addField(
      "temel.ikMevcut",
      makeField(
        `temel.ikMevcut.${f.key}`,
        f.label,
        "number",
        (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "ikMevcut", f.key], null),
        () => true
      )
    );
  });

  SCHOLAR_KEYS.forEach((key) => {
    addField(
      "temel.bursOgr",
      makeField(
        `temel.burs.${key}`,
        `Burs ${key}`,
        "number",
        (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "bursIndirimOgrenciSayilari", key], null),
        () => true
      )
    );
  });

  COMPETITOR_KEYS.forEach((key) => {
    ["a", "b", "c"].forEach((suffix) => {
      addField(
        "temel.rakip",
        makeField(
          `temel.rakip.${key}.${suffix}`,
          `Rakip ${key} ${suffix}`,
          "number",
          (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "rakipAnalizi", key, suffix], null),
          () => (ctx.enabledKademes.size ? ctx.enabledKademes.has(key) : true)
        )
      );
    });
  });

  KADEME_BASE_KEYS.forEach((key) => {
    ["cur", "y1", "y2", "y3"].forEach((period) => {
      addField(
        "kapasite.caps",
        makeField(
          `kapasite.${key}.${period}`,
          `Kapasite ${key} ${period}`,
          "number",
          (inputsArg) => safeGet(inputsArg, ["kapasite", "byKademe", key, "caps", period], null),
          () => (ctx.enabledKademes.size ? ctx.enabledKademes.has(key) : true)
        )
      );
    });
  });

  const grades = getGradeOptions();
  YEAR_KEYS.forEach((year) => {
    grades.forEach((grade) => {
      ["branchCount", "studentsPerBranch"].forEach((fieldKey) => {
        addField(
          "gradesPlan.plan",
          makeField(
            `gradesPlan.${year}.${grade}.${fieldKey}`,
            `Plan ${grade} ${year} ${fieldKey}`,
            "number",
            (inputsArg) => getGradePlanValue(inputsArg, year, grade, fieldKey),
            () => {
              if (typeof ctx.isGradeActive === "function") return ctx.isGradeActive(grade);
              if (ctx.enabledGrades && ctx.enabledGrades.size) return ctx.enabledGrades.has(grade);
              return true;
            }
          )
        );
      });
    });
  });

  const normSubjects = collectNormSubjects(norm);
  normSubjects.forEach((subjectKey) => {
    addField(
      "norm.lessons",
      makeField(
        `norm.subject.${subjectKey}`,
        `Ders ${subjectKey}`,
        "number",
        () => getNormSubjectHours(norm, subjectKey, ctx.enabledGrades),
        () => ctx.enabledGrades.size > 0
      )
    );
  });

  YEAR_KEYS.forEach((year) => {
    IK_LOCAL_ROLES.forEach((role) => {
      addField(
        "ik.localStaff",
        makeField(
          `ik.unitCost.${year}.${role.key}`,
          `Unit cost ${role.label} ${year}`,
          "number",
          (inputsArg) => safeGet(inputsArg, ["ik", "years", year, "unitCosts", role.key], null),
          () => true
        )
      );
      IK_LEVEL_DEFS.forEach((lvl) => {
        addField(
          "ik.localStaff",
          makeField(
            `ik.headcount.${year}.${lvl.key}.${role.key}`,
            `Headcount ${lvl.label} ${role.label} ${year}`,
            "number",
            (inputsArg) => {
              const yerelValue = safeGet(
                inputsArg,
                ["ik", "years", year, "headcountsByLevel", lvl.yerelKey || lvl.key, role.key],
                null
              );
              const intValue = safeGet(
                inputsArg,
                ["ik", "years", year, "headcountsByLevel", lvl.intKey || lvl.key, role.key],
                null
              );
              return pickHeadcountValue(yerelValue, intValue);
            },
            () => (ctx.enabledLevels.size ? ctx.enabledLevels.has(lvl.key) : true)
          )
        );
      });
    });
  });

  TUITION_ROWS.forEach((row) => {
    addField(
      "gelirler.unitFee",
      makeField(
        `gelirler.tuition.${row.idKey}.unitFee`,
        `Birim ucret ${row.label}`,
        "number",
        (inputsArg) => {
          const yerelVal = getTuitionUnitFee(inputsArg, row.yerelKey);
          const intVal = getTuitionUnitFee(inputsArg, row.intKey);
          return pickTuitionValue(yerelVal, intVal);
        },
        () => (ctx.enabledKademes.size ? ctx.enabledKademes.has(row.baseKey) : true)
      )
    );
  });

  GIDERLER_ITEMS.forEach((key) => {
    addField(
      "giderler.isletme",
      makeField(
        `giderler.isletme.${key}`,
        `Gider ${key}`,
        "number",
        (inputsArg) => safeGet(inputsArg, ["giderler", "isletme", "items", key], null),
        () => true
      )
    );
  });

  const discountRows = Array.isArray(inputs?.discounts) ? inputs.discounts : [];
  discountRows.forEach((row, idx) => {
    const label = row?.name ? String(row.name) : `Indirim #${idx + 1}`;
    addField(
      "discounts.discounts",
      makeField(
        `indirim.${idx}.ratio`,
        `${label} ratio`,
        "number",
        (inputsArg) => safeGet(inputsArg, ["discounts", idx, "ratio"], null),
        () => true
      )
    );
    addField(
      "discounts.discounts",
      makeField(
        `indirim.${idx}.value`,
        `${label} value`,
        "number",
        (inputsArg) => safeGet(inputsArg, ["discounts", idx, "value"], null),
        () => true
      )
    );
  });

  return {
    tabs: TAB_DEFS.map((t) => ({ ...t })),
    sections,
    fieldsById,
    context: ctx,
  };
}

export {
  toNum,
  isNonEmptyString,
  safeGet,
  YEAR_KEYS,
  SECTION_DEFS,
  TAB_DEFS,
  KADEME_BASE_KEYS,
  IK_LEVEL_DEFS,
  IK_LOCAL_ROLES,
};
