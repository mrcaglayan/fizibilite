import React from "react";
import { useOutletContext } from "react-router-dom";
import HREditorIK from "../../components/HREditorIK";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

function pctValue(tab) {
  const n = Number(tab?.pct);
  return Number.isFinite(n) ? n : 0;
}

export default function IKPage() {
  const {
    inputs,
    setField,
    programType,
    inputCurrencyCode,
    dirtyPaths,
    markDirty,
    uiScopeKey,
    handleIkSalaryComputed,
    progMap,
  } = useOutletContext();

  if (!inputs) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <TabProgressHeatmap
        pct={pctValue(progMap?.ik)}
        title="IK / HR"
        missingLines={progMap?.ik?.missingLines}
        missingPreview={progMap?.ik?.missingPreview}
      >
        <HREditorIK
          value={inputs.ik}
          kademeConfig={inputs.temelBilgiler?.kademeler}
          currencyCode={inputCurrencyCode}
          programType={programType}
          temelBilgiler={inputs.temelBilgiler}
          onChange={(v) => {
            setField("ik", v);
          }}
          onSalaryComputed={handleIkSalaryComputed}
          dirtyPaths={dirtyPaths}
          onDirty={markDirty}
          uiScopeKey={uiScopeKey}
        />
      </TabProgressHeatmap>
    </div>
  );
}
