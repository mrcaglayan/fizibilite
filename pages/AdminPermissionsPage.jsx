import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api } from "../api";
import { useAdminUsers, useListCountries } from "../hooks/useListQueries";
import { toast } from "react-toastify";
import { useOutletContext } from "react-router-dom";
import PermissionsTable from "../components/permissions/PermissionsTable";
import AdminCreateUserModal from "../components/access/AdminCreateUserModal";
import AdminCreateSchoolModal from "../components/access/AdminCreateSchoolModal";
import AdminSchoolPrincipalsDrawer from "../components/access/AdminSchoolPrincipalsDrawer";

const CAPABILITY_DEFS = [
  { key: "managePermissions", label: "Manage Permissions", resources: ["page.manage_permissions"] },
  { key: "createUser", label: "Create User", resources: ["user.create"] },
  { key: "createSchool", label: "Create School", resources: ["school.create"] },
  {
    key: "scenarioActions",
    label: "Scenario Actions",
    resources: [
      "scenario.create",
      "scenario.plan_edit",
      "scenario.copy",
      "scenario.submit",
      "scenario.delete",
    ],
  },
];
const CAPABILITY_RESOURCES = CAPABILITY_DEFS.flatMap((def) => def.resources);
const CAPABILITY_RESOURCE_SET = new Set(CAPABILITY_RESOURCES);

function dedupePermissions(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((perm) => {
    const key = [
      perm.resource,
      perm.action,
      perm.scope_country_id ?? "",
      perm.scope_school_id ?? "",
    ].join("|");
    map.set(key, perm);
  });
  return Array.from(map.values());
}

function hasScopedWritePermission(perms, resource, countryId) {
  if (!Array.isArray(perms)) return false;
  return perms.some((perm) => {
    if (perm.resource !== resource || perm.action !== "write") return false;
    if (perm.scope_school_id != null) return false;
    if (perm.scope_country_id == null) return true;
    return Number(perm.scope_country_id) === Number(countryId);
  });
}

function buildCapabilityState(perms, countryId) {
  const state = {};
  CAPABILITY_DEFS.forEach((def) => {
    state[def.key] = def.resources.every((resource) =>
      hasScopedWritePermission(perms, resource, countryId)
    );
  });
  return state;
}

/**
 * AdminPermissionsPage renders the Access Management hub for administrators.
 * Administrators can manage users across all countries, assign countries and
 * roles, edit permissions scoped to country or schools, create users and
 * schools, and assign principals to schools via a drawer.  The UI is built
 * with a two‑pane layout and tabs for Users & Permissions and Schools &
 * Principals.  All UI text is English.
 */
export default function AdminPermissionsPage() {
  const outlet = useOutletContext();
  // Countries list used for filters and selectors
  const [countries, setCountries] = useState([]);
  // countriesLoading is unused; removed to avoid ESLint warning
  // Users data and filters
  const [users, setUsers] = useState([]);
  const usersQuery = useAdminUsers({
    limit: 50,
    offset: 0,
    fields: "brief",
    order: "full_name:asc",
  });
  const usersLoading = usersQuery.isFetching;
  const [searchUser, setSearchUser] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  // Selected user metadata and snapshots
  const [selectedUserRole, setSelectedUserRole] = useState(null);
  const [selectedUserCountryId, setSelectedUserCountryId] = useState("");
  const [initialRole, setInitialRole] = useState(null);
  const [initialCountryId, setInitialCountryId] = useState("");
  const [permissionSelections, setPermissionSelections] = useState({});
  const [permissionScopes, setPermissionScopes] = useState({});
  const [initialSelections, setInitialSelections] = useState({});
  const [initialScopes, setInitialScopes] = useState({});
  const [permissionsCatalog, setPermissionsCatalog] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [userSchools, setUserSchools] = useState([]);
  const [saving, setSaving] = useState(false);
  // Tab state: 'countries', 'users', or 'schools'
  const [activeTab, setActiveTab] = useState("countries");
  // Countries tab state
  const [selectedCountryIdForDrawer, setSelectedCountryIdForDrawer] = useState(null);
  const [selectedAccountantId, setSelectedAccountantId] = useState("");
  const [assignAccountantUserId, setAssignAccountantUserId] = useState("");
  const [permissionsByUserId, setPermissionsByUserId] = useState({});
  const [permissionsLoadingByUserId, setPermissionsLoadingByUserId] = useState({});
  const permissionsByUserIdRef = useRef({});
  const permissionsLoadingByUserIdRef = useRef({});
  const [capabilityDraft, setCapabilityDraft] = useState(null);
  const [capabilitySnapshot, setCapabilitySnapshot] = useState(null);
  const [capabilitySaving, setCapabilitySaving] = useState(false);
  // Create modals
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateSchool, setShowCreateSchool] = useState(false);
  // Schools tab state
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [schools, setSchools] = useState([]);
  const [searchSchool, setSearchSchool] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);

  const countriesQuery = useListCountries();

  // Set header meta on mount/unmount
  useEffect(() => {
    outlet?.setHeaderMeta?.({
      title: "Access Management",
      subtitle: "Manage users, permissions, and principal assignments",
      centered: true,
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

  // Load list of countries
  const loadCountries = useCallback(async () => {
    const result = await countriesQuery.refetch();
    if (result?.error) {
      console.error(result.error);
      toast.error(result.error?.message || "Failed to load countries");
    }
  }, [countriesQuery]);

  // Load list of users
  const loadUsers = useCallback(async () => {
    const result = await usersQuery.refetch();
    if (result?.error) {
      console.error(result.error);
      toast.error(result.error?.message || "Failed to load users");
    }
  }, [usersQuery]);

  useEffect(() => {
    const rows = countriesQuery.data;
    setCountries(Array.isArray(rows) ? rows : []);
  }, [countriesQuery.data]);

  useEffect(() => {
    const rows = usersQuery.data?.items;
    setUsers(Array.isArray(rows) ? rows : []);
  }, [usersQuery.data]);

  useEffect(() => {
    if (!countriesQuery.isError) return;
    console.error(countriesQuery.error);
    toast.error(countriesQuery.error?.message || "Failed to load countries");
  }, [countriesQuery.isError, countriesQuery.error]);

  useEffect(() => {
    if (!usersQuery.isError) return;
    console.error(usersQuery.error);
    toast.error(usersQuery.error?.message || "Failed to load users");
  }, [usersQuery.isError, usersQuery.error]);

  // Load schools for selected country in Schools tab
  const loadSchoolsForCountry = useCallback(async (countryId) => {
    const cid = Number(countryId);
    if (!Number.isFinite(cid)) {
      setSchools([]);
      return;
    }
    try {
      const rows = await api.adminListCountrySchools(cid);
      if (Array.isArray(rows)) {
        setSchools(rows);
      } else if (rows && Array.isArray(rows.items)) {
        setSchools(rows.items);
      } else {
        setSchools([]);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to load schools");
      setSchools([]);
    }
  }, []);

  // Load permissions catalog, user permissions, and country schools for selected user
  const loadPermissionsForUser = useCallback(async (user) => {
    if (!user) {
      // Reset state when no user is selected
      setPermissionsCatalog(null);
      setPermissionSelections({});
      setPermissionScopes({});
      setUserSchools([]);
      setSelectedUserRole(null);
      setSelectedUserCountryId("");
      setInitialRole(null);
      setInitialCountryId("");
      setInitialSelections({});
      setInitialScopes({});
      return;
    }
    setPermissionsLoading(true);
    try {
      const schoolsPromise =
        user.country_id != null ? api.adminListCountrySchools(user.country_id) : Promise.resolve([]);
      const [catalogData, userPerms, schoolRows] = await Promise.all([
        api.adminGetPermissionsCatalog(),
        api.adminGetUserPermissions(user.id),
        schoolsPromise,
      ]);
      setPermissionsCatalog(catalogData || null);
      let schoolsList = [];
      if (Array.isArray(schoolRows)) {
        schoolsList = schoolRows;
      } else if (schoolRows && Array.isArray(schoolRows.items)) {
        schoolsList = schoolRows.items;
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
      setSelectedUserRole(user.role || null);
      setSelectedUserCountryId(user.country_id != null ? String(user.country_id) : "");
      setInitialRole(user.role || null);
      setInitialCountryId(user.country_id != null ? String(user.country_id) : "");
      setInitialSelections(sel);
      setInitialScopes(scopes);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to load permissions");
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    permissionsByUserIdRef.current = permissionsByUserId;
  }, [permissionsByUserId]);

  useEffect(() => {
    permissionsLoadingByUserIdRef.current = permissionsLoadingByUserId;
  }, [permissionsLoadingByUserId]);

  // When selected user or users list changes: load their permissions
  useEffect(() => {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    loadPermissionsForUser(user);
  }, [selectedUserId, users, loadPermissionsForUser]);

  // When selectedCountryId changes in Schools tab: load schools
  useEffect(() => {
    if (activeTab !== "schools") return;
    loadSchoolsForCountry(selectedCountryId);
  }, [activeTab, selectedCountryId, loadSchoolsForCountry]);

  const accountantUsers = useMemo(
    () => users.filter((u) => String(u.role) === "accountant"),
    [users]
  );

  const accountantsByCountry = useMemo(() => {
    const map = {};
    accountantUsers.forEach((user) => {
      const key = user.country_id != null ? String(user.country_id) : "";
      if (!map[key]) map[key] = [];
      map[key].push(user);
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => {
        const nameA = (a.full_name || a.email || "").toLowerCase();
        const nameB = (b.full_name || b.email || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    });
    return map;
  }, [accountantUsers]);

  const ensureUserPermissions = useCallback(async (userId) => {
    if (!userId) return [];
    const cached = permissionsByUserIdRef.current[userId];
    if (cached) return cached;
    setPermissionsLoadingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      const perms = await api.adminGetUserPermissions(userId);
      const normalized = Array.isArray(perms) ? perms : [];
      setPermissionsByUserId((prev) => ({ ...prev, [userId]: normalized }));
      return normalized;
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to load accountant permissions");
      return [];
    } finally {
      setPermissionsLoadingByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "countries") return;
    if (accountantUsers.length === 0) return;
    const toFetch = accountantUsers.filter(
      (user) =>
        !permissionsByUserIdRef.current[user.id] &&
        !permissionsLoadingByUserIdRef.current[user.id]
    );
    if (toFetch.length === 0) return;
    setPermissionsLoadingByUserId((prev) => {
      const next = { ...prev };
      toFetch.forEach((user) => {
        next[user.id] = true;
      });
      return next;
    });
    Promise.allSettled(toFetch.map((user) => api.adminGetUserPermissions(user.id)))
      .then((results) => {
        let hadError = false;
        setPermissionsByUserId((prev) => {
          const next = { ...prev };
          results.forEach((result, index) => {
            const userId = toFetch[index]?.id;
            if (!userId) return;
            if (result.status === "fulfilled") {
              next[userId] = Array.isArray(result.value) ? result.value : [];
            } else {
              hadError = true;
            }
          });
          return next;
        });
        if (hadError) {
          toast.error("Failed to load some accountant permissions");
        }
      })
      .finally(() => {
        setPermissionsLoadingByUserId((prev) => {
          const next = { ...prev };
          toFetch.forEach((user) => {
            delete next[user.id];
          });
          return next;
        });
      });
  }, [activeTab, accountantUsers]);

  const selectedCountryForDrawer = useMemo(
    () =>
      countries.find((country) => String(country.id) === String(selectedCountryIdForDrawer)) ||
      null,
    [countries, selectedCountryIdForDrawer]
  );

  const drawerAccountants = useMemo(() => {
    if (!selectedCountryForDrawer) return [];
    return accountantsByCountry[String(selectedCountryForDrawer.id)] || [];
  }, [accountantsByCountry, selectedCountryForDrawer]);

  const assignableAccountants = useMemo(() => {
    if (!selectedCountryForDrawer) return [];
    return users.filter((user) => {
      if (String(user.role) === "admin") return false;
      if (user.country_id == null) return true;
      return Number(user.country_id) === Number(selectedCountryForDrawer.id);
    });
  }, [selectedCountryForDrawer, users]);

  useEffect(() => {
    if (!selectedCountryForDrawer) {
      setSelectedAccountantId("");
      setAssignAccountantUserId("");
      setCapabilityDraft(null);
      setCapabilitySnapshot(null);
      return;
    }
    if (drawerAccountants.length === 0) {
      setSelectedAccountantId("");
      setCapabilityDraft(null);
      setCapabilitySnapshot(null);
      return;
    }
    const hasSelected = drawerAccountants.some(
      (user) => String(user.id) === String(selectedAccountantId)
    );
    if (!hasSelected) {
      setSelectedAccountantId(String(drawerAccountants[0].id));
    }
  }, [drawerAccountants, selectedAccountantId, selectedCountryForDrawer]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      if (!selectedCountryForDrawer || !selectedAccountantId) {
        setCapabilityDraft(null);
        setCapabilitySnapshot(null);
        return;
      }
      const userId = Number(selectedAccountantId);
      if (!Number.isFinite(userId)) return;
      const perms = await ensureUserPermissions(userId);
      if (!isActive) return;
      const caps = buildCapabilityState(perms, selectedCountryForDrawer.id);
      setCapabilityDraft(caps);
      setCapabilitySnapshot(caps);
    };
    load();
    return () => {
      isActive = false;
    };
  }, [ensureUserPermissions, selectedAccountantId, selectedCountryForDrawer]);

  // Helper to group permissions by group name
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

  /**
   * Toggle a permission (read or write) while enforcing dependency rules.
   * Write implies read. Disabling read will disable write. Scopes default to "country".
   */
  const togglePermission = useCallback(
    (key, scopeValue = "country") => {
      if (!key) return;
      const [resource, action] = key.split("|");
      const readKey = `${resource}|read`;
      const writeKey = `${resource}|write`;
      const newSelections = { ...permissionSelections };
      const newScopes = { ...permissionScopes };
      const currentVal = !!permissionSelections[key];
      const enable = !currentVal;
      if (action === "write") {
        if (enable) {
          newSelections[writeKey] = true;
          newSelections[readKey] = true;
          if (!newScopes[writeKey]) newScopes[writeKey] = scopeValue || "country";
          if (!newScopes[readKey]) newScopes[readKey] = scopeValue || "country";
        } else {
          // disabling write only
          newSelections[writeKey] = false;
          delete newScopes[writeKey];
        }
      } else {
        // toggling read
        if (enable) {
          newSelections[readKey] = true;
          if (!newScopes[readKey]) newScopes[readKey] = scopeValue || "country";
        } else {
          // disabling read removes both read and write
          newSelections[readKey] = false;
          newSelections[writeKey] = false;
          delete newScopes[readKey];
          delete newScopes[writeKey];
        }
      }
      setPermissionSelections(newSelections);
      setPermissionScopes(newScopes);
    },
    [permissionSelections, permissionScopes]
  );

  /**
   * Toggle an entire group of permissions on or off. Delegates to togglePermission
   * for each individual key to ensure dependency rules are enforced.
   */
  const togglePermissionGroup = useCallback(
    (groupKeys, nextValue) => {
      if (!Array.isArray(groupKeys) || groupKeys.length === 0) return;
      groupKeys.forEach((k) => {
        const cur = !!permissionSelections[k];
        if (cur !== nextValue) {
          togglePermission(k, "country");
        }
      });
    },
    [permissionSelections, togglePermission]
  );

  /**
   * Change the scope for a given resource across both read and write actions.
   */
  function changePermissionScopeForResource(resource, value) {
    const readKey = `${resource}|read`;
    const writeKey = `${resource}|write`;
    setPermissionScopes((prev) => {
      const next = { ...prev };
      if (permissionSelections[readKey]) next[readKey] = value;
      if (permissionSelections[writeKey]) next[writeKey] = value;
      return next;
    });
  }

  /**
   * Determine if there are unsaved changes relative to the initial snapshot.
   */
  const hasUnsavedChanges = useMemo(() => {
    if (selectedUserId == null) return false;
    if (selectedUserRole !== initialRole) return true;
    if ((selectedUserCountryId || "") !== (initialCountryId || "")) return true;
    const allKeys = new Set([
      ...Object.keys(initialSelections || {}),
      ...Object.keys(permissionSelections || {}),
    ]);
    for (const k of allKeys) {
      const curSel = !!permissionSelections[k];
      const initSel = !!initialSelections[k];
      if (curSel !== initSel) return true;
      const curScope = permissionScopes[k] || null;
      const initScope = initialScopes[k] || null;
      if (curScope !== initScope) return true;
    }
    return false;
  }, [
    selectedUserId,
    selectedUserRole,
    selectedUserCountryId,
    initialRole,
    initialCountryId,
    permissionSelections,
    permissionScopes,
    initialSelections,
    initialScopes,
  ]);

  /**
   * Save changes for the selected user. Writes country, role and permissions to the server.
   */
  async function saveChanges() {
    const user = users.find((u) => String(u.id) === String(selectedUserId));
    if (!user) {
      toast.error("Select a user");
      return;
    }
    const countryChanged = (selectedUserCountryId || "") !== (initialCountryId || "");
    const roleChanged = selectedUserRole !== initialRole;
    // Determine if permissions changed
    let permissionsChanged = false;
    const keysUnion = new Set([
      ...Object.keys(initialSelections || {}),
      ...Object.keys(permissionSelections || {}),
    ]);
    for (const k of keysUnion) {
      const curSel = !!permissionSelections[k];
      const initSel = !!initialSelections[k];
      if (curSel !== initSel) {
        permissionsChanged = true;
        break;
      }
      const curScope = permissionScopes[k] || null;
      const initScope = initialScopes[k] || null;
      if (curScope !== initScope) {
        permissionsChanged = true;
        break;
      }
    }
    let perms = [];
    if (permissionsChanged) {
      const scopeCountryId = selectedUserCountryId && selectedUserCountryId !== "" ? Number(selectedUserCountryId) : null;
      perms = [];
      Object.keys(permissionSelections || {}).forEach((k) => {
        if (!permissionSelections[k]) return;
        const [resource, action] = k.split("|");
        let scopeVal = permissionScopes[k] || "country";
        let scope_country_id = null;
        let scope_school_id = null;
        if (scopeVal === "country") {
          scope_country_id = scopeCountryId;
        } else if (scopeVal.startsWith("school:")) {
          const sidStr = scopeVal.split(":")[1];
          const sid = Number(sidStr);
          if (Number.isFinite(sid)) {
            scope_school_id = sid;
          }
          scope_country_id = scopeCountryId;
        }
        perms.push({ resource, action, scope_country_id, scope_school_id });
      });
    }
    setSaving(true);
    try {
      if (countryChanged) {
        const cid = selectedUserCountryId ? Number(selectedUserCountryId) : null;
        await api.assignUserCountry(user.id, { country_id: cid });
      }
      if (roleChanged) {
        await api.adminUpdateUserRole(user.id, { role: selectedUserRole });
      }
      if (permissionsChanged) {
        await api.adminSetUserPermissions(user.id, { permissions: perms });
      }
      toast.success("Saved");
      // Reload users to update country/role badges
      await loadUsers();
      // Reload permissions for the selected user using updated data
      await loadPermissionsForUser({
        id: user.id,
        role: selectedUserRole,
        country_id: selectedUserCountryId ? Number(selectedUserCountryId) : null,
      });
      // Reset snapshot states
      setInitialRole(selectedUserRole);
      setInitialCountryId(selectedUserCountryId || "");
      setInitialSelections({ ...permissionSelections });
      setInitialScopes({ ...permissionScopes });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Discard unsaved changes by restoring selections, scopes, role and country from snapshots.
   */
  function discardChanges() {
    setPermissionSelections({ ...initialSelections });
    setPermissionScopes({ ...initialScopes });
    setSelectedUserRole(initialRole);
    setSelectedUserCountryId(initialCountryId || "");
  }

  // Filter users list based on search, role, country and showUnassignedOnly
  const filteredUsers = useMemo(() => {
    let list = users;
    if (roleFilter && roleFilter !== "all") {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (showUnassignedOnly) {
      list = list.filter((u) => u.country_id == null);
    }
    if (countryFilter && countryFilter !== "all") {
      if (countryFilter === "unassigned") {
        list = list.filter((u) => u.country_id == null);
      } else {
        list = list.filter((u) => String(u.country_id) === String(countryFilter));
      }
    }
    const term = searchUser.trim().toLowerCase();
    if (term) {
      list = list.filter((u) => {
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(term) || email.includes(term);
      });
    }
    return list;
  }, [users, roleFilter, countryFilter, searchUser, showUnassignedOnly]);

  // Filter schools list based on search term
  const filteredSchools = useMemo(() => {
    if (!Array.isArray(schools)) return [];
    const term = searchSchool.trim().toLowerCase();
    if (!term) return schools;
    return schools.filter((s) => {
      const name = (s.name || "").toLowerCase();
      return name.includes(term);
    });
  }, [schools, searchSchool]);

  const capabilityDirty = useMemo(() => {
    if (!capabilityDraft || !capabilitySnapshot) return false;
    return CAPABILITY_DEFS.some(
      (def) => capabilityDraft[def.key] !== capabilitySnapshot[def.key]
    );
  }, [capabilityDraft, capabilitySnapshot]);

  const getUserLabel = useCallback(
    (user) => user?.full_name || user?.email || user?.id || "Unknown",
    []
  );

  const handleAssignAccountant = async () => {
    if (!selectedCountryForDrawer || !assignAccountantUserId) return;
    const userId = Number(assignAccountantUserId);
    if (!Number.isFinite(userId)) return;
    setCapabilitySaving(true);
    try {
      const selectedUser = users.find((u) => String(u.id) === String(userId));
      if (!selectedUser) {
        toast.error("User not found");
        return;
      }
      if (selectedUser.country_id == null || Number(selectedUser.country_id) !== Number(selectedCountryForDrawer.id)) {
        await api.assignUserCountry(userId, { country_id: selectedCountryForDrawer.id });
      }
      await api.adminUpdateUserRole(userId, { role: "accountant" });
      toast.success("Accountant assigned");
      setPermissionsByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await loadUsers();
      setAssignAccountantUserId("");
      setSelectedAccountantId(String(userId));
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to assign accountant");
    } finally {
      setCapabilitySaving(false);
    }
  };

  const handleToggleCapability = (key) => {
    setCapabilityDraft((prev) => ({ ...prev, [key]: !prev?.[key] }));
  };

  const handleDiscardCapabilities = () => {
    setCapabilityDraft(capabilitySnapshot);
  };

  const handleSaveCapabilities = async () => {
    if (!selectedCountryForDrawer || !selectedAccountantId) return;
    const userId = Number(selectedAccountantId);
    if (!Number.isFinite(userId)) return;
    setCapabilitySaving(true);
    try {
      const basePerms = permissionsByUserIdRef.current[userId] || (await ensureUserPermissions(userId));
      let nextPerms = (Array.isArray(basePerms) ? basePerms : []).filter(
        (perm) => !CAPABILITY_RESOURCE_SET.has(perm.resource)
      );
      CAPABILITY_DEFS.forEach((def) => {
        if (!capabilityDraft?.[def.key]) return;
        def.resources.forEach((resource) => {
          nextPerms.push({
            resource,
            action: "read",
            scope_country_id: Number(selectedCountryForDrawer.id),
            scope_school_id: null,
          });
          nextPerms.push({
            resource,
            action: "write",
            scope_country_id: Number(selectedCountryForDrawer.id),
            scope_school_id: null,
          });
        });
      });
      nextPerms = dedupePermissions(nextPerms);
      await api.adminSetUserPermissions(userId, { permissions: nextPerms });
      setPermissionsByUserId((prev) => ({ ...prev, [userId]: nextPerms }));
      setCapabilitySnapshot(capabilityDraft);
      toast.success("Accountant permissions updated");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to update permissions");
    } finally {
      setCapabilitySaving(false);
    }
  };

  const handleOpenFullEditor = () => {
    if (!selectedAccountantId) return;
    setActiveTab("users");
    setSelectedUserId(String(selectedAccountantId));
    setSelectedCountryIdForDrawer(null);
  };

  return (
    <div className="permissions-page">
      <div className="container permissions-page-content" style={{ padding: "1rem" }}>
        {/* Top bar with tabs and actions */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="access-hub-tabs">
            <div
              className={`access-hub-tab ${activeTab === "countries" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("countries");
                setSelectedUserId(null);
                setSelectedSchoolId(null);
              }}
            >
              Countries & Accountants
            </div>
            <div
              className={`access-hub-tab ${activeTab === "users" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("users");
                setSelectedSchoolId(null);
                setSelectedCountryIdForDrawer(null);
              }}
            >
              Users & Permissions
            </div>
            <div
              className={`access-hub-tab ${activeTab === "schools" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("schools");
                setSelectedUserId(null);
                setSelectedCountryIdForDrawer(null);
              }}
            >
              Schools & Principals
            </div>
          </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => setShowCreateUser(true)}>
                Create user
              </button>
              <button className="btn primary" onClick={() => setShowCreateSchool(true)}>
                Create school
              </button>
            </div>
          </div>
          {activeTab === "countries" && (
            <>
              <div
                className={`school-assignments-overlay ${
                  selectedCountryForDrawer ? "is-open" : ""
                }`}
                onClick={() => setSelectedCountryIdForDrawer(null)}
                role="button"
                aria-label="Close country drawer"
                tabIndex={-1}
              />
              <aside
                className={`school-assignments-drawer ${
                  selectedCountryForDrawer ? "is-open" : ""
                }`}
              >
                <div className="school-assignments-drawer-header">
                  <div>
                    <div className="school-assignments-drawer-title">Country accountants</div>
                    <div className="school-assignments-drawer-subtitle">
                      {selectedCountryForDrawer
                        ? `${selectedCountryForDrawer.name} ${selectedCountryForDrawer.code ? `(${selectedCountryForDrawer.code})` : ""}`
                        : "Select a country"}
                    </div>
                  </div>
                  <button
                    className="btn school-assignments-close"
                    onClick={() => setSelectedCountryIdForDrawer(null)}
                    aria-label="Close drawer"
                    type="button"
                  >
                  x
                  </button>
                </div>
                <div className="school-assignments-drawer-body">
                  {!selectedCountryForDrawer ? (
                    <div className="school-assignments-empty">Select a country to manage accountants.</div>
                  ) : (
                    <>
                      <div className="school-assignments-section-title">Assigned accountant</div>
                      {drawerAccountants.length === 0 ? (
                        <div className="school-assignments-add-card">
                          <div className="row" style={{ flexDirection: "column", gap: 8 }}>
                            <select
                              className="input full"
                              value={assignAccountantUserId}
                              onChange={(e) => setAssignAccountantUserId(e.target.value)}
                            >
                              <option value="">Select user...</option>
                              {assignableAccountants.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {getUserLabel(user)}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn primary"
                              onClick={handleAssignAccountant}
                              disabled={!assignAccountantUserId || capabilitySaving}
                            >
                              {capabilitySaving ? "Assigning..." : "Set as Accountant"}
                            </button>
                            {assignableAccountants.length === 0 && (
                              <div className="small">No eligible users available.</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="school-assignments-add-card">
                          {drawerAccountants.length > 1 ? (
                            <select
                              className="input full"
                              value={selectedAccountantId}
                              onChange={(e) => setSelectedAccountantId(e.target.value)}
                            >
                              {drawerAccountants.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {getUserLabel(user)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div style={{ fontWeight: 600 }}>
                              {getUserLabel(drawerAccountants[0])}
                            </div>
                          )}
                          {drawerAccountants.length > 1 && (
                            <div className="small" style={{ marginTop: 6 }}>
                              Multiple accountants assigned. Select one to edit.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="school-assignments-section-title">Accountant capabilities</div>
                      {!selectedAccountantId ? (
                        <div className="school-assignments-empty">
                          Assign an accountant to edit capabilities.
                        </div>
                      ) : (
                        <div className="school-assignments-card">
                          {CAPABILITY_DEFS.map((def) => (
                            <label key={def.key} className="school-assignments-module-item">
                              <input
                                type="checkbox"
                                checked={Boolean(capabilityDraft?.[def.key])}
                                onChange={() => handleToggleCapability(def.key)}
                                disabled={capabilitySaving}
                              />
                              <span>{def.label}</span>
                            </label>
                          ))}
                          <div
                            className="row"
                            style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}
                          >
                            <button
                              className="btn"
                              onClick={handleDiscardCapabilities}
                              disabled={!capabilityDirty || capabilitySaving}
                            >
                              Discard
                            </button>
                            <button
                              className="btn primary"
                              onClick={handleSaveCapabilities}
                              disabled={!capabilityDirty || capabilitySaving}
                            >
                              {capabilitySaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedAccountantId && (
                        <button
                          className="btn"
                          onClick={handleOpenFullEditor}
                          style={{ marginTop: 12 }}
                        >
                          Open full permission editor
                        </button>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </>
          )}
        {/* Tab content */}
        {activeTab === "countries" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Countries</div>
            <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <span className="role-tag is-ok">Enabled</span>
              <span className="role-tag is-warn">Disabled / No accountant</span>
              <span className="role-tag is-muted">Loading / Unknown</span>
            </div>
            <div className="school-assignments-table-wrap">
              <table className="table school-assignments-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Accountant status</th>
                    <th>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No countries available.</td>
                    </tr>
                  ) : (
                    countries.map((country) => {
                      const accountants = accountantsByCountry[String(country.id)] || [];
                      const primaryAccountant = accountants[0] || null;
                      const hasMultiple = accountants.length > 1;
                      const statusLabel =
                        accountants.length === 0
                          ? "No accountant"
                          : accountants.length === 1
                            ? `1 accountant: ${getUserLabel(primaryAccountant)}`
                            : `Multiple accountants: ${accountants.length}`;
                      const perms = primaryAccountant
                        ? permissionsByUserId[primaryAccountant.id]
                        : null;
                      const capabilities = perms
                        ? buildCapabilityState(perms, country.id)
                        : null;
                      const isPermsLoading =
                        primaryAccountant &&
                        Boolean(permissionsLoadingByUserId[primaryAccountant.id]);
                      return (
                        <tr
                          key={country.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelectedCountryIdForDrawer(String(country.id))}
                        >
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {country.name}
                              {country.code ? ` (${country.code})` : ""}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                className={`role-tag ${
                                  accountants.length === 1 ? "is-ok" : "is-warn"
                                }`}
                              >
                                {statusLabel}
                              </span>
                              {hasMultiple && <span className="role-tag is-warn">Needs review</span>}
                            </div>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              {CAPABILITY_DEFS.map((def) => {
                                const enabled = capabilities?.[def.key];
                                const label = def.label;
                                let status = "Unknown";
                                let badgeClass = "role-tag is-muted";
                                if (accountants.length === 0) {
                                  status = "No accountant";
                                  badgeClass = "role-tag is-warn";
                                } else if (isPermsLoading) {
                                  status = "Loading";
                                  badgeClass = "role-tag is-muted";
                                } else if (!capabilities) {
                                  status = "Unknown";
                                  badgeClass = "role-tag is-muted";
                                } else if (enabled) {
                                  status = "Enabled";
                                  badgeClass = "role-tag is-ok";
                                } else {
                                  status = "Disabled";
                                  badgeClass = "role-tag is-warn";
                                }
                                return (
                                  <span
                                    key={def.key}
                                    className={badgeClass}
                                  >
                                    {label}: {status}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === "users" && (
          <div className="access-hub-grid" style={{ marginTop: 16 }}>
            {/* Left pane: user list and filters */}
            <div className="left-pane">
              <div style={{ marginBottom: 12, fontWeight: 700 }}>Users</div>
              <div className="row" style={{ flexDirection: "column", gap: 8 }}>
                <input
                  className="input full"
                  placeholder="Search users by name or email…"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                />
                <select
                  className="input full"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">All roles</option>
                  <option value="user">User</option>
                  <option value="hr">HR</option>
                  <option value="principal">Principal</option>
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  className="input full"
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                >
                  <option value="all">All countries</option>
                  {countries.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={showUnassignedOnly}
                    onChange={(e) => setShowUnassignedOnly(e.target.checked)}
                  />
                  <span className="small">Show unassigned only</span>
                </label>
              </div>
              <div style={{ marginTop: 12 }}>
                {usersLoading ? (
                  <div>Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <div>No users yet. Create a user to start assigning permissions.</div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = String(u.id) === String(selectedUserId);
                    const name = u.full_name || u.email || u.id;
                    const email = u.email || "";
                    const roleLabel =
                      u.role?.charAt(0).toUpperCase() + u.role?.slice(1) || "";
                    const countryLabel = u.country_name || "Unassigned";
                    return (
                      <div
                        key={u.id}
                        className={`access-list-item ${isSelected ? "is-selected" : ""}`}
                        onClick={() => setSelectedUserId(String(u.id))}
                      >
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <div style={{ fontWeight: 600 }}>{name}</div>
                          <div className="small" style={{ color: "#6b7280" }}>
                            {email}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="role-tag">{roleLabel}</span>
                          <span className="role-tag">{countryLabel}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Right pane: user editor */}
            <div className="right-pane">
              {!selectedUserId ? (
                <div style={{ padding: 16 }}>Select a user from the list to edit role and permissions.</div>
              ) : permissionsLoading ? (
                <div>Loading permissions…</div>
              ) : (
                <>
                  {/* User details */}
                  <div className="card" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>User details</div>
                    {(() => {
                      const u = users.find((x) => String(x.id) === String(selectedUserId));
                      if (!u) return null;
                      const name = u.full_name || u.email || u.id;
                      return (
                        <>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{name}</div>
                            <div className="small" style={{ color: "#6b7280" }}>
                              {u.email}
                            </div>
                          </div>
                          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <label className="small" style={{ display: "block", marginBottom: 4 }}>
                                Role
                              </label>
                              <select
                                className="input full"
                                value={selectedUserRole || "user"}
                                onChange={(e) => setSelectedUserRole(e.target.value)}
                              >
                                <option value="user">User</option>
                                <option value="hr">HR</option>
                                <option value="principal">Principal</option>
                                <option value="manager">Manager</option>
                                <option value="accountant">Accountant</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label className="small" style={{ display: "block", marginBottom: 4 }}>
                                Country
                              </label>
                              <select
                                className="input full"
                                value={selectedUserCountryId}
                                onChange={(e) => setSelectedUserCountryId(e.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {countries.map((c) => (
                                  <option key={c.id} value={String(c.id)}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              {selectedUserCountryId === "" && (
                                <div className="small" style={{ color: "#ef4444", marginTop: 4 }}>
                                  Assign a country to edit scoped permissions.
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  {/* Permissions section */}
                  <div className="card">
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissions</div>
                    {!selectedUserCountryId ? (
                      <div>Assign a country to edit scoped permissions.</div>
                    ) : (
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
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {activeTab === "schools" && (
          <div className="access-hub-grid" style={{ marginTop: 16 }}>
            {/* Left pane: country selector and schools list */}
            <div className="left-pane">
              <div style={{ marginBottom: 12, fontWeight: 700 }}>Schools</div>
              <div className="row" style={{ flexDirection: "column", gap: 8 }}>
                <select
                  className="input full"
                  value={selectedCountryId}
                  onChange={(e) => setSelectedCountryId(e.target.value)}
                >
                  <option value="">Select country…</option>
                  {countries.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input full"
                  placeholder="Search schools…"
                  value={searchSchool}
                  onChange={(e) => setSearchSchool(e.target.value)}
                  disabled={!selectedCountryId}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                {!selectedCountryId ? (
                  <div>Select a country to view schools and assign principals.</div>
                ) : schools.length === 0 ? (
                  <div>No schools in this country yet. Create a school to assign principals.</div>
                ) : filteredSchools.length === 0 ? (
                  <div>No schools match your search.</div>
                ) : (
                  filteredSchools.map((s) => {
                    const isSelected = String(s.id) === String(selectedSchoolId);
                    return (
                      <div
                        key={s.id}
                        className={`access-list-item ${isSelected ? "is-selected" : ""}`}
                        onClick={() => setSelectedSchoolId(String(s.id))}
                      >
                        <div>{s.name}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Right pane: placeholder for instructional text */}
            <div className="right-pane">
              {!selectedSchoolId && (
                <div style={{ padding: 16 }}>Select a school to manage principal assignments.</div>
              )}
            </div>
            {selectedSchoolId && (
              <AdminSchoolPrincipalsDrawer
                show={!!selectedSchoolId}
                school={schools.find((s) => String(s.id) === String(selectedSchoolId))}
                users={users}
                countryId={selectedCountryId}
                onClose={() => setSelectedSchoolId(null)}
                onSaved={async (schoolId, assigned) => {
                  // No extra actions needed after saving assignments
                }}
              />
            )}
          </div>
        )}
      </div>
      {/* Unsaved changes action bar */}
      {activeTab === "users" && selectedUserId && hasUnsavedChanges && (
        <div className="permissions-sticky-footer">
          <div className="permissions-sticky-footer-inner">
            <div className="permissions-footer-actions">
              <button className="btn" onClick={discardChanges} disabled={saving || permissionsLoading}>
                Discard
              </button>
              <button
                className="btn primary"
                onClick={saveChanges}
                disabled={saving || permissionsLoading}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modals */}
      {showCreateUser && (
        <AdminCreateUserModal
          show={showCreateUser}
          onClose={() => setShowCreateUser(false)}
          onCreated={() => {
            loadUsers();
            // When creating a new user, also reload countries in case a new country was added elsewhere
            loadCountries();
          }}
          countries={countries}
        />
      )}
      {showCreateSchool && (
        <AdminCreateSchoolModal
          show={showCreateSchool}
          onClose={() => setShowCreateSchool(false)}
          onCreated={(countryId) => {
            // If the new school belongs to the current country in Schools tab, reload schools
            if (String(countryId) === String(selectedCountryId)) {
              loadSchoolsForCountry(countryId);
            }
            // Refresh list regardless
            loadCountries();
          }}
          countries={countries}
        />
      )}
    </div>
  );
}
