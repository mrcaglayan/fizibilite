//frontend/src/components/ReportView.jsx

import React, { useEffect, useMemo, useState } from "react";

const fmt = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "-";

const fmtPct = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? (v * 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) + "%"
    : "-";

const SERVICE_LABELS = {
  yemek: "Yemek",
  uniforma: "Uniforma",
  kitapKirtasiye: "Kitap/Kırtasiye",
  ulasimServis: "Ulaşım/Servis",
};

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

  const yOf = (ky) => years?.[ky] || {};
  const pnlOf = (ky) => yOf(ky)?.pnl || {};
  const incOf = (ky) => yOf(ky)?.income || {};

  const grossSalesRemainder = (ky) => {
    const p = pnlOf(ky) || {};
    const inc = incOf(ky) || {};
    const gross = Number(p?.grossSales);
    if (!Number.isFinite(gross)) return null;
    const sum =
      Number(inc?.grossTuition || 0) +
      Number(inc?.nonEducationFeesTotal || 0) +
      Number(inc?.dormitoryRevenuesTotal || 0) +
      Number(inc?.otherInstitutionIncomeTotal || 0) +
      Number(inc?.governmentIncentives || 0);
    const rem = gross - sum;
    return Math.abs(rem) > 0.01 ? rem : null;
  };

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
  const pnl = y.pnl || {};

  const serviceRows = Array.isArray(e.nonTuitionServicesBreakdown) ? e.nonTuitionServicesBreakdown : [];
  const getServiceRowTotal = (row) => {
    const total = Number(row?.total);
    if (Number.isFinite(total)) return total;
    const sc = Number(row?.studentCount);
    const uc = Number(row?.unitCost);
    if (!Number.isFinite(sc) || !Number.isFinite(uc)) return 0;
    return sc * uc;
  };
  const serviceTotal = serviceRows.length
    ? serviceRows.reduce((sum, row) => sum + getServiceRowTotal(row), 0)
    : undefined;


  const grossBreak = Array.isArray(pnl?.grossSalesBreakdown) ? pnl.grossSalesBreakdown : [];
  const grossRem = grossSalesRemainder(activeYear);
  const grossBreakFull = grossRem == null ? grossBreak : [...grossBreak, { label: "Diğer / Yuvarlama", value: grossRem }];
  const discountsSplit = i?.discountsSplit || {};
  const bursDetails = Array.isArray(discountsSplit?.bursDetails) ? discountsSplit.bursDetails : [];
  const indirimDetails = Array.isArray(discountsSplit?.indirimDetails) ? discountsSplit.indirimDetails : [];

  const allErrors = ["y1", "y2", "y3"].flatMap(
    (ky) => years?.[ky]?.flags?.errors || []
  );
  const allWarnings = ["y1", "y2", "y3"].flatMap(
    (ky) => years?.[ky]?.flags?.warnings || []
  );

  const factors = meta?.inflationFactors;
  const infl = meta?.inflation;
  const inflNotes = Array.isArray(meta?.inflationNotes) ? meta.inflationNotes : [];

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

      {(infl || factors || inflNotes.length > 0) && (
        <div style={{ marginTop: 10 }}>
          {(infl || factors) && (
            <div className="row">
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
          {inflNotes.length > 0 && (
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
              {inflNotes.map((note, idx) => (
                <span
                  key={idx}
                  className="badge"
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.35)",
                  }}
                >
                  ⚠️ {note}
                </span>
              ))}
            </div>
          )}
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



      {/* GELIR TABLOSU (Y1-Y2-Y3) */}
      {available.length > 1 && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Gelir Tablosu (Y1-Y2-Y3)</div>
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
              {(() => {
                const y1 = years?.y1 || {};
                const y2 = years?.y2 || {};
                const y3 = years?.y3 || {};
                const p1 = y1?.pnl || {};
                const p2 = y2?.pnl || {};
                const p3 = y3?.pnl || {};
                const i1 = y1?.income || {};
                const i2 = y2?.income || {};
                const i3 = y3?.income || {};

                const remV = [grossSalesRemainder("y1"), grossSalesRemainder("y2"), grossSalesRemainder("y3")];
                const remRows = remV.some((v) => v != null)
                  ? [{ type: "i", label: "Diğer / Yuvarlama", v: remV }]
                  : [];

                const rows = [
                  { type: "h", label: "A. BRÜT SATIŞLAR", v: [p1.grossSales, p2.grossSales, p3.grossSales] },
                  { type: "i", label: "Brüt Eğitim Geliri (Tuition)", v: [i1.grossTuition, i2.grossTuition, i3.grossTuition] },
                  { type: "i", label: "Öğrenim Dışı Öğrenci Ücretleri (Brüt)", v: [i1.nonEducationFeesTotal, i2.nonEducationFeesTotal, i3.nonEducationFeesTotal] },
                  { type: "i", label: "Yurt Gelirleri (Brüt)", v: [i1.dormitoryRevenuesTotal, i2.dormitoryRevenuesTotal, i3.dormitoryRevenuesTotal] },
                  { type: "i", label: "Diğer Kurum Gelirleri", v: [i1.otherInstitutionIncomeTotal, i2.otherInstitutionIncomeTotal, i3.otherInstitutionIncomeTotal] },
                  { type: "i", label: "Devlet Teşvikleri", v: [i1.governmentIncentives, i2.governmentIncentives, i3.governmentIncentives] },

                  ...remRows,

                  { type: "h", label: "B. SATIŞ İNDİRİMLERİ (-)", v: [p1.salesDiscounts, p2.salesDiscounts, p3.salesDiscounts] },
                  { type: "i", label: "Burslar (-)", v: [p1.bursDiscounts, p2.bursDiscounts, p3.bursDiscounts] },
                  { type: "i", label: "İndirimler (-)", v: [p1.indirimDiscounts, p2.indirimDiscounts, p3.indirimDiscounts] },

                  { type: "h", label: "C. Net Satışlar", v: [p1.netSales, p2.netSales, p3.netSales] },

                  { type: "h", label: "D. Satışların Maliyeti (-)", v: [p1.costOfSalesTotal, p2.costOfSalesTotal, p3.costOfSalesTotal] },
                  { type: "i", label: "Satılan Ticari Mallar Maliyeti (-) (621)", v: [p1.costOfSalesGoods, p2.costOfSalesGoods, p3.costOfSalesGoods] },
                  { type: "i", label: "Satılan Hizmet Maliyeti (-) (622)", v: [p1.costOfSalesServices, p2.costOfSalesServices, p3.costOfSalesServices] },

                  { type: "h", label: "BRÜT SATIŞ KARI VEYA ZARARI", v: [p1.grossProfit, p2.grossProfit, p3.grossProfit] },

                  { type: "h", label: "E. FAALİYET GİDERLERİ (-)", v: [p1.operatingTotal, p2.operatingTotal, p3.operatingTotal] },
                  { type: "i", label: "Pazarlama Satış Dağıtım Giderleri (-) (631)", v: [p1.operatingMarketing, p2.operatingMarketing, p3.operatingMarketing] },
                  { type: "i", label: "Genel Yönetim Giderleri (-) (632)", v: [p1.operatingGeneral, p2.operatingGeneral, p3.operatingGeneral] },

                  { type: "f", label: "DÖNEM NET KARI VEYA ZARARI", v: [p1.periodNetProfit, p2.periodNetProfit, p3.periodNetProfit] },
                ];

                const styleFor = (t) => {
                  if (t === "h") return { fontWeight: 800 };
                  if (t === "f") return { fontWeight: 900 };
                  return {};
                };
                const labelStyleFor = (t) => (t === "i" ? { paddingLeft: 18 } : {});

                return rows.map((row, idx) => (
                  <tr key={idx} style={styleFor(row.type)}>
                    <td style={labelStyleFor(row.type)}>{row.label}</td>
                    <td className="num">{fmtMoney(row.v[0])}</td>
                    <td className="num">{fmtMoney(row.v[1])}</td>
                    <td className="num">{fmtMoney(row.v[2])}</td>
                  </tr>
                ));
              })()}
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
            <tr style={{ fontWeight: 800 }}>
              <td>A. BRÜT SATIŞLAR</td>
              <td className="num">{fmtMoney(pnl.grossSales)}</td>
            </tr>
            {grossBreakFull.map((row, idx) => (
              <tr key={idx}>
                <td style={{ paddingLeft: 18 }}>{row.label}</td>
                <td className="num">{fmtMoney(row.value)}</td>
              </tr>
            ))}

            <tr style={{ fontWeight: 800 }}>
              <td>B. SATIŞ İNDİRİMLERİ (-)</td>
              <td className="num">{fmtMoney(pnl.salesDiscounts)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>Burslar (-)</td>
              <td className="num">{fmtMoney(pnl.bursDiscounts)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>İndirimler (-)</td>
              <td className="num">{fmtMoney(pnl.indirimDiscounts)}</td>
            </tr>
            {(bursDetails.length > 0 || indirimDetails.length > 0) && (
              <tr>
                <td colSpan={2} style={{ paddingTop: 0 }}>
                  <details>
                    <summary className="small">Burs / İndirim detayları</summary>
                    <div style={{ marginTop: 8, overflowX: "auto" }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tür</th>
                            <th>Açıklama</th>
                            <th style={{ width: 170, textAlign: "right" }}>Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bursDetails.map((d, idx) => (
                            <tr key={"b" + idx}>
                              <td>Burs</td>
                              <td>{d.name}</td>
                              <td className="num">{fmtMoney(-Math.abs(d.amount))}</td>
                            </tr>
                          ))}
                          {indirimDetails.map((d, idx) => (
                            <tr key={"i" + idx}>
                              <td>İndirim</td>
                              <td>{d.name}</td>
                              <td className="num">{fmtMoney(-Math.abs(d.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </td>
              </tr>
            )}

            <tr style={{ fontWeight: 800 }}>
              <td>C. Net Satışlar</td>
              <td className="num">{fmtMoney(pnl.netSales)}</td>
            </tr>

            <tr style={{ fontWeight: 800 }}>
              <td>D. Satışların Maliyeti (-)</td>
              <td className="num">{fmtMoney(pnl.costOfSalesTotal)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>Satılan Ticari Mallar Maliyeti (-) (621)</td>
              <td className="num">{fmtMoney(pnl.costOfSalesGoods)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>Satılan Hizmet Maliyeti (-) (622)</td>
              <td className="num">{fmtMoney(pnl.costOfSalesServices)}</td>
            </tr>

            <tr style={{ fontWeight: 800 }}>
              <td>BRÜT SATIŞ KARI VEYA ZARARI</td>
              <td className="num">{fmtMoney(pnl.grossProfit)}</td>
            </tr>

            <tr style={{ fontWeight: 800 }}>
              <td>E. FAALİYET GİDERLERİ (-)</td>
              <td className="num">{fmtMoney(pnl.operatingTotal)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>Pazarlama Satış Dağıtım Giderleri (-) (631)</td>
              <td className="num">{fmtMoney(pnl.operatingMarketing)}</td>
            </tr>
            <tr>
              <td style={{ paddingLeft: 18 }}>Genel Yönetim Giderleri (-) (632)</td>
              <td className="num">{fmtMoney(pnl.operatingGeneral)}</td>
            </tr>

            <tr style={{ fontWeight: 900 }}>
              <td>DÖNEM NET KARI VEYA ZARARI</td>
              <td className="num">{fmtMoney(pnl.periodNetProfit)}</td>
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
              <td colSpan={2} style={{ paddingTop: 0 }}>
                <details>
                  <summary style={{ cursor: "pointer" }}>Detayları göster</summary>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      Öğrenim Dışı Maliyetler Detayı
                    </div>
                    {serviceRows.length > 0 ? (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Kalem</th>
                            <th style={{ textAlign: "right" }}>Öğrenci Sayısı</th>
                            <th style={{ textAlign: "right" }}>Birim Maliyet</th>
                            <th style={{ textAlign: "right" }}>Toplam</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceRows.map((row, idx) => {
                            const rowTotal = getServiceRowTotal(row);
                            return (
                              <tr key={row?.key || row?.id || idx}>
                                <td>{SERVICE_LABELS[row?.key] || row?.key || "-"}</td>
                                <td className="num">{fmt(row?.studentCount)}</td>
                                <td className="num">{fmtMoney(row?.unitCost)}</td>
                                <td className="num">{fmtMoney(rowTotal)}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ fontWeight: 800 }}>
                            <td>Toplam</td>
                            <td />
                            <td />
                            <td className="num">{fmtMoney(serviceTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="small">Detay bulunamadı.</div>
                    )}
                  </div>
                </details>
              </td>
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
        <div className="stat">
          <div className="label">Tahsil Edilemeyen Gelirler %</div>
          <div className="value">{fmtPct(k.uncollectableRevenuePct)}</div>
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
