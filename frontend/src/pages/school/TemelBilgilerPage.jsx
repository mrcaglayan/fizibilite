import React from "react";
import { useOutletContext } from "react-router-dom";
import TemelBilgilerEditor from "../../components/TemelBilgilerEditor";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

function pctValue(tab) {
  const n = Number(tab?.pct);
  return Number.isFinite(n) ? n : 0;
}

export default function TemelBilgilerPage() {
  const {
    inputs,
    setField,
    school,
    me,
    baseYear,
    prevReport,
    prevScenarioMeta,
    dirtyPaths,
    programType,
    inputCurrencyCode,
    selectedScenario,
    reportCurrency,
    markDirty,
    progMap,
  } = useOutletContext();

  if (!inputs) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <TabProgressHeatmap
        pct={pctValue(progMap?.temelBilgiler)}
        title="Temel Bilgiler"
        missingLines={progMap?.temelBilgiler?.missingLines}
        missingPreview={progMap?.temelBilgiler?.missingPreview}
      >
        <TemelBilgilerEditor
          value={inputs.temelBilgiler}
          onChange={(v) => setField("temelBilgiler", v)}
          school={school}
          me={me}
          baseYear={baseYear}
          kapasite={inputs.kapasite}
          gradesCurrent={inputs.gradesCurrent}
          ik={inputs.ik}
          prevReport={prevReport}
          prevCurrencyMeta={prevScenarioMeta}
          dirtyPaths={dirtyPaths}
          programType={programType}
          currencyCode={inputCurrencyCode}
          isScenarioLocal={selectedScenario?.input_currency === "LOCAL"}
          reportCurrency={reportCurrency}
          currencyMeta={{
            input_currency: selectedScenario?.input_currency,
            fx_usd_to_local: selectedScenario?.fx_usd_to_local,
            local_currency_code: selectedScenario?.local_currency_code,
          }}
          onDirty={markDirty}
        />
      </TabProgressHeatmap>
    </div>
  );
}
