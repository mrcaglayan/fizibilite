import React from "react";
import { useOutletContext } from "react-router-dom";
import NormConfigEditor from "../../components/NormConfigEditor";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

export default function NormPage() {
  const {
    norm,
    setNorm,
    inputs,
    handlePlanningGradesChange,
    setField,
    programType,
    dirtyPaths,
    markDirty,
    normAvgPct,
    normMissingLines,
  } = useOutletContext();

  const missingPreview = Array.isArray(normMissingLines) ? normMissingLines.join(" / ") : "";

  return (
    <div style={{ marginTop: 12 }}>
      <TabProgressHeatmap
        pct={normAvgPct}
        title="Norm"
        missingLines={normMissingLines}
        missingPreview={missingPreview}
      >
        <NormConfigEditor
          value={norm || null}
          onChange={(v) => {
            setNorm((prev) => ({ ...(prev || {}), ...v }));
          }}
          lastUpdatedAt={norm?.updatedAt}
          planningGrades={inputs?.gradesYears || inputs?.grades}
          currentGrades={inputs?.gradesCurrent}
          onPlanningGradesChange={inputs ? handlePlanningGradesChange : null}
          onCurrentGradesChange={inputs ? (v) => setField("gradesCurrent", v) : null}
          kademeConfig={inputs?.temelBilgiler?.kademeler}
          programType={programType}
          dirtyPaths={dirtyPaths}
          onDirty={markDirty}
        />
      </TabProgressHeatmap>
    </div>
  );
}
