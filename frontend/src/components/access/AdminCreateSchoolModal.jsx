import React, { useMemo, useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";

/**
 * Modal for creating a new school within a selected country.
 *
 * Admins must choose a country to assign the school to. After successful
 * creation, the modal closes and the parent can refresh the schools list.
 *
 * Props:
 * - show (boolean): whether the modal is visible
 * - onClose (function): called when the modal should close
 * - onCreated (function): called after a school is successfully created
 * - countries (array): list of countries { id, name }
 */
export default function AdminCreateSchoolModal({ show, onClose, onCreated, countries = [] }) {
  const [countryId, setCountryId] = useState("");
  const [schoolRows, setSchoolRows] = useState([""]);
  const [loading, setLoading] = useState(false);
  const createCount = useMemo(
    () => schoolRows.reduce((count, row) => (String(row || "").trim() ? count + 1 : count), 0),
    [schoolRows]
  );

  if (!show) return null;

  const updateRow = (index, value) => {
    setSchoolRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addRow = () => {
    setSchoolRows((prev) => [...prev, ""]);
  };

  const removeRow = (index) => {
    setSchoolRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawNames = schoolRows.map((row) => String(row || "").trim()).filter(Boolean);
    const names = Array.from(new Set(rawNames));
    if (!countryId) {
      toast.error("Country is required");
      return;
    }
    if (!names.length) {
      toast.error("At least one school name is required");
      return;
    }
    setLoading(true);
    const errors = [];
    let created = 0;
    try {
      for (const name of names) {
        try {
          await api.adminCreateCountrySchool(countryId, { name });
          created += 1;
        } catch (err) {
          errors.push({ name, message: err?.message || "Failed to create school" });
        }
      }
      if (created > 0) {
        onCreated?.(countryId);
      }
      if (errors.length) {
        toast.error(`${errors.length} of ${names.length} schools failed`);
        setSchoolRows(errors.map((err) => err.name));
      } else {
        toast.success(`${created} schools created`);
        setCountryId("");
        setSchoolRows([""]);
        onClose?.();
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create school");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Create School</h2>
        <div className="small" style={{ marginBottom: 12 }}>
          Choose a country and enter one or more school names.
        </div>
        <form onSubmit={handleSubmit}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select
              className="input full"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select country…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {schoolRows.map((row, idx) => (
              <div key={`school-row-${idx}`} className="row" style={{ gap: 8 }}>
                <input
                  className="input full"
                  placeholder={`School name #${idx + 1}`}
                  value={row}
                  onChange={(e) => updateRow(idx, e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => removeRow(idx)}
                  disabled={loading || schoolRows.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <button type="button" className="btn" onClick={addRow} disabled={loading}>
              Add row
            </button>
            <div className="small" style={{ color: "#6b7280" }}>
              Add one school per row.
            </div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading
                ? "Creating..."
                : createCount > 1
                  ? `Create ${createCount} schools`
                  : "Create school"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
