//frontend/src/components/ReportView.jsx

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
  if (!results) return { years: {}, meta: {} };
  if (results?.years && typeof results.years === "object") {
    return { years: results.years, meta: results.temelBilgiler || {} };
  }
  return { years: { y1: results }, meta: results.temelBilgiler || {} };
}

function yearLabel(y) {
  if (y === "y1") return "1.Yıl";
  if (y === "y2") return "2.Yıl";
  return "3.Yıl";
}

export default function ReportView({ results, currencyMeta, reportCurrency = "usd", onReportCurrencyChange }) {
  const { years, meta } = useMemo(() => pickYearObj(results), [results]);
  const fx = Number(currencyMeta?.fx_usd_to_local || 0);
  const canShowLocal =
    currencyMeta?.input_currency === "LOCAL" && fx > 0 && currencyMeta?.local_currency_code;
  const showLocal = reportCurrency === "local" && canShowLocal;
  const localLabel = currencyMeta?.local_currency_code || "LOCAL";
  const money = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return showLocal ? n * fx : n;
  };
  const fmtMoney = (v) => fmt(money(v));

  const available = useMemo(() => {
    const keys = ["y1", "y2", "y3"].filter((k) => years?.[k]);
    return keys.length ? keys : ["y1"];
  }, [years]);

  const [activeYear, setActiveYear] = useState(available[0] || "y1");

  useEffect(() => {
    // results / years değişince seçili yıl geçerli kalsın
    if (!available.includes(activeYear)) {
      setActiveYear(available[0] || "y1");
    }
  }, [available, activeYear]);

  // ✅ IMPORTANT: This hook must be ABOVE any early return
  const compare = useMemo(() => {
    return ["y1", "y2", "y3"].map((ky) => {
      const yy = years?.[ky] || {};
      return {
        ky,
        netIncome: yy?.income?.netIncome,
        netCiro: yy?.income?.netActivityIncome,
        expenses: yy?.expenses?.totalExpenses,
        netResult: yy?.result?.netResult,
        margin: yy?.kpis?.profitMargin,
      };
    });
  }, [years]);

  // ✅ early return AFTER all hooks
  if (!results) return null;

  const y = years?.[activeYear] || years?.y1 || {};
  const s = y.students || {};
  const i = y.income || {};
  const e = y.expenses || {};
  const r = y.result || {};
  const k = y.kpis || {};

  const allErrors = ["y1", "y2", "y3"].flatMap(
    (ky) => years?.[ky]?.flags?.errors || []
  );
  const allWarnings = ["y1", "y2", "y3"].flatMap(
    (ky) => years?.[ky]?.flags?.warnings || []
  );

  const factors = meta?.inflationFactors;
  const infl = meta?.inflation;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Özet Rapor</div>
          <div className="small" style={{ marginTop: 2 }}>
            1/2/3. yıl raporu • 2. ve 3. yıl enflasyon ile otomatik türetilir
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div className="tabs">
            {available.map((ky) => (
              <button
                key={ky}
                type="button"
                className={`tab ${activeYear === ky ? "active" : ""}`}
                onClick={() => setActiveYear(ky)}
              >
                {yearLabel(ky)}
              </button>
            ))}
          </div>
          {canShowLocal ? (
            <div className="tabs">
              <button
                type="button"
                className={`tab ${reportCurrency === "usd" ? "active" : ""}`}
                onClick={() => onReportCurrencyChange?.("usd")}
              >
                USD
              </button>
              <button
                type="button"
                className={`tab ${reportCurrency === "local" ? "active" : ""}`}
                onClick={() => onReportCurrencyChange?.("local")}
              >
                {localLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {(infl || factors) && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="badge">
            Enflasyon Y2: {infl?.y2 != null ? fmtPct(infl.y2) : "-"}
          </span>
          <span className="badge">
            Enflasyon Y3: {infl?.y3 != null ? fmtPct(infl.y3) : "-"}
          </span>
          <span className="badge">
            Faktör Y2: {factors?.y2 != null ? factors.y2.toFixed(4) : "-"}
          </span>
          <span className="badge">
            Faktör Y3: {factors?.y3 != null ? factors.y3.toFixed(4) : "-"}
          </span>
        </div>
      )}

      {/* QUICK 3-YEAR */}
      {available.length > 1 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th style={{ width: 170, textAlign: "right" }}>Y1</th>
                <th style={{ width: 170, textAlign: "right" }}>Y2</th>
                <th style={{ width: 170, textAlign: "right" }}>Y3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Net Toplam Gelir</td>
                <td className="num">{fmtMoney(compare[0]?.netIncome)}</td>
                <td className="num">{fmtMoney(compare[1]?.netIncome)}</td>
                <td className="num">{fmtMoney(compare[2]?.netIncome)}</td>
              </tr>
              <tr>
                <td>Net Ciro</td>
                <td className="num">{fmtMoney(compare[0]?.netCiro)}</td>
                <td className="num">{fmtMoney(compare[1]?.netCiro)}</td>
                <td className="num">{fmtMoney(compare[2]?.netCiro)}</td>
              </tr>
              <tr>
                <td>Toplam Gider</td>
                <td className="num">{fmtMoney(compare[0]?.expenses)}</td>
                <td className="num">{fmtMoney(compare[1]?.expenses)}</td>
                <td className="num">{fmtMoney(compare[2]?.expenses)}</td>
              </tr>
              <tr style={{ fontWeight: 800 }}>
                <td>Net Sonuç</td>
                <td className="num">{fmtMoney(compare[0]?.netResult)}</td>
                <td className="num">{fmtMoney(compare[1]?.netResult)}</td>
                <td className="num">{fmtMoney(compare[2]?.netResult)}</td>
              </tr>
              <tr>
                <td>Kâr Marjı</td>
                <td className="num">{fmtPct(compare[0]?.margin)}</td>
                <td className="num">{fmtPct(compare[1]?.margin)}</td>
                <td className="num">{fmtPct(compare[2]?.margin)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Students */}
      <div style={{ marginTop: 14, fontWeight: 900 }}>
        Kapasite • {yearLabel(activeYear)}
      </div>
      <div className="grid2" style={{ marginTop: 6 }}>
        <div className="stat">
          <div className="label">Kapasite</div>
          <div className="value">{fmt(s.schoolCapacity)}</div>
        </div>
        <div className="stat">
          <div className="label">Toplam Öğrenci</div>
          <div className="value">{fmt(s.totalStudents)}</div>
        </div>
        <div className="stat">
          <div className="label">Doluluk</div>
          <div className="value">{fmtPct(s.utilizationRate)}</div>
        </div>
      </div>

      {/* Income */}
      <div style={{ marginTop: 14, fontWeight: 900 }}>
        Gelirler • {yearLabel(activeYear)}
      </div>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table className="table">
          <tbody>
            <tr>
              <td>Brüt Eğitim Geliri (Tuition)</td>
              <td className="num">{fmtMoney(i.grossTuition)}</td>
            </tr>
            <tr>
              <td>Öğrenim Dışı Öğrenci Ücretleri (Brüt)</td>
              <td className="num">{fmtMoney(i.nonEducationFeesTotal)}</td>
            </tr>
            <tr>
              <td>Yurt Gelirleri (Brüt)</td>
              <td className="num">{fmtMoney(i.dormitoryRevenuesTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 800 }}>
              <td>Faaliyet Gelirleri (Brüt)</td>
              <td className="num">{fmtMoney(i.activityGross)}</td>
            </tr>
            <tr>
              <td>Burs ve İndirimler</td>
              <td className="num">-{fmtMoney(i.totalDiscounts)}</td>
            </tr>
            <tr style={{ fontWeight: 800 }}>
              <td>Net Faaliyet Gelirleri (Net Ciro)</td>
              <td className="num">{fmtMoney(i.netActivityIncome)}</td>
            </tr>
            <tr>
              <td>Diğer Gelirler (Brüt + Devlet Teşvikleri)</td>
              <td className="num">{fmtMoney(i.otherIncomeTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 800 }}>
              <td>Net Toplam Gelir</td>
              <td className="num">{fmtMoney(i.netIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid2" style={{ marginTop: 8 }}>
        <div className="stat">
          <div className="label">Net Kişi Başı Ciro</div>
          <div className="value">{fmtMoney(k.netCiroPerStudent)}</div>
        </div>
        <div className="stat">
          <div className="label">Diğer Gelirler %</div>
          <div className="value">{fmtPct(i.otherIncomeRatio)}</div>
        </div>
      </div>

      {/* Expenses */}
      <div style={{ marginTop: 14, fontWeight: 900 }}>
        Giderler • {yearLabel(activeYear)}
      </div>
      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <table className="table">
          <tbody>
            <tr>
              <td>İşletme Giderleri Toplamı</td>
              <td className="num">{fmtMoney(e.operatingExpensesTotal)}</td>
            </tr>
            <tr>
              <td>Öğrenim Dışı Maliyetler Toplamı</td>
              <td className="num">{fmtMoney(e.nonTuitionServicesCostTotal)}</td>
            </tr>
            <tr>
              <td>Yurt Giderleri Toplamı</td>
              <td className="num">{fmtMoney(e.dormitoryCostTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 800 }}>
              <td>Toplam Gider</td>
              <td className="num">{fmtMoney(e.totalExpenses)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Result */}
      <div style={{ marginTop: 14, fontWeight: 900 }}>
        Sonuç • {yearLabel(activeYear)}
      </div>
      <div className="grid2" style={{ marginTop: 6 }}>
        <div className="stat">
          <div className="label">Net Sonuç</div>
          <div className="value">{fmtMoney(r.netResult)}</div>
        </div>
        <div className="stat">
          <div className="label">Kâr Marjı</div>
          <div className="value">{fmtPct(k.profitMargin)}</div>
        </div>
        <div className="stat">
          <div className="label">Gelir / Öğrenci</div>
          <div className="value">{fmtMoney(k.revenuePerStudent)}</div>
        </div>
        <div className="stat">
          <div className="label">Gider / Öğrenci</div>
          <div className="value">{fmtMoney(k.costPerStudent)}</div>
        </div>
      </div>

      {(allErrors.length > 0 || allWarnings.length > 0) && (
        <div style={{ marginTop: 12 }}>
          {allErrors.length > 0 && (
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.25)",
              }}
            >
              <div style={{ fontWeight: 900, color: "#b91c1c" }}>Hatalar</div>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {allErrors.map((x, idx) => (
                  <li key={idx}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {allWarnings.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 12,
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <div style={{ fontWeight: 900, color: "#92400e" }}>Uyarılar</div>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {allWarnings.map((x, idx) => (
                  <li key={idx}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
