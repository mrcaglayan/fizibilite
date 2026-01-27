// frontend/src/pages/ManagePermissionsPage.jsx

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import { can } from "../utils/permissions";
import { toast } from "react-toastify";
import { useOutletContext } from "react-router-dom";
import PermissionsTable from "../components/permissions/PermissionsTable";

/**
 * ManagePermissionsPage allows users with the manage_permissions permission to
 * view and update roles and permissions for users within their assigned
 * country.  Managers can assign user, HR, and principal roles but are not
 * allowed to grant the manager or admin roles.  They can also grant
 * resource-level read/write permissions scoped to country or specific
 * schools.  This page is a simplified subset of the Admin page tailored
 * for managers.
 */
export default function ManagePermissionsPage() {
  const auth = useAuth();
  const outlet = useOutletContext();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [permissionsCatalog, setPermissionsCatalog] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionSelections, setPermissionSelections] = useState({});
  const [permissionScopes, setPermissionScopes] = useState({});
  const [userSchools, setUserSchools] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  // State for school principal assignments
  const [principalAssignments, setPrincipalAssignments] = useState({});
  const [loadingPrincipals, setLoadingPrincipals] = useState(false);
  const [savingPrincipals, setSavingPrincipals] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("principal");
  const [creatingUser, setCreatingUser] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [creatingSchool, setCreatingSchool] = useState(false);

  // Set the header meta on mount so that the top bar displays an appropriate
  // title and subtitle.  Clear the header meta on unmount to avoid
  // persisting it when navigating away.  Without this, the default
  // header may use stale values from previous pages, leading to a
  // mismatched topbar style.
  useEffect(() => {
    // Center the header to align the "Okul / Senaryo Değiştir" button
    outlet?.setHeaderMeta?.({
      title: "Manage Permissions",
      subtitle: "Assign roles and permissions",
      centered: true,
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

  // Fetch the list of users that the manager/admin can manage
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await api.managerListUsers();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const permissionScope = useMemo(
    () => ({ countryId: auth.user?.country_id ?? null }),
    [auth.user?.country_id]
  );
  const canCreateUsers = can(auth.user, "user.create", "write", permissionScope);
  const canCreateSchools = can(auth.user, "school.create", "write", permissionScope);

  const refreshSchools = useCallback(async () => {
    try {
      const schools = await api.listSchools();
      if (Array.isArray(schools)) {
        setUserSchools(schools);
      } else if (schools && Array.isArray(schools.items)) {
        setUserSchools(schools.items);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  // Load permissions catalog, current user permissions, and school list for the selected user.
  //
  // We wrap this function in useCallback so it has a stable identity across
  // renders. This avoids triggering the permissions effect when nothing has
  // changed and allows us to include it safely in effect dependencies.
  const loadPermissionsForUser = useCallback(async (user) => {
    if (!user) {
      setPermissionsCatalog(null);
      setPermissionSelections({});
      setPermissionScopes({});
      setUserSchools([]);
      return;
    }
    setPermissionsLoading(true);
    try {
      const [catalogData, userPerms, schools] = await Promise.all([
        api.managerGetPermissionsCatalog(),
        api.managerGetUserPermissions(user.id),
        api.listSchools(),
      ]);
      setPermissionsCatalog(catalogData || null);
      // Flatten schools list (manager sees only their country's schools)
      let schoolsList = [];
      if (Array.isArray(schools)) {
        schoolsList = schools;
      } else if (schools && Array.isArray(schools.items)) {
        schoolsList = schools.items;
      }
      setUserSchools(schoolsList);
      // Initialize selection state from existing user permissions
      const sel = {};
      const scopes = {};
      (userPerms || []).forEach((p) => {
        const key = `${p.resource}|${p.action}`;
        sel[key] = true;
        if (p.scope_school_id != null) {
          scopes[key] = `school:${p.scope_school_id}`;
        } else {
          scopes[key] = "country";
        }
      });
      setPermissionSelections(sel);
      setPermissionScopes(scopes);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to load permissions");
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  // On mount, load users
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // When a user is selected or the user list changes, load their permissions and catalog
  useEffect(() => {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    loadPermissionsForUser(user);
  }, [selectedUserId, users, loadPermissionsForUser]);

  // Load current principal assignments for each school in the manager's country.
  // This runs whenever the list of userSchools changes (e.g. after loading catalog).
  useEffect(() => {
    async function loadPrincipals() {
      if (!Array.isArray(userSchools) || userSchools.length === 0) {
        return;
      }
      setLoadingPrincipals(true);
      const assignments = {};
      try {
        // Load principals for each school sequentially
        for (const s of userSchools) {
          try {
            const list = await api.managerGetSchoolPrincipals(s.id);
            assignments[s.id] = Array.isArray(list) ? list.map((u) => u.id) : [];
          } catch (_) {
            assignments[s.id] = [];
          }
        }
        setPrincipalAssignments(assignments);
      } finally {
        setLoadingPrincipals(false);
      }
    }
    loadPrincipals();
  }, [userSchools]);

  // Handler: update selected principals for a school
  function handlePrincipalChange(schoolId, selectedIds) {
    setPrincipalAssignments((prev) => ({ ...prev, [schoolId]: selectedIds }));
  }

  // Save principal assignments across all schools.  Loops through each school
  // and calls the backend endpoint.  Shows a toast on completion or error.
  async function savePrincipalAssignments() {
    if (!Array.isArray(userSchools) || userSchools.length === 0) return;
    setSavingPrincipals(true);
    try {
      for (const s of userSchools) {
        const ids = Array.isArray(principalAssignments[s.id]) ? principalAssignments[s.id] : [];
        await api.managerSetSchoolPrincipals(s.id, { userIds: ids });
      }
      toast.success("Principal assignments saved");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to save principal assignments');
    } finally {
      setSavingPrincipals(false);
    }
  }

  // Utility: group permissions by group from catalog
  const permissionsGrouped = useMemo(() => {
    if (!permissionsCatalog) return {};
    if (typeof permissionsCatalog === "object" && !Array.isArray(permissionsCatalog)) {
      return permissionsCatalog;
    }
    if (Array.isArray(permissionsCatalog)) {
      return permissionsCatalog.reduce((acc, perm) => {
        const grp = perm.group || "Other";
        if (!acc[grp]) acc[grp] = [];
        acc[grp].push(perm);
        return acc;
      }, {});
    }
    return {};
  }, [permissionsCatalog]);

  const togglePermission = useCallback((key, scopeValue = "country") => {
    setPermissionSelections((prev) => {
      const next = { ...prev };
      const nextValue = !prev[key];
      next[key] = nextValue;
      setPermissionScopes((prevScopes) => {
        const copy = { ...prevScopes };
        if (!nextValue) {
          delete copy[key];
        } else if (!copy[key]) {
          copy[key] = scopeValue || "country";
        }
        return copy;
      });
      return next;
    });
  }, []);

  function togglePermissionGroup(groupKeys, nextValue) {
    if (!Array.isArray(groupKeys) || groupKeys.length === 0) return;
    setPermissionSelections((prev) => {
      const next = { ...prev };
      groupKeys.forEach((key) => {
        next[key] = nextValue;
      });
      return next;
    });
    setPermissionScopes((prev) => {
      const next = { ...prev };
      if (nextValue) {
        groupKeys.forEach((key) => {
          if (!next[key]) next[key] = "country";
        });
      } else {
        groupKeys.forEach((key) => {
          delete next[key];
        });
      }
      return next;
    });
  }

  function changePermissionScopeForResource(resource, value) {
    const readKey = `${resource}|read`;
    const writeKey = `${resource}|write`;
    setPermissionScopes((prev) => ({ ...prev, [readKey]: value, [writeKey]: value }));
  }

  async function saveUserPermissions() {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    if (!user) {
      toast.error("Select a user");
      return;
    }
    const scopeCountryId = auth.user?.country_id != null ? Number(auth.user.country_id) : null;
    const perms = [];
    const keys = Object.keys(permissionSelections || {});
    keys.forEach((k) => {
      if (!permissionSelections[k]) return;
      const [resource, action] = k.split("|");
      let scopeVal = permissionScopes[k] || "country";
      let scope_country_id = null;
      let scope_school_id = null;
      if (scopeVal === "country") {
        if (scopeCountryId != null) {
          scope_country_id = scopeCountryId;
        }
      } else if (scopeVal.startsWith("school:")) {
        const sidStr = scopeVal.split(":")[1];
        const sid = Number(sidStr);
        if (Number.isFinite(sid)) {
          scope_school_id = sid;
        }
        if (scopeCountryId != null) {
          scope_country_id = scopeCountryId;
        }
      }
      perms.push({ resource, action, scope_country_id, scope_school_id });
    });
    setSavingPermissions(true);
    try {
      await api.managerSetUserPermissions(user.id, { permissions: perms });
      // Reload to reflect server state
      const updated = await api.managerGetUserPermissions(user.id);
      const sel = {};
      const scopeMap = {};
      (updated || []).forEach((p) => {
        const key = `${p.resource}|${p.action}`;
        sel[key] = true;
        if (p.scope_school_id != null) {
          scopeMap[key] = `school:${p.scope_school_id}`;
        } else {
          scopeMap[key] = "country";
        }
      });
      setPermissionSelections(sel);
      setPermissionScopes(scopeMap);
      toast.success("Saved");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSavingPermissions(false);
    }
  }

  async function updateUserRole(role) {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    if (!user) return;
    setRoleUpdating(true);
    try {
      await api.managerUpdateUserRole(user.id, { role });
      toast.success("Role updated");
      // reload users list
      await loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to update role");
    } finally {
      setRoleUpdating(false);
    }
  }

  async function createUser() {
    if (!canCreateUsers) return;
    const email = newUserEmail.trim();
    const password = newUserPassword;
    const fullName = newUserName.trim();
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!["principal", "hr"].includes(newUserRole)) {
      toast.error("Role must be Principal or HR");
      return;
    }
    setCreatingUser(true);
    try {
      await api.managerCreateUser({
        full_name: fullName || null,
        email,
        password,
        role: newUserRole,
      });
      toast.success("User created");
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("principal");
      await loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  }

  async function createSchool() {
    if (!canCreateSchools) return;
    const name = newSchoolName.trim();
    if (!name) {
      toast.error("School name is required");
      return;
    }
    setCreatingSchool(true);
    try {
      await api.createSchool({ name });
      toast.success("School created");
      setNewSchoolName("");
      await refreshSchools();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to create school");
    } finally {
      setCreatingSchool(false);
    }
  }

  // Determine available role options (manager cannot assign manager or admin roles)
  const roleOptions = [
    { value: "user", label: "User" },
    { value: "hr", label: "HR" },
    { value: "principal", label: "Principal" },
  ];

  return (
    <div className="permissions-page">
      <div className="container permissions-page-content" style={{ padding: "1rem" }}>
      <h1>Manage Permissions</h1>
      {(canCreateUsers || canCreateSchools) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Create</div>
          {canCreateUsers && (
            <div style={{ marginBottom: 12 }}>
              <div className="small" style={{ marginBottom: 6 }}>New Principal / HR</div>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <input
                  className="input sm"
                  placeholder="Full name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <input
                  className="input sm"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                  className="input sm"
                  placeholder="Temporary password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <select
                  className="input sm"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                >
                  <option value="principal">Principal</option>
                  <option value="hr">HR</option>
                </select>
                <button className="btn primary" onClick={createUser} disabled={creatingUser}>
                  {creatingUser ? "Creating..." : "Create User"}
                </button>
              </div>
            </div>
          )}
          {canCreateSchools && (
            <div>
              <div className="small" style={{ marginBottom: 6 }}>New School (your country)</div>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <input
                  className="input sm"
                  placeholder="School name"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                />
                <button className="btn primary" onClick={createSchool} disabled={creatingSchool}>
                  {creatingSchool ? "Creating..." : "Create School"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Users list */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Users</div>
        {usersLoading ? (
          <div>Loading users...</div>
        ) : users.length === 0 ? (
          <div>No users found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={String(u.id) === String(selectedUserId) ? "is-selected" : ""}>
                  <td>{u.id}</td>
                  <td>{u.full_name || "-"}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <button className="btn" onClick={() => setSelectedUserId(String(u.id))}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Permission and role editor */}
      {selectedUserId && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Edit User: {users.find((u) => String(u.id) === String(selectedUserId))?.full_name || "User"}
          </div>
          {permissionsLoading ? (
            <div>Loading permissions...</div>
          ) : (
            <>
              {/* Role selector */}
              <div style={{ marginBottom: 8 }}>
                <label className="small" style={{ marginRight: 8 }}>Role:</label>
                <select
                  className="input sm"
                  value={users.find((u) => String(u.id) === String(selectedUserId))?.role || "user"}
                  onChange={(e) => updateUserRole(e.target.value)}
                  disabled={roleUpdating}
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <PermissionsTable
                permissionsGrouped={permissionsGrouped}
                permissionSelections={permissionSelections}
                permissionScopes={permissionScopes}
                userSchools={userSchools}
                isAdmin={false}
                onTogglePermission={togglePermission}
                onToggleGroup={togglePermissionGroup}
                onScopeChange={changePermissionScopeForResource}
              />
            </>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>School Principals Assignment</div>
        {loadingPrincipals ? (
          <div>Loading principals...</div>
        ) : !userSchools || userSchools.length === 0 ? (
          <div>No schools found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>School</th>
                <th>Principals</th>
              </tr>
            </thead>
            <tbody>
              {userSchools.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <select
                      multiple
                      className="input"
                      style={{ minWidth: 200 }}
                      value={principalAssignments[s.id] || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
                        handlePrincipalChange(s.id, selected);
                      }}
                    >
                      {users
                        .filter((u) => u.role === "principal")
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email || u.id}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={savePrincipalAssignments} disabled={savingPrincipals}>
            {savingPrincipals ? "Saving..." : "Save Principals"}
          </button>
        </div>
      </div>
      </div>
      {selectedUserId ? (
        <div className="permissions-sticky-footer" role="region" aria-label="Permission actions">
          <div className="permissions-sticky-footer-inner">
            <div className="permissions-footer-pills" />
            <div className="permissions-footer-actions">
              <button
                className="btn primary"
                onClick={saveUserPermissions}
                disabled={savingPermissions || permissionsLoading}
              >
                {savingPermissions ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
