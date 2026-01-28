//frontend/src/pages/ProfilePage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api";
import { useListSchools } from "../hooks/useListQueries";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/ui/Button";

export default function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const outlet = useOutletContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  // List of schools accessible to the current user.  This will be used
  // to display the schools the user is responsible for.  We fetch it
  // once on mount.  For principal users, this list will include only
  // the schools they have been assigned to; for other roles, it lists
  // all schools they can access (typically all schools in their country).
  const [assignedSchools, setAssignedSchools] = useState([]);
  const schoolsQuery = useListSchools({
    limit: 50,
    offset: 0,
    fields: "brief",
    order: "name:asc",
  });

  // Compute the list of schools to display.  Principals should see only
  // the schools they have been assigned to (via principalSchoolIds).  Other
  // roles see all accessible schools.  The list is derived from
  // assignedSchools fetched from the API.
  const schoolsToShow = useMemo(() => {
    const list = Array.isArray(assignedSchools) ? assignedSchools : [];
    const principalIds = auth.user?.principalSchoolIds;
    if (auth.user?.role === "principal" && Array.isArray(principalIds) && principalIds.length > 0) {
      // Filter by principalSchoolIds
      const idSet = new Set(principalIds.map((n) => Number(n)));
      return list.filter((s) => idSet.has(Number(s.id)));
    }
    return list;
  }, [assignedSchools, auth.user?.role, auth.user?.principalSchoolIds]);

  const permissionRows = useMemo(() => {
    const perms = Array.isArray(auth.user?.permissions) ? auth.user.permissions : [];
    const map = new Map();
    perms.forEach((p) => {
      const resource = String(p.resource || "");
      const action = String(p.action || "").toLowerCase();
      const scopeSchoolId = p.scope_school_id != null ? Number(p.scope_school_id) : null;
      const scopeCountryId = p.scope_country_id != null ? Number(p.scope_country_id) : null;
      const key = `${resource}::${scopeSchoolId ?? "null"}::${scopeCountryId ?? "null"}`;
      if (!map.has(key)) {
        map.set(key, {
          resource,
          scope_school_id: scopeSchoolId,
          scope_country_id: scopeCountryId,
          read: false,
          write: false,
        });
      }
      const entry = map.get(key);
      if (action === "read") entry.read = true;
      if (action === "write") entry.write = true;
    });
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.resource !== b.resource) {
        return a.resource.localeCompare(b.resource, "tr", { sensitivity: "base" });
      }
      const as = a.scope_school_id ?? -1;
      const bs = b.scope_school_id ?? -1;
      if (as !== bs) return as - bs;
      const ac = a.scope_country_id ?? -1;
      const bc = b.scope_country_id ?? -1;
      return ac - bc;
    });
    return list;
  }, [auth.user?.permissions]);

  const schoolNameById = useMemo(() => {
    const map = new Map();
    const list = Array.isArray(assignedSchools) ? assignedSchools : [];
    list.forEach((s) => {
      if (s && s.id != null) map.set(Number(s.id), s.name);
    });
    return map;
  }, [assignedSchools]);

  useEffect(() => {
    document.title = "Profile · Feasibility Studio";
  }, []);

  useEffect(() => {
    if (!outlet?.setHeaderMeta) return;
    // Pass centered flag to align the "Okul / Senaryo Değiştir" button consistently with other pages.
    outlet.setHeaderMeta({ title: "Profil", subtitle: "Şifre ve hesap bilgileri", centered: true });
    return () => outlet.clearHeaderMeta?.();
  }, [outlet]);

  // Keep assigned schools in sync with the cached query.
  useEffect(() => {
    const rows = schoolsQuery.data?.items;
    if (Array.isArray(rows)) {
      setAssignedSchools(rows);
    }
  }, [schoolsQuery.data]);

  const mustReset = useMemo(() => Boolean(auth.user?.must_reset_password), [auth.user?.must_reset_password]);

  const renderPermMark = (enabled) => (
    <span
      className={`perm-mark ${enabled ? "is-yes" : "is-no"}`}
      role="img"
      aria-label={enabled ? "Allowed" : "Not allowed"}
      title={enabled ? "Allowed" : "Not allowed"}
    >
      {enabled ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="perm-mark-icon">
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="perm-mark-icon">
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      )}
    </span>
  );

  async function handleChangePassword(e) {
    e.preventDefault();
    setStatus(null);

    if (!currentPassword || !newPassword) {
      setStatus({ type: "error", message: "Current and new password are required." });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }

    setLoading(true);
    const wasForced = mustReset;
    try {
      const data = await api.changePassword({ currentPassword, newPassword });
      auth.setSession(data);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ type: "success", message: "Password updated successfully." });
      if (wasForced) navigate("/schools", { replace: true });
    } catch (e2) {
      setStatus({ type: "error", message: e2.message || "Password update failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      {mustReset ? (
        <div className="card" style={{ marginTop: 12, borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div style={{ fontWeight: 700 }}>Şifre değiştirme gerekli</div>
          <div className="small" style={{ marginTop: 6 }}>
            Bu ilk girişiniz. Devam etmek için yeni bir şifre belirleyin.
          </div>
        </div>
      ) : null}

      {status ? (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderColor: status.type === "error" ? "#fecaca" : "#bbf7d0",
            background: status.type === "error" ? "#fff1f2" : "#f0fdf4",
          }}
        >
          {status.message}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Hesap</div>
        <div className="row">
          <input className="input" value={auth.user?.full_name || ""} disabled placeholder="Full name" />
          <input className="input" value={auth.user?.email || ""} disabled placeholder="Email" />
          <input className="input sm" value={auth.user?.role || ""} disabled placeholder="Role" />
        </div>
      </div>

      {/* Card to display the country and schools assigned to the user */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Assignments</div>
        <div className="row" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 600 }}>Country</div>
            <div>{auth.user?.country_name || auth.user?.country_code || "-"}</div>
          </div>
          <div style={{ flex: 2 }}>
            <div className="small" style={{ fontWeight: 600 }}>Responsible Schools</div>
            {schoolsToShow && schoolsToShow.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {schoolsToShow.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            ) : (
              <div>-</div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissions</div>
        {permissionRows.length === 0 ? (
          <div className="small">No permissions assigned.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Resource</th>
                <th style={{ textAlign: "center" }}>Read</th>
                <th style={{ textAlign: "center" }}>Write</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {permissionRows.map((row, idx) => {
                const schoolId = row.scope_school_id != null ? Number(row.scope_school_id) : null;
                const countryId = row.scope_country_id != null ? Number(row.scope_country_id) : null;
                let scopeLabel = "Global";
                if (schoolId != null && Number.isFinite(schoolId)) {
                  const name = schoolNameById.get(schoolId);
                  scopeLabel = name ? `School: ${name}` : `School: #${schoolId}`;
                } else if (countryId != null && Number.isFinite(countryId)) {
                  const code = auth.user?.country_code || auth.user?.country_name || "";
                  scopeLabel = code ? `Country: ${code}` : `Country: #${countryId}`;
                }
                return (
                  <tr key={`${row.resource}-${schoolId ?? "global"}-${countryId ?? "global"}-${idx}`}>
                    <td>{row.resource}</td>
                    <td style={{ textAlign: "center" }}>{renderPermMark(row.read)}</td>
                    <td style={{ textAlign: "center" }}>{renderPermMark(row.write)}</td>
                    <td>{scopeLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Şifre Değiştir</div>
        <form onSubmit={handleChangePassword}>
          <div className="row">
            <input
              className="input"
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              Update Password
            </Button>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            En az 8 karakter kullanın. Bu işlemi daha sonra herhangi bir zamanda değiştirebilirsiniz.
          </div>
        </form>
      </div>
    </div>
  );
}
