import React from "react";
import { useOutletContext } from "react-router-dom";
import CapacityEditor from "../../components/CapacityEditor";
import TabProgressHeatmap from "../../components/ui/TabProgressHeatmap";

function pctValue(tab) {
  const n = Number(tab?.pct);
  return Number.isFinite(n) ? n : 0;
}

export default function KapasitePage() {
  const {
    inputs,
    setField,
    school,
    me,
    baseYear,
    programType,
    dirtyPaths,
    markDirty,
    progMap,

  } = useOutletContext();

  if (!inputs) return null;



  return (
    <div style={{ marginTop: 12 }}>

      <TabProgressHeatmap
        pct={pctValue(progMap?.kapasite)}
        title="Kapasite"
        missingLines={progMap?.kapasite?.missingLines}
        missingPreview={progMap?.kapasite?.missingPreview}
      >
        <CapacityEditor
          school={school}
          me={me}
          baseYear={baseYear}
          kapasite={inputs.kapasite}
          plannedGrades={inputs.gradesYears || inputs.grades}
          currentGrades={inputs.gradesCurrent}
          kademeConfig={inputs.temelBilgiler?.kademeler}
          programType={programType}
          onChange={(v) => {
            setField("kapasite", v);
          }}
          dirtyPaths={dirtyPaths}
          onDirty={markDirty}
        />
      </TabProgressHeatmap>
    </div>
  );
}
