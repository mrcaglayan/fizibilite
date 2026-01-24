import React from "react";
import { useOutletContext } from "react-router-dom";
import IncomeEditor from "../../components/IncomeEditor";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

function pctValue(tab) {
  const n = Number(tab?.pct);
  return Number.isFinite(n) ? n : 0;
}

export default function GelirlerPage() {
  const { inputs, setField, baseYear, inputCurrencyCode, dirtyPaths, markDirty, progMap } =
    useOutletContext();

  if (!inputs) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <TabProgressHeatmap
        pct={pctValue(progMap?.gelirler)}
        title="Gelirler"
        missingLines={progMap?.gelirler?.missingLines}
        missingPreview={progMap?.gelirler?.missingPreview}
      >
        <IncomeEditor
          gelirler={inputs.gelirler}
          temelBilgiler={inputs.temelBilgiler}
          baseYear={baseYear}
          gradesYears={inputs.gradesYears}
          grades={inputs.gradesYears?.y1 || inputs.grades}
          discounts={inputs.discounts}
          currencyCode={inputCurrencyCode}
          onChange={(v) => {
            setField("gelirler", v);
          }}
          dirtyPaths={dirtyPaths}
          onDirty={markDirty}
        />
      </TabProgressHeatmap>
    </div>
  );
}
