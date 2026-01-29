import React, { useState } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";

/**
 * Modal for creating a new user in the admin context.
 *
 * Admins can assign a role (User, HR, Principal, Manager, Accountant, Admin)
 * and optionally assign the user to a country. A temporary password is
 * required. Upon successful creation, the modal will close and the
 * provided onCreated callback will be fired to refresh parent state.
 *
 * Props:
 * - show (boolean): whether the modal is visible
 * - onClose (function): called when the modal should close
 * - onCreated (function): called after a user is successfully created
 * - countries (array): list of countries { id, name } for the country selector
 */
export default function AdminCreateUserModal({ show, onClose, onCreated, countries = [] }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [countryId, setCountryId] = useState("");
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
    // Validate role
    const allowedRoles = ["user", "hr", "principal", "manager", "accountant", "admin"];
    if (!allowedRoles.includes(role)) {
      toast.error("Invalid role");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        full_name: fullName ? fullName.trim() : null,
        email: trimmedEmail,
        password,
        role,
      };
      if (countryId && countryId !== "unassigned") {
        payload.country_id = Number(countryId);
      }
      await api.createUser(payload);
      toast.success("User created");
      // Reset form fields
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("user");
      setCountryId("");
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
          Enter details for the new user. A temporary password must be at least 8 characters.
        </div>
        <form onSubmit={handleSubmit}>
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
              <option value="user">User</option>
              <option value="hr">HR</option>
              <option value="principal">Principal</option>
              <option value="manager">Manager</option>
              <option value="accountant">Accountant</option>
              <option value="admin">Admin</option>
            </select>
            <select
              className="input full"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}