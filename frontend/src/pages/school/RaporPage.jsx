import React from "react";
import { useOutletContext } from "react-router-dom";
import ReportView from "../../components/ReportView";

export default function RaporPage() {
  const { report, selectedScenario, reportCurrency, setReportCurrency, reportExportRef } =
    useOutletContext();

  return (
    <div style={{ marginTop: 12 }}>
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
