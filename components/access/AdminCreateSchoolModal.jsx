import React, { useState } from "react";
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
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!countryId) {
      toast.error("Country is required");
      return;
    }
    if (!trimmed) {
      toast.error("School name is required");
      return;
    }
    setLoading(true);
    try {
      await api.adminCreateCountrySchool(countryId, { name: trimmed });
      toast.success("School created");
      setCountryId("");
      setName("");
      onCreated?.(countryId);
      onClose?.();
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
          Choose a country and enter the name of the new school.
        </div>
        <form onSubmit={handleSubmit}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select
              className="input full"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">Select country…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="input full"
              placeholder="School name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Creating..." : "Create School"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}