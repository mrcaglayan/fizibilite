const YEAR_KEYS = ["y1", "y2", "y3"];

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "Ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
];

const KADEME_BASE_KEYS = KADEME_DEFS.map((d) => d.key);

const KADEME_ROWS = [
  { key: "okulOncesi", label: "Okul Oncesi" },
  { key: "ilkokul", label: "Ilkokul" },
  { key: "ortaokul", label: "Ortaokul" },
  { key: "lise", label: "Lise" },
];

const KADEME_BASE_BY_ROW = {
  okulOncesi: "okulOncesi",
  ilkokulYerel: "ilkokul",
  ilkokulInt: "ilkokul",
  ortaokulYerel: "ortaokul",
  ortaokulInt: "ortaokul",
  liseYerel: "lise",
  liseInt: "lise",
  ilkokul: "ilkokul",
  ortaokul: "ortaokul",
  lise: "lise",
};

const TUITION_ROWS = [
  { key: "okulOncesi", label: "Okul Oncesi" },
  { key: "ilkokulYerel", label: "Ilkokul-Yerel" },
  { key: "ilkokulInt", label: "Ilkokul-Int" },
  { key: "ortaokulYerel", label: "Ortaokul-Yerel" },
  { key: "ortaokulInt", label: "Ortaokul-Int" },
  { key: "liseYerel", label: "Lise-Yerel" },
  { key: "liseInt", label: "Lise-Int" },
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
  { key: "okulOncesi", label: "Okul Oncesi", kademeKey: "okulOncesi" },
  { key: "ilkokulYerel", label: "Ilkokul-Yerel", kademeKey: "ilkokul" },
  { key: "ilkokulInt", label: "Ilkokul-Int", kademeKey: "ilkokul" },
  { key: "ortaokulYerel", label: "Ortaokul-Yerel", kademeKey: "ortaokul" },
  { key: "ortaokulInt", label: "Ortaokul-Int", kademeKey: "ortaokul" },
  { key: "liseYerel", label: "Lise-Yerel", kademeKey: "lise" },
  { key: "liseInt", label: "Lise-Int", kademeKey: "lise" },
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
    key: "temelBilgiler",
    label: "Temel Bilgiler",
    sectionIds: [
      "temel.okulEgitim",
      "temel.kademeler",
      "temel.inflation",
      "temel.ikMevcut",
      "temel.bursOgr",
      "temel.rakip",
    ],
  },
  { key: "kapasite", label: "Kapasite", sectionIds: ["kapasite.caps"] },
  { key: "gradesPlan", label: "Sinif/Sube Plani", sectionIds: ["gradesPlan.plan"] },
  { key: "norm", label: "Norm", sectionIds: ["norm.lessons"] },
  { key: "ik", label: "IK / HR", sectionIds: ["ik.localStaff"] },
  { key: "gelirler", label: "Gelirler", sectionIds: ["gelirler.unitFee"] },
  { key: "giderler", label: "Giderler", sectionIds: ["giderler.isletme"] },
  { key: "indirimler", label: "Indirimler", sectionIds: ["indirimler.discounts"] },
];

const SECTION_DEFS = [
  { id: "temel.okulEgitim", tabKey: "temelBilgiler", label: "Okul Egitim Bilgileri", modeDefault: "ALL", minDefault: null },
  { id: "temel.kademeler", tabKey: "temelBilgiler", label: "Kademeler", modeDefault: "ALL", minDefault: null },
  { id: "temel.inflation", tabKey: "temelBilgiler", label: "Enflasyon ve Parametreler", modeDefault: "ALL", minDefault: null },
  { id: "temel.ikMevcut", tabKey: "temelBilgiler", label: "IK Mevcut", modeDefault: "ALL", minDefault: null },
  { id: "temel.bursOgr", tabKey: "temelBilgiler", label: "Burs ve Indirimler (Ogrenci)", modeDefault: "MIN", minDefault: 1 },
  { id: "temel.rakip", tabKey: "temelBilgiler", label: "Rakip Analizi", modeDefault: "ALL", minDefault: null },
  { id: "kapasite.caps", tabKey: "kapasite", label: "Kapasite", modeDefault: "ALL", minDefault: null, requiresKademe: true },
  { id: "gradesPlan.plan", tabKey: "gradesPlan", label: "Planlanan Sinif/Sube", modeDefault: "ALL", minDefault: null, requiresKademe: true },
  { id: "norm.lessons", tabKey: "norm", label: "Ders Dagilimi", modeDefault: "MIN", minDefault: 3, requiresKademe: true, allowEmpty: false },
  { id: "ik.localStaff", tabKey: "ik", label: "IK Yerel", modeDefault: "ALL", minDefault: null },
  { id: "gelirler.unitFee", tabKey: "gelirler", label: "Birim Ucret", modeDefault: "MIN", minDefault: 1 },
  { id: "giderler.isletme", tabKey: "giderler", label: "Isletme Giderleri", modeDefault: "MIN", minDefault: 5 },
  { id: "indirimler.discounts", tabKey: "indirimler", label: "Indirimler", modeDefault: "MIN", minDefault: 1 },
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

function safeGet(obj, path, fallback) {
  let cur = obj;
  for (const key of path || []) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[key];
  }
  return cur == null ? fallback : cur;
}

function normalizeGrade(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "KG") return "KG";
  if (!/^[0-9]{1,2}$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return String(n);
}

function getGradeOptions() {
  return ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
}

function gradeIndex(value) {
  const g = normalizeGrade(value);
  if (!g) return -1;
  return getGradeOptions().indexOf(g);
}

function normalizeRange(fromValue, toValue, def) {
  const from = normalizeGrade(fromValue) ?? def.defaultFrom;
  const to = normalizeGrade(toValue) ?? def.defaultTo;
  const fromIdx = gradeIndex(from);
  const toIdx = gradeIndex(to);
  if (fromIdx < 0 || toIdx < 0) return { from: def.defaultFrom, to: def.defaultTo };
  if (fromIdx <= toIdx) return { from, to };
  return { from: to, to: from };
}

function normalizeKademeConfig(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const out = {};
  KADEME_DEFS.forEach((d) => {
    const row = cfg[d.key] && typeof cfg[d.key] === "object" ? cfg[d.key] : {};
    const enabled = row.enabled !== false;
    const range = normalizeRange(row.from, row.to, d);
    out[d.key] = { enabled, ...range };
  });
  return out;
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
    };
  }

  const normalized = normalizeKademeConfig(raw);
  const gradeOptions = getGradeOptions();
  const gradeIndexMap = new Map(gradeOptions.map((g, idx) => [g, idx]));
  const enabledKademes = new Set();
  const enabledGrades = new Set();

  KADEME_BASE_KEYS.forEach((key) => {
    const row = normalized[key];
    if (!row?.enabled) return;
    enabledKademes.add(key);
    const fromIdx = gradeIndexMap.get(row.from);
    const toIdx = gradeIndexMap.get(row.to);
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

  return { hasKademeSelection: true, enabledKademes, enabledGrades, enabledLevels };
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

function DEFAULT_PROGRESS_CONFIG() {
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

function buildProgressCatalog({ inputs, norm } = {}) {
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

  KADEME_ROWS.forEach((row) => {
    ["enabled", "from", "to"].forEach((k) => {
      addField(
        "temel.kademeler",
        makeField(
          `temel.kademeler.${row.key}.${k}`,
          `${row.label} ${k}`,
          k === "enabled" ? "boolean" : "string",
          (inputsArg) => safeGet(inputsArg, ["temelBilgiler", "kademeler", row.key, k], null),
          () => true
        )
      );
    });
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
            () => (ctx.enabledGrades.size ? ctx.enabledGrades.has(grade) : true)
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
            (inputsArg) =>
              safeGet(inputsArg, ["ik", "years", year, "headcountsByLevel", lvl.key, role.key], null),
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
        `gelirler.tuition.${row.key}.unitFee`,
        `Birim ucret ${row.label}`,
        "number",
        (inputsArg) => {
          const rows = safeGet(inputsArg, ["gelirler", "tuition", "rows"], []);
          const match = Array.isArray(rows) ? rows.find((r) => String(r?.key) === row.key) : null;
          return match?.unitFee ?? null;
        },
        () => {
          const baseKey = KADEME_BASE_BY_ROW[row.key] || row.key;
          return ctx.enabledKademes.size ? ctx.enabledKademes.has(baseKey) : true;
        }
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
      "indirimler.discounts",
      makeField(
        `indirim.${idx}.ratio`,
        `${label} ratio`,
        "number",
        (inputsArg) => safeGet(inputsArg, ["discounts", idx, "ratio"], null),
        () => true
      )
    );
    addField(
      "indirimler.discounts",
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

function computeScenarioProgress({ inputs, norm, config } = {}) {
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
    const missingReasons = done ? [] : missing.map((field) => field.label).filter(Boolean);

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

module.exports = {
  DEFAULT_PROGRESS_CONFIG,
  buildProgressCatalog,
  computeScenarioProgress,
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
