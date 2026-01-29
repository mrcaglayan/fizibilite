import React, { useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";

/**
 * Modal for creating a new user (Principal or HR).
 *
 * Props:
 * - show (boolean): whether the modal is visible
 * - onClose (function): called when the modal should close
 * - onCreated (function): called after a user is successfully created
 */
export default function CreateUserModal({ show, onClose, onCreated }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("principal");
  const [loading, setLoading] = useState(false);

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error("Email and password are required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!["principal", "hr"].includes(role)) {
      toast.error("Role must be Principal or HR");
      return;
    }
    setLoading(true);
    try {
      await api.managerCreateUser({
        full_name: fullName ? fullName.trim() : null,
        email: trimmedEmail,
        password,
        role,
      });
      toast.success("User created");
      // Reset form fields
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("principal");
      onCreated?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          // Prevent backdrop click from closing when clicking inside modal
          e.stopPropagation();
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Create User</h2>
        <div className="small" style={{ marginBottom: 12 }}>
          Enter details for the new user. Temporary password must be at least 8 characters.
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            className="input full"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className="input full"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input full"
            placeholder="Temporary password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <select
            className="input full"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="principal">Principal</option>
            <option value="hr">HR</option>
          </select>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}