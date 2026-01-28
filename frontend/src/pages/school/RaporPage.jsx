import React from "react";
import { useOutletContext } from "react-router-dom";
import ReportView from "../../components/ReportView";

export default function RaporPage() {
  const {
    report,
    selectedScenario,
    reportCurrency,
    setReportCurrency,
    reportMode,
    reportModeLoading,
    handleReportModeChange,
    reportExportRef,
  } =
    useOutletContext();

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div className="tabs">
          <button
            type="button"
            className={`tab ${reportMode === "original" ? "active" : ""}`}
            onClick={() => handleReportModeChange?.("original")}
            disabled={reportModeLoading}
          >
            Original
          </button>
          <button
            type="button"
            className={`tab ${reportMode === "distributed" ? "active" : ""}`}
            onClick={() => handleReportModeChange?.("distributed")}
            disabled={reportModeLoading}
          >
            Distributed
          </button>
        </div>
        {reportModeLoading ? <div className="small muted">Yükleniyor...</div> : null}
      </div>
      <div ref={reportExportRef} data-report-export="1" className="report-export">
        <ReportView
          results={report}
          currencyMeta={selectedScenario}
          reportCurrency={reportCurrency}
          onReportCurrencyChange={setReportCurrency}
        />
      </div>
    </div>
  );
}
