//frontend/src/components/TemelBilgilerEditor.jsx

import React, { useMemo } from "react";
import NumberInput  from "./NumberInput";
import {
  formatKademeLabel,
  getKademeDefinitions,
  getGradeOptions,
  normalizeKademeConfig,
} from "../utils/kademe";

const KADeme_ROWS = [
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
  { key: "uluslararasiYukumlulukIndirimi", label: "Vakfın Uluslararası Yükümlülüklerinden Kaynaklı İndirim" },
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
    {
      key: ["inflation", "y1"],
      label: `1. YIL TAHMİNİ ENFLASYON ORANI (${y1} YILI)`,
      type: "percent",
    },
    {
      key: ["inflation", "y2"],
      label: `2. YIL TAHMİNİ ENFLASYON ORANI (${y2} YILI)`,
      type: "percent",
    },
    {
      key: ["inflation", "y3"],
      label: `3. YIL TAHMİNİ ENFLASYON ORANI (${y3} YILI)`,
      type: "percent",
    },
    {
      key: ["inflation", "currentSeasonAvgFee"],
      label: "Mevcut Eğitim Sezonu Ücreti (ortalama)",
      type: "money",
    },
  ];
}

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// UI formatters (avoid eslint no-undef)
const fmt0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";
};

const fmt2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    : "0";
};

function get(obj, path, fallback) {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[k];
  }
  return cur == null ? fallback : cur;
}

function setDeep(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

function percentToFrac(p) {
  return safeNum(p) / 100;
}
function fracToPercent(f) {
  return safeNum(f) * 100;
}

export default function TemelBilgilerEditor({
  value,
  onChange,
  school,
  me,
  baseYear,
  kapasite,
  gradesCurrent,
  ik,
  prevReport,
  dirtyPaths,
  onDirty,
}) {
  const tb = useMemo(() => (value && typeof value === "object" ? value : {}), [value]);
  const kademeDefs = useMemo(() => getKademeDefinitions(), []);
  const gradeOptions = useMemo(() => getGradeOptions(), []);
  const kademeConfig = useMemo(() => normalizeKademeConfig(tb.kademeler), [tb]);
  const feeParamRows = useMemo(() => buildFeeParamRows(baseYear), [baseYear]);

  const makePath = (path) => `inputs.temelBilgiler.${Array.isArray(path) ? path.join(".") : path}`;
  const isDirty = (path) => (dirtyPaths ? dirtyPaths.has(makePath(path)) : false);
  const inputClass = (base, path) => base + (isDirty(path) ? " input-dirty" : "");
  const dirtyOnly = (path) => (isDirty(path) ? "input-dirty" : "");

  const update = (path, v) => {
    const next = structuredClone(tb);
    setDeep(next, path, v);
    onChange(next);
    onDirty?.(makePath(path), v);
  };

  const updateKademe = (key, patch) => {
    const nextConfig = normalizeKademeConfig(tb.kademeler);
    const next = structuredClone(tb);
    next.kademeler = {
      ...nextConfig,
      [key]: { ...nextConfig[key], ...patch },
    };
    onChange(next);
    Object.keys(patch || {}).forEach((field) => {
      onDirty?.(makePath(["kademeler", key, field]), next.kademeler[key][field]);
    });
  };

  const region = me?.region || "";
  const countryName = school?.country_name || me?.country_name || "";
  const campusName = school?.name || "";

  const currentStudents = useMemo(() => {
    const cs = safeNum(kapasite?.currentStudents);
    if (cs > 0) return cs;

    // fallback: derive from gradesCurrent if entered
    const list = Array.isArray(gradesCurrent) ? gradesCurrent : [];
    // gradesCurrent studentsPerBranch is TOTAL students per grade
    return list.reduce((s, r) => s + safeNum(r.studentsPerBranch), 0);
  }, [kapasite, gradesCurrent]);

  const totalBranchesCurrent = useMemo(() => {
    const list = Array.isArray(gradesCurrent) ? gradesCurrent : [];
    return list.reduce((s, r) => s + safeNum(r.branchCount), 0);
  }, [gradesCurrent]);

  const studentsPerClass = totalBranchesCurrent > 0 ? currentStudents / totalBranchesCurrent : 0;

  const plannedHeadcounts = useMemo(() => {
    const hc = ik?.years?.y1?.headcountsByLevel || {};
    const levels = Object.keys(hc);
    const sumRole = (role) =>
      levels.reduce((s, lvl) => s + safeNum(hc?.[lvl]?.[role]), 0);

    return {
      turkPersonelYoneticiEgitimci: sumRole("turk_mudur") + sumRole("turk_mdyard") + sumRole("turk_egitimci"),
      turkPersonelTemsilcilik: sumRole("turk_temsil"),
      yerelKadroluEgitimci: sumRole("yerel_yonetici_egitimci"),
      // optional role (if you add it later to IK UI)
      yerelUcretliVakaterEgitimci: sumRole("yerel_ucretli_egitimci"),
      yerelDestek: sumRole("yerel_destek"),
      yerelTemsilcilik: sumRole("yerel_ulke_temsil_destek"),
      international: sumRole("int_yonetici_egitimci"),
    };
  }, [ik]);

  const kademeLabels = useMemo(
    () => ({
      okulOncesi: formatKademeLabel("Okul Öncesi", kademeConfig, "okulOncesi"),
      ilkokul: formatKademeLabel("İlkokul", kademeConfig, "ilkokul"),
      ortaokul: formatKademeLabel("Ortaokul", kademeConfig, "ortaokul"),
      lise: formatKademeLabel("Lise", kademeConfig, "lise"),
      ilkokulYerel: `${formatKademeLabel("İlkokul", kademeConfig, "ilkokul")}-YEREL`,
      ilkokulInt: `${formatKademeLabel("İlkokul", kademeConfig, "ilkokul")}-INT.`,
      ortaokulYerel: `${formatKademeLabel("Ortaokul", kademeConfig, "ortaokul")}-YEREL`,
      ortaokulInt: `${formatKademeLabel("Ortaokul", kademeConfig, "ortaokul")}-INT.`,
      liseYerel: `${formatKademeLabel("Lise", kademeConfig, "lise")}-YEREL`,
      liseInt: `${formatKademeLabel("Lise", kademeConfig, "lise")}-INT.`,
    }),
    [kademeConfig]
  );
  const kademeBaseByRow = useMemo(
    () => ({
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
    }),
    []
  );
  const visibleUcretRows = useMemo(
    () =>
      KADeme_ROWS.filter((r) => {
        const baseKey = kademeBaseByRow[r.key] || r.key;
        return kademeConfig?.[baseKey]?.enabled !== false;
      }),
    [kademeBaseByRow, kademeConfig]
  );
  const visibleCompetitorRows = useMemo(
    () => COMPETITOR_ROWS.filter((r) => kademeConfig?.[r.key]?.enabled !== false),
    [kademeConfig]
  );
  const avgIncreasePercent = useMemo(() => {
    const rates = visibleUcretRows.map((r) => safeNum(get(tb, ["ucretArtisOranlari", r.key], 0)));
    const sum = rates.reduce((s, v) => s + v, 0);
    return rates.length ? fracToPercent(sum / rates.length) : 0;
  }, [tb, visibleUcretRows]);

  const plannedPerf = useMemo(() => {
    // prevReport may be the whole report with years.y1
    const y1 = prevReport?.years?.y1 || prevReport?.y1 || null;
    if (!y1) return null;

    const pm = safeNum(y1?.kpis?.profitMargin) * 100; // ratio -> %
    return {
      ogrenci: safeNum(y1?.students?.totalStudents),
      gelirler: safeNum(y1?.income?.netIncome),
      giderler: safeNum(y1?.expenses?.totalExpenses),
      karZararOrani: pm,
      bursIndirim: safeNum(y1?.income?.totalDiscounts),
    };
  }, [prevReport]);

  const scholarshipGroups = useMemo(() => {
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
  }, []);

  return (
    <div className="temel-bilgiler">
      {/* Top bar */}
      <div className="card tb-topbar">
        <div className="tb-head">
          <div>
            <div className="tb-title">TEMEL BİLGİLER</div>
          </div>
          <div className="tb-badges">
            <span className="badge">Öğrenci: {fmt0(currentStudents)}</span>
            <span className="badge">Şube: {fmt0(totalBranchesCurrent)}</span>
            <span className="badge">Öğr./Sınıf: {fmt2(studentsPerClass)}</span>
          </div>
        </div>
      </div>

      <div className="tb-card-grid">
        {/* A) Bölge / Ülke / Kampüs */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">A) Bölge / Ülke / Kampüs</div>
          </div>
          <div className="tb-grid">
            <div className="tb-field tb-col-4">
              <label>BÖLGE</label>
              <input className="input tb-input" value={region} disabled />
            </div>
            <div className="tb-field tb-col-4">
              <label>ÜLKE</label>
              <input className="input tb-input" value={countryName} disabled />
            </div>
            <div className="tb-field tb-col-4">
              <label>KAMPÜS / OKUL</label>
              <input className="input tb-input" value={campusName} disabled />
            </div>

            <div className="tb-field tb-col-4">
              <label>MÜDÜR</label>
              <input
                className={inputClass("input tb-input", ["yetkililer", "mudur"])}
                value={get(tb, ["yetkililer", "mudur"], "")}
                onChange={(e) => update(["yetkililer", "mudur"], e.target.value)}
              />
            </div>
            <div className="tb-field tb-col-4">
              <label>ÜLKE TEMSİLCİSİ</label>
              <input
                className={inputClass("input tb-input", ["yetkililer", "ulkeTemsilcisi"])}
                value={get(tb, ["yetkililer", "ulkeTemsilcisi"], "")}
                onChange={(e) => update(["yetkililer", "ulkeTemsilcisi"], e.target.value)}
              />
            </div>
            <div className="tb-field tb-col-4">
              <label>RAPORU HAZIRLAYAN</label>
              <input
                className={inputClass("input tb-input", ["yetkililer", "raporuHazirlayan"])}
                value={get(tb, ["yetkililer", "raporuHazirlayan"], "")}
                onChange={(e) => update(["yetkililer", "raporuHazirlayan"], e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* B) Okul eğitim bilgileri */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">B) Okul Eğitim Bilgileri</div>
          </div>

          <div className="tb-grid">
            <div className="tb-field tb-col-4">
              <label>Eğitim Öğretim Döneminin Başlama Tarihi</label>
              <input
                type="date"
                className={inputClass("input tb-input", ["okulEgitimBilgileri", "egitimBaslamaTarihi"])}
                value={get(tb, ["okulEgitimBilgileri", "egitimBaslamaTarihi"], "")}
                onChange={(e) => update(["okulEgitimBilgileri", "egitimBaslamaTarihi"], e.target.value)}
              />
            </div>
            <div className="tb-field tb-col-8">
              <label>Zorunlu Eğitim Dönemleri</label>
              <input
                className={inputClass("input tb-input", ["okulEgitimBilgileri", "zorunluEgitimDonemleri"])}
                value={get(tb, ["okulEgitimBilgileri", "zorunluEgitimDonemleri"], "")}
                onChange={(e) => update(["okulEgitimBilgileri", "zorunluEgitimDonemleri"], e.target.value)}
              />
            </div>

            <div className="tb-field tb-col-3 tb-mini">
              <label>Bir Ders Süresi (dk)</label>
              <NumberInput
               
                className={inputClass("input tb-input tb-num", ["okulEgitimBilgileri", "birDersSuresiDakika"])}
                value={safeNum(get(tb, ["okulEgitimBilgileri", "birDersSuresiDakika"], 0))}
                onChange={(value) =>
                  update(["okulEgitimBilgileri", "birDersSuresiDakika"], safeNum(value))
                }
              />
            </div>
            <div className="tb-field tb-col-3 tb-mini">
              <label>Günlük Ders Saati</label>
              <NumberInput
               
                className={inputClass("input tb-input tb-num", ["okulEgitimBilgileri", "gunlukDersSaati"])}
                value={safeNum(get(tb, ["okulEgitimBilgileri", "gunlukDersSaati"], 0))}
                onChange={(value) => update(["okulEgitimBilgileri", "gunlukDersSaati"], safeNum(value))}
              />
            </div>
            <div className="tb-field tb-col-3 tb-mini">
              <label>Haftalık Ders (Bir Sınıf)</label>
              <NumberInput
               
                className={inputClass("input tb-input tb-num", ["okulEgitimBilgileri", "haftalikDersSaatiToplam"])}
                value={safeNum(get(tb, ["okulEgitimBilgileri", "haftalikDersSaatiToplam"], 0))}
                onChange={(value) =>
                  update(["okulEgitimBilgileri", "haftalikDersSaatiToplam"], safeNum(value))
                }
              />
            </div>
            <div className="tb-field tb-col-3 tb-mini">
              <label>Öğretmen Haftalık Ortalama</label>
              <NumberInput
               
                className={inputClass("input tb-input tb-num", ["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"])}
                value={safeNum(get(tb, ["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], 0))}
                onChange={(value) =>
                  update(["okulEgitimBilgileri", "ogretmenHaftalikDersOrt"], safeNum(value))
                }
              />
            </div>

            <div className="tb-field tb-col-6">
              <label>Okulda Sabahçı / Öğlenci Uygulaması</label>
              <input
                className={inputClass("input tb-input", ["okulEgitimBilgileri", "sabahciOglenci"])}
                value={get(tb, ["okulEgitimBilgileri", "sabahciOglenci"], "")}
                onChange={(e) => update(["okulEgitimBilgileri", "sabahciOglenci"], e.target.value)}
              />
            </div>
            <div className="tb-field tb-col-6">
              <label>Okulda Uygulanan Program (ulusal, uluslararası)</label>
              <input
                className={inputClass("input tb-input", ["okulEgitimBilgileri", "uygulananProgram"])}
                value={get(tb, ["okulEgitimBilgileri", "uygulananProgram"], "")}
                onChange={(e) => update(["okulEgitimBilgileri", "uygulananProgram"], e.target.value)}
              />
            </div>

            <div className="tb-col-12">
              <div className="tb-kpis">
                <div className="tb-kpi">
                  <div className="k">Öğrenci (Mevcut)</div>
                  <div className="v">{fmt0(currentStudents)}</div>
                </div>
                <div className="tb-kpi">
                  <div className="k">Şube (Mevcut)</div>
                  <div className="v">{fmt0(totalBranchesCurrent)}</div>
                </div>
                <div className="tb-kpi">
                  <div className="k">Fiili Derslik Kullanım (öğrenci/sınıf)</div>
                  <div className="v">{fmt2(studentsPerClass)}</div>
                </div>
              </div>
            </div>

            <div className="tb-field tb-col-12">
              <label>Kademeler Arasında Geçiş Sınavı (Varsa) Bilgileri</label>
              <input
                className={inputClass("input tb-input", ["okulEgitimBilgileri", "gecisSinaviBilgisi"])}
                value={get(tb, ["okulEgitimBilgileri", "gecisSinaviBilgisi"], "")}
                onChange={(e) => update(["okulEgitimBilgileri", "gecisSinaviBilgisi"], e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Kademeler (Düzenle) */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">Kademeler (Düzenle)</div>
            <div className="tb-muted">Kademe seçimleri ve sınıf aralıkları, diğer ekranlardaki kademe etiketlerini ve toplamlarını etkiler.</div>
          </div>
          <div className="tb-table-wrap">
            <table className="table tb-table">
              <thead>
                <tr>
                  <th>Kademe</th>
                  <th style={{ width: 90 }}>Aktif</th>
                  <th style={{ width: 120 }}>Başlangıç</th>
                  <th style={{ width: 120 }}>Bitiş</th>
                </tr>
              </thead>
              <tbody>
                {kademeDefs.map((def) => {
                  const row = kademeConfig[def.key];
                  return (
                    <tr key={def.key}>
                      <td style={{ fontWeight: 700 }}>{def.label}</td>
                      <td>
                        <input
                          type="checkbox"
                          className={dirtyOnly(["kademeler", def.key, "enabled"])}
                          checked={!!row?.enabled}
                          onChange={(e) => updateKademe(def.key, { enabled: e.target.checked })}
                        />
                      </td>
                      <td>
                        <select
                          className={inputClass("input xxs", ["kademeler", def.key, "from"])}
                          value={row?.from || ""}
                          onChange={(value) => updateKademe(def.key, { from: value })}
                          disabled={!row?.enabled}
                        >
                          {gradeOptions.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={inputClass("input xxs", ["kademeler", def.key, "to"])}
                          value={row?.to || ""}
                          onChange={(value) => updateKademe(def.key, { to: value })}
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
          </div>
        </section>

        {/* C) Okul ücretleri artış oranları */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">C) Okul Ücretleri (Yeni Eğitim Dönemi)</div>
            <div className="tb-section-actions">
              <label className="tb-switch">
                <input
                  type="checkbox"
                  className={dirtyOnly(["okulUcretleriHesaplama"])}
                  checked={!!tb.okulUcretleriHesaplama}
                  onChange={(e) => update(["okulUcretleriHesaplama"], e.target.checked)}
                />
                <span>Ücret hesaplamayı aktif et</span>
              </label>
              <span className="tb-muted">Ortalama artış: {avgIncreasePercent.toFixed(2)}%</span>
            </div>
          </div>

          <div className="tb-table-wrap">
            <table className="table tb-table">
              <thead>
                <tr>
                  <th>Kademe</th>
                  <th className="num" style={{ width: 150 }}>Artış Oranı (%)</th>
                </tr>
              </thead>
              <tbody>
                {visibleUcretRows.map((r) => {
                  const frac = safeNum(get(tb, ["ucretArtisOranlari", r.key], 0));
                  return (
                    <tr key={r.key}>
                      <td style={{ fontWeight: 700 }}>{kademeLabels[r.key] || r.label}</td>
                      <td className="num">
                        <NumberInput
                         
                          className={inputClass("input tb-input tb-num", ["ucretArtisOranlari", r.key])}
                          value={fracToPercent(frac)}
                          onChange={(value) =>
                            update(["ucretArtisOranlari", r.key], percentToFrac(value))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* D) Okul ucreti hesaplama parametreleri */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">D) Tahmini Enflasyon ve Parametreler</div>
          </div>
          <div className="tb-table-wrap">
            <table className="table tb-table">
              <thead>
                <tr>
                  <th>Parametre</th>
                  <th className="num" style={{ width: 190 }}>Değer</th>
                </tr>
              </thead>
              <tbody>
                {feeParamRows.map((row) => {
                  const rawValue = get(tb, row.key, 0);
                  const isPercent = row.type === "percent";
                  const displayValue = isPercent ? fracToPercent(rawValue) : safeNum(rawValue);

                  return (
                    <tr key={row.label}>
                      <td style={{ fontWeight: 700 }}>{row.label}</td>
                      <td className="num">
                        {isPercent ? (
                          <div className="tb-affix">
                            <NumberInput
                             
                              className={inputClass("input tb-input tb-num", row.key)}
                              value={displayValue}
                              onChange={(value) => update(row.key, percentToFrac(value))}
                            />
                            <span className="tb-affix-sfx">%</span>
                          </div>
                        ) : (
                          <div className="tb-affix">
                            <span className="tb-affix-pfx">$</span>
                            <NumberInput
                             
                              className={inputClass("input tb-input tb-num", row.key)}
                              value={displayValue.toFixed(0)}
                              onChange={(value) => update(row.key, safeNum(value))}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* E) IK (Mevcut vs Planlanan) */}
        <section className="card tb-card tb-span-6">
          <div className="tb-section-head">
            <div className="tb-section-title">E) İnsan Kaynakları</div>
            <div className="tb-muted">Planlanan (IK) değerleri IK sekmesi / Yıl-1 planından gelir.</div>
          </div>
          <div className="tb-table-wrap">
            <table className="table tb-table">
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th style={{ width: 140 }} className="num">Mevcut</th>
                  <th style={{ width: 140 }} className="num">Planlanan (IK)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700 }}>Türk Personel Yönetici ve Eğitimci Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "turkPersonelYoneticiEgitimci"])}
                      value={safeNum(get(tb, ["ikMevcut", "turkPersonelYoneticiEgitimci"], 0))}
                      onChange={(value) => update(["ikMevcut", "turkPersonelYoneticiEgitimci"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.turkPersonelYoneticiEgitimci} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Türk Personel Temsilcilik Personeli Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "turkPersonelTemsilcilik"])}
                      value={safeNum(get(tb, ["ikMevcut", "turkPersonelTemsilcilik"], 0))}
                      onChange={(value) => update(["ikMevcut", "turkPersonelTemsilcilik"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.turkPersonelTemsilcilik} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Yerel Kadrolu Eğitimci Personel Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "yerelKadroluEgitimci"])}
                      value={safeNum(get(tb, ["ikMevcut", "yerelKadroluEgitimci"], 0))}
                      onChange={(value) => update(["ikMevcut", "yerelKadroluEgitimci"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.yerelKadroluEgitimci} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Yerel Ücretli (Vakater) Eğitimci Personel Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "yerelUcretliVakaterEgitimci"])}
                      value={safeNum(get(tb, ["ikMevcut", "yerelUcretliVakaterEgitimci"], 0))}
                      onChange={(value) => update(["ikMevcut", "yerelUcretliVakaterEgitimci"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.yerelUcretliVakaterEgitimci} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Yerel Destek Personel Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "yerelDestek"])}
                      value={safeNum(get(tb, ["ikMevcut", "yerelDestek"], 0))}
                      onChange={(value) => update(["ikMevcut", "yerelDestek"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.yerelDestek} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>Yerel Personel Temsilcilik Personeli Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "yerelTemsilcilik"])}
                      value={safeNum(get(tb, ["ikMevcut", "yerelTemsilcilik"], 0))}
                      onChange={(value) => update(["ikMevcut", "yerelTemsilcilik"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.yerelTemsilcilik} disabled />
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>International Personel Sayısı</td>
                  <td className="num">
                    <NumberInput
                     
                      className={inputClass("input tb-input tb-num", ["ikMevcut", "international"])}
                      value={safeNum(get(tb, ["ikMevcut", "international"], 0))}
                      onChange={(value) => update(["ikMevcut", "international"], safeNum(value))}
                    />
                  </td>
                  <td className="num">
                    <NumberInput className="input tb-input tb-num" value={plannedHeadcounts.international} disabled />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom row: F and the right stack should be equal width (50/50) */}
        {/* This card can get stretched by the grid row; make the table area flex-fill to avoid empty space */}
        <section className="card tb-card tb-span-6 tb-fill">
          <div className="tb-section-head">
            <div className="tb-section-title">F) Burs ve İndirimler — Öğrenci Sayısı</div>
            <div className="tb-muted">Sadece öğrenci sayısı girilir (oran değil).</div>
          </div>
          <div className="tb-table-wrap tb-table-tall">
            <table className="table tb-table">
              <thead>
                <tr>
                  <th>Tür</th>
                  <th className="num" style={{ width: 160 }}>Öğrenci</th>
                </tr>
              </thead>
              <tbody>
                {scholarshipGroups.map((g) => (
                  <React.Fragment key={g.key}>
                    <tr className="tb-group-row">
                      <td colSpan={2}>{g.label}</td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.key}>
                        <td style={{ fontWeight: 700 }}>{r.label}</td>
                        <td className="num">
                          <NumberInput
                           
                            className={inputClass("input tb-input tb-num", ["bursIndirimOgrenciSayilari", r.key])}
                            value={safeNum(get(tb, ["bursIndirimOgrenciSayilari", r.key], 0))}
                            onChange={(value) =>
                              update(["bursIndirimOgrenciSayilari", r.key], safeNum(value))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="tb-right-stack tb-span-6">
          {/* G) Rakip Analizi */}
          <section className="card tb-card">
            <div className="tb-section-head">
              <div className="tb-section-title">G) Rakip Kurumların Analizi</div>
              <div className="tb-muted">A/B/C: aynı kademedeki ortalama.</div>
            </div>
            <div className="tb-table-wrap">
              <table className="table tb-table">
                <thead>
                  <tr>
                    <th>Kademe</th>
                    <th style={{ width: 110 }} className="num">A</th>
                    <th style={{ width: 110 }} className="num">B</th>
                    <th style={{ width: 110 }} className="num">C</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCompetitorRows.map((r) => (
                    <tr key={r.key}>
                      <td style={{ fontWeight: 700 }}>{kademeLabels[r.key] || r.label}</td>
                      <td className="num">
                        <NumberInput
                         
                          className={inputClass("input tb-input tb-num", ["rakipAnalizi", r.key, "a"])}
                          value={safeNum(get(tb, ["rakipAnalizi", r.key, "a"], 0))}
                          onChange={(value) => update(["rakipAnalizi", r.key, "a"], safeNum(value))}
                        />
                      </td>
                      <td className="num">
                        <NumberInput
                         
                          className={inputClass("input tb-input tb-num", ["rakipAnalizi", r.key, "b"])}
                          value={safeNum(get(tb, ["rakipAnalizi", r.key, "b"], 0))}
                          onChange={(value) => update(["rakipAnalizi", r.key, "b"], safeNum(value))}
                        />
                      </td>
                      <td className="num">
                        <NumberInput
                         
                          className={inputClass("input tb-input tb-num", ["rakipAnalizi", r.key, "c"])}
                          value={safeNum(get(tb, ["rakipAnalizi", r.key, "c"], 0))}
                          onChange={(value) => update(["rakipAnalizi", r.key, "c"], safeNum(value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* H) Performans */}
          <section className="card tb-card">
            <div className="tb-section-head">
              <div className="tb-section-title">H) Performans (Önceki Dönem)</div>
              <div className="tb-muted">Planlanan: önceki yıl senaryosu.</div>
            </div>
            <div className="tb-table-wrap">
              <table className="table tb-table">
                <thead>
                  <tr>
                    <th>Kalem</th>
                    <th style={{ width: 150 }} className="num">Plan</th>
                    <th style={{ width: 150 }} className="num">Gerçek</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Öğrenci Sayısı</td>
                    <td className="num">
                      <NumberInput
                        className="input tb-input tb-num"
                        value={plannedPerf ? plannedPerf.ogrenci : ""}
                        disabled={!plannedPerf}
                      />
                    </td>
                    <td className="num">
                      <NumberInput
                       
                        className={inputClass("input tb-input tb-num", ["performans", "gerceklesen", "ogrenciSayisi"])}
                        value={safeNum(get(tb, ["performans", "gerceklesen", "ogrenciSayisi"], 0))}
                        onChange={(value) => update(["performans", "gerceklesen", "ogrenciSayisi"], safeNum(value))}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Gelirler</td>
                    <td className="num">
                      <NumberInput
                        className="input tb-input tb-num"
                        value={plannedPerf ? plannedPerf.gelirler : ""}
                        disabled={!plannedPerf}
                      />
                    </td>
                    <td className="num">
                      <NumberInput
                       
                        className={inputClass("input tb-input tb-num", ["performans", "gerceklesen", "gelirler"])}
                        value={safeNum(get(tb, ["performans", "gerceklesen", "gelirler"], 0))}
                        onChange={(value) => update(["performans", "gerceklesen", "gelirler"], safeNum(value))}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Giderler</td>
                    <td className="num">
                      <NumberInput
                        className="input tb-input tb-num"
                        value={plannedPerf ? plannedPerf.giderler : ""}
                        disabled={!plannedPerf}
                      />
                    </td>
                    <td className="num">
                      <NumberInput
                       
                        className={inputClass("input tb-input tb-num", ["performans", "gerceklesen", "giderler"])}
                        value={safeNum(get(tb, ["performans", "gerceklesen", "giderler"], 0))}
                        onChange={(value) => update(["performans", "gerceklesen", "giderler"], safeNum(value))}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Kar / Zarar Oranı (%)</td>
                    <td className="num">
                      <NumberInput
                        className="input tb-input tb-num"
                        value={plannedPerf ? plannedPerf.karZararOrani.toFixed(2) : ""}
                        disabled={!plannedPerf}
                      />
                    </td>
                    <td className="num">
                      <NumberInput
                       
                        className={inputClass("input tb-input tb-num", ["performans", "gerceklesen", "karZararOrani"])}
                        value={safeNum(get(tb, ["performans", "gerceklesen", "karZararOrani"], 0))}
                        onChange={(value) => update(["performans", "gerceklesen", "karZararOrani"], safeNum(value))}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Burs ve İndirimler</td>
                    <td className="num">
                      <NumberInput
                        className="input tb-input tb-num"
                        value={plannedPerf ? plannedPerf.bursIndirim : ""}
                        disabled={!plannedPerf}
                      />
                    </td>
                    <td className="num">
                      <NumberInput
                       
                        className={inputClass("input tb-input tb-num", ["performans", "gerceklesen", "bursVeIndirimler"])}
                        value={safeNum(get(tb, ["performans", "gerceklesen", "bursVeIndirimler"], 0))}
                        onChange={(value) =>
                          update(["performans", "gerceklesen", "bursVeIndirimler"], safeNum(value))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!plannedPerf ? (
              <div className="tb-muted" style={{ marginTop: 6 }}>
                Önceki yıl senaryosu bulunamadı (aynı okul için bir önceki akademik yıl). Planlanan kolonu bu yüzden boş.
              </div>
            ) : null}
          </section>

          {/* I) Değerlendirme */}
          <section className="card tb-card">
            <div className="tb-section-head">
              <div className="tb-section-title">I) Değerlendirme</div>
              <div className="tb-muted">Kısa notlar, riskler, beklentiler.</div>
            </div>
            <textarea
              className={inputClass("input tb-input", ["degerlendirme"])}
              value={get(tb, ["degerlendirme"], "")}
              onChange={(e) => update(["degerlendirme"], e.target.value)}
              rows={4}
              style={{ width: "100%", resize: "vertical" }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}