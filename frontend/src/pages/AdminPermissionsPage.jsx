import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../api";
import { toast } from "react-toastify";
import { useOutletContext } from "react-router-dom";
import PermissionsTable from "../components/permissions/PermissionsTable";

export default function AdminPermissionsPage() {
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
  const [roleUpdating, setRoleUpdating] = useState(false);

  useEffect(() => {
    outlet?.setHeaderMeta?.({
      title: "Manage Permissions",
      subtitle: "Assign roles and permissions",
      centered: true,
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await api.listUsers();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

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
      const schoolsPromise = user?.country_id
        ? api.adminListCountrySchools(user.country_id)
        : Promise.resolve([]);
      const [catalogData, userPerms, schools] = await Promise.all([
        api.adminGetPermissionsCatalog(),
        api.adminGetUserPermissions(user.id),
        schoolsPromise,
      ]);
      setPermissionsCatalog(catalogData || null);
      let schoolsList = [];
      if (Array.isArray(schools)) {
        schoolsList = schools;
      } else if (schools && Array.isArray(schools.items)) {
        schoolsList = schools.items;
      }
      setUserSchools(schoolsList);
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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    loadPermissionsForUser(user);
  }, [selectedUserId, users, loadPermissionsForUser]);

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
    const scopeCountryId = user?.country_id != null ? Number(user.country_id) : null;
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
      await api.adminSetUserPermissions(user.id, { permissions: perms });
      const updated = await api.adminGetUserPermissions(user.id);
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
      await api.adminUpdateUserRole(user.id, { role });
      toast.success("Role updated");
      await loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to update role");
    } finally {
      setRoleUpdating(false);
    }
  }

  const roleOptions = [
    { value: "user", label: "User" },
    { value: "hr", label: "HR" },
    { value: "principal", label: "Principal" },
    { value: "manager", label: "Manager" },
    { value: "accountant", label: "Accountant" },
    { value: "admin", label: "Admin" },
  ];

  return (
    <div className="permissions-page">
      <div className="container permissions-page-content" style={{ padding: "1rem" }}>
        <h1>Manage Permissions</h1>
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
        {selectedUserId && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Edit User: {users.find((u) => String(u.id) === String(selectedUserId))?.full_name || "User"}
            </div>
            {permissionsLoading ? (
              <div>Loading permissions...</div>
            ) : (
              <>
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
                  isAdmin
                  onTogglePermission={togglePermission}
                  onToggleGroup={togglePermissionGroup}
                  onScopeChange={changePermissionScopeForResource}
                />
              </>
            )}
          </div>
        )}
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
