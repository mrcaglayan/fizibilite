// backend/src/utils/report/buildTemelBilgilerModel.js
// Pure model builder for Excel export: "TEMEL BİLGİLER" sheet

const { normalizeProgramType, isKademeKeyVisible } = require("../programType");

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

// --- UI row definitions (ported from frontend/src/components/TemelBilgilerEditor.jsx) ---
const UCRET_ROWS = [
  { key: "okulOncesi", label: "Okul Öncesi" },
  { key: "ilkokulYerel", label: "İlkokul-YEREL" },
  { key: "ilkokulInt", label: "İlkokul-INT." },
  { key: "ortaokulYerel", label: "Ortaokul-YEREL" },
  { key: "ortaokulInt", label: "Ortaokul-INT." },
  { key: "liseYerel", label: "Lise-YEREL" },
  { key: "liseInt", label: "Lise-INT." },
];

const SCHOLAR_ROWS = [
  { key: "magisBasariBursu", label: "MAGİS Başarı Bursu" },
  { key: "maarifYetenekBursu", label: "Maarif Yetenek Bursu" },
  { key: "ihtiyacBursu", label: "İhtiyaç Bursu" },
  { key: "okulBasariBursu", label: "Okul Başarı Bursu" },
  { key: "tamEgitimBursu", label: "Tam Eğitim Bursu" },
  { key: "barinmaBursu", label: "Barınma Bursu" },
  { key: "turkceBasariBursu", label: "Türkçe Başarı Bursu" },
  {
    key: "uluslararasiYukumlulukIndirimi",
    label: "Vakfın Uluslararası Yükümlülüklerinden Kaynaklı İndirim",
  },
  { key: "vakifCalisaniIndirimi", label: "Vakıf Çalışanı İndirimi" },
  { key: "kardesIndirimi", label: "Kardeş İndirimi" },
  { key: "erkenKayitIndirimi", label: "Erken Kayıt İndirimi" },
  { key: "pesinOdemeIndirimi", label: "Peşin Ödeme İndirimi" },
  { key: "kademeGecisIndirimi", label: "Kademe Geçiş İndirimi" },
  { key: "temsilIndirimi", label: "Temsil İndirimi" },
  { key: "kurumIndirimi", label: "Kurum İndirimi" },
  { key: "istisnaiIndirim", label: "İstisnai İndirim" },
  { key: "yerelMevzuatIndirimi", label: "Yerel Mevzuatın Şart Koştuğu İndirim" },
];

const COMPETITOR_ROWS = [
  { key: "okulOncesi", label: "Okul Öncesi" },
  { key: "ilkokul", label: "İlkokul" },
  { key: "ortaokul", label: "Ortaokul" },
  { key: "lise", label: "Lise" },
];

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function positiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function get(obj, path, fallback = undefined) {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[k];
  }
  return cur == null ? fallback : cur;
}

function percentToDisplay(frac) {
  return safeNum(frac) * 100;
}

function parseAcademicStartYear(academicYear) {
  const raw = String(academicYear || "").trim();
  const m = raw.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function buildFeeParamRows(baseYear) {
  const base = Number.isFinite(Number(baseYear)) ? Number(baseYear) : 2026;
  const yPrev3 = base - 3;
  const yPrev2 = base - 2;
  const yPrev1 = base - 1;
  const y1 = base;
  const y2 = base + 1;
  const y3 = base + 2;

  return [
    {
      key: ["inflation", "expenseDeviationPct"],
      label: "Giderlerin Sapma Yüzdeliği (%... Olarak Hesaplanabilir)",
      type: "percent",
    },
    { key: ["inflation", "y2023"], label: `${yPrev3} YILI ENFLASYON ORANI`, type: "percent" },
    { key: ["inflation", "y2024"], label: `${yPrev2} YILI ENFLASYON ORANI`, type: "percent" },
    { key: ["inflation", "y2025"], label: `${yPrev1} YILI ENFLASYON ORANI`, type: "percent" },
    { key: ["inflation", "y1"], label: `1. YIL TAHMİNİ ENFLASYON ORANI (${y1} YILI)`, type: "percent" },
    { key: ["inflation", "y2"], label: `2. YIL TAHMİNİ ENFLASYON ORANI (${y2} YILI)`, type: "percent" },
    { key: ["inflation", "y3"], label: `3. YIL TAHMİNİ ENFLASYON ORANI (${y3} YILI)`, type: "percent" },
    {
      key: ["inflation", "currentSeasonAvgFee"],
      label: "Mevcut Eğitim Sezonu Ücreti (ortalama)",
      type: "money",
    },
  ];
}

function computePlannedHeadcounts(ik) {
  const hc = ik?.years?.y1?.headcountsByLevel || {};
  const levels = Object.keys(hc);
  const sumRole = (role) => levels.reduce((s, lvl) => s + safeNum(hc?.[lvl]?.[role]), 0);

  return {
    turkPersonelYoneticiEgitimci:
      sumRole("turk_mudur") + sumRole("turk_mdyard") + sumRole("turk_egitimci"),
    turkPersonelTemsilcilik: sumRole("turk_temsil"),
    yerelKadroluEgitimci: sumRole("yerel_yonetici_egitimci"),
    yerelUcretliVakaterEgitimci: sumRole("yerel_ucretli_egitimci"),
    yerelDestek: sumRole("yerel_destek"),
    yerelTemsilcilik: sumRole("yerel_ulke_temsil_destek"),
    international: sumRole("int_yonetici_egitimci"),
  };
}

function getScholarshipGroups() {
  const burs = [];
  const indirim = [];
  const diger = [];
  for (const r of SCHOLAR_ROWS) {
    const l = String(r.label || "").toLowerCase();
    if (l.includes("burs")) burs.push(r);
    else if (l.includes("indir")) indirim.push(r);
    else diger.push(r);
  }
  return [
    { key: "burs", label: "Burslar", rows: burs },
    { key: "indirim", label: "İndirimler", rows: indirim },
    { key: "diger", label: "Diğer", rows: diger },
  ].filter((g) => g.rows.length);
}

function computePlannedPerf(prevReport) {
  const y1 = prevReport?.years?.y1 || prevReport?.y1 || null;
  if (!y1) return null;

  const gelirler = safeNum(y1?.income?.netIncome);
  const giderler = safeNum(y1?.expenses?.totalExpenses);
  const base = {
    ogrenci: safeNum(y1?.students?.totalStudents),
    gelirler,
    giderler,
    karZarar: gelirler - giderler,
    bursIndirim: safeNum(y1?.income?.totalDiscounts),
  };

  return base;
}

function computeCurrentStudents(inputs) {
  const cs = safeNum(inputs?.kapasite?.currentStudents);
  if (cs > 0) return cs;

  const list = Array.isArray(inputs?.gradesCurrent) ? inputs.gradesCurrent : [];
  return list.reduce((s, r) => s + safeNum(r?.studentsPerBranch), 0);
}

function computeCurrentBranches(inputs) {
  const list = Array.isArray(inputs?.gradesCurrent) ? inputs.gradesCurrent : [];
  return list.reduce((s, r) => s + safeNum(r?.branchCount), 0);
}

function programTypeLabel(programType) {
  const t = normalizeProgramType(programType);
  if (t === "international") return "International";
  return "Yerel";
}

/**
 * buildTemelBilgilerModel
 * Returns a sheet-agnostic representation of the UI Temel Bilgiler tab.
 */
function buildTemelBilgilerModel({
  school,
  scenario,
  inputs,
  report,
  prevReport,
  currencyMeta,
  prevCurrencyMeta,
  reportCurrency,
  programType,
}) {
  const tb = inputs?.temelBilgiler && typeof inputs.temelBilgiler === "object" ? inputs.temelBilgiler : {};
  const kademeConfig = normalizeKademeConfig(tb.kademeler);
  const type = normalizeProgramType(programType || tb?.programType || scenario?.program_type);

  const currencyCode =
    String(currencyMeta?.input_currency || scenario?.input_currency || "").toUpperCase() === "LOCAL"
      ? String(currencyMeta?.local_currency_code || scenario?.local_currency_code || "").toUpperCase()
      : "USD";

  const inputCurrency = String(currencyMeta?.input_currency || scenario?.input_currency || "USD").toUpperCase();
  const localCurrencyCode = String(currencyMeta?.local_currency_code || scenario?.local_currency_code || "LOCAL").toUpperCase();
  const reportCurrencyKey = String(reportCurrency || "usd").toLowerCase();
  const showUsd = reportCurrencyKey === "usd";
  const showLocal = reportCurrencyKey === "local";

  const baseYear = parseAcademicStartYear(scenario?.academic_year);

  // Kademe labels
  const kademeLabels = {
    okulOncesi: formatKademeLabel("Okul Öncesi", kademeConfig, "okulOncesi"),
    ilkokul: formatKademeLabel("İlkokul", kademeConfig, "ilkokul"),
    ortaokul: formatKademeLabel("Ortaokul", kademeConfig, "ortaokul"),
    lise: formatKademeLabel("Lise", kademeConfig, "lise"),
  };
  kademeLabels.ilkokulYerel = `${kademeLabels.ilkokul}-YEREL`;
  kademeLabels.ilkokulInt = `${kademeLabels.ilkokul}-INT.`;
  kademeLabels.ortaokulYerel = `${kademeLabels.ortaokul}-YEREL`;
  kademeLabels.ortaokulInt = `${kademeLabels.ortaokul}-INT.`;
  kademeLabels.liseYerel = `${kademeLabels.lise}-YEREL`;
  kademeLabels.liseInt = `${kademeLabels.lise}-INT.`;

  const kademeBaseByRow = {
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

  const visibleUcretRows = UCRET_ROWS.filter((r) => {
    const baseKey = kademeBaseByRow[r.key] || r.key;
    const baseEnabled = kademeConfig?.[baseKey]?.enabled !== false;
    return baseEnabled && isKademeKeyVisible(r.key, type);
  });

  const visibleCompetitorRows = COMPETITOR_ROWS.filter((r) => kademeConfig?.[r.key]?.enabled !== false);

  const avgIncreasePercent = (() => {
    const rates = visibleUcretRows.map((r) => safeNum(get(tb, ["ucretArtisOranlari", r.key], 0)));
    const sum = rates.reduce((s, v) => s + v, 0);
    return rates.length ? percentToDisplay(sum / rates.length) : 0;
  })();

  const currentStudents = computeCurrentStudents(inputs);
  const totalBranchesCurrent = computeCurrentBranches(inputs);
  const studentsPerClass = totalBranchesCurrent > 0 ? currentStudents / totalBranchesCurrent : 0;

  const plannedHeadcounts = computePlannedHeadcounts(inputs?.ik);
  const isScenarioLocal = String(scenario?.input_currency || "").toUpperCase() === "LOCAL";
  const plannedPerf = computePlannedPerf(prevReport);
  const perfInputs = tb?.performans?.gerceklesen || {};
  const prevFx = positiveNumber(prevCurrencyMeta?.fx_usd_to_local);
  const realizedFx = positiveNumber(get(inputs, ["temelBilgiler", "performans", "prevYearRealizedFxUsdToLocal"], 0));
  const planFxForLocal = prevFx || realizedFx;
  const needsPlannedConversion = showLocal && !planFxForLocal;
  const needsActualConversion =
    (showUsd && inputCurrency === "LOCAL") || (showLocal && inputCurrency === "USD");
  const actualConversionMissing = needsActualConversion && !realizedFx;
  const showPerfFxWarning = needsPlannedConversion || actualConversionMissing;
  const perfWarningMessage = "Önceki dönem USD karşılaştırması için ortalama kur girilmelidir.";

  const toPlannedDisplay = (value) => {
    const raw = numOrNull(value);
    if (raw == null) return null;
    if (showLocal) {
      if (!planFxForLocal) return null;
      return raw * planFxForLocal;
    }
    return raw;
  };

  const toActualDisplay = (value) => {
    const raw = numOrNull(value);
    if (raw == null) return null;
    if (showUsd) {
      if (inputCurrency === "LOCAL") {
        return realizedFx ? raw / realizedFx : null;
      }
      return raw;
    }
    if (showLocal) {
      if (inputCurrency === "USD") {
        return realizedFx ? raw * realizedFx : null;
      }
      return raw;
    }
    return raw;
  };

  const actualKarZararRaw = (() => {
    const gelir = numOrNull(perfInputs.gelirler);
    const gider = numOrNull(perfInputs.giderler);
    if (gelir != null && gider != null) return gelir - gider;
    const stored = numOrNull(perfInputs.karZarar);
    return stored != null ? stored : null;
  })();

  const performanceMoneyUnitLabel = showLocal ? localCurrencyCode : "USD";
  const realizedFxLabel = `Önceki Dönem Ortalama Kur (Gerçekleşen) (1 USD = X ${localCurrencyCode})`;
  const scholarshipGroups = getScholarshipGroups();
  const feeParamRows = buildFeeParamRows(baseYear);

  const programLabel = programTypeLabel(type);

  // Sections & tables (matches UI intent, not cell-by-cell layout)
  const model = {
    title: "TEMEL BİLGİLER",
    meta: {
      currencyCode,
      reportCurrency,
      programType: type,
      programLabel,
      academicYear: scenario?.academic_year || "",
      schoolName: school?.name || "",
      countryName: school?.country_name || "",
      countryCode: school?.country_code || "",
    },
    sections: [
      {
        title: "ÖZET",
        tables: [
          {
            title: "Genel Göstergeler",
            headers: ["Gösterge", "Değer"],
            rows: [
              ["Öğrenci (Mevcut)", currentStudents],
              ["Şube (Mevcut)", totalBranchesCurrent],
              ["Öğr./Sınıf (Fiili)", studentsPerClass],
            ],
          },
        ],
      },
      {
        title: "A) Bölge / Ülke / Kampüs",
        tables: [
          {
            title: "Bilgiler",
            headers: ["Alan", "Değer"],
            rows: [
              ["BÖLGE", ""],
              ["ÜLKE", school?.country_name || ""],
              ["KAMPÜS / OKUL", school?.name || ""],
              ["MÜDÜR", get(tb, ["yetkililer", "mudur"], "")],
              ["ÜLKE TEMSİLCİSİ", get(tb, ["yetkililer", "ulkeTemsilcisi"], "")],
              ["RAPORU HAZIRLAYAN", get(tb, ["yetkililer", "raporuHazirlayan"], "")],
            ],
          },
        ],
      },
      {
        title: "Program Türü",
        tables: [
          {
            title: "Seçim",
            headers: ["Program", "Değer"],
            rows: [["Program Türü", programLabel]],
          },
        ],
      },
      {
        title: "B) Okul Eğitim Bilgileri",
        tables: [
          {
            title: "Okul Eğitim Bilgileri",
            headers: ["Alan", "Değer"],
            rows: [
              [
                "Eğitim Öğretim Döneminin Başlama Tarihi",
                get(tb, ["okulEgitimBilgileri", "egitimBaslamaTarihi"], ""),
              ],
              [
                "Zorunlu Eğitim Dönemleri",
                get(tb, ["okulEgitimBilgileri", "zorunluEgitimDonemleri"], ""),
              ],
              ["Bir Ders Süresi (dk)", safeNum(get(tb, ["okulEgitimBilgileri", "birDersSuresiDakika"], 0))],
              ["Günlük Ders Saati", safeNum(get(tb, ["okulEgitimBilgileri", "gunlukDersSaati"], 0))],
              [
                "Haftalık Ders (Bir Sınıf)",
                safeNum(get(tb, ["okulEgitimBilgileri", "haftalikDersSaatiToplam"], 0)),
              ],
              [
                "Öğretmen Haftalık Ortalama",
                safeNum(get(tb, ["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], 0)),
              ],
              [
                "Okulda Sabahçı / Öğlenci Uygulaması",
                get(tb, ["okulEgitimBilgileri", "sabahciOglenci"], ""),
              ],
              [
                "Okulda Uygulanan Program (ulusal, uluslararası)",
                get(tb, ["okulEgitimBilgileri", "uygulananProgram"], ""),
              ],
              ["Öğrenci (Mevcut)", currentStudents],
              ["Şube (Mevcut)", totalBranchesCurrent],
              ["Fiili Derslik Kullanım (öğrenci/sınıf)", studentsPerClass],
              [
                "Kademeler Arasında Geçiş Sınavı (Varsa) Bilgileri",
                get(tb, ["okulEgitimBilgileri", "gecisSinaviBilgisi"], ""),
              ],
            ],
          },
        ],
      },
      {
        title: "Kademeler (Düzenle)",
        tables: [
          {
            title: "Kademeler",
            headers: ["Kademe", "Aktif", "Başlangıç", "Bitiş"],
            rows: KADEME_DEFS.map((def) => {
              const row = kademeConfig?.[def.key] || {};
              return [def.label, row?.enabled ? "Evet" : "Hayır", row?.from || "", row?.to || ""]; 
            }),
          },
        ],
      },
      {
        title: "C) Okul Ücretleri (Yeni Eğitim Dönemi)",
        tables: [
          {
            title: "Ayarlar",
            headers: ["Parametre", "Değer"],
            rows: [
              ["Ücret hesaplamayı aktif et", tb?.okulUcretleriHesaplama ? "Evet" : "Hayır"],
              ["Ortalama artış (%)", avgIncreasePercent],
            ],
          },
          {
            title: "Okul Ücretleri Artış Oranları",
            headers: ["Kademe", "Artış Oranı (%)"],
            rows: visibleUcretRows.map((r) => {
              const frac = safeNum(get(tb, ["ucretArtisOranlari", r.key], 0));
              return [kademeLabels[r.key] || r.label, percentToDisplay(frac)];
            }),
          },
        ],
      },
      {
        title: "D) Tahmini Enflasyon ve Parametreler",
        tables: [
          {
            title: "Enflasyon ve Parametreler",
            headers: ["Parametre", "Değer", "Birim"],
            rows: feeParamRows.map((row) => {
              const raw = get(tb, row.key, row.type === "money" ? 0 : 0);
              if (row.type === "percent") {
                return [row.label, percentToDisplay(raw), "%"];
              }
              return [row.label, safeNum(raw), currencyCode];
            }),
          },
        ],
      },
      {
        title: "E) İnsan Kaynakları",
        tables: [
          {
            title: "Mevcut vs Planlanan (IK)",
            headers: ["Kalem", "Mevcut", "Planlanan (IK)"],
            rows: [
              [
                "Türk Personel Yönetici ve Eğitimci Sayısı",
                safeNum(get(tb, ["ikMevcut", "turkPersonelYoneticiEgitimci"], 0)),
                safeNum(plannedHeadcounts.turkPersonelYoneticiEgitimci),
              ],
              [
                "Türk Personel Temsilcilik Personeli Sayısı",
                safeNum(get(tb, ["ikMevcut", "turkPersonelTemsilcilik"], 0)),
                safeNum(plannedHeadcounts.turkPersonelTemsilcilik),
              ],
              [
                "Yerel Kadrolu Eğitimci Personel Sayısı",
                safeNum(get(tb, ["ikMevcut", "yerelKadroluEgitimci"], 0)),
                safeNum(plannedHeadcounts.yerelKadroluEgitimci),
              ],
              [
                "Yerel Ücretli (Vakater) Eğitimci Personel Sayısı",
                safeNum(get(tb, ["ikMevcut", "yerelUcretliVakaterEgitimci"], 0)),
                safeNum(plannedHeadcounts.yerelUcretliVakaterEgitimci),
              ],
              [
                "Yerel Destek Personel Sayısı",
                safeNum(get(tb, ["ikMevcut", "yerelDestek"], 0)),
                safeNum(plannedHeadcounts.yerelDestek),
              ],
              [
                "Yerel Personel Temsilcilik Personeli Sayısı",
                safeNum(get(tb, ["ikMevcut", "yerelTemsilcilik"], 0)),
                safeNum(plannedHeadcounts.yerelTemsilcilik),
              ],
              [
                "International Personel Sayısı",
                safeNum(get(tb, ["ikMevcut", "international"], 0)),
                safeNum(plannedHeadcounts.international),
              ],
            ],
          },
        ],
      },
      {
        title: "F) Burs ve İndirimler — Öğrenci Sayısı",
        tables: [
          {
            title: "Öğrenci Sayıları",
            headers: ["Tür", "Öğrenci"],
            rows: (() => {
              const out = [];
              for (const g of scholarshipGroups) {
                out.push([g.label, ""]);
                for (const r of g.rows) {
                  out.push([
                    r.label,
                    safeNum(get(tb, ["bursIndirimOgrenciSayilari", r.key], 0)),
                  ]);
                }
              }
              return out;
            })(),
          },
        ],
      },
      {
        title: "G) Rakip Kurumların Analizi",
        tables: [
          {
            title: "A/B/C Analizi",
            headers: ["Kademe", "A", "B", "C"],
            rows: visibleCompetitorRows.map((r) => [
              kademeLabels[r.key] || r.label,
              safeNum(get(tb, ["rakipAnalizi", r.key, "a"], 0)),
              safeNum(get(tb, ["rakipAnalizi", r.key, "b"], 0)),
              safeNum(get(tb, ["rakipAnalizi", r.key, "c"], 0)),
            ]),
          },
        ],
      },
      {
        title: "H) Performans (Önceki Dönem)",
        tables: [
          {
            title: "Kur Bilgisi",
            headers: ["Parametre", "Değer"],
            rows: [[realizedFxLabel, realizedFx || ""]],
          },
          {
            title: "Planlanan (Önceki Senaryo) vs Gerçek",
            headers: ["Kalem", "Plan", "Gerçek", "Birim"],
            rows: [
              [
                "Öğrenci Sayısı",
                plannedPerf ? numOrNull(plannedPerf.ogrenci) : null,
                safeNum(perfInputs.ogrenciSayisi),
                "Öğrenci",
              ],
              [
                "Gelirler",
                plannedPerf ? toPlannedDisplay(plannedPerf.gelirler) : null,
                toActualDisplay(perfInputs.gelirler),
                performanceMoneyUnitLabel,
              ],
              [
                "Giderler",
                plannedPerf ? toPlannedDisplay(plannedPerf.giderler) : null,
                toActualDisplay(perfInputs.giderler),
                performanceMoneyUnitLabel,
              ],
              [
                "Kar / Zarar",
                plannedPerf ? toPlannedDisplay(plannedPerf.karZarar) : null,
                toActualDisplay(actualKarZararRaw),
                performanceMoneyUnitLabel,
              ],
              [
                "Burs ve İndirimler",
                plannedPerf ? toPlannedDisplay(plannedPerf.bursIndirim) : null,
                toActualDisplay(perfInputs.bursVeIndirimler),
                performanceMoneyUnitLabel,
              ],
              ...(showPerfFxWarning ? [["Not", perfWarningMessage, "", ""]] : []),
            ],
          },
        ],
      },

      {
        title: "I) Değerlendirme",
        tables: [
          {
            title: "Notlar",
            headers: ["Değerlendirme"],
            rows: [[get(tb, ["degerlendirme"], "")]],
          },
        ],
      },
    ],
  };

  // keep report reference for future use, but do NOT invent fallbacks here
  model._debug = {
    hasReport: Boolean(report),
    hasPrevReport: Boolean(prevReport),
  };

  return model;
}

module.exports = { buildTemelBilgilerModel };
