//frontend/src/components/HREditorIK.jsx

import React, { useEffect, useMemo, useState } from "react";
import { formatKademeLabel, normalizeKademeConfig } from "../utils/kademe";
import { useScenarioUiFlag } from "../hooks/useScenarioUIState";
import NumberInput from "./NumberInput";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v) =>
  Number.isFinite(v)
    ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "-";

const YEARS = [
  { key: "y1", label: "1.Yıl" },
  { key: "y2", label: "2.Yıl" },
  { key: "y3", label: "3.Yıl" },
];

const DEFAULT_UNIT_COST_RATIO = 1;

const LEVEL_DEFS = [
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
  ROLE_GROUPS.forEach((group, groupIndex) => {
    group.roles.forEach((role, roleIndex) => {
      out[role.key] = {
        groupIndex,
        roleIndex,
        groupLen: group.roles.length,
        isGroupEnd: roleIndex === group.roles.length - 1,
      };
    });
  });
  return out;
})();

const groupDividerClass = (groupIndex) =>
  groupIndex < ROLE_GROUPS.length - 1 ? "ik-compact-divider" : "";

// Column dividers:
// - Inside the same group: dotted separator
// - End of group (between groups): solid separator
const cellDividerClass = (roleKey) => {
  const meta = ROLE_META[roleKey];
  if (!meta) return "";
  if (!meta.isGroupEnd) return "ik-compact-dot";
  if (meta.groupIndex < ROLE_GROUPS.length - 1) return "ik-compact-divider";
  return "";
};


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
  if (v?.years && typeof v.years === "object") {
    return deepMerge(base, v);
  }

  if (v?.unitCosts || v?.headcountsByLevel) {
    return deepMerge(base, { years: { y1: v } });
  }

  return deepMerge(base, v);
}

function normalizeUnitCostRatio(value) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNIT_COST_RATIO;
  return n;
}

function applyUnitCostRatio(input, ratioValue) {
  const ratio = normalizeUnitCostRatio(ratioValue);
  const next = structuredClone(input || {});
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
    const y2 = base * ratio;
    const y3 = y2 * ratio;
    next.years.y2.unitCosts[r.key] = y2;
    next.years.y3.unitCosts[r.key] = y3;
  }

  return next;
}

function areUnitCostsSynced(input, ratioValue) {
  const ratio = normalizeUnitCostRatio(ratioValue);
  const y1 = input?.years?.y1?.unitCosts || {};
  const y2 = input?.years?.y2?.unitCosts || {};
  const y3 = input?.years?.y3?.unitCosts || {};
  for (const r of ALL_ROLES) {
    const base = toNum(y1?.[r.key]);
    const expY2 = base * ratio;
    const expY3 = expY2 * ratio;
    if (Math.abs(toNum(y2?.[r.key]) - expY2) > 1e-6) return false;
    if (Math.abs(toNum(y3?.[r.key]) - expY3) > 1e-6) return false;
  }
  return true;
}

function computeYear(yearIK) {
  const roleTotals = {};
  const roleAnnualCosts = {};
  const roleMonthlyUnitCosts = {};
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
    roleMonthlyUnitCosts[r.key] = unit / 12;
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
    roleMonthlyUnitCosts,
    roleMonthlyPerPersonAvg,
    salaryExpenseMapping,
    totals: { totalAnnual, totalHeadcount },
  };
}

export default function HREditorIK({
  value,
  kademeConfig,
  onChange,
  onSalaryComputed,
  currencyCode = "USD",
  dirtyPaths,
  onDirty,
  uiScopeKey,
}) {
  const [showRules, setShowRules] = useState(false);

  // Persist per school + scenario (scoped by URL)
  // Default is "Geniş".
  const [isCondensed, setIsCondensed] = useScenarioUiFlag("hr.isCondensed", true, { scope: uiScopeKey });

  const ik = useMemo(() => buildIK(value), [value]);

  const unitCostRatio = useMemo(
    () => normalizeUnitCostRatio(ik?.unitCostRatio),
    [ik?.unitCostRatio]
  );

  const kademeler = useMemo(() => normalizeKademeConfig(kademeConfig), [kademeConfig]);

  const levels = useMemo(
    () =>
      LEVEL_DEFS.map((lvl) => {
        const base = formatKademeLabel(lvl.baseLabel, kademeler, lvl.kademeKey);
        return { ...lvl, label: lvl.suffix ? `${base}${lvl.suffix}` : base };
      }),
    [kademeler]
  );

  const visibleLevels = useMemo(
    () => levels.filter((lvl) => kademeler[lvl.kademeKey]?.enabled !== false),
    [levels, kademeler]
  );

  useEffect(() => {
    if (!ik) return;
    if (areUnitCostsSynced(ik, unitCostRatio)) return;
    const next = applyUnitCostRatio(ik, unitCostRatio);
    onChange?.(next);
  }, [ik, unitCostRatio, onChange]);

  const unitCostPath = (yearKey, roleKey) => `inputs.ik.years.${yearKey}.unitCosts.${roleKey}`;
  const unitCostRatioPath = "inputs.ik.unitCostRatio";
  const headcountPath = (yearKey, levelKey, roleKey) =>
    `inputs.ik.years.${yearKey}.headcountsByLevel.${levelKey}.${roleKey}`;

  const isDirty = (path) => (dirtyPaths ? dirtyPaths.has(path) : false);
  const dirtyClass = (path) => (isDirty(path) ? "input-dirty" : "");

  const setUnitCostRatio = (v) => {
    const ratio = normalizeUnitCostRatio(v);
    const next = applyUnitCostRatio(ik, ratio);
    onChange?.(next);
    onDirty?.(unitCostRatioPath, ratio);
  };

  const setUnitCost = (yearKey, roleKey, v) => {
    if (yearKey !== "y1") return;
    const nextValue = toNum(v);
    const next = structuredClone(ik);
    next.years = next.years || {};
    next.years.y1 = next.years.y1 || defaultYearIK();
    next.years.y1.unitCosts = next.years.y1.unitCosts || {};
    next.years.y1.unitCosts[roleKey] = nextValue;
    const withGrowth = applyUnitCostRatio(next, unitCostRatio);
    onChange?.(withGrowth);
    onDirty?.(unitCostPath("y1", roleKey), nextValue);
  };

  const setHeadcount = (yearKey, levelKey, roleKey, v) => {
    const nextValue = Math.max(0, Math.trunc(toNum(v)));
    const next = structuredClone(ik);
    next.years = next.years || {};
    next.years[yearKey] = next.years[yearKey] || defaultYearIK();
    next.years[yearKey].headcountsByLevel = next.years[yearKey].headcountsByLevel || {};
    next.years[yearKey].headcountsByLevel[levelKey] =
      next.years[yearKey].headcountsByLevel[levelKey] || {};
    next.years[yearKey].headcountsByLevel[levelKey][roleKey] = nextValue;
    onChange?.(next);
    onDirty?.(headcountPath(yearKey, levelKey, roleKey), nextValue);
  };

  const computedByYear = useMemo(() => {
    const out = {};
    for (const y of YEARS) out[y.key] = computeYear(ik?.years?.[y.key] || defaultYearIK());
    return out;
  }, [ik]);

  const salaryMappingByYear = useMemo(() => {
    const out = {};
    for (const y of YEARS) out[y.key] = computedByYear?.[y.key]?.salaryExpenseMapping || {};
    return out;
  }, [computedByYear]);

  useEffect(() => {
    onSalaryComputed?.(salaryMappingByYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(salaryMappingByYear)]);

  return (
    <div className="card">
      <div style={{ fontWeight: 800, textAlign: "center" }}>
        PERSONEL SAYILARI VE İŞVEREN MALİYETLERİ
      </div>
      <hr />

      <div className="row" style={{ marginTop: 8 }}>
        <label>
          <div className="small">Yıllık Birim Maliyet Çarpanı (Y2/Y3)</div>
          <NumberInput
            className={`input sm ${dirtyClass(unitCostRatioPath)}`}
           
            min="0"
            step="0.01"
            value={unitCostRatio}
            onChange={(value) => setUnitCostRatio(value)}
          />
        </label>

        <div className="row" style={{ marginLeft: "auto" }}>
          <div className="small" style={{ fontWeight: 700 }}>
            Görünüm
          </div>
          <button
            type="button"
            className={`pill ${!isCondensed ? "active" : ""}`}
            onClick={() => setIsCondensed(false)}
          >
            Geniş
          </button>
          <button
            type="button"
            className={`pill ${isCondensed ? "active" : ""}`}
            onClick={() => setIsCondensed(true)}
          >
            Yoğun
          </button>
        </div>
      </div>

      <div className="ik-compact-wrap table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table ik-compact-table">
          <thead>
            <tr>
              {/* �
 3 satır header var artık */}
              <th className="ik-compact-level" rowSpan={3}>
                Kademeler
              </th>

              {ROLE_GROUPS.map((g, groupIndex) => (
                <th
                  key={g.groupKey}
                  colSpan={g.roles.length}
                  className={`ik-compact-group ik-compact-group-dot ${groupDividerClass(groupIndex)}`}
                >
                  {g.groupLabel}
                </th>
              ))}
            </tr>

            <tr>
              {ALL_ROLES.map((r) => (
                <th key={r.key} className={`ik-compact-role ${cellDividerClass(r.key)}`}>
                  {r.label}
                </th>
              ))}
            </tr>

            {/* �
 Yeni header satırı: Yıllar (dinamik) */}
            <tr>
              {ALL_ROLES.map((r) => (
                <th key={`yr-${r.key}`} className={`ik-year-head ${cellDividerClass(r.key)}`}>
                  <div
                    className={`ik-year-stack ${isCondensed ? "ik-year-stack-condensed" : ""}`}
                  >
                    {YEARS.map((y) => (
                      <div key={`yr-${r.key}-${y.key}`} className="ik-year-chip">
                        {y.label}
                      </div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="ik-compact-level ik-compact-title">
                {`Birim İşveren Maliyeti / YIL (${currencyCode})`}
              </td>

              {ALL_ROLES.map((r) => (
                <td key={`uc-${r.key}`} className={`ik-compact-cell ${cellDividerClass(r.key)}`}>
                  <div className={`ik-stack ${isCondensed ? "ik-stack-condensed" : ""}`}>
                    {YEARS.map((y) => (
                      <div className="ik-stack-row" key={`uc-${r.key}-${y.key}`} title={y.label}>
                        {y.key === "y1" ? (
                          <NumberInput
                           
                            min="0"
                            step="100"
                            className={`ik-stack-input ${dirtyClass(unitCostPath(y.key, r.key))}`}
                            value={toNum(ik?.years?.[y.key]?.unitCosts?.[r.key])}
                            onChange={(value) => setUnitCost(y.key, r.key, value)}
                          />
                        ) : (
                          <div className="ik-stack-readonly">
                            {fmtMoney(toNum(ik?.years?.[y.key]?.unitCosts?.[r.key]) || 0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>

            {visibleLevels.map((lvl) => (
              <tr key={lvl.key}>
                <td className="ik-compact-level">{lvl.label}</td>
                {ALL_ROLES.map((r) => (
                  <td key={`${lvl.key}-${r.key}`} className={`ik-compact-cell ${cellDividerClass(r.key)}`}>
                    <div className={`ik-stack ${isCondensed ? "ik-stack-condensed" : ""}`}>
                      {YEARS.map((y) => (
                        <div className="ik-stack-row" key={`${lvl.key}-${r.key}-${y.key}`} title={y.label}>
                          <NumberInput
                           
                            min="0"
                            step="1"
                            className={`ik-stack-input ${dirtyClass(headcountPath(y.key, lvl.key, r.key))}`}
                            value={toNum(ik?.years?.[y.key]?.headcountsByLevel?.[lvl.key]?.[r.key])}
                            onChange={(value) => setHeadcount(y.key, lvl.key, r.key, value)}
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}

            <tr className="ik-total-row row-group-start">
              <td className="ik-compact-level">TOPLAM YILLIK MALİYET</td>
              {ALL_ROLES.map((r) => (
                <td key={`totcost-${r.key}`} className={`ik-compact-cell ${cellDividerClass(r.key)}`}>
                  <div className={`ik-stack ${isCondensed ? "ik-stack-condensed" : ""}`}>
                    {YEARS.map((y) => (
                      <div className="ik-stack-row" key={`totcost-${r.key}-${y.key}`} title={y.label}>
                        <div className="ik-stack-value">
                          {fmtMoney(computedByYear?.[y.key]?.roleAnnualCosts?.[r.key] || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>

            <tr className="ik-total-row row-group-start">
              <td className="ik-compact-level small">Ortalama Aylık / Kişi (Bilgi)</td>
              {ALL_ROLES.map((r) => (
                <td key={`avgm-${r.key}`} className={`ik-compact-cell ${cellDividerClass(r.key)}`}>
                  <div className={`ik-stack ${isCondensed ? "ik-stack-condensed" : ""}`}>
                    {YEARS.map((y) => (
                      <div className="ik-stack-row" key={`avgm-${r.key}-${y.key}`} title={y.label}>
                        <div className="ik-stack-muted">
                          {fmtMoney(computedByYear?.[y.key]?.roleMonthlyPerPersonAvg?.[r.key] || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>

            <tr className="ik-total-row row-group-start">
              <td className="ik-compact-level">TOPLAM PERSONEL SAYISI</td>
              {ALL_ROLES.map((r) => (
                <td key={`totcnt-${r.key}`} className={`ik-compact-cell ${cellDividerClass(r.key)}`}>
                  <div className={`ik-stack ${isCondensed ? "ik-stack-condensed" : ""}`}>
                    {YEARS.map((y) => (
                      <div className="ik-stack-row" key={`totcnt-${r.key}-${y.key}`} title={y.label}>
                        <div className="ik-stack-value">
                          {fmtMoney(computedByYear?.[y.key]?.roleTotals?.[r.key] || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid3" style={{ marginTop: 12 }}>
        {YEARS.map((y) => (
          <div className="stat" key={`sum-${y.key}`}>
            <div className="label">{y.label} Toplam Yıllık Maliyet</div>
            <div className="value">{fmtMoney(computedByYear?.[y.key]?.totals?.totalAnnual || 0)}</div>
            <div className="small" style={{ marginTop: 2 }}>
              Personel: {fmtMoney(computedByYear?.[y.key]?.totals?.totalHeadcount || 0)}
            </div>
          </div>
        ))}
      </div>

      <hr />

      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table className="table data-table">
          <thead>
            <tr>
              <th>Gider Anahtarı</th>
              {YEARS.map((y) => (
                <th key={`map-${y.key}`} className="cell-num">
                  {`${y.label} (${currencyCode})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              "turkPersonelMaas",
              "turkDestekPersonelMaas",
              "yerelPersonelMaas",
              "yerelDestekPersonelMaas",
              "internationalPersonelMaas",
            ].map((k) => (
              <tr key={k}>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {k}
                </td>
                {YEARS.map((y) => (
                  <td key={`${k}-${y.key}`} className="cell-num" style={{ fontWeight: 800 }}>
                    {fmtMoney(salaryMappingByYear?.[y.key]?.[k] || 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr />

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Kural Notları</div>
        </div>
        <button className="btn" onClick={() => setShowRules((s) => !s)}>
          {showRules ? "Hide" : "Show"}
        </button>
      </div>

      {showRules ? (
        <div style={{ marginTop: 10 }}>
          <div className="card" style={{ background: "#f9fafb" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>5.x – Yönetim / Temsil</div>
            <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {`5.1.1.1. Okul müdürünün çalışma süresi ülkelerin yasal sürelerinin azami ve asgari sınırlarını aşmamak kaydıyla 40-45 saattir. 5.1.1.2. Türkiye Maarif Vakfı bünyesinde tüm branşları okul öncesinden liseye kadar bulunan kampüs şeklindeki okulların eğitim hizmetlerinin yürütülmesi ile ilgili olarak okul açıldığında Türk Okul Müdürü atanır. 5.1.1.3. Ülke Temsilcisinin olmadığı ve en fazla 300 öğrencinin bulunduğu yerlerde okul müdürü ülke temsilcisi tarafından Ülke Temsilcisi Vekili olarak görevlendirilebilir. 5.2.1.1. Okul müdür yardımcısının çalışma süresi ülkelerin yasal sürelerinin azami ve asgari sınırlarını aşmamak kaydıyla 40-45 saattir. 5.2.1.2. Okul müdür yardımcısı kampüs şeklindeki okullarda öğrenci sayısı 500 e ulaşıldığında Türk Okul Müdür Yardımcısı atanabilir.`}
            </pre>
          </div>

          <div className="card" style={{ background: "#f9fafb", marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>5.4 – Öğretmen</div>
            <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {`5.4.1.1. Öğretmenin çalışma süresi ülkelerin yasal sürelerinin azami ve asgari sınırlarını aşmamak kaydıyla ortalama 40 saattir. 5.4.1.2. Bir öğretmene haftalık olarak 26 saat ders verilir. 5.4.1.3. Bir öğretmene haftalık olarak 8 saat ek ders verilir. Türkiye'den görevlendirilen öğretmenlerin haftalık ders saati 24 saat olarak belirlenmiştir. 5.4.1.4. Genel ve mesleki bilgi derslerinde bir öğretmene haftalık 26 saat ders verilir. Eğer bu branşlarda haftalık ders saati 36 saat ders çıkıyorsa 2 öğretmen istihdam edilir. Ayrıca beden eğitimi, müzik, görsel sanatlar gibi branşlarda haftalık ders saati 24 saat olarak belirlenmiştir.`}
            </pre>
          </div>

          <div className="card" style={{ background: "#f9fafb", marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>6.x – Güvenlik / Temizlik</div>
            <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {`6.1.1. Okulun Güvenliği: Okulda 7 gün 24 saat (3 vardiya) şeklinde güvenlik personeli istihdam edilir. 6.3.1. Temizlik Personeli: Okulda hijyenin sağlanmasına yönelik yeteri kadar temizlik personeli istihdam edilir. 6.3.1.1. Okul öncesi kademesinde 50 öğrenciye 1 personel istihdamı yapılır. 6.3.1.2. İlkokul, ortaokul ve lise kademelerinde 150 öğrenciye 1 personel istihdamı yapılır.`}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
