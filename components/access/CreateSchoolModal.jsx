import React, { useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";

/**
 * Modal for creating a new school. A school belongs to the manager's country.
 *
 * Props:
 * - show: whether to show the modal
 * - onClose: function to close the modal
 * - onCreated: function called after a school is successfully created
 */
export default function CreateSchoolModal({ show, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("School name is required");
      return;
    }
    setLoading(true);
    try {
      await api.createSchool({ name: trimmed });
      toast.success("School created");
      setName("");
      onCreated?.();
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
          Enter the name of the new school. Schools are created within your country.
        </div>
        <input
          className="input full"
          placeholder="School name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create School"}
          </button>
        </div>
      </div>
    </div>
  );
}