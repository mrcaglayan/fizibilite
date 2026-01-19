// frontend/src/components/DetailedReportView.jsx

import React, { useCallback, useMemo } from "react";

import { getProgramType, isKademeKeyVisible } from "../utils/programType";

import { buildDetailedReportModel } from "../utils/buildDetailedReportModel";

function isFiniteNumber(v) {
  const n = Number(v);

  return Number.isFinite(n);
}

function fmtNumber(v, opts = {}) {
  if (!isFiniteNumber(v)) return "—";

  const n = Number(v);

  const {
    maximumFractionDigits = 0,

    minimumFractionDigits = 0,

    style,

    currency,
  } = opts;

  try {
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits,

      minimumFractionDigits,

      style,

      currency,
    }).format(n);
  } catch {
    return String(n);
  }
}

function fmtMoney(v, currency) {
  if (!isFiniteNumber(v)) return "—";

  const code = String(currency || "").trim();

  if (code) {
    return fmtNumber(v, {
      style: "currency",

      currency: code,

      maximumFractionDigits: 0,
    });
  }

  return fmtNumber(v, { maximumFractionDigits: 0 });
}

function fmtPct(v, digits = 2) {
  if (!isFiniteNumber(v)) return "—";

  return (
    fmtNumber(Number(v) * 100, {
      maximumFractionDigits: digits,

      minimumFractionDigits: 0,
    }) + "%"
  );
}

const NUM_CELL_STYLE = { textAlign: "right" };

function fmtInt(v) {
  if (!isFiniteNumber(v)) return "—";

  return fmtNumber(v, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function formatTuitionRow(row, formatMoney) {
  if (!row || typeof row !== "object") return row;

  return {
    ...row,

    edu: isFiniteNumber(row.edu) ? formatMoney(row.edu) : (row.edu ?? "—"),

    uniform: isFiniteNumber(row.uniform)
      ? formatMoney(row.uniform)
      : (row.uniform ?? "—"),

    books: isFiniteNumber(row.books)
      ? formatMoney(row.books)
      : (row.books ?? "—"),

    transport: isFiniteNumber(row.transport)
      ? formatMoney(row.transport)
      : (row.transport ?? "—"),

    meal: isFiniteNumber(row.meal) ? formatMoney(row.meal) : (row.meal ?? "—"),

    raisePct: isFiniteNumber(row.raisePct)
      ? fmtPct(row.raisePct, 0)
      : (row.raisePct ?? "—"),

    total: isFiniteNumber(row.total)
      ? formatMoney(row.total)
      : (row.total ?? "—"),
  };
}

function formatAmountRatioRow(row, formatMoney) {
  if (!row || typeof row !== "object") return row;

  return {
    ...row,

    amount: isFiniteNumber(row.amount)
      ? formatMoney(row.amount)
      : (row.amount ?? "—"),

    ratio: isFiniteNumber(row.ratio)
      ? fmtPct(row.ratio, 0)
      : (row.ratio ?? "—"),
  };
}

function formatScholarshipRow(row, formatMoney) {
  if (!row || typeof row !== "object") return row;

  return {
    ...row,

    cur: isFiniteNumber(row.cur) ? fmtInt(row.cur) : (row.cur ?? "—"),

    planned: isFiniteNumber(row.planned)
      ? fmtInt(row.planned)
      : (row.planned ?? "—"),

    cost: isFiniteNumber(row.cost) ? formatMoney(row.cost) : (row.cost ?? "—"),
  };
}

const LEVEL_VARIANT_BASES = [
  { key: "okulOncesi", match: "okul oncesi" },

  { key: "ilkokul", match: "ilkokul" },

  { key: "ortaokul", match: "ortaokul" },

  { key: "lise", match: "lise" },
];

function normalizeString(value) {
  return String(value || "")
    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^a-z0-9 ]/gi, " ")

    .toLowerCase();
}

function inferTuitionVariantKey(row) {
  const explicitKey = String(row?.key || "").trim();

  if (explicitKey) return explicitKey;

  const label = normalizeString(row?.level);

  if (!label) return null;

  for (const def of LEVEL_VARIANT_BASES) {
    if (label.includes(def.match)) {
      if (def.key === "okulOncesi") return "okulOncesi";

      if (label.includes("yerel")) return `${def.key}Yerel`;

      if (label.includes("int") || label.includes("international"))
        return `${def.key}Int`;

      return null;
    }
  }

  return null;
}

function isTuitionRowVisible(row, programType) {
  const variantKey = inferTuitionVariantKey(row);

  if (!variantKey) return true;

  return isKademeKeyVisible(variantKey, programType);
}

function Section({ title, children, subtitle }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>

      {subtitle ? (
        <div className="small" style={{ marginBottom: 10 }}>
          {subtitle}
        </div>
      ) : null}

      {children}
    </div>
  );
}

function SimpleTable({ columns, rows }) {
  return (
    <table className="table" style={{ width: "100%" }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={c.thStyle}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.length ? (
          rows.map((r, idx) => (
            <tr key={r.key || idx}>
              {columns.map((c) => (
                <td key={c.key} style={c.tdStyle}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length} className="small">
              Veri yok.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div
      style={{
        padding: 12,

        borderRadius: 12,

        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div className="small" style={{ opacity: 0.8, marginBottom: 6 }}>
        {label}
      </div>

      <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.15 }}>
        {value}
      </div>

      {hint ? (
        <div className="small" style={{ opacity: 0.75, marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**

 * Detaylı Rapor (Excel: RAPOR sayfası)

 *

 * mode:

 *  - "detailed": Excel RAPOR sayfası iskeleti (A-F)

 *  - "onepager": Tek sayfa özet (yönetici gözüyle kısa)

 */

export default function DetailedReportView(props) {
  const {
    school,

    scenario,

    mode = "detailed",

    // ileride veri baglamak i??n simdiden aliyoruz (simdilik opsiyonel)

    inputs,

    report,

    prevReport,
    prevCurrencyMeta,
    programType: programTypeProp,

    reportCurrency = "usd",

    currencyMeta,
  } = props || {};

  const model = useMemo(
    () =>
      buildDetailedReportModel({
        school,

        scenario,

        inputs,

        report,

        prevReport,
        prevCurrencyMeta,
        programType: programTypeProp,
      }),

    [
      school,
      scenario,
      inputs,
      report,
      prevReport,
      prevCurrencyMeta,
      programTypeProp,
    ],
  );

  const activeProgramType = useMemo(
    () => programTypeProp || getProgramType(inputs, scenario),

    [programTypeProp, inputs, scenario],
  );

  const header = useMemo(() => {
    if (model.headerLabel) return model.headerLabel;

    const schoolName = school?.name || school?.school_name || "Okul";

    const year = scenario?.academic_year || "";

    const scenarioName = scenario?.name || "";

    const parts = [schoolName, scenarioName, year].filter(Boolean);

    return parts.join(" › ");
  }, [model.headerLabel, school, scenario]);

  const currencyCode = model.currencyCode || "USD";

  const fx = Number(currencyMeta?.fx_usd_to_local || 0);

  const canShowLocal =
    currencyMeta?.input_currency === "LOCAL" &&
    fx > 0 &&
    currencyMeta?.local_currency_code;

  const showLocal = reportCurrency === "local" && canShowLocal;

  const localLabel = currencyMeta?.local_currency_code || "LOCAL";

  const displayCurrencyCode = showLocal ? localLabel : currencyCode;

  const displayMoney = useCallback(
    (v) => {
      const n = Number(v);

      if (!Number.isFinite(n)) return v;

      return showLocal ? n * fx : n;
    },

    [showLocal, fx],
  );

  const fmtMoneyDisplay = useCallback(
    (v) => fmtMoney(displayMoney(v), displayCurrencyCode),

    [displayMoney, displayCurrencyCode],
  );
  const prevFx = Number(prevCurrencyMeta?.fx_usd_to_local || 0);

  const prevLocalCode = prevCurrencyMeta?.local_currency_code || "";

  const showPerfLocal =
    reportCurrency === "local" && prevFx > 0 && prevLocalCode;

  const perfCurrencyCode = showPerfLocal ? prevLocalCode : currencyCode;

  const perfDisplayMoney = useCallback(
    (v) => {
      const n = Number(v);

      if (!Number.isFinite(n)) return v;

      return showPerfLocal ? n * prevFx : n;
    },

    [showPerfLocal, prevFx],
  );

  const fmtPerfMoneyDisplay = useCallback(
    (v) => fmtMoney(perfDisplayMoney(v), perfCurrencyCode),

    [perfDisplayMoney, perfCurrencyCode],
  );
  const fmtMoneyKpi = useCallback(
    (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "?";
      if (reportCurrency === "local" && canShowLocal) {
        return fmtMoney(n * fx, localLabel);
      }
      return fmtMoney(n, currencyCode);
    },
    [reportCurrency, canShowLocal, fx, localLabel, currencyCode],
  );

  // ------------------ Detailed (Excel-like) model rows ------------------

  const educationInfoRows = useMemo(
    () =>
      [
        {
          k: "Eğitim Öğretim Döneminin Başlama Tarihi",
          v: model.periodStartDate || "—",
        },

        {
          k: "Okul Kapasitesi",

          v: isFiniteNumber(model.schoolCapacity)
            ? fmtNumber(model.schoolCapacity)
            : "—",
        },

        {
          k: "Mevcut Öğrenci Sayısı",

          v: isFiniteNumber(model.currentStudents)
            ? fmtNumber(model.currentStudents)
            : "—",
        },

        { k: "Zorunlu Eğitim Dönemleri", v: model.compulsoryEducation || "—" },

        { k: "Bir Ders Süresi", v: model.lessonDuration || "—" },

        { k: "Günlük Ders Saati", v: model.dailyLessonHours || "—" },

        {
          k: "Haftalık Ders Saati Toplamı (Bir Sınıfın)",

          v: model.weeklyLessonHours || "—",
        },

        {
          k: "Okulda Sabahçı / Öğlenci Uygulaması",
          v: model.shiftSystem || "—",
        },

        {
          k: "Öğretmen Haftalık Ders Saati Ortalaması",

          v: model.teacherWeeklyHoursAvg || "—",
        },

        {
          k: "Fiili Derslik Kullanım Yüzdeliği (öğrenci sayısı/sınıf sayısı)",

          v: isFiniteNumber(model.classroomUtilization)
            ? fmtNumber(model.classroomUtilization, {
              maximumFractionDigits: 2,
            })
            : "—",
        },

        {
          k: "Kademeler Arasında Geçiş Sınavı (Varsa) Bilgileri",

          v: model.transitionExamInfo || "—",
        },

        {
          k: "Okulda Uygulanan Program (ulusal, uluslararası)",
          v: model.programType || "—",
        },
      ].map((x, i) => ({ key: String(i), ...x })),

    [model],
  );

  const tuitionRows = useMemo(() => {
    const base = model.tuitionTable || [];

    if (Array.isArray(base) && base.length) return base;

    // Excel'deki varsayılan satır iskeleti

    return [
      {
        level: "Okul Öncesi",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "İlkokul - YEREL",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "İlkokul - INT.",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "Ortaokul - YEREL",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "Ortaokul - INT.",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "Lise - YEREL",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "Lise - INT.",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "TOPLAM",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },

      {
        level: "ORTALAMA ÜCRET",

        edu: "—",

        uniform: "—",

        books: "—",

        transport: "—",

        meal: "—",

        raisePct: "—",

        total: "—",
      },
    ];
  }, [model]);

  const filteredTuitionRows = useMemo(
    () =>
      tuitionRows.filter((row) => isTuitionRowVisible(row, activeProgramType)),

    [tuitionRows, activeProgramType],
  );

  const formattedTuitionRows = useMemo(
    () =>
      filteredTuitionRows.map((row) => formatTuitionRow(row, fmtMoneyDisplay)),

    [filteredTuitionRows, fmtMoneyDisplay],
  );

  const paramsRows = useMemo(() => {
    const base = model.parameters || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      {
        no: "1",
        desc: "Planlanan Dönem Kapasite Kullanım Oranı (%)",
        value: "—",
      },

      {
        no: "2",
        desc: "İnsan Kaynakları Planlaması (Türk + Yerel + International)",
        value: "—",
      },

      { no: "3", desc: "Gelir Planlaması", value: "—" },

      { no: "4", desc: "Gider Planlaması", value: "—" },

      { no: "", desc: "Gelir - Gider Farkı", value: "—" },

      {
        no: "5",

        desc: "Tahsil Edilemeyecek Gelirler (Önceki Dönemin Tahsil Edilemeyen yüzdelik rakamı)",

        value: "—",
      },

      {
        no: "6",
        desc: "Giderlerin Sapma Yüzdeliği (%... Olarak Hesaplanabilir)",
        value: "—",
      },

      {
        no: "7",
        desc: "Burs ve İndirim Giderleri (Fizibilite-G71)",
        value: "—",
      },

      {
        no: "",

        desc: "Öğrenci Başına Maliyet (Tüm Giderler (Parametre 4 / Planlanan Öğrenci Sayısı))",

        value: "—",
      },

      { no: "8", desc: "Rakip Kurumların Analizi (VAR / YOK)", value: "—" },

      {
        no: "",
        desc: "Planlanan Dönem Eğitim Ücretleri Artış Oranı",
        value: "—",
      },

      {
        no: "9",

        desc: "Yerel Mevzuatta uygunluk (yasal azami artış, Protokol Sınırlılıkları, Son 3 yılın resmi enflasyon orn.)",

        value: "—",
      },

      { no: "10", desc: "Mevcut Eğitim Sezonu Ücreti (ortalama)", value: "—" },

      { no: "", desc: "Nihai Ücret", value: "—" },
    ];
  }, [model.parameters]);

  const formatParamValue = useCallback(
    (param) => {
      if (!param) return "—";

      const { value, valueType } = param;

      if (typeof value === "string" && !valueType) return value;

      if (value == null) return "—";

      switch (valueType) {
        case "percent":
          return fmtPct(value);

        case "currency":
          return fmtMoneyDisplay(value);

        case "number":
          return fmtNumber(value);

        default:
          return typeof value === "string"
            ? value
            : isFiniteNumber(value)
              ? fmtNumber(value)
              : "—";
      }
    },
    [fmtMoneyDisplay],
  );

  const PARAM_HEADER_CELLS = [
    { key: "no", label: "#", colSpan: 1, thStyle: { width: 40 } },

    { key: "desc", label: "Parametre", colSpan: 4 },

    {
      key: "value",
      label: "Veri",
      colSpan: 1,
      thStyle: { width: 220, textAlign: "right" },
    },
  ];

  const inflationYearsMeta = model.parametersMeta?.inflationYears;

  const inflationHistory = useMemo(
    () => model.parametersMeta?.inflationHistory || {},
    [model.parametersMeta?.inflationHistory],
  );

  const inflationBaseYear = Number(model.parametersMeta?.inflationBaseYear);

  const inflationYearRows = useMemo(() => {
    if (Array.isArray(inflationYearsMeta) && inflationYearsMeta.length === 3) {
      return inflationYearsMeta.map((item) => ({
        year: Number.isFinite(item?.year) ? Number(item.year) : null,

        value: item?.value,
      }));
    }

    if (Number.isFinite(inflationBaseYear)) {
      const base = inflationBaseYear;

      const years = [base - 3, base - 2, base - 1];

      return years.map((year) => ({
        year,

        value: inflationHistory[`y${year}`],
      }));
    }

    return [];
  }, [inflationYearsMeta, inflationHistory, inflationBaseYear]);

  const inflationYearLabels = inflationYearRows.map((item) =>
    item.year ? `${item.year} yılı oran` : "",
  );

  const inflationYearValues = inflationYearRows.map((item) => item.value);

  const paramTableRows = useMemo(() => {
    const rows = [];

    const pushRow = (row, idx) => {
      rows.push({
        key: row.key || `param-${idx}`,

        cells: [
          { content: row.no, colSpan: 1 },

          { content: row.desc, colSpan: 4 },

          { content: formatParamValue(row), colSpan: 1, align: "right" },
        ],
      });
    };

    paramsRows.forEach((row, idx) => {
      pushRow(row, idx);

      if (String(row.no || "") === "9") {
        rows.push({
          key: "param-inflation-head",

          cells: [
            { content: "", colSpan: 1 },

            { content: "Son 3 Yılın Resmi Enflasyon Oranları", colSpan: 1 },

            { content: inflationYearLabels[0], colSpan: 1, align: "center" },

            { content: inflationYearLabels[1], colSpan: 1, align: "center" },

            { content: inflationYearLabels[2], colSpan: 1, align: "center" },

            { content: "", colSpan: 1 },
          ],
        });

        rows.push({
          key: "param-inflation-values",

          cells: [
            { content: "", colSpan: 1 },

            { content: "", colSpan: 1 },

            {
              content: formatParamValue({
                value: inflationYearValues[0],
                valueType: "percent",
              }),
              colSpan: 1,
              align: "center",
            },

            {
              content: formatParamValue({
                value: inflationYearValues[1],
                valueType: "percent",
              }),
              colSpan: 1,
              align: "center",
            },

            {
              content: formatParamValue({
                value: inflationYearValues[2],
                valueType: "percent",
              }),
              colSpan: 1,
              align: "center",
            },

            { content: "", colSpan: 1 },
          ],
        });
      }
    });

    return rows;
  }, [paramsRows, inflationYearLabels, inflationYearValues, formatParamValue]);

  const capacityStudentRows = useMemo(() => {
    const v = model.capacity || {};

    return [
      {
        k: "Bina Öğrenci Kapasitesi",

        v: isFiniteNumber(v.buildingCapacity)
          ? fmtNumber(v.buildingCapacity)
          : "—",
      },

      {
        k: "Mevcut Öğrenci Sayısı",

        v: isFiniteNumber(v.currentStudents)
          ? fmtNumber(v.currentStudents)
          : "—",
      },

      {
        k: "Planlanan Öğrenci Sayısı",

        v: isFiniteNumber(v.plannedStudents)
          ? fmtNumber(v.plannedStudents)
          : "—",
      },

      {
        k: "Planlanan Kapasite Kullanımı %",

        v: isFiniteNumber(v.plannedUtilization)
          ? fmtPct(v.plannedUtilization, 2)
          : "—",
      },
    ];
  }, [model]);

  const capacityClassRows = useMemo(() => {
    const v = model.capacity || {};

    const plannedAvg =
      isFiniteNumber(v.plannedStudents) &&
        isFiniteNumber(v.plannedBranches) &&
        Number(v.plannedBranches) !== 0
        ? Number(v.plannedStudents) / Number(v.plannedBranches)
        : v.avgStudentsPerClassPlanned;

    return [
      {
        k: "Binadaki Toplam Şube (Derslik) Sayısı",

        v: isFiniteNumber(v.totalBranches) ? fmtNumber(v.totalBranches) : "—",
      },

      {
        k: "Mevcut Dönemde Kullanılan Şube (Derslik) Sayısı",

        v: isFiniteNumber(v.usedBranches) ? fmtNumber(v.usedBranches) : "—",
      },

      {
        k: "Planlanan Şube (Derslik) Sayısı",

        v: isFiniteNumber(v.plannedBranches)
          ? fmtNumber(v.plannedBranches)
          : "—",
      },

      {
        k: "Sınıf Başına Düşen Ort. Öğrenci Sayısı",

        v: isFiniteNumber(plannedAvg)
          ? fmtNumber(plannedAvg, { maximumFractionDigits: 2 })
          : "—",
      },
    ];
  }, [model]);

  const hrRows = useMemo(() => {
    const base = model.hr || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      {
        item: "Türk Personel Yönetici ve Eğitimci Sayısı",
        current: "—",
        planned: "—",
      },

      {
        item: "Türk Personel Temsilcilik Personeli Sayısı",
        current: "—",
        planned: "—",
      },

      {
        item: "Yerel Kadrolu Eğitimci Personel Sayısı",
        current: "—",
        planned: "—",
      },

      {
        item: "Yerel Ücretli (Vakater) Eğitimci Personel Sayısı",
        current: "—",
        planned: "—",
      },

      { item: "Yerel Destek Personel Sayısı", current: "—", planned: "—" },

      {
        item: "Yerel Personel Temsilcilik Personeli Sayısı",
        current: "—",
        planned: "—",
      },

      { item: "International Personel Sayısı", current: "—", planned: "—" },
    ];
  }, [model]);

  const revRows = useMemo(() => {
    const base = model.revenues || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      { name: "Eğitim Ücreti", amount: "—", ratio: "—" },

      { name: "Üniforma", amount: "—", ratio: "—" },

      { name: "Kitap Kırtasiye", amount: "—", ratio: "—" },

      { name: "Yemek", amount: "—", ratio: "—" },

      { name: "Servis", amount: "—", ratio: "—" },

      { name: "Yurt Gelirleri", amount: "—", ratio: "—" },

      { name: "Diğer (kantin, kira vb.)", amount: "—", ratio: "—" },
    ];
  }, [model]);

  const expRows = useMemo(() => {
    const base = model.expenses || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      { name: "IK Giderleri (Türk Personel)", amount: "—", ratio: "—" },

      { name: "IK (Yerel Personel)", amount: "—", ratio: "—" },

      { name: "İşletme Giderleri", amount: "—", ratio: "—" },

      { name: "Yemek (Öğrenci Yemeği)", amount: "—", ratio: "—" },

      { name: "Üniforma", amount: "—", ratio: "—" },

      { name: "Kitap- Kırtasiye", amount: "—", ratio: "—" },

      { name: "Öğrenci Servisi", amount: "—", ratio: "—" },
    ];
  }, [model]);

  const formattedRevRows = useMemo(
    () => revRows.map((row) => formatAmountRatioRow(row, fmtMoneyDisplay)),

    [revRows, fmtMoneyDisplay],
  );

  const revenuesDetailed = useMemo(
    () => model.revenuesDetailed || [],
    [model.revenuesDetailed],
  );

  const revenuesDetailedTotal =
    Number.isFinite(Number(model.revenuesDetailedTotal)) &&
      Number(model.revenuesDetailedTotal) > 0
      ? Number(model.revenuesDetailedTotal)
      : null;

  const revenueTable = useMemo(() => {
    const filtered = revenuesDetailed.filter(
      (r) => Number.isFinite(r.amount) && Number(r.amount) !== 0,
    );

    const total =
      revenuesDetailedTotal ||
      filtered.reduce(
        (sum, r) => (Number.isFinite(r.amount) ? sum + Number(r.amount) : sum),
        0,
      );

    if (!filtered.length || !Number.isFinite(total) || total === 0) return null;

    const rows = filtered.map((r, idx) => {
      const ratio =
        Number.isFinite(r.amount) && total ? r.amount / total : null;

      return {
        key: r.name || idx,

        name: r.name,

        amount: fmtMoneyDisplay(r.amount),

        ratio: Number.isFinite(ratio) ? fmtPct(ratio, 2) : "—",
      };
    });

    return { rows, total: fmtMoneyDisplay(total) };
  }, [revenuesDetailed, revenuesDetailedTotal, fmtMoneyDisplay]);

  const detailedExpenses = useMemo(
    () => model.parametersMeta?.detailedExpenses || [],
    [model.parametersMeta?.detailedExpenses],
  );

  const detailedExpenseTotal =
    Number(model.parametersMeta?.detailedExpenseTotal) ||
    Number(model.expenseTotal) ||
    0;

  const formattedExpRows = useMemo(
    () => expRows.map((row) => formatAmountRatioRow(row, fmtMoneyDisplay)),

    [expRows, fmtMoneyDisplay],
  );

  const detailedExpenseRows = useMemo(() => {
    if (!Array.isArray(detailedExpenses) || !detailedExpenses.length)
      return null;

    const total =
      detailedExpenseTotal ||
      detailedExpenses.reduce(
        (sum, r) => (Number.isFinite(r.amount) ? sum + Number(r.amount) : sum),
        0,
      );

    const rows = detailedExpenses.map((r, idx) => {
      const ratioVal =
        r.ratio != null
          ? r.ratio
          : Number.isFinite(r.amount) && total > 0
            ? Number(r.amount) / total
            : null;

      const overTarget =
        Number.isFinite(r.targetPct) &&
        Number.isFinite(ratioVal) &&
        ratioVal > r.targetPct;

      return {
        key: r.name || idx,

        name: r.name,

        amount: Number.isFinite(r.amount) ? fmtMoneyDisplay(r.amount) : "—",

        ratio: Number.isFinite(ratioVal) ? fmtPct(ratioVal, 2) : "—",

        targetLabel: Number.isFinite(r.targetPct)
          ? `(Hedeflenen Maliyet ${fmtPct(r.targetPct, 0)})`
          : "",

        highlight: overTarget,
      };
    });

    const totalAmount = total > 0 ? fmtMoneyDisplay(total) : "—";

    return { rows, total: totalAmount };
  }, [detailedExpenses, detailedExpenseTotal, fmtMoneyDisplay]);


  const discountAnalysis = model.discountAnalysis || {};

  const scholarshipAnalysis = useMemo(
    () => discountAnalysis.scholarships || {},
    [discountAnalysis.scholarships],
  );
  const discountAnalysisData = useMemo(
    () => discountAnalysis.discounts || {},
    [discountAnalysis.discounts],
  );
  const MINI_ANALYSIS_COLUMNS = [
    { key: "label", label: "", thStyle: { width: 240 } },

    {
      key: "value",
      label: "",
      thStyle: { width: 140, textAlign: "right" },
      tdStyle: NUM_CELL_STYLE,
    },
  ];

  const formatCurrencyOrDash = useCallback(
    (v) => (Number.isFinite(Number(v)) ? fmtMoneyDisplay(v) : "—"),

    [fmtMoneyDisplay],
  );

  const formatPct0OrDash = useCallback(
    (v) => (Number.isFinite(Number(v)) ? fmtPct(v, 0) : "—"),

    [],
  );

  const scholarshipAnalysisRows = useMemo(
    () => [
      {
        key: "sch-per-target",

        label: "Toplam Burs Hedeflenen Öğrenci Sayısına Bölümü",

        value: formatCurrencyOrDash(scholarshipAnalysis.perTargetStudent),
      },

      {
        key: "sch-student-share",

        label: "Burs Öğrencilerin Toplam Öğrenci içindeki %",

        value: formatPct0OrDash(scholarshipAnalysis.studentShare),
      },

      {
        key: "sch-revenue-share",

        label: "Burs Velilerden Alınan Öğrenci Gelirleri içindeki %",

        value: formatPct0OrDash(scholarshipAnalysis.revenueShare),
      },

      {
        key: "sch-weighted",

        label: "Ağırlıklı Burs Ortalaması %",

        value: formatPct0OrDash(scholarshipAnalysis.weightedAvgRate),
      },
    ],

    [scholarshipAnalysis, formatCurrencyOrDash, formatPct0OrDash],
  );

  const discountAnalysisRows = useMemo(
    () => [
      {
        key: "disc-per-target",

        label: "Toplam İndirimlerin Hedeflenen Öğrenci Sayısına Bölümü",

        value: formatCurrencyOrDash(discountAnalysisData.perTargetStudent),
      },

      {
        key: "disc-student-share",

        label: "İndirimli Öğrencilerin Toplam Öğrenci içindeki %",

        value: formatPct0OrDash(discountAnalysisData.studentShare),
      },

      {
        key: "disc-revenue-share",

        label: "İndirimlerin Velilerden Alınan Öğrenci Gelirleri içindeki %",

        value: formatPct0OrDash(discountAnalysisData.revenueShare),
      },

      {
        key: "disc-weighted",

        label: "Ağırlıklı İndirim Ortalaması %",

        value: formatPct0OrDash(discountAnalysisData.weightedAvgRate),
      },
    ],

    [discountAnalysisData, formatCurrencyOrDash, formatPct0OrDash],
  );

  const scholarshipsRows = useMemo(() => {
    const base = model.scholarships || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      { name: "MAGİS Başarı Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Maarif Yetenek Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "İhtiyaç Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Okul Başarı Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Tam Eğitim Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Barınma Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Türkçe Başarı Bursu", cur: "—", planned: "—", cost: "—" },

      { name: "Toplam", cur: "—", planned: "—", cost: "—" },
    ];
  }, [model]);

  const discountsRows = useMemo(() => {
    const base = model.discounts || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      {
        name: "Vakfın Uluslararası Yükümlülüklerinden Kaynaklı İndirim",

        cur: "—",

        planned: "—",

        cost: "—",
      },

      { name: "Vakıf Çalışanı İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Kardeş İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Erken Kayıt İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Peşin Ödeme İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Kademe Geçiş İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Temsil İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "Kurum İndirimi", cur: "—", planned: "—", cost: "—" },

      { name: "İstisnai İndirim", cur: "—", planned: "—", cost: "—" },

      {
        name: "Yerel Mevzuatın Şart Koştuğu İndirim",
        cur: "—",
        planned: "—",
        cost: "—",
      },

      { name: "Toplam", cur: "—", planned: "—", cost: "—" },
    ];
  }, [model]);

  const formattedScholarshipsRows = useMemo(
    () =>
      scholarshipsRows.map((row) => formatScholarshipRow(row, fmtMoneyDisplay)),

    [scholarshipsRows, fmtMoneyDisplay],
  );

  const formattedDiscountsRows = useMemo(
    () =>
      discountsRows.map((row) => formatScholarshipRow(row, fmtMoneyDisplay)),

    [discountsRows, fmtMoneyDisplay],
  );

  const scholarshipTotals = useMemo(() => {
    const totals = scholarshipsRows.reduce(
      (acc, row) => {
        const cur = isFiniteNumber(row.cur) ? Number(row.cur) : 0;

        const planned = isFiniteNumber(row.planned) ? Number(row.planned) : 0;

        const cost = isFiniteNumber(row.cost) ? Number(row.cost) : 0;

        return {
          cur: acc.cur + cur,

          planned: acc.planned + planned,

          cost: acc.cost + cost,
        };
      },

      { cur: 0, planned: 0, cost: 0 },
    );

    return {
      cur: fmtInt(totals.cur),

      planned: fmtInt(totals.planned),

      cost: fmtMoneyDisplay(totals.cost),
    };
  }, [scholarshipsRows, fmtMoneyDisplay]);

  const discountTotals = useMemo(() => {
    const totals = discountsRows.reduce(
      (acc, row) => {
        const cur = isFiniteNumber(row.cur) ? Number(row.cur) : 0;

        const planned = isFiniteNumber(row.planned) ? Number(row.planned) : 0;

        const cost = isFiniteNumber(row.cost) ? Number(row.cost) : 0;

        return {
          cur: acc.cur + cur,

          planned: acc.planned + planned,

          cost: acc.cost + cost,
        };
      },

      { cur: 0, planned: 0, cost: 0 },
    );

    return {
      cur: fmtInt(totals.cur),

      planned: fmtInt(totals.planned),

      cost: fmtMoneyDisplay(totals.cost),
    };
  }, [discountsRows, fmtMoneyDisplay]);

  const perfRows = useMemo(() => {
    const base = Array.isArray(model.performance) ? model.performance : [];
    const formatValue = (value, kind) => {
      if (!isFiniteNumber(value)) return "—";
      if (kind === "int") return fmtInt(value);
      if (kind === "money") return fmtPerfMoneyDisplay(value);
      if (kind === "pct") return fmtPct(value);
      return fmtNumber(value);
    };
    const formatVariance = (value) =>
      isFiniteNumber(value) ? fmtPct(value) : "—";

    if (!base.length) {
      return [
        { metric: "Ogrenci Sayisi", planned: "—", actual: "—", variance: "—" },
        { metric: "Gelirler", planned: "—", actual: "—", variance: "—" },
        { metric: "Giderler", planned: "—", actual: "—", variance: "—" },
        { metric: "Kar Zarar Orani", planned: "—", actual: "—", variance: "—" },
        {
          metric: "Burs ve Indirimler",
          planned: "—",
          actual: "—",
          variance: "—",
        },
      ];
    }

    return base.map((row) => {
      const metric = row.metric;
      const kind =
        metric === "Ogrenci Sayisi"
          ? "int"
          : metric === "Kar Zarar Orani"
            ? "pct"
            : metric === "Gelirler" ||
              metric === "Giderler" ||
              metric === "Burs ve Indirimler"
              ? "money"
              : "number";
      return {
        metric,
        planned: formatValue(row.planned, kind),
        actual: formatValue(row.actual, kind),
        variance: formatVariance(row.variance),
      };
    });
  }, [model, fmtPerfMoneyDisplay]);

  const competitorRows = useMemo(() => {
    const base = model.competitors || [];

    if (Array.isArray(base) && base.length) return base;

    return [
      { level: "Okul Öncesi", a: "—", b: "—", c: "—" },

      { level: "İlkokul", a: "—", b: "—", c: "—" },

      { level: "Ortaokul", a: "—", b: "—", c: "—" },

      { level: "Lise", a: "—", b: "—", c: "—" },
    ];
  }, [model]);
  const formattedCompetitorRows = useMemo(
    () =>
      competitorRows.map((row) => ({
        ...row,
        a: isFiniteNumber(row.a) ? fmtMoneyDisplay(row.a) : (row.a ?? "-"),
        b: isFiniteNumber(row.b) ? fmtMoneyDisplay(row.b) : (row.b ?? "-"),
        c: isFiniteNumber(row.c) ? fmtMoneyDisplay(row.c) : (row.c ?? "-"),
      })),
    [competitorRows, fmtMoneyDisplay],
  );

  // ------------------ One pager helpers (still skeleton) ------------------
  const onePagerKpis = useMemo(() => {
    // Şimdilik model üzerinden. Sonraki adımda inputs/report ile dolduracağız.

    const students = model.currentStudents ?? model.capacity?.currentStudents;

    const cap = model.schoolCapacity ?? model.capacity?.buildingCapacity;

    const util = model.capacity?.plannedUtilization;

    // Gelir/Gider toplamları (ileride report'tan gelecek)

    const revTotal = model.revenueTotal;

    const expTotal = model.expenseTotal;

    const net =
      isFiniteNumber(revTotal) && isFiniteNumber(expTotal)
        ? Number(revTotal) - Number(expTotal)
        : null;

    const margin =
      isFiniteNumber(revTotal) && isFiniteNumber(net) && Number(revTotal) !== 0
        ? Number(net) / Number(revTotal)
        : null;

    // Ortalama ücret (ileride tuition table ile)

    const avgTuition = model.avgTuition;

    return [
      {
        label: "Mevcut Öğrenci",
        value: isFiniteNumber(students) ? fmtNumber(students) : "—",
      },

      { label: "Kapasite", value: isFiniteNumber(cap) ? fmtNumber(cap) : "—" },

      {
        label: "Kapasite Kullanım %",
        value: isFiniteNumber(util) ? fmtPct(util) : "—",
      },

      {
        label: "Ortalama Ücret",
        value: isFiniteNumber(avgTuition) ? fmtMoneyKpi(avgTuition) : "—",
      },

      {
        label: "Toplam Gelir",
        value: isFiniteNumber(revTotal) ? fmtMoneyKpi(revTotal) : "—",
      },

      {
        label: "Toplam Gider",
        value: isFiniteNumber(expTotal) ? fmtMoneyKpi(expTotal) : "—",
      },

      { label: "Net", value: isFiniteNumber(net) ? fmtMoneyKpi(net) : "—" },

      { label: "Marj", value: isFiniteNumber(margin) ? fmtPct(margin) : "—" },
    ];
  }, [model, fmtMoneyKpi]);

  const viewMode = String(mode || "detailed").toLowerCase();

  if (viewMode === "onepager") {
    return (
      <div>
        <div className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",

              justifyContent: "space-between",

              gap: 12,

              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Detaylı Rapor · Tek Sayfa Özet
              </div>

              <div className="small" style={{ marginTop: 2 }}>
                {header || ""}
              </div>
            </div>

            <div className="small" style={{ textAlign: "right", opacity: 0.8 }}>
              <div>
                Görünüm: <b>Özet</b>
              </div>

              <div>Şimdilik iskelet (UI), veri bağlama sonraki adım.</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",

              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",

              gap: 10,

              marginTop: 12,
            }}
          >
            {onePagerKpis.map((k) => (
              <Kpi
                key={k.label}
                label={k.label}
                value={k.value}
                hint={k.hint}
              />
            ))}
          </div>

          <div
            className="small"
            style={{ marginTop: 12, opacity: 0.85, lineHeight: 1.35 }}
          >
            Bu görünüm, yönetici/komisyon için hızlı kontrol amaçlı “tek sayfa”
            özetidir. Detaylı Excel RAPOR düzeni için “Detaylı” görünümü
            seçebilirsiniz.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ücret Özeti</div>

            <SimpleTable
              columns={[
                { key: "level", label: "Kademe" },

                {
                  key: "edu",
                  label: "Eğitim",
                  thStyle: { width: 140, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "total",
                  label: "Toplam",
                  thStyle: { width: 140, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedTuitionRows

                .filter((r) => !/TOPLAM|ORTALAMA/i.test(String(r.level || "")))

                .slice(0, 7)

                .map((r, i) => ({
                  key: String(i),
                  level: r.level,
                  edu: r.edu,
                  total: r.total,
                }))}
            />

            <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
              Not: Paket ücretler ve artış oranları bir sonraki adımda otomatik
              bağlanacak.
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>İK Özeti</div>

            <SimpleTable
              columns={[
                { key: "item", label: "Kalem" },

                {
                  key: "planned",
                  label: "Plan",
                  thStyle: { width: 120, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={hrRows
                .slice(0, 7)
                .map((r, i) => ({
                  key: String(i),
                  item: r.item,
                  planned: r.planned,
                }))}
            />

            <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
              Not: Mevcut/plan karşılaştırması detaylı görünümde.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Gelir Dağılımı
            </div>

            <SimpleTable
              columns={[
                { key: "name", label: "Gelir" },

                {
                  key: "amount",
                  label: "Tutar",
                  thStyle: { width: 160, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "ratio",
                  label: "%",
                  thStyle: { width: 70, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedRevRows
                .slice(0, 7)
                .map((r, i) => ({ key: String(i), ...r }))}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Gider Dağılımı
            </div>

            <SimpleTable
              columns={[
                { key: "name", label: "Gider" },

                {
                  key: "amount",
                  label: "Tutar",
                  thStyle: { width: 160, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "ratio",
                  label: "%",
                  thStyle: { width: 70, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedExpRows
                .slice(0, 7)
                .map((r, i) => ({ key: String(i), ...r }))}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Burslar</div>

            <SimpleTable
              columns={[
                { key: "name", label: "Burs" },

                {
                  key: "planned",
                  label: "Plan",
                  thStyle: { width: 90, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "cost",
                  label: "Maliyet",
                  thStyle: { width: 120, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedScholarshipsRows
                .slice(0, 8)
                .map((r, i) => ({
                  key: String(i),
                  name: r.name,
                  planned: r.planned,
                  cost: r.cost,
                }))}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>İndirimler</div>

            <SimpleTable
              columns={[
                { key: "name", label: "İndirim" },

                {
                  key: "planned",
                  label: "Plan",
                  thStyle: { width: 90, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "cost",
                  label: "Maliyet",
                  thStyle: { width: 120, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedDiscountsRows
                .slice(0, 8)
                .map((r, i) => ({
                  key: String(i),
                  name: r.name,
                  planned: r.planned,
                  cost: r.cost,
                }))}
            />
          </div>
        </div>

        <Section title="Rakip Kurum (Özet)">
          <SimpleTable
            columns={[
              { key: "level", label: "Kademe" },

              {
                key: "a",
                label: "A",
                thStyle: { width: 120, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },

              {
                key: "b",
                label: "B",
                thStyle: { width: 120, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },

              {
                key: "c",
                label: "C",
                thStyle: { width: 120, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },
            ]}
            rows={formattedCompetitorRows.map((r, i) => ({
              key: String(i),
              ...r,
            }))}
          />
        </Section>

        <Section title="Notlar">
          <div className="small" style={{ lineHeight: 1.45 }}>
            <b>E.</b> Değerlendirme ve <b>F.</b> Komisyon görüşleri alanları bir
            sonraki adımda role/izin bazlı bağlanacaktır.
          </div>

          <div
            style={{
              marginTop: 10,

              padding: 12,

              border: "1px dashed rgba(0,0,0,0.25)",

              borderRadius: 10,

              opacity: 0.85,
            }}
          >
            <div className="small">
              <i>Metin alanı (sonraki adımda veri bağlanacak)</i>
            </div>
          </div>
        </Section>
      </div>
    );
  }

  // ------------------ Detailed view (current skeleton) ------------------

  return (
    <div>
      <Section title="A. OKUL EĞİTİM BİLGİLERİ">
        <SimpleTable
          columns={[
            { key: "k", label: "Bilgi" },

            {
              key: "v",
              label: "Değer",
              thStyle: { width: 240, textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },
          ]}
          rows={educationInfoRows}
        />
      </Section>

      <Section title="B. OKUL ÜCRETLERİ TABLOSU (YENİ EĞİTİM DÖNEMİ)">
        <SimpleTable
          columns={[
            { key: "level", label: "Kademe" },

            {
              key: "edu",
              label: "Eğitim Ücreti",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "uniform",
              label: "Üniforma",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "books",
              label: "Kitap Kırtasiye",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "transport",
              label: "Ulaşım",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "meal",
              label: "Yemek (*)",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "raisePct",
              label: "Artış Oranı",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "total",
              label: "Total Ücret",
              thStyle: { textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },
          ]}
          rows={formattedTuitionRows

            .filter((r) => !/TOPLAM/i.test(String(r.level || "")))

            .map((r, i) => ({ key: String(i), ...r }))}
        />
      </Section>

      <Section title="C. OKUL ÜCRETİ HESAPLAMA PARAMETRELERİ">
        <table className="table" style={{ width: "100%" }}>
          <thead>
            <tr>
              {PARAM_HEADER_CELLS.map((c) => (
                <th key={c.key} colSpan={c.colSpan} style={c.thStyle}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paramTableRows.length ? (
              paramTableRows.map((row, rowIdx) => (
                <tr key={row.key || rowIdx}>
                  {row.cells.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      colSpan={cell.colSpan || 1}
                      style={
                        cell.align === "right"
                          ? NUM_CELL_STYLE
                          : cell.align === "center"
                            ? { textAlign: "center" }
                            : undefined
                      }
                    >
                      {cell.content ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="small">
                  Veri yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.1. Kapasite Kullanımı
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <div
                className="small"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                Öğrenci Kapasite Bilgileri
              </div>

              <SimpleTable
                columns={[
                  { key: "k", label: "Bilgi" },

                  {
                    key: "v",
                    label: "Değer",
                    thStyle: { width: 180, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },
                ]}
                rows={capacityStudentRows.map((r, i) => ({
                  key: String(i),
                  ...r,
                }))}
              />
            </div>

            <div>
              <div
                className="small"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                Sınıf Kapasite Bilgileri
              </div>

              <SimpleTable
                columns={[
                  { key: "k", label: "Bilgi" },

                  {
                    key: "v",
                    label: "Değer",
                    thStyle: { width: 180, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },
                ]}
                rows={capacityClassRows.map((r, i) => ({
                  key: String(i),
                  ...r,
                }))}
              />
            </div>
          </div>

          <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
            * Belirlenen sınıf öğrenci kapasitesi oranına göre %80 - %100
            aralığı (örnek: 24 kişilik sınıf kapasitesine göre 20-24 aralığı)
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.2. İnsan Kaynakları
          </div>

          <SimpleTable
            columns={[
              { key: "item", label: "Kalem" },

              {
                key: "current",
                label: "Mevcut",
                thStyle: { width: 120, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },

              {
                key: "planned",
                label: "Planlanan",
                thStyle: { width: 140, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },
            ]}
            rows={hrRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.3. Gelirler</div>

          {revenueTable ? (
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Gelir</th>

                  <th style={{ width: 180, textAlign: "right" }}>Tutar</th>

                  <th style={{ width: 120, textAlign: "right" }}>% Oranı</th>
                </tr>
              </thead>

              <tbody>
                {revenueTable.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>

                    <td style={NUM_CELL_STYLE}>{row.amount}</td>

                    <td style={NUM_CELL_STYLE}>{row.ratio}</td>
                  </tr>
                ))}

                <tr style={{ fontWeight: 800 }}>
                  <td>Toplam</td>

                  <td style={NUM_CELL_STYLE}>{revenueTable.total}</td>

                  <td style={NUM_CELL_STYLE}>{fmtPct(1, 2)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <SimpleTable
              columns={[
                { key: "name", label: "Gelir" },

                {
                  key: "amount",
                  label: "Tutar",
                  thStyle: { width: 180, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "ratio",
                  label: "% Oranı",
                  thStyle: { width: 120, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedRevRows.map((r, i) => ({ key: String(i), ...r }))}
            />
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.4. Giderler</div>

          {detailedExpenseRows ? (
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Giderler</th>

                  <th style={{ width: 180, textAlign: "right" }}>Tutar</th>

                  <th style={{ width: 120, textAlign: "right" }}>% Oranı</th>
                </tr>
              </thead>

              <tbody>
                {detailedExpenseRows.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>

                    <td style={NUM_CELL_STYLE}>{row.amount}</td>

                    <td
                      style={
                        row.highlight
                          ? { ...NUM_CELL_STYLE, background: "#ffd9d9" }
                          : NUM_CELL_STYLE
                      }
                    >
                      {row.ratio}
                    </td>
                  </tr>
                ))}

                <tr style={{ fontWeight: 800 }}>
                  <td>Toplam</td>

                  <td style={NUM_CELL_STYLE}>{detailedExpenseRows.total}</td>

                  <td style={NUM_CELL_STYLE}>{fmtPct(1, 2)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <SimpleTable
              columns={[
                { key: "name", label: "Gider" },

                {
                  key: "amount",
                  label: "Tutar",
                  thStyle: { width: 180, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },

                {
                  key: "ratio",
                  label: "% Oranı",
                  thStyle: { width: 120, textAlign: "right" },
                  tdStyle: NUM_CELL_STYLE,
                },
              ]}
              rows={formattedExpRows.map((r, i) => ({ key: String(i), ...r }))}
            />
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.5. Tahsil Edilemeyecek Gelirler
          </div>

          <div className="small" style={{ lineHeight: 1.4 }}>
            Önceki yıllarda tahsil edilemeyen giderlerin hesaplanması suretiyle
            öğrenci başı ortalama bir gider okul fiyatlarına eklenmelidir.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.6. Giderlerin Sapma Yüzdeliği
          </div>

          <div className="small" style={{ lineHeight: 1.4 }}>
            Hedeflenen öğrenci sayısına uygun olarak hesaplanan işletme, burs,
            erken kayıt ve kampanya giderlerinin toplamından sonra yanılma payı
            olarak belli bir yüzdelik belirlenerek çıkan ortalama öğrenci
            fiyatına eklenmelidir.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.7. Burs ve İndirim Oranları
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div>
              <div
                className="small"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                Burslar
              </div>

              <SimpleTable
                columns={[
                  { key: "name", label: "Burs" },

                  {
                    key: "cur",
                    label: "Mevcut",
                    thStyle: { width: 90, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },

                  {
                    key: "planned",
                    label: "Planlanan",
                    thStyle: { width: 110, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },

                  {
                    key: "cost",
                    label: "Maliyet",
                    thStyle: { width: 120, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },
                ]}
                rows={formattedScholarshipsRows.map((r, i) => ({
                  key: String(i),
                  ...r,
                }))}
              />

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  fontWeight: 700,
                }}
              >
                <div>Toplam Mevcut: {scholarshipTotals.cur}</div>

                <div>Toplam Planlanan: {scholarshipTotals.planned}</div>

                <div>Toplam Maliyet: {scholarshipTotals.cost}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <SimpleTable
                  columns={MINI_ANALYSIS_COLUMNS}
                  rows={scholarshipAnalysisRows}
                />
              </div>
            </div>

            <div>
              <div
                className="small"
                style={{ fontWeight: 700, marginBottom: 6 }}
              >
                İndirimler
              </div>

              <SimpleTable
                columns={[
                  { key: "name", label: "İndirim" },

                  {
                    key: "cur",
                    label: "Mevcut",
                    thStyle: { width: 90, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },

                  {
                    key: "planned",
                    label: "Planlanan",
                    thStyle: { width: 110, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },

                  {
                    key: "cost",
                    label: "Maliyet",
                    thStyle: { width: 120, textAlign: "right" },
                    tdStyle: NUM_CELL_STYLE,
                  },
                ]}
                rows={formattedDiscountsRows.map((r, i) => ({
                  key: String(i),
                  ...r,
                }))}
              />

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  fontWeight: 700,
                }}
              >
                <div>Toplam Mevcut: {discountTotals.cur}</div>

                <div>Toplam Planlanan: {discountTotals.planned}</div>

                <div>Toplam Maliyet: {discountTotals.cost}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <SimpleTable
                  columns={MINI_ANALYSIS_COLUMNS}
                  rows={discountAnalysisRows}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.8. Rakip Kurumların Analizi
          </div>

          <div className="small" style={{ lineHeight: 1.4, marginBottom: 8 }}>
            Eşdeğer kurumlarla yarışabilecek eğitim kalitesine ve ekonomik güce
            sahip olmak için okul ücretinin rakip kurumlar ile yarışabilecek
            yeterlilikte olması gereklidir.
          </div>

          <SimpleTable
            columns={[
              { key: "level", label: "Kademe" },

              {
                key: "a",
                label: "A Kurum Fiyatı",
                thStyle: { width: 140, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },

              {
                key: "b",
                label: "B Kurum Fiyatı",
                thStyle: { width: 140, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },

              {
                key: "c",
                label: "C Kurum Fiyatı",
                thStyle: { width: 140, textAlign: "right" },
                tdStyle: NUM_CELL_STYLE,
              },
            ]}
            rows={formattedCompetitorRows.map((r, i) => ({
              key: String(i),
              ...r,
            }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.9. Yerel Mevzuatta Uygunluk (yasal azami artış)
          </div>

          <div className="small" style={{ lineHeight: 1.4 }}>
            Belirlenecek ücretin ülke mevzuatına uygun olması, ülkede belirlenen
            azami ücret artışları, son üç yılın resmi enflasyon oranı gibi
            parametreler dikkate alınmalıdır. Ayrıca ev sahibi ülke ile yapılmış
            Protokol yükümlülükleri de mutlaka dikkate alınmalıdır.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            C.10. Mevcut Eğitim Sezonu Ücreti
          </div>

          <div className="small" style={{ lineHeight: 1.4 }}>
            Belirlenecek ücretin mevcut eğitim dönemi ile uyumlu olmasına azami
            önem gösterilmeli ve sürdürülebilir devamlılık ilkesi
            gözetilmelidir.
          </div>
        </div>
      </Section>

      <Section
        title="D. GERÇEKLEŞEN VE GERÇEKLEŞMESİ PLANLANAN / PERFORMANS"
        subtitle="Bu bölüm komisyon üyeleri tarafından doldurulacaktır (uygulamada ayrıca bağlanacak)."
      >
        <SimpleTable
          columns={[
            { key: "metric", label: "" },

            {
              key: "planned",
              label: "Planlanan",
              thStyle: { width: 180, textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "actual",
              label: "Gerçekleşen",
              thStyle: { width: 180, textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },

            {
              key: "variance",
              label: "Sapma %",
              thStyle: { width: 120, textAlign: "right" },
              tdStyle: NUM_CELL_STYLE,
            },
          ]}
          rows={perfRows.map((r, i) => ({ key: String(i), ...r }))}
        />
      </Section>

      <Section title="E. DEĞERLENDİRME">
        <div className="small" style={{ lineHeight: 1.4 }}>
          Okulun lokasyon, fiziki şartları, varsa karşılaşılan zorluklar,
          bölgenin demografik yapısı, sosyal ekonomik durumu, enflasyon ve
          belirtmek istediğiniz hususlar burada özetlenecektir.
        </div>

        <div
          style={{
            marginTop: 10,

            padding: 12,

            border: "1px dashed rgba(0,0,0,0.25)",

            borderRadius: 10,

            opacity: 0.85,
          }}
        >
          <div className="small">
            <i>Metin alanı (sonraki adımda veri bağlanacak)</i>
          </div>
        </div>
      </Section>

      <Section title="F. KOMİSYON GÖRÜŞ VE ÖNERİLERİ">
        <div
          style={{
            padding: 12,

            border: "1px dashed rgba(0,0,0,0.25)",

            borderRadius: 10,

            opacity: 0.85,
          }}
        >
          <div className="small">
            <i>Komisyon görüş metni (sonraki adımda veri bağlanacak)</i>
          </div>
        </div>
      </Section>
    </div >
  );
}
