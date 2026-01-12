//frontend/src/components/GradesEditor.jsx

import React from "react";
import NumberInput from "./NumberInput";

const GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/**
 * GradesEditor
 *
 * Excel-like readable layout:
 *   - Grades in the header
 *   - Left side rows:
 *       1) Şube Sayısı
 *       2) Öğrenci / Şube
 *       3) Toplam Öğrenci (auto)
 *
 * Props
 * - grades: [{ grade, branchCount, studentsPerBranch }]
 * - onChange(nextGrades)
 * - title, subtitle (optional)
 * - layout: "matrix" | "rows"  (rows = legacy)
 */
export default function GradesEditor({
  grades,
  onChange,
  title = "Sınıf / Şube Bilgileri",
  subtitle = "Her sınıf için şube sayısı ve şube başı öğrenci sayısını girin.",
  layout = "matrix",
}) {
  const data = Array.isArray(grades) ? grades : [];

  const getRow = (g) => data.find((x) => String(x.grade) === g) || { grade: g, branchCount: 0, studentsPerBranch: 0 };

  function setField(grade, field, value) {
    const next = GRADES.map((g) => {
      const row = getRow(g);
      if (g !== grade) return row;
      const n = value === "" ? 0 : Number(value);
      return { ...row, [field]: Number.isFinite(n) ? n : 0 };
    });
    onChange(next);
  }

  const gradeTotals = GRADES.map((g) => {
    const r = getRow(g);
    const bc = Number(r.branchCount || 0);
    const spb = Number(r.studentsPerBranch || 0);
    return { grade: g, branchCount: bc, studentsPerBranch: spb, total: bc * spb };
  });

  const totalStudents = gradeTotals.reduce((s, r) => s + (Number.isFinite(r.total) ? r.total : 0), 0);

  // --- Legacy (rows per grade) ---
  if (layout === "rows") {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{title}</div>
            <div className="small">{subtitle}</div>
          </div>
          <div className="badge">Toplam Öğrenci: {totalStudents.toFixed(0)}</div>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Sınıf</th>
              <th>Şube</th>
              <th>Öğrenci / Şube</th>
              <th>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {gradeTotals.map((r) => (
              <tr key={r.grade}>
                <td>{r.grade}</td>
                <td>
                  <NumberInput className="input sm" min="0" value={r.branchCount}
                    onChange={(value) => setField(r.grade, "branchCount", value)}
                  />
                </td>
                <td>
                  <NumberInput className="input sm" min="0" value={r.studentsPerBranch}
                    onChange={(value) => setField(r.grade, "studentsPerBranch", value)}
                  />
                </td>
                <td>{Number(r.total || 0).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // --- Matrix (requested) ---
  const cellStyle = { minWidth: 60, textAlign: "center" };
  const rowHeadStyle = { position: "sticky", left: 0, background: "white", zIndex: 1, minWidth: 160 };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div className="small">{subtitle}</div>
        </div>
        <div className="badge">Toplam Öğrenci: {totalStudents.toFixed(0)}</div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="table" style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th style={{ ...rowHeadStyle, textAlign: "left" }}> </th>
              {GRADES.map((g) => (
                <th key={g} style={cellStyle}>{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...rowHeadStyle, fontWeight: 700 }}>Şube Sayısı</td>
              {gradeTotals.map((r) => (
                <td key={r.grade} style={cellStyle}>
                  <NumberInput
                    className="input sm"
                   
                    min="0"
                    value={r.branchCount}
                    onChange={(value) => setField(r.grade, "branchCount", value)}
                    style={{ textAlign: "center" }}
                  />
                </td>
              ))}
            </tr>

            <tr>
              <td style={{ ...rowHeadStyle, fontWeight: 700 }}>Öğrenci / Şube</td>
              {gradeTotals.map((r) => (
                <td key={r.grade} style={cellStyle}>
                  <NumberInput
                    className="input sm"
                   
                    min="0"
                    value={r.studentsPerBranch}
                    onChange={(value) => setField(r.grade, "studentsPerBranch", value)}
                    style={{ textAlign: "center" }}
                  />
                </td>
              ))}
            </tr>

            <tr>
              <td style={{ ...rowHeadStyle, fontWeight: 800 }}>Toplam Öğrenci</td>
              {gradeTotals.map((r) => (
                <td key={r.grade} style={{ ...cellStyle, fontWeight: 800, background: "rgba(15, 23, 42, 0.03)" }}>
                  {Number(r.total || 0).toFixed(0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}