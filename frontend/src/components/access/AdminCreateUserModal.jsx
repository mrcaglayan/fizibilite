import React, { useEffect, useState } from "react";
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
  const [schoolId, setSchoolId] = useState("");
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (role !== "principal") {
      setSchoolId("");
      setSchools([]);
      return;
    }
    if (!countryId) {
      setSchoolId("");
      setSchools([]);
      return;
    }
    setSchoolId("");
    setSchools([]);
    let active = true;
    setSchoolsLoading(true);
    (async () => {
      try {
        const rows = await api.adminListCountrySchools(countryId);
        const list = Array.isArray(rows) ? rows : rows?.items && Array.isArray(rows.items) ? rows.items : [];
        if (active) {
          setSchools(list);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setSchools([]);
          toast.error(err?.message || "Failed to load schools");
        }
      } finally {
        if (active) setSchoolsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [show, role, countryId]);

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
    if (role === "principal" && !countryId) {
      toast.error("Country is required for principals");
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
      const created = await api.createUser(payload);
      if (role === "principal" && schoolId) {
        const schoolIdNum = Number(schoolId);
        if (Number.isFinite(schoolIdNum)) {
          try {
            const existing = await api.adminGetSchoolPrincipals(schoolIdNum);
            const existingIds = Array.isArray(existing)
              ? existing.map((u) => Number(u.id)).filter(Number.isFinite)
              : [];
            const newId = Number(created?.id);
            if (Number.isFinite(newId) && !existingIds.includes(newId)) {
              existingIds.push(newId);
            }
            await api.adminSetSchoolPrincipals(schoolIdNum, { userIds: existingIds });
          } catch (err) {
            console.error(err);
            toast.error(err?.message || "Failed to assign principal to school");
          }
        }
      }
      toast.success("User created");
      // Reset form fields
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("user");
      setCountryId("");
      setSchoolId("");
      setSchools([]);
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
              <option value="">
                {role === "principal" ? "Select country (required)" : "Unassigned"}
              </option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {role === "principal" ? (
              <select
                className="input full"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={!countryId || schoolsLoading}
              >
                <option value="">
                  {schoolsLoading ? "Loading schools..." : "Optional: assign to a school"}
                </option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}
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
