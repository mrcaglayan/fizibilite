//frontend/src/components/CapacityEditor.jsx

import React, { useMemo } from "react";
import NumberInput from "./NumberInput";
import {
  formatKademeLabel,
  getKademeDefinitions,
  normalizeKademeConfig,
  summarizeGradesByKademe,
} from "../utils/kademe";

const n0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";
};

const fmtPct = (v) => {
  if (!Number.isFinite(v)) return "";
  return `${(v * 100).toFixed(1)}%`;
};

function normalizePlanningGrades(input) {
  if (Array.isArray(input)) return { y1: input, y2: input, y3: input };
  if (input && typeof input === "object") {
    const years = input.years && typeof input.years === "object" ? input.years : input;
    const y1 = Array.isArray(years?.y1) ? years.y1 : [];
    const y2 = Array.isArray(years?.y2) ? years.y2 : y1;
    const y3 = Array.isArray(years?.y3) ? years.y3 : y1;
    return { y1, y2, y3 };
  }
  return { y1: [], y2: [], y3: [] };
}

function getYearLabel(baseYear, offset) {
  const y = Number.isFinite(Number(baseYear)) ? Number(baseYear) : null;
  if (y == null) return `${offset + 1}. YIL`;
  const a = y + offset;
  const b = y + offset + 1;
  return `${offset + 1}. YIL (${a}-${b})`;
}

function safeDiv(a, b) {
  const A = Number(a);
  const B = Number(b);
  if (!Number.isFinite(A) || !Number.isFinite(B) || B === 0) return null;
  return A / B;
}

export default function CapacityEditor({
  school,
  me,
  baseYear,
  kapasite,
  plannedGrades,
  currentGrades,
  kademeConfig,
  onChange,
  dirtyPaths,
  onDirty,
}) {
  const cap = kapasite && typeof kapasite === "object" ? kapasite : {};
  const kademeler = useMemo(() => normalizeKademeConfig(kademeConfig), [kademeConfig]);

  const kademeDefs = useMemo(() => getKademeDefinitions(), []);
  const activeKademeler = kademeDefs.filter((d) => kademeler?.[d.key]?.enabled);
  const visibleKademeler = activeKademeler.length ? activeKademeler : kademeDefs;

  // Students (derived from Norm/Grades)
  const planningByYear = useMemo(() => normalizePlanningGrades(plannedGrades), [plannedGrades]);

  const plannedByYear = useMemo(
    () => ({
      y1: summarizeGradesByKademe(planningByYear.y1, kademeler),
      y2: summarizeGradesByKademe(planningByYear.y2, kademeler),
      y3: summarizeGradesByKademe(planningByYear.y3, kademeler),
    }),
    [planningByYear, kademeler]
  );

  const current = useMemo(
    () => summarizeGradesByKademe(currentGrades, kademeler),
    [currentGrades, kademeler]
  );

  // Capacity storage: cap.byKademe[rowKey].caps = { cur, y1, y2, y3 }
  const byKademe = useMemo(() => {
    const src = cap.byKademe && typeof cap.byKademe === "object" ? cap.byKademe : {};
    const next = {};
    for (const lvl of visibleKademeler) {
      const row = src[lvl.key] && typeof src[lvl.key] === "object" ? src[lvl.key] : {};
      const caps = row.caps && typeof row.caps === "object" ? row.caps : row; // legacy-friendly
      next[lvl.key] = {
        caps: {
          cur: n0(caps?.cur),
          y1: n0(caps?.y1),
          y2: n0(caps?.y2),
          y3: n0(caps?.y3),
        },
      };
    }
    return next;
  }, [cap.byKademe, visibleKademeler]);

  const makePath = (suffix) => `inputs.kapasite.${suffix}`;
  const isDirty = (suffix) => (dirtyPaths ? dirtyPaths.has(makePath(suffix)) : false);
  const inputClass = (base, suffix) => base + (isDirty(suffix) ? " input-dirty" : "");

  const sumCap = (periodKey, srcByKademe = byKademe) => {
    let t = 0;
    for (const lvl of visibleKademeler) {
      t += n0(srcByKademe?.[lvl.key]?.caps?.[periodKey]);
    }
    return t;
  };

  const totals = {
    cur: sumCap("cur"),
    y1: sumCap("y1"),
    y2: sumCap("y2"),
    y3: sumCap("y3"),
  };

  const studentsTotals = {
    cur: n0(current?.total),
    y1: n0(plannedByYear?.y1?.total),
    y2: n0(plannedByYear?.y2?.total),
    y3: n0(plannedByYear?.y3?.total),
  };

  // Growth calculations (TOTAL)
  const delta = {
    y1: studentsTotals.y1 - studentsTotals.cur,
    y2: studentsTotals.y2 - studentsTotals.y1,
    y3: studentsTotals.y3 - studentsTotals.y2,
  };
  const growthRate = {
    y1: safeDiv(delta.y1, studentsTotals.cur),
    y2: safeDiv(delta.y2, studentsTotals.y1),
    y3: safeDiv(delta.y3, studentsTotals.y2),
  };

  const setCapCell = (lvlKey, periodKey, value) => {
    const nextVal = n0(value);

    const prevRow = byKademe?.[lvlKey] || { caps: { cur: 0, y1: 0, y2: 0, y3: 0 } };
    const nextRow = {
      ...prevRow,
      caps: { ...(prevRow.caps || {}), [periodKey]: nextVal },
    };

    const nextByKademe = { ...(byKademe || {}), [lvlKey]: nextRow };

    const nextTotals = {
      cur: sumCap("cur", nextByKademe),
      y1: sumCap("y1", nextByKademe),
      y2: sumCap("y2", nextByKademe),
      y3: sumCap("y3", nextByKademe),
    };

    const next = {
      ...cap,
      byKademe: nextByKademe,
      totals: nextTotals,
      years: { ...(cap.years || {}), y1: nextTotals.y1, y2: nextTotals.y2, y3: nextTotals.y3 },
    };

    onChange(next);
    onDirty?.(makePath(`byKademe.${lvlKey}.caps.${periodKey}`), nextVal);
  };

  const region = me?.region || "";
  const countryName = school?.country_name || me?.country_name || "";
  const campusName = school?.name || "";

  const headerCellStyle = {
    fontSize: 11,
    lineHeight: 1.1,
    fontWeight: 700,
    verticalAlign: "top",
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
  };

  const groupThStyle = {
    textAlign: "center",
    fontWeight: 800,
    fontSize: 12,
    paddingTop: 4,
    paddingBottom: 4,
  };

  const subThStyle = {
    textAlign: "center",
    fontWeight: 700,
    fontSize: 11,
    paddingTop: 3,
    paddingBottom: 3,
    lineHeight: 1.1,
  };

  const grayRowStyle = {
    fontSize: 11,
    background: "rgba(28, 93, 223, 0.16)",
    fontWeight: 700,
  };

  const renderPeriodCells = (lvlKey, periodKey, students) => {
    const capVal = n0(byKademe?.[lvlKey]?.caps?.[periodKey]);
    const util = capVal > 0 ? students / capVal : null;

    return (
      <>
        <td className="cell-count">
          <NumberInput
            className={inputClass("input xs kapInput", `byKademe.${lvlKey}.caps.${periodKey}`)}
            min="0"
            step="1"
            value={capVal}
            onChange={(value) => setCapCell(lvlKey, periodKey, value)}
          />
        </td>
        <td className="cell-count">{fmt0(students)}</td>
        <td className="cell-num">{util == null ? "" : fmtPct(util)}</td>
      </>
    );
  };

  const renderTotalsPeriod = (periodKey, students) => {
    const capVal = n0(totals?.[periodKey]);
    const util = capVal > 0 ? students / capVal : null;
    return (
      <>
        <td className="cell-count" style={{ fontWeight: 800 }}>
          {fmt0(capVal)}
        </td>
        <td className="cell-count" style={{ fontWeight: 800 }}>
          {fmt0(students)}
        </td>
        <td className="cell-num" style={{ fontWeight: 800 }}>
          {util == null ? "" : fmtPct(util)}
        </td>
      </>
    );
  };

  return (
    <div className="card">
      <div className="table-scroll">
        <style>{`
          .kapasiteExcelTable{
            width:100%;
            table-layout:fixed;
            border-collapse:collapse;
          }

          .kapasiteExcelTable th, .kapasiteExcelTable td{
            padding:3px 4px;
          }

          .kapasiteExcelTable thead th{
            white-space:normal;
            line-height:1.1;
            word-break:break-word;
          }

          .kapasiteExcelTable tbody td:first-child{
            white-space:nowrap;
          }

          /* center helper */
          .kapasiteExcelTable .center{
            text-align:center;
          }

          /* force override any global .num { text-align:right } */
          .kapasiteExcelTable td.center,
          .kapasiteExcelTable th.center,
          .kapasiteExcelTable td.num.center,
          .kapasiteExcelTable th.num.center {
            text-align: center !important;
          }

          /* keep numbers compact but centered */
          .kapasiteExcelTable td.num{
            white-space:nowrap;
          }

          .kapasiteExcelTable .kapInput{
            width:62px;
            max-width:62px;
            padding:2px 4px;
            text-align:center !important;
          }

          .kapasiteExcelTable tbody td:not(:first-child){
            text-align:center !important;
          }

          /* ===== Group separators (vertical) ===== */
          :root{
            --kap-sep: rgba(15, 23, 42, 0.22);
            --kap-band: rgba(2, 6, 23, 0.028); /* very light */
          }

          /* BODY has 13 columns: 1 label + 12 data
             groups: (2-4), (5-7), (8-10), (11-13) */

          /* group borders */
          .kapasiteExcelTable tbody td:nth-child(2),
          .kapasiteExcelTable tbody td:nth-child(5),
          .kapasiteExcelTable tbody td:nth-child(8),
          .kapasiteExcelTable tbody td:nth-child(11){
            border-left: 2px solid var(--kap-sep);
          }

          .kapasiteExcelTable tbody td:nth-child(4),
          .kapasiteExcelTable tbody td:nth-child(7),
          .kapasiteExcelTable tbody td:nth-child(10),
          .kapasiteExcelTable tbody td:nth-child(13){
            border-right: 2px solid var(--kap-sep);
          }

          /* HEADER 2nd row: 12 cells (because first col is rowSpan)
             groups: (1-3), (4-6), (7-9), (10-12) */
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(1),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(4),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(7),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(10){
            border-left: 2px solid var(--kap-sep);
          }

          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(3),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(6),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(9),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(12){
            border-right: 2px solid var(--kap-sep);
          }

          /* ===== Alternating banding by group (very light) =====
             Apply to columns of groups 2 and 4 only (like Excel banding) */
          .kapasiteExcelTable tbody td:nth-child(5),
          .kapasiteExcelTable tbody td:nth-child(6),
          .kapasiteExcelTable tbody td:nth-child(7),
          .kapasiteExcelTable tbody td:nth-child(11),
          .kapasiteExcelTable tbody td:nth-child(12),
          .kapasiteExcelTable tbody td:nth-child(13){
            background: var(--kap-band);
          }

          /* Header banding too (2nd row) */
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(4),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(5),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(6),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(10),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(11),
          .kapasiteExcelTable thead tr:nth-child(2) th:nth-child(12){
            background: var(--kap-band);
          }

          /* Growth rows: because we use colSpan=3, nth-child borders won't apply.
             Re-add group borders on the merged group-cells. */
          .kapasiteExcelTable tbody tr.kapGrowth td.kapG{
            border-left: 2px solid var(--kap-sep);
            border-right: 2px solid var(--kap-sep);
          }
        `}</style>

        <table className="table data-table kapasiteExcelTable">
          <colgroup>
            <col style={{ width: 210 }} />
            {Array.from({ length: 12 }).map((_, i) => (
              <col key={i} style={{ width: i % 3 === 0 ? 70 : i % 3 === 1 ? 78 : 70 }} />
            ))}
          </colgroup>

          <thead>
            <tr className="row-group-start">
              <th rowSpan={2} style={headerCellStyle}>
                <div>BÖLGE: {region || "-"}</div>
                <div>ÜLKE: {countryName || "-"}</div>
                <div>KAMPÜS: {campusName || "-"}</div>
              </th>

              <th
                colSpan={3}
                style={{ ...groupThStyle, borderLeft: "2px solid rgba(15,23,42,0.22)" }}
              >
                Mevcut veya Ön Kayıt
              </th>
              <th
                colSpan={3}
                style={{ ...groupThStyle, borderLeft: "2px solid rgba(15,23,42,0.22)" }}
              >
                {getYearLabel(baseYear, 0)}
              </th>
              <th
                colSpan={3}
                style={{ ...groupThStyle, borderLeft: "2px solid rgba(15,23,42,0.22)" }}
              >
                {getYearLabel(baseYear, 1)}
              </th>
              <th
                colSpan={3}
                style={{
                  ...groupThStyle,
                  borderLeft: "2px solid rgba(15,23,42,0.22)",
                  borderRight: "2px solid rgba(15,23,42,0.22)",
                }}
              >
                {getYearLabel(baseYear, 2)}
              </th>
            </tr>

            <tr>
              <th style={subThStyle}>Kapasite</th>
              <th style={subThStyle}>Öğrenci Sayısı</th>
              <th style={subThStyle}>Kapasite Kullanım Oranı</th>

              <th style={subThStyle}>Kapasite</th>
              <th style={subThStyle}>Öğrenci Sayısı</th>
              <th style={subThStyle}>Kapasite Kullanım Oranı</th>

              <th style={subThStyle}>Kapasite</th>
              <th style={subThStyle}>Öğrenci Sayısı</th>
              <th style={subThStyle}>Kapasite Kullanım Oranı</th>

              <th style={subThStyle}>Kapasite</th>
              <th style={subThStyle}>Öğrenci Sayısı</th>
              <th style={subThStyle}>Kapasite Kullanım Oranı</th>
            </tr>
          </thead>

          <tbody>
            {/* Growth rows (TOTAL) */}
            <tr className="kapGrowth row-group-start" style={grayRowStyle}>
              <td className="cell-count">Bir Önceki Yıla Göre Öğrenci Artışı</td>

              <td colSpan={3} className="cell-count kapG kapG0"></td>
              <td colSpan={3} className="cell-count kapG kapG1">{fmt0(delta.y1)}</td>
              <td colSpan={3} className="cell-count kapG kapG2">{fmt0(delta.y2)}</td>
              <td colSpan={3} className="cell-count kapG kapG3">{fmt0(delta.y3)}</td>
            </tr>

            <tr className="kapGrowth" style={grayRowStyle}>
              <td className="cell-count">1&apos;nci Yıla Göre Öğrenci Artış Oranı</td>

              <td colSpan={3} className="cell-pct kapG kapG0"></td>
              <td colSpan={3} className="cell-pct kapG kapG1">
                {growthRate.y1 == null ? "" : fmtPct(growthRate.y1)}
              </td>
              <td colSpan={3} className="cell-pct kapG kapG2">
                {growthRate.y2 == null ? "" : fmtPct(growthRate.y2)}
              </td>
              <td colSpan={3} className="cell-pct kapG kapG3">
                {growthRate.y3 == null ? "" : fmtPct(growthRate.y3)}
              </td>
            </tr>

            {/* Kademe rows */}
            {visibleKademeler.map((lvl, idx) => {
              const label = formatKademeLabel(lvl.label, kademeler, lvl.key);

              const studentsCur = n0(current?.[lvl.key]);
              const studentsY1 = n0(plannedByYear?.y1?.[lvl.key]);
              const studentsY2 = n0(plannedByYear?.y2?.[lvl.key]);
              const studentsY3 = n0(plannedByYear?.y3?.[lvl.key]);

              return (
                <tr key={lvl.key} className={idx === 0 ? "row-group-start" : ""}>
                  <td className="nowrap">{label}</td>

                  {renderPeriodCells(lvl.key, "cur", studentsCur)}
                  {renderPeriodCells(lvl.key, "y1", studentsY1)}
                  {renderPeriodCells(lvl.key, "y2", studentsY2)}
                  {renderPeriodCells(lvl.key, "y3", studentsY3)}
                </tr>
              );
            })}

            {/* TOTAL */}
            <tr>
              <td style={{ fontWeight: 800, textAlign:"left" }}>TOPLAM</td>

              {renderTotalsPeriod("cur", studentsTotals.cur)}
              {renderTotalsPeriod("y1", studentsTotals.y1)}
              {renderTotalsPeriod("y2", studentsTotals.y2)}
              {renderTotalsPeriod("y3", studentsTotals.y3)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Not: “Mevcut Öğrenci Sayısı” otomatik olarak Norm/Mevcut Dönem verilerinden hesaplanır.
      </div>
    </div>
  );
}
