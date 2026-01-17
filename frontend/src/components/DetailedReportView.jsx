// frontend/src/components/DetailedReportView.jsx

import React, { useMemo } from "react";
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

function formatTuitionRow(row, currencyCode) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    edu: isFiniteNumber(row.edu) ? fmtMoney(row.edu, currencyCode) : row.edu ?? "—",
    uniform: isFiniteNumber(row.uniform) ? fmtMoney(row.uniform, currencyCode) : row.uniform ?? "—",
    books: isFiniteNumber(row.books) ? fmtMoney(row.books, currencyCode) : row.books ?? "—",
    transport: isFiniteNumber(row.transport) ? fmtMoney(row.transport, currencyCode) : row.transport ?? "—",
    meal: isFiniteNumber(row.meal) ? fmtMoney(row.meal, currencyCode) : row.meal ?? "—",
    raisePct: isFiniteNumber(row.raisePct) ? fmtPct(row.raisePct, 0) : row.raisePct ?? "—",
    total: isFiniteNumber(row.total) ? fmtMoney(row.total, currencyCode) : row.total ?? "—",
  };
}

function formatAmountRatioRow(row, currencyCode) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    amount: isFiniteNumber(row.amount) ? fmtMoney(row.amount, currencyCode) : row.amount ?? "—",
    ratio: isFiniteNumber(row.ratio) ? fmtPct(row.ratio, 0) : row.ratio ?? "—",
  };
}

function formatScholarshipRow(row, currencyCode) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    cur: isFiniteNumber(row.cur) ? fmtInt(row.cur) : row.cur ?? "—",
    planned: isFiniteNumber(row.planned) ? fmtInt(row.planned) : row.planned ?? "—",
    cost: isFiniteNumber(row.cost) ? fmtMoney(row.cost, currencyCode) : row.cost ?? "—",
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
      if (label.includes("int") || label.includes("international")) return `${def.key}Int`;
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
      <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.15 }}>{value}</div>
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
    programType: programTypeProp,
  } = props || {};

  const model = useMemo(
    () =>
      buildDetailedReportModel({
        school,
        scenario,
        inputs,
        report,
        prevReport,
        programType: programTypeProp,
      }),
    [school, scenario, inputs, report, prevReport, programTypeProp]
  );


  const activeProgramType = useMemo(
    () => programTypeProp || getProgramType(inputs, scenario),
    [programTypeProp, inputs, scenario]
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

// ------------------ Detailed (Excel-like) model rows ------------------
  const educationInfoRows = useMemo(
    () =>
      [
        { k: "Eğitim Öğretim Döneminin Başlama Tarihi", v: model.periodStartDate || "—" },
        {
          k: "Okul Kapasitesi",
          v: isFiniteNumber(model.schoolCapacity) ? fmtNumber(model.schoolCapacity) : "—",
        },
        {
          k: "Mevcut Öğrenci Sayısı",
          v: isFiniteNumber(model.currentStudents) ? fmtNumber(model.currentStudents) : "—",
        },
        { k: "Zorunlu Eğitim Dönemleri", v: model.compulsoryEducation || "—" },
        { k: "Bir Ders Süresi", v: model.lessonDuration || "—" },
        { k: "Günlük Ders Saati", v: model.dailyLessonHours || "—" },
        {
          k: "Haftalık Ders Saati Toplamı (Bir Sınıfın)",
          v: model.weeklyLessonHours || "—",
        },
        { k: "Okulda Sabahçı / Öğlenci Uygulaması", v: model.shiftSystem || "—" },
        {
          k: "Öğretmen Haftalık Ders Saati Ortalaması",
          v: model.teacherWeeklyHoursAvg || "—",
        },
        {
          k: "Fiili Derslik Kullanım Yüzdeliği (öğrenci sayısı/sınıf sayısı)",
          v: isFiniteNumber(model.classroomUtilization)
            ? fmtNumber(model.classroomUtilization, { maximumFractionDigits: 2 })
            : "—",
        },
        {
          k: "Kademeler Arasında Geçiş Sınavı (Varsa) Bilgileri",
          v: model.transitionExamInfo || "—",
        },
        { k: "Okulda Uygulanan Program (ulusal, uluslararası)", v: model.programType || "—" },
      ].map((x, i) => ({ key: String(i), ...x })),
    [model]
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
    () => tuitionRows.filter((row) => isTuitionRowVisible(row, activeProgramType)),
    [tuitionRows, activeProgramType]
  );
  const formattedTuitionRows = useMemo(
    () => filteredTuitionRows.map((row) => formatTuitionRow(row, currencyCode)),
    [filteredTuitionRows, currencyCode]
  );

  const paramsRows = useMemo(() => {
    const base = model.parameters || [];
    if (Array.isArray(base) && base.length) return base;
    return [
      { no: "1", desc: "Planlanan Dönem Kapasite Kullanım Oranı (%)", value: "—" },
      { no: "2", desc: "İnsan Kaynakları Planlaması (Türk + Yerel + International)", value: "—" },
      { no: "3", desc: "Gelir Planlaması", value: "—" },
      { no: "4", desc: "Gider Planlaması", value: "—" },
      { no: "", desc: "Gelir - Gider Farkı", value: "—" },
    ];
  }, [model.parameters]);

  const formatParamValue = (param) => {
    if (!param) return "—";
    const { value, valueType } = param;
    if (typeof value === "string" && !valueType) return value;
    if (value == null) return "—";
    switch (valueType) {
      case "percent":
        return fmtPct(value);
      case "currency":
        return fmtMoney(value, currencyCode);
      case "number":
        return fmtNumber(value);
      default:
        return typeof value === "string" ? value : isFiniteNumber(value) ? fmtNumber(value) : "—";
    }
  };

  const capacityStudentRows = useMemo(() => {
    const v = model.capacity || {};
    return [
      {
        k: "Bina Öğrenci Kapasitesi",
        v: isFiniteNumber(v.buildingCapacity) ? fmtNumber(v.buildingCapacity) : "—",
      },
      {
        k: "Mevcut Öğrenci Sayısı",
        v: isFiniteNumber(v.currentStudents) ? fmtNumber(v.currentStudents) : "—",
      },
      {
        k: "Planlanan Öğrenci Sayısı",
        v: isFiniteNumber(v.plannedStudents) ? fmtNumber(v.plannedStudents) : "—",
      },
      {
        k: "Planlanan Kapasite Kullanımı %",
        v: isFiniteNumber(v.plannedUtilization) ? fmtPct(v.plannedUtilization, 2) : "—",
      },
    ];
  }, [model]);

  const capacityClassRows = useMemo(() => {
    const v = model.capacity || {};
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
        v: isFiniteNumber(v.plannedBranches) ? fmtNumber(v.plannedBranches) : "—",
      },
      {
        k: "Sınıf Başına Düşen Ort. Öğrenci Sayısı",
        v: isFiniteNumber(v.avgStudentsPerClass)
          ? fmtNumber(v.avgStudentsPerClass, { maximumFractionDigits: 2 })
          : "—",
      },
    ];
  }, [model]);

  const hrRows = useMemo(() => {
    const base = model.hr || [];
    if (Array.isArray(base) && base.length) return base;
    return [
      { item: "Türk Personel Yönetici ve Eğitimci Sayısı", current: "—", planned: "—" },
      { item: "Türk Personel Temsilcilik Personeli Sayısı", current: "—", planned: "—" },
      { item: "Yerel Kadrolu Eğitimci Personel Sayısı", current: "—", planned: "—" },
      { item: "Yerel Ücretli (Vakater) Eğitimci Personel Sayısı", current: "—", planned: "—" },
      { item: "Yerel Destek Personel Sayısı", current: "—", planned: "—" },
      { item: "Yerel Personel Temsilcilik Personeli Sayısı", current: "—", planned: "—" },
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
    () => revRows.map((row) => formatAmountRatioRow(row, currencyCode)),
    [revRows, currencyCode]
  );
  const formattedExpRows = useMemo(
    () => expRows.map((row) => formatAmountRatioRow(row, currencyCode)),
    [expRows, currencyCode]
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
      { name: "Yerel Mevzuatın Şart Koştuğu İndirim", cur: "—", planned: "—", cost: "—" },
      { name: "Toplam", cur: "—", planned: "—", cost: "—" },
    ];
  }, [model]);

  const formattedScholarshipsRows = useMemo(
    () => scholarshipsRows.map((row) => formatScholarshipRow(row, currencyCode)),
    [scholarshipsRows, currencyCode]
  );
  const formattedDiscountsRows = useMemo(
    () => discountsRows.map((row) => formatScholarshipRow(row, currencyCode)),
    [discountsRows, currencyCode]
  );

  const perfRows = useMemo(() => {
    const base = model.performance || [];
    if (Array.isArray(base) && base.length) return base;
    return [
      { metric: "Öğrenci Sayısı", planned: "—", actual: "—", variance: "—" },
      { metric: "Gelirler", planned: "—", actual: "—", variance: "—" },
      { metric: "Giderler", planned: "—", actual: "—", variance: "—" },
      { metric: "Kar Zarar Oranı", planned: "—", actual: "—", variance: "—" },
      { metric: "Burs ve İndirimler", planned: "—", actual: "—", variance: "—" },
    ];
  }, [model]);

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

  // ------------------ One pager helpers (still skeleton) ------------------
  const onePagerKpis = useMemo(() => {
    // Şimdilik model üzerinden. Sonraki adımda inputs/report ile dolduracağız.
    const students = model.currentStudents ?? model.capacity?.currentStudents;
    const cap = model.schoolCapacity ?? model.capacity?.buildingCapacity;
    const util = model.capacity?.plannedUtilization;

    // Gelir/Gider toplamları (ileride report'tan gelecek)
    const revTotal = model.revenueTotal;
    const expTotal = model.expenseTotal;
    const net = isFiniteNumber(revTotal) && isFiniteNumber(expTotal) ? Number(revTotal) - Number(expTotal) : null;
    const margin = isFiniteNumber(revTotal) && isFiniteNumber(net) && Number(revTotal) !== 0 ? Number(net) / Number(revTotal) : null;

    // Ortalama ücret (ileride tuition table ile)
    const avgTuition = model.avgTuition;

    return [
      { label: "Mevcut Öğrenci", value: isFiniteNumber(students) ? fmtNumber(students) : "—" },
      { label: "Kapasite", value: isFiniteNumber(cap) ? fmtNumber(cap) : "—" },
      { label: "Kapasite Kullanım %", value: isFiniteNumber(util) ? fmtPct(util) : "—" },
      { label: "Ortalama Ücret", value: isFiniteNumber(avgTuition) ? fmtMoney(avgTuition, currencyCode) : "—" },
      { label: "Toplam Gelir", value: isFiniteNumber(revTotal) ? fmtMoney(revTotal, currencyCode) : "—" },
      { label: "Toplam Gider", value: isFiniteNumber(expTotal) ? fmtMoney(expTotal, currencyCode) : "—" },
      { label: "Net", value: isFiniteNumber(net) ? fmtMoney(net, currencyCode) : "—" },
      { label: "Marj", value: isFiniteNumber(margin) ? fmtPct(margin) : "—" },
    ];
  }, [model, currencyCode]);

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
              <div style={{ fontWeight: 900, fontSize: 18 }}>Detaylı Rapor · Tek Sayfa Özet</div>
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
              <Kpi key={k.label} label={k.label} value={k.value} hint={k.hint} />
            ))}
          </div>

          <div className="small" style={{ marginTop: 12, opacity: 0.85, lineHeight: 1.35 }}>
            Bu görünüm, yönetici/komisyon için hızlı kontrol amaçlı “tek sayfa” özetidir. Detaylı Excel RAPOR düzeni için
            “Detaylı” görünümü seçebilirsiniz.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ücret Özeti</div>
            <SimpleTable
              columns={[
                { key: "level", label: "Kademe" },
                { key: "edu", label: "Eğitim" , thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                { key: "total", label: "Toplam" , thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
                rows={formattedTuitionRows
                  .filter((r) => !/TOPLAM|ORTALAMA/i.test(String(r.level || "")))
                  .slice(0, 7)
                  .map((r, i) => ({ key: String(i), level: r.level, edu: r.edu, total: r.total }))}
              />
            <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
              Not: Paket ücretler ve artış oranları bir sonraki adımda otomatik bağlanacak.
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>İK Özeti</div>
            <SimpleTable
              columns={[
                { key: "item", label: "Kalem" },
                { key: "planned", label: "Plan", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
              rows={hrRows.slice(0, 7).map((r, i) => ({ key: String(i), item: r.item, planned: r.planned }))}
            />
            <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
              Not: Mevcut/plan karşılaştırması detaylı görünümde.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Gelir Dağılımı</div>
            <SimpleTable
              columns={[
                { key: "name", label: "Gelir" },
                { key: "amount", label: "Tutar", thStyle: { width: 160, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                { key: "ratio", label: "%", thStyle: { width: 70, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
              rows={formattedRevRows.slice(0, 7).map((r, i) => ({ key: String(i), ...r }))}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Gider Dağılımı</div>
            <SimpleTable
              columns={[
                { key: "name", label: "Gider" },
                { key: "amount", label: "Tutar", thStyle: { width: 160, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                { key: "ratio", label: "%", thStyle: { width: 70, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
              rows={formattedExpRows.slice(0, 7).map((r, i) => ({ key: String(i), ...r }))}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Burslar</div>
            <SimpleTable
              columns={[
                { key: "name", label: "Burs" },
                { key: "planned", label: "Plan", thStyle: { width: 90, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                { key: "cost", label: "Maliyet", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
              rows={formattedScholarshipsRows.slice(0, 8).map((r, i) => ({ key: String(i), name: r.name, planned: r.planned, cost: r.cost }))}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>İndirimler</div>
            <SimpleTable
              columns={[
                { key: "name", label: "İndirim" },
                { key: "planned", label: "Plan", thStyle: { width: 90, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                { key: "cost", label: "Maliyet", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              ]}
              rows={formattedDiscountsRows.slice(0, 8).map((r, i) => ({ key: String(i), name: r.name, planned: r.planned, cost: r.cost }))}
            />
          </div>
        </div>

        <Section title="Rakip Kurum (Özet)">
          <SimpleTable
            columns={[
              { key: "level", label: "Kademe" },
              { key: "a", label: "A", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "b", label: "B", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "c", label: "C", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            ]}
            rows={competitorRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </Section>

        <Section title="Notlar">
          <div className="small" style={{ lineHeight: 1.45 }}>
            <b>E.</b> Değerlendirme ve <b>F.</b> Komisyon görüşleri alanları bir sonraki adımda role/izin bazlı bağlanacaktır.
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
            <div style={{ fontWeight: 900, fontSize: 18 }}>Detaylı Rapor</div>
            <div className="small" style={{ marginTop: 2 }}>
              {header || ""}
            </div>
          </div>
          <div className="small" style={{ textAlign: "right", opacity: 0.8 }}>
            <div>
              Excel: <b>RAPOR</b> sayfası
            </div>
            <div>Şimdilik iskelet (UI), veri bağlama sonraki adım.</div>
          </div>
        </div>

        <div className="small" style={{ marginTop: 10, lineHeight: 1.35 }}>
          Not: Bu sayfa rapor sayfası olarak tasarlanmıştır, veri girişine kapalıdır. Temel Bilgiler, Kapasite, İnsan
          Kaynakları, Gelir-Gider ve Norm Kadro sayfalarında doldurmanız gereken bölümleri lütfen doldurunuz.
        </div>
      </div>

      <Section title="A. OKUL EĞİTİM BİLGİLERİ">
        <SimpleTable
          columns={[
            { key: "k", label: "Bilgi" },
            { key: "v", label: "Değer", thStyle: { width: 240, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
          ]}
          rows={educationInfoRows}
        />
      </Section>

      <Section title="B. OKUL ÜCRETLERİ TABLOSU (YENİ EĞİTİM DÖNEMİ)">
        <SimpleTable
          columns={[
            { key: "level", label: "Kademe" },
            { key: "edu", label: "Eğitim Ücreti", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "uniform", label: "Üniforma", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "books", label: "Kitap Kırtasiye", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "transport", label: "Ulaşım", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "meal", label: "Yemek (*)", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "raisePct", label: "Artış Oranı", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "total", label: "Total Ücret", thStyle: { textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
          ]}
          rows={formattedTuitionRows
            .filter((r) => !/TOPLAM/i.test(String(r.level || "")))
            .map((r, i) => ({ key: String(i), ...r }))}
        />
        <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
          (*) Yemek ve diğer paket kalemleri okula göre değişebilir. Detaylar ileride veri bağlanınca otomatik gelecektir.
        </div>
      </Section>

      <Section title="C. OKUL ÜCRETİ HESAPLAMA PARAMETRELERİ">
        <SimpleTable
          columns={[
            { key: "no", label: "#", thStyle: { width: 40 } },
            { key: "desc", label: "Parametre" },
            { key: "value", label: "Veri", thStyle: { width: 220, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
          ]}
          rows={paramsRows.map((r, i) => ({
            key: String(i),
            no: r.no,
            desc: r.desc,
            value: formatParamValue(r),
          }))}
        />

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.1. Kapasite Kullanımı</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                Öğrenci Kapasite Bilgileri
              </div>
              <SimpleTable
                columns={[
                  { key: "k", label: "Bilgi" },
                  { key: "v", label: "Değer", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                ]}
                rows={capacityStudentRows.map((r, i) => ({ key: String(i), ...r }))}
              />
            </div>

            <div>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                Sınıf Kapasite Bilgileri
              </div>
              <SimpleTable
                columns={[
                  { key: "k", label: "Bilgi" },
                  { key: "v", label: "Değer", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                ]}
                rows={capacityClassRows.map((r, i) => ({ key: String(i), ...r }))}
              />
            </div>
          </div>

          <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
            * Belirlenen sınıf öğrenci kapasitesi oranına göre %80 - %100 aralığı (örnek: 24 kişilik sınıf kapasitesine
            göre 20-24 aralığı)
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.2. İnsan Kaynakları</div>
          <SimpleTable
            columns={[
              { key: "item", label: "Kalem" },
              { key: "current", label: "Mevcut", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "planned", label: "Planlanan", thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            ]}
            rows={hrRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.3. Gelirler</div>
          <SimpleTable
            columns={[
              { key: "name", label: "Gelir" },
              { key: "amount", label: "Tutar", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "ratio", label: "% Oranı", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            ]}
            rows={formattedRevRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.4. Giderler</div>
          <SimpleTable
            columns={[
              { key: "name", label: "Gider" },
              { key: "amount", label: "Tutar", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "ratio", label: "% Oranı", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            ]}
            rows={formattedExpRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.5. Tahsil Edilemeyecek Gelirler</div>
          <div className="small" style={{ lineHeight: 1.4 }}>
            Önceki yıllarda tahsil edilemeyen giderlerin hesaplanması suretiyle öğrenci başı ortalama bir gider okul
            fiyatlarına eklenmelidir.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.6. Giderlerin Sapma Yüzdeliği</div>
          <div className="small" style={{ lineHeight: 1.4 }}>
            Hedeflenen öğrenci sayısına uygun olarak hesaplanan işletme, burs, erken kayıt ve kampanya giderlerinin
            toplamından sonra yanılma payı olarak belli bir yüzdelik belirlenerek çıkan ortalama öğrenci fiyatına
            eklenmelidir.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.7. Burs ve İndirim Oranları</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                Burslar
              </div>
              <SimpleTable
                columns={[
                  { key: "name", label: "Burs" },
                  { key: "cur", label: "Mevcut", thStyle: { width: 90, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                  { key: "planned", label: "Planlanan", thStyle: { width: 110, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                  { key: "cost", label: "Maliyet", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                ]}
                rows={formattedScholarshipsRows.map((r, i) => ({ key: String(i), ...r }))}
              />
            </div>

            <div>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                İndirimler
              </div>
              <SimpleTable
                columns={[
                  { key: "name", label: "İndirim" },
                  { key: "cur", label: "Mevcut", thStyle: { width: 90, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                  { key: "planned", label: "Planlanan", thStyle: { width: 110, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                  { key: "cost", label: "Maliyet", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
                ]}
                rows={formattedDiscountsRows.map((r, i) => ({ key: String(i), ...r }))}
              />
            </div>
          </div>

          <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
            Alt metrikler (hedeflenen öğrenciye bölümü, ağırlıklı ortalama vb.) bir sonraki adımda hesaplanıp burada
            gösterilecek.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.8. Rakip Kurumların Analizi</div>
          <div className="small" style={{ lineHeight: 1.4, marginBottom: 8 }}>
            Eşdeğer kurumlarla yarışabilecek eğitim kalitesine ve ekonomik güce sahip olmak için okul ücretinin rakip
            kurumlar ile yarışabilecek yeterlilikte olması gereklidir.
          </div>
          <SimpleTable
            columns={[
              { key: "level", label: "Kademe" },
              { key: "a", label: "A Kurum Fiyatı", thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "b", label: "B Kurum Fiyatı", thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
              { key: "c", label: "C Kurum Fiyatı", thStyle: { width: 140, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            ]}
            rows={competitorRows.map((r, i) => ({ key: String(i), ...r }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.9. Yerel Mevzuatta Uygunluk (yasal azami artış)</div>
          <div className="small" style={{ lineHeight: 1.4 }}>
            Belirlenecek ücretin ülke mevzuatına uygun olması, ülkede belirlenen azami ücret artışları, son üç yılın
            resmi enflasyon oranı gibi parametreler dikkate alınmalıdır. Ayrıca ev sahibi ülke ile yapılmış Protokol
            yükümlülükleri de mutlaka dikkate alınmalıdır.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>C.10. Mevcut Eğitim Sezonu Ücreti</div>
          <div className="small" style={{ lineHeight: 1.4 }}>
            Belirlenecek ücretin mevcut eğitim dönemi ile uyumlu olmasına azami önem gösterilmeli ve sürdürülebilir
            devamlılık ilkesi gözetilmelidir.
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
            { key: "planned", label: "Planlanan", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "actual", label: "Gerçekleşen", thStyle: { width: 180, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
            { key: "variance", label: "Sapma %", thStyle: { width: 120, textAlign: "right" }, tdStyle: NUM_CELL_STYLE },
          ]}
          rows={perfRows.map((r, i) => ({ key: String(i), ...r }))}
        />
      </Section>

      <Section title="E. DEĞERLENDİRME">
        <div className="small" style={{ lineHeight: 1.4 }}>
          Okulun lokasyon, fiziki şartları, varsa karşılaşılan zorluklar, bölgenin demografik yapısı, sosyal ekonomik
          durumu, enflasyon ve belirtmek istediğiniz hususlar burada özetlenecektir.
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
    </div>
  );
}
