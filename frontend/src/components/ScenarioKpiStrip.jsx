// frontend/src/components/ScenarioKpiStrip.jsx

import React, { useEffect, useMemo, useState } from "react";

const fmt = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "-";

const fmtPct = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? (v * 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%"
    : "-";

function pickYearObj(results) {
  if (!results) return { years: {} };
  if (results?.years && typeof results.years === "object") {
    return { years: results.years };
  }
  return { years: { y1: results } };
}

function yearLabel(y) {
  if (y === "y1") return "1.Yıl";
  if (y === "y2") return "2.Yıl";
  return "3.Yıl";
}

export default function ScenarioKpiStrip(props) {
  const { results, fallbackResults } = props;
  const resolvedResults = results || fallbackResults;

  const { years } = useMemo(() => pickYearObj(resolvedResults), [resolvedResults]);

  const available = useMemo(() => {
    const keys = ["y1", "y2", "y3"].filter((k) => years?.[k]);
    return keys.length ? keys : ["y1"];
  }, [years]);

  const [activeYear, setActiveYear] = useState(available[0] || "y1");

  useEffect(() => {
    if (!available.includes(activeYear)) {
      setActiveYear(available[0] || "y1");
    }
  }, [available, activeYear]);

  if (!resolvedResults) {
    return (
      <div className="kpi-strip">
        <div className="small muted">Henüz hesaplanmadı — Hesapla'ya tıklayın.</div>
      </div>
    );
  }

  const y = years?.[activeYear] || years?.y1 || {};
  const income = y.income || {};
  const expenses = y.expenses || {};
  const result = y.result || {};
  const kpis = y.kpis || {};
  const students = y.students || {};

  const netResult = Number.isFinite(result?.netResult) ? result.netResult : null;
  const profitMargin = Number.isFinite(kpis?.profitMargin) ? kpis.profitMargin : null;
  const utilizationRate = Number.isFinite(students?.utilizationRate) ? students.utilizationRate : null;

  const chips = [
    { label: "Net Ciro", value: fmt(income.netActivityIncome) },
    { label: "Net Toplam Gelir", value: fmt(income.netIncome) },
    { label: "Toplam Gider", value: fmt(expenses.totalExpenses) },
    {
      label: "Net Sonuç",
      value: fmt(netResult),
      tone: netResult != null ? (netResult < 0 ? "is-bad" : "is-good") : "",
    },
    {
      label: "Kâr Marjı",
      value: fmtPct(profitMargin),
      tone: profitMargin != null ? (profitMargin < 0 ? "is-bad" : "is-good") : "",
    },
    { label: "Toplam Öğrenci", value: fmt(students.totalStudents) },
    {
      label: "Doluluk",
      value: fmtPct(utilizationRate),
      tone:
        utilizationRate != null
          ? utilizationRate > 1
            ? "is-warn"
            : "is-good"
          : "",
    },
  ];

  return (
    <div className="kpi-strip">
      {chips.map((chip) => (
        <div key={chip.label} className={`kpi-chip ${chip.tone || ""}`.trim()}>
          <div className="kpi-label">{chip.label}</div>
          <div className="kpi-value">{chip.value}</div>
        </div>
      ))}

      {available.length > 1 ? (
        <div className="kpi-year-toggle">
          {available.map((ky) => (
            <button
              key={ky}
              type="button"
              className={"kpi-year-btn " + (activeYear === ky ? "is-active" : "")}
              onClick={() => setActiveYear(ky)}
            >
              {yearLabel(ky)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
