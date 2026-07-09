import React from "react";
import { useOutletContext } from "react-router-dom";
import ExpensesEditor from "../../components/ExpensesEditor";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

export default function GiderlerPage() {
  const {
    inputs,
    setField,
    baseYear,
    inputCurrencyCode,
    dirtyPaths,
    markDirty,
    uiScopeKey,
    expensesAvgPct,
    expensesMissingLines,

  } = useOutletContext();

  if (!inputs) return null;

  const missingPreview = Array.isArray(expensesMissingLines)
    ? expensesMissingLines.join(" / ")
    : "";



  return (
    <div style={{ marginTop: 12 }}>

      <TabProgressHeatmap
        pct={expensesAvgPct}
        title="Giderler"
        missingLines={expensesMissingLines}
        missingPreview={missingPreview}
      >
        <ExpensesEditor
          baseYear={baseYear}
          giderler={inputs.giderler}
          temelBilgiler={inputs.temelBilgiler}
          ik={inputs.ik}
          grades={inputs.grades}
          gelirler={inputs.gelirler}
          discounts={inputs.discounts}
          currencyCode={inputCurrencyCode}
          onDiscountsChange={(v) => {
            setField("discounts", v);
          }}
          onChange={(v) => {
            setField("giderler", v);
          }}
          dirtyPaths={dirtyPaths}
          onDirty={markDirty}
          uiScopeKey={uiScopeKey}
        />
      </TabProgressHeatmap>
    </div>
  );
}
