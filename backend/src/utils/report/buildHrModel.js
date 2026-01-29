// backend/src/utils/report/buildHrModel.js
// Pure model builder for Excel export: "HR ( IK )" sheet (AOA-only)
// Goal: reflect frontend HR/IK tab (frontend/src/components/HREditorIK.jsx)

const { normalizeProgramType, isKademeKeyVisible } = require("../programType");

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// --- kademe helpers (ported from frontend/src/utils/kademe.js) ---
const GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Öncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "İlkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
];

function normalizeGrade(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "KG") return "KG";
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return String(n);
}

function gradeIndex(value) {
  const g = normalizeGrade(value);
  if (!g) return -1;
  return GRADES.indexOf(g);
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

function getKademeRangeLabel(config, key) {
  const def = KADEME_DEFS.find((d) => d.key === key);
  if (!def) return "";
  const cfg = normalizeKademeConfig(config)[key];
  if (!cfg?.enabled) return "";
  return cfg.from === cfg.to ? cfg.from : `${cfg.from}-${cfg.to}`;
}

function formatKademeLabel(label, config, key) {
  const range = getKademeRangeLabel(config, key);
  if (!range) return label;
  return `${label} (${range})`;
}

// --- HR constants (ported from frontend/src/components/HREditorIK.jsx) ---
const YEARS = [
  { key: "y1", label: "1.Yıl" },
  { key: "y2", label: "2.Yıl" },
  { key: "y3", label: "3.Yıl" },
];

const DEFAULT_UNIT_COST_RATIO = 1;

function getInflationFactors(temelBilgiler) {
  const infl = temelBilgiler?.inflation || {};
  const y2 = toNum(infl?.y2);
  const y3 = toNum(infl?.y3);
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

const LEVEL_DEFS = [
  { key: "merkez", baseLabel: "MERKEZ / HQ", kademeKey: null },
  { key: "okulOncesi", baseLabel: "Okul Öncesi", kademeKey: "okulOncesi" },
  { key: "ilkokulYerel", baseLabel: "İlkokul", kademeKey: "ilkokul", suffix: "-YEREL" },
  { key: "ilkokulInt", baseLabel: "İlkokul", kademeKey: "ilkokul", suffix: "-INT." },
  { key: "ortaokulYerel", baseLabel: "Ortaokul", kademeKey: "ortaokul", suffix: "-YEREL" },
  { key: "ortaokulInt", baseLabel: "Ortaokul", kademeKey: "ortaokul", suffix: "-INT." },
  { key: "liseYerel", baseLabel: "Lise", kademeKey: "lise", suffix: "-YEREL" },
  { key: "liseInt", baseLabel: "Lise", kademeKey: "lise", suffix: "-INT." },
];

const ROLE_GROUPS = [
  {
    groupKey: "turk",
    groupLabel: "MERKEZ TARAFINDAN GÖREVLENDİRİLEN (TÜRK PER.)",
    roles: [
      { key: "turk_mudur", label: "Müdür" },
      { key: "turk_mdyard", label: "Md.Yrd." },
      { key: "turk_egitimci", label: "Eğitimci (Eğitimci, Öğretmen, Belletmen vb.)" },
      { key: "turk_temsil", label: "TEMSİLCİLİK / EĞİTİM KURUMU ÇALIŞANLARI" },
    ],
  },
  {
    groupKey: "yerel",
    groupLabel: "YEREL KAYNAKTAN TEMİN EDİLEN ÇALIŞANLAR",
    roles: [
      { key: "yerel_yonetici_egitimci", label: "Yönetici ve Eğitimci" },
      { key: "yerel_destek", label: "Destek Per." },
      { key: "yerel_ulke_temsil_destek", label: "Ülke Temsilciliği Destek Per." },
    ],
  },
  {
    groupKey: "international",
    groupLabel: "INTERNATIONAL",
    roles: [{ key: "int_yonetici_egitimci", label: "Yönetici ve Eğitimci" }],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

const ROLE_META = (() => {
  const out = {};
  ROLE_GROUPS.forEach((group) => {
    group.roles.forEach((role) => {
      out[role.key] = { groupKey: group.groupKey };
    });
  });
  return out;
})();

function deepMerge(target, source) {
  const t = { ...(target || {}) };
  const s = source || {};
  for (const k of Object.keys(s)) {
    const sv = s[k];
    if (sv && typeof sv === "object" && !Array.isArray(sv)) t[k] = deepMerge(t[k], sv);
    else t[k] = sv;
  }
  return t;
}

function defaultYearIK() {
  const unitCosts = {};
  const headcountsByLevel = {};
  for (const r of ALL_ROLES) unitCosts[r.key] = 0;
  for (const lvl of LEVEL_DEFS) {
    headcountsByLevel[lvl.key] = {};
    for (const r of ALL_ROLES) headcountsByLevel[lvl.key][r.key] = 0;
  }
  return { unitCosts, headcountsByLevel };
}

function defaultIK3Y() {
  return {
    unitCostRatio: DEFAULT_UNIT_COST_RATIO,
    years: {
      y1: defaultYearIK(),
      y2: defaultYearIK(),
      y3: defaultYearIK(),
    },
  };
}

function buildIK(value) {
  const base = defaultIK3Y();
  const v = value || {};

  // Backward compatibility:
  // - old shape: { unitCosts, headcountsByLevel }
  // - new shape: { years: { y1: {..}, y2: {..}, y3: {..} } }
  if (v?.years && typeof v.years === "object") return deepMerge(base, v);
  if (v?.unitCosts || v?.headcountsByLevel) return deepMerge(base, { years: { y1: v } });
  return deepMerge(base, v);
}

function normalizeUnitCostRatio(value) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNIT_COST_RATIO;
  return n;
}

function applyUnitCostGrowth(input, ratioValue, inflFactors) {
  const ratio = normalizeUnitCostRatio(ratioValue);
  const factors = inflFactors || { y1: 1, y2: 1, y3: 1 };

  const next = buildIK(input);
  next.unitCostRatio = ratio;
  next.years = next.years || {};
  next.years.y1 = next.years.y1 || defaultYearIK();
  next.years.y2 = next.years.y2 || defaultYearIK();
  next.years.y3 = next.years.y3 || defaultYearIK();

  next.years.y1.unitCosts = next.years.y1.unitCosts || {};
  next.years.y2.unitCosts = next.years.y2.unitCosts || {};
  next.years.y3.unitCosts = next.years.y3.unitCosts || {};

  for (const r of ALL_ROLES) {
    const base = toNum(next.years.y1.unitCosts?.[r.key]);
    const meta = ROLE_META[r.key] || {};
    const useInflation = meta.groupKey === "yerel";
    const y2 = useInflation ? base * (factors.y2 ?? 1) : base * ratio;
    const y3 = useInflation ? base * (factors.y3 ?? 1) : y2 * ratio;
    next.years.y2.unitCosts[r.key] = y2;
    next.years.y3.unitCosts[r.key] = y3;
  }

  return next;
}

function computeYear(yearIK) {
  const roleTotals = {};
  const roleAnnualCosts = {};
  const roleMonthlyPerPersonAvg = {};

  for (const r of ALL_ROLES) {
    let totalCount = 0;
    for (const lvl of LEVEL_DEFS) {
      totalCount += toNum(yearIK?.headcountsByLevel?.[lvl.key]?.[r.key]);
    }
    roleTotals[r.key] = totalCount;

    const unit = toNum(yearIK?.unitCosts?.[r.key]);
    const annual = unit * totalCount;
    roleAnnualCosts[r.key] = annual;
    roleMonthlyPerPersonAvg[r.key] = totalCount > 0 ? annual / 12 / totalCount : 0;
  }

  const totalAnnual = Object.values(roleAnnualCosts).reduce((s, v) => s + toNum(v), 0);
  const totalHeadcount = Object.values(roleTotals).reduce((s, v) => s + toNum(v), 0);

  const sumAnnual = (keys) => keys.reduce((s, k) => s + toNum(roleAnnualCosts[k]), 0);
  const salaryExpenseMapping = {
    turkPersonelMaas: sumAnnual(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
    turkDestekPersonelMaas: sumAnnual(["turk_temsil"]),
    yerelPersonelMaas: sumAnnual(["yerel_yonetici_egitimci"]),
    yerelDestekPersonelMaas: sumAnnual(["yerel_destek", "yerel_ulke_temsil_destek"]),
    internationalPersonelMaas: sumAnnual(["int_yonetici_egitimci"]),
  };

  return {
    roleTotals,
    roleAnnualCosts,
    roleMonthlyPerPersonAvg,
    salaryExpenseMapping,
    totals: { totalAnnual, totalHeadcount },
  };
}

function buildHrModel({ scenario, inputs, report, programType, currencyMeta, reportCurrency }) {
  const _inputs = inputs && typeof inputs === "object" ? inputs : {};
  const resolvedProgramType = normalizeProgramType(programType);

  // currency selection for export
  const inputCurrency = String(currencyMeta?.input_currency || scenario?.input_currency || "USD").toUpperCase();
  const fx = toNum(currencyMeta?.fx_usd_to_local || scenario?.fx_usd_to_local);
  const localCode = String(currencyMeta?.local_currency_code || scenario?.local_currency_code || "LOCAL");
  const showLocal = String(reportCurrency || "usd").toLowerCase() === "local";
  const currencyCode = showLocal ? localCode : "USD";

  const convMoney = (v) => {
    const n = toNum(v);
    if (!Number.isFinite(n)) return 0;
    // Inputs are stored in scenario input currency.
    // If inputs are LOCAL but export is USD, convert local -> USD by dividing by fx.
    if (!showLocal && inputCurrency === "LOCAL") {
      if (!Number.isFinite(fx) || fx <= 0) return n;
      return n / fx;
    }
    // Export local keeps local (route already rejects LOCAL export for non-LOCAL scenario)
    return n;
  };

  const kademeConfig = _inputs?.temelBilgiler?.kademeler;
  const kademeler = normalizeKademeConfig(kademeConfig);
  const baseKeys = ["okulOncesi", "ilkokul", "ortaokul", "lise"];
  const noKademeMode = baseKeys.every((k) => kademeler?.[k]?.enabled === false);

  const levels = LEVEL_DEFS.map((lvl) => {
    const base = formatKademeLabel(lvl.baseLabel, kademeler, lvl.kademeKey);
    return { ...lvl, label: lvl.suffix ? `${base}${lvl.suffix}` : base };
  });

  let visibleLevels = [];
  if (noKademeMode) {
    const hq = levels.find((lvl) => lvl.key === "merkez");
    visibleLevels = hq ? [hq] : [];
  } else {
    visibleLevels = levels.filter(
      (lvl) =>
        lvl.key !== "merkez" &&
        kademeler?.[lvl.kademeKey]?.enabled !== false &&
        isKademeKeyVisible(lvl.key, resolvedProgramType)
    );
  }
  if (!visibleLevels.length) visibleLevels = levels;

  // Build IK structure and ensure derived Y2/Y3 unit costs are consistent
  const inflationFactors = getInflationFactors(_inputs?.temelBilgiler);
  const rawIk = buildIK(_inputs?.ik);
  const unitCostRatio = normalizeUnitCostRatio(rawIk?.unitCostRatio);
  const ik = applyUnitCostGrowth(rawIk, unitCostRatio, inflationFactors);

  // Prepare per-year computed values (in export currency)
  const computedByYear = {};
  const unitCostsByYear = {};

  for (const y of YEARS) {
    const src = ik?.years?.[y.key] || defaultYearIK();
    const unitCosts = {};
    for (const r of ALL_ROLES) unitCosts[r.key] = convMoney(src?.unitCosts?.[r.key]);

    unitCostsByYear[y.key] = unitCosts;

    computedByYear[y.key] = computeYear({
      unitCosts,
      headcountsByLevel: src?.headcountsByLevel || {},
    });
  }

  const matrixHeaders = ["Kademeler / Satır"];
  for (const r of ALL_ROLES) {
    for (const y of YEARS) {
      matrixHeaders.push(`${r.label} (${y.label})`);
    }
  }

  const buildMatrixRow = (label, getValue) => {
    const row = [label];
    for (const r of ALL_ROLES) {
      for (const y of YEARS) {
        row.push(getValue(r.key, y.key));
      }
    }
    return row;
  };

  const matrixRows = [];

  // Unit costs (money)
  matrixRows.push(
    buildMatrixRow(`Birim İşveren Maliyeti / YIL (${currencyCode})`, (roleKey, yearKey) =>
      toNum(unitCostsByYear?.[yearKey]?.[roleKey])
    )
  );

  // Headcounts per visible level (counts)
  for (const lvl of visibleLevels) {
    matrixRows.push(
      buildMatrixRow(lvl.label, (roleKey, yearKey) => {
        const srcYear = ik?.years?.[yearKey] || {};
        return Math.trunc(toNum(srcYear?.headcountsByLevel?.[lvl.key]?.[roleKey]));
      })
    );
  }

  // Totals (computed)
  matrixRows.push(
    buildMatrixRow("TOPLAM YILLIK MALİYET", (roleKey, yearKey) =>
      toNum(computedByYear?.[yearKey]?.roleAnnualCosts?.[roleKey])
    )
  );
  matrixRows.push(
    buildMatrixRow("Ortalama Aylık / Kişi (Bilgi)", (roleKey, yearKey) =>
      toNum(computedByYear?.[yearKey]?.roleMonthlyPerPersonAvg?.[roleKey])
    )
  );
  matrixRows.push(
    buildMatrixRow("TOPLAM PERSONEL SAYISI", (roleKey, yearKey) =>
      Math.trunc(toNum(computedByYear?.[yearKey]?.roleTotals?.[roleKey]))
    )
  );

  const totalsRows = YEARS.map((y) => [
    y.label,
    toNum(computedByYear?.[y.key]?.totals?.totalAnnual || 0),
    Math.trunc(toNum(computedByYear?.[y.key]?.totals?.totalHeadcount || 0)),
  ]);

  const salaryKeys = [
    "turkPersonelMaas",
    "turkDestekPersonelMaas",
    "yerelPersonelMaas",
    "yerelDestekPersonelMaas",
    "internationalPersonelMaas",
  ];
  const salaryRows = salaryKeys.map((k) => [
    k,
    toNum(computedByYear?.y1?.salaryExpenseMapping?.[k] || 0),
    toNum(computedByYear?.y2?.salaryExpenseMapping?.[k] || 0),
    toNum(computedByYear?.y3?.salaryExpenseMapping?.[k] || 0),
  ]);

  return {
    title: "HR ( IK )",
    currencyCode,
    unitCostRatio,
    meta: {
      programType: resolvedProgramType,
      // report is not strictly needed, but kept in signature for consistency
      hasReport: Boolean(report),
    },
    sections: [
      {
        title: "PERSONEL SAYILARI VE İŞVEREN MALİYETLERİ",
        tables: [
          {
            title: "Parametreler",
            headers: ["Parametre", "Değer"],
            rows: [
              ["Yıllık Birim Maliyet Çarpanı (Y2/Y3)", unitCostRatio],
              ["Para Birimi", currencyCode],
            ],
          },
          {
            title: "Personel ve Maliyet Matrisi",
            headers: matrixHeaders,
            rows: matrixRows,
          },
          {
            title: "Yıllık Toplamlar",
            headers: ["Yıl", `Toplam Yıllık Maliyet (${currencyCode})`, "Toplam Personel"],
            rows: totalsRows,
          },
          {
            title: "Gider Anahtarı (Salary Mapping)",
            headers: [
              "Gider Anahtarı",
              `1.Yıl (${currencyCode})`,
              `2.Yıl (${currencyCode})`,
              `3.Yıl (${currencyCode})`,
            ],
            rows: salaryRows,
          },
        ],
      },
    ],
  };
}

module.exports = { buildHrModel };
