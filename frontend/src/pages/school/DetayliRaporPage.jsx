import React from "react";
import { useOutletContext } from "react-router-dom";
import DetailedReportView from "../../components/DetailedReportView";

export default function DetayliRaporPage() {
  const {
    detailedReportMode,
    setDetailedReportMode,
    selectedScenario,
    reportCurrency,
    setReportCurrency,
    reportExportRef,
    school,
    inputs,
    report,
    prevReport,
    prevScenarioMeta,
    programType,
  } = useOutletContext();

  const showCurrencyTabs =
    selectedScenario?.input_currency === "LOCAL" &&
    Number(selectedScenario?.fx_usd_to_local) > 0 &&
    selectedScenario?.local_currency_code;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className={detailedReportMode === "onepager" ? "btn primary" : "btn"}
              onClick={() => setDetailedReportMode("onepager")}
            >
              Tek Sayfa (Ozet)
            </button>
            <button
              className={detailedReportMode === "detailed" ? "btn primary" : "btn"}
              onClick={() => setDetailedReportMode("detailed")}
            >
              Detayli (RAPOR)
            </button>
            {showCurrencyTabs ? (
              <div className="tabs">
                <button
                  type="button"
                  className={`tab ${reportCurrency === "usd" ? "active" : ""}`}
                  onClick={() => setReportCurrency("usd")}
                >
                  USD
                </button>
                <button
                  type="button"
                  className={`tab ${reportCurrency === "local" ? "active" : ""}`}
                  onClick={() => setReportCurrency("local")}
                >
                  {selectedScenario.local_currency_code}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={reportExportRef} data-report-export="1" className="report-export">
        <DetailedReportView
          mode={detailedReportMode}
          school={school}
          scenario={selectedScenario}
          inputs={inputs}
          report={report}
          prevReport={prevReport}
          prevCurrencyMeta={prevScenarioMeta}
          reportCurrency={reportCurrency}
          currencyMeta={selectedScenario}
          programType={programType}
        />
      </div>
    </div>
  );
}
