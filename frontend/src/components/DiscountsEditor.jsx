//frontend/src/components/DiscountsEditor.jsx

import React, { useMemo, useState } from "react";
import NumberInput from "./NumberInput";

export default function DiscountsEditor({ discounts, onChange }) {
  const list = Array.isArray(discounts) ? discounts : [];
  const [name, setName] = useState("");
  const [mode, setMode] = useState("percent");
  const [value, setValue] = useState(0);
  const [ratio, setRatio] = useState(0);

  const normalized = useMemo(() => list.map((d, i) => ({
    ...d,
    id: d.id || `${i}-${d.name}-${d.mode}`
  })), [list]);

  function add() {
    const n = name.trim();
    if (!n) return;
    const next = [...list, { name: n, mode, value: Number(value), ratio: Number(ratio) }];
    onChange(next);
    setName("");
    setMode("percent");
    setValue(0);
    setRatio(0);
  }

  function update(idx, field, val) {
    const next = list.map((d, i) => {
      if (i !== idx) return d;
      return { ...d, [field]: val };
    });
    onChange(next);
  }

  function remove(idx) {
    const next = list.filter((_, i) => i !== idx);
    onChange(next);
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Discount Categories (Temel Bilgiler)</div>
      <div className="small">Discounts apply to tuition only. Ratio is the share of students receiving this discount (0..1).</div>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Name (Scholarship, Sibling...)"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <select className="input sm" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="percent">Percent</option>
          <option value="fixed">Fixed (per student)</option>
        </select>
        <NumberInput className="input sm" min="0" step="0.01"
          value={value} onChange={(next) => setValue(next)}
          placeholder={mode === "percent" ? "0.15" : "100"}
        />
        <NumberInput className="input sm" min="0" max="1" step="0.01"
          value={ratio} onChange={(next) => setRatio(next)}
          placeholder="0.20"
        />
        <button className="btn primary" onClick={add}>Add</button>
      </div>

      <table className="table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Mode</th>
            <th>Value</th>
            <th>Ratio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {normalized.length === 0 ? (
            <tr><td colSpan="5" className="small">No discounts yet.</td></tr>
          ) : normalized.map((d, idx) => (
            <tr key={d.id}>
              <td>
                <input className="input" value={d.name}
                  onChange={(e) => update(idx, "name", e.target.value)}
                />
              </td>
              <td>
                <select className="input sm" value={d.mode}
                  onChange={(e) => update(idx, "mode", e.target.value)}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
              </td>
              <td>
                <NumberInput className="input sm" min="0" step="0.01" value={d.value}
                  onChange={(next) => update(idx, "value", Number(next))}
                />
              </td>
              <td>
                <NumberInput className="input sm" min="0" max="1" step="0.01" value={d.ratio}
                  onChange={(next) => update(idx, "ratio", Number(next))}
                />
              </td>
              <td>
                <button className="btn danger" onClick={() => remove(idx)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
