import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "react-toastify";
import { FaSchool, FaUserPlus } from "react-icons/fa";
import { api } from "../api";
import { useListSchools, useManagerUsers } from "../hooks/useListQueries";

const REQUIRED_MODULES = [
  "Temel Bilgiler",
  "Kapasite",
  "Norm",
  "İK (HR)",
  "Gelirler",
  "Giderler",
];

const MODULE_ALIASES = {
  "Norm İK (HR)": ["Norm", "İK (HR)"],
};

const ROLE_LABELS = {
  principal: "Principal",
  hr: "HR",
  accountant: "Accountant",
};

const ROLE_OPTIONS = [
  { value: "principal", label: "Principal" },
  { value: "hr", label: "HR" },
];

const normalizeModuleList = (modules) => {
  if (!Array.isArray(modules)) return [];
  const expanded = [];
  modules.forEach((moduleName) => {
    const clean = String(moduleName || "").trim();
    if (!clean) return;
    const alias = MODULE_ALIASES[clean];
    if (alias) {
      expanded.push(...alias);
      return;
    }
    expanded.push(clean);
  });
  return Array.from(new Set(expanded));
};

const normalizeAssignmentsFromApi = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const userId = Number(row?.userId ?? row?.user_id);
      const role = String(row?.role || "").trim().toLowerCase();
      const modules = normalizeModuleList(row?.modules);
      return { userId, role, modules };
    })
    .filter(
      (row) =>
        Number.isFinite(row.userId) &&
        row.userId > 0 &&
        (row.role === "principal" || row.role === "hr" || row.role === "accountant")
    );
};

const normalizeAssignmentPayload = (assignments) =>
  (Array.isArray(assignments) ? assignments : []).map((assignment) => ({
    userId: assignment.userId,
    role: assignment.role,
    modules: normalizeModuleList(assignment.modules),
  }));

export default function ManagePermissionsPage() {
  const outlet = useOutletContext();
  const saveVersionRef = useRef({});

  // === State for users, schools and assignments ===
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [assignmentsBySchool, setAssignmentsBySchool] = useState({});
  const assignmentsBySchoolRef = useRef({});

  // Loading/saving flags
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingSchoolIds, setSavingSchoolIds] = useState({});

  // UI state: which school row is selected (for drawer) and which tab is active
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);
  const [activeTab, setActiveTab] = useState("assignments");

  // Add user drawer state (existing)
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("principal");

  // Create user form state for the Create User tab
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("principal");
  const [createSchoolId, setCreateSchoolId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [createSchoolName, setCreateSchoolName] = useState("");
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [userRoleDrafts, setUserRoleDrafts] = useState({});
  const [userEmailDrafts, setUserEmailDrafts] = useState({});
  const [updatingUserIds, setUpdatingUserIds] = useState({});
  const [resettingUserIds, setResettingUserIds] = useState({});
  const [temporaryPasswords, setTemporaryPasswords] = useState({});

  const usersQuery = useManagerUsers({
    limit: 50,
    offset: 0,
    fields: "brief",
    order: "full_name:asc",
  });
  const usersLoading = usersQuery.isFetching;

  const schoolsQuery = useListSchools({
    limit: 50,
    offset: 0,
    fields: "brief",
    order: "name:asc",
  });
  const schoolsLoading = schoolsQuery.isFetching;

  useEffect(() => {
    // Set a generic title and subtitle for the access management hub.  When
    // this page mounts the header will reflect that users can manage
    // assignments and create new users within their country.
    outlet?.setHeaderMeta?.({
      title: "Manage Permissions",
      subtitle: "Assign users to schools and create new users",
      centered: true,
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

  const normalizeSchoolsList = useCallback((list) => {
    if (Array.isArray(list)) return list;
    if (list && Array.isArray(list.items)) return list.items;
    return [];
  }, []);

  const loadUsers = useCallback(async () => {
    const result = await usersQuery.refetch();
    if (result?.error) {
      console.error(result.error);
      toast.error(result.error?.message || "Failed to load users");
    }
  }, [usersQuery]);

  const loadSchools = useCallback(async () => {
    const result = await schoolsQuery.refetch();
    if (result?.error) {
      console.error(result.error);
      toast.error(result.error?.message || "Failed to load schools");
    }
  }, [schoolsQuery]);

  useEffect(() => {
    const rows = usersQuery.data?.items;
    setUsers(Array.isArray(rows) ? rows : []);
  }, [usersQuery.data]);

  useEffect(() => {
    setSchools(normalizeSchoolsList(schoolsQuery.data));
  }, [schoolsQuery.data, normalizeSchoolsList]);

  useEffect(() => {
    if (!usersQuery.isError) return;
    console.error(usersQuery.error);
    toast.error(usersQuery.error?.message || "Failed to load users");
  }, [usersQuery.isError, usersQuery.error]);

  useEffect(() => {
    if (!schoolsQuery.isError) return;
    console.error(schoolsQuery.error);
    toast.error(schoolsQuery.error?.message || "Failed to load schools");
  }, [schoolsQuery.isError, schoolsQuery.error]);

  const loadAssignmentsForSchools = useCallback(async (schoolsList) => {
    if (!Array.isArray(schoolsList) || schoolsList.length === 0) {
      setAssignmentsBySchool({});
      return;
    }
    setAssignmentsLoading(true);
    try {
      const results = await Promise.allSettled(
        schoolsList.map((school) => api.managerGetSchoolAssignments(school.id))
      );
      const next = {};
      let hasError = false;
      results.forEach((result, index) => {
        const schoolId = schoolsList[index]?.id;
        if (schoolId == null) return;
        if (result.status === "fulfilled") {
          next[String(schoolId)] = normalizeAssignmentsFromApi(result.value);
        } else {
          hasError = true;
          next[String(schoolId)] = [];
        }
      });
      if (hasError) {
        toast.error("Failed to load some school assignments");
      }
      setAssignmentsBySchool(next);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to load school assignments");
      setAssignmentsBySchool({});
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    assignmentsBySchoolRef.current = assignmentsBySchool;
  }, [assignmentsBySchool]);

  useEffect(() => {
    if (schools.length === 0) {
      setAssignmentsBySchool({});
      return;
    }
    loadAssignmentsForSchools(schools);
  }, [schools, loadAssignmentsForSchools]);

  useEffect(() => {
    if (!selectedSchoolId) return;
    if (!schools.some((school) => String(school.id) === String(selectedSchoolId))) {
      setSelectedSchoolId(null);
    }
  }, [schools, selectedSchoolId]);

  useEffect(() => {
    setNewUserId("");
  }, [selectedSchoolId]);

  const selectedSchool = useMemo(
    () => schools.find((school) => String(school.id) === String(selectedSchoolId)) || null,
    [schools, selectedSchoolId]
  );

  const selectedAssignments = useMemo(() => {
    if (!selectedSchool) return [];
    return assignmentsBySchool[String(selectedSchool.id)] || [];
  }, [assignmentsBySchool, selectedSchool]);

  const isSavingSelected = selectedSchool
    ? Boolean(savingSchoolIds[String(selectedSchool.id)])
    : false;

  const getUserById = (id) => users.find((user) => Number(user.id) === Number(id)) || null;

  const getUserLabel = (user) =>
    user?.full_name || user?.name || user?.email || (user?.id != null ? `User ${user.id}` : "Unknown");

  const getMissingModules = (assignments) => {
    const covered = new Set();
    (assignments || []).forEach((assignment) => {
      (assignment.modules || []).forEach((moduleName) => covered.add(moduleName));
    });
    return REQUIRED_MODULES.filter((moduleName) => !covered.has(moduleName));
  };

  const persistAssignments = useCallback(async (schoolId, nextAssignments, previousAssignments) => {
    if (!schoolId) return;
    const key = String(schoolId);
    const nextVersion = (saveVersionRef.current[key] || 0) + 1;
    saveVersionRef.current[key] = nextVersion;
    setSavingSchoolIds((prev) => ({ ...prev, [key]: true }));
    try {
      const payload = normalizeAssignmentPayload(nextAssignments);
      const response = await api.managerSetSchoolAssignments(schoolId, { assignments: payload });
      if (saveVersionRef.current[key] !== nextVersion) return;
      const savedAssignments = Array.isArray(response)
        ? response
        : response?.assignments || payload;
      const normalized = normalizeAssignmentsFromApi(savedAssignments);
      setAssignmentsBySchool((prev) => ({ ...prev, [key]: normalized }));
    } catch (err) {
      console.error(err);
      if (saveVersionRef.current[key] !== nextVersion) return;
      setAssignmentsBySchool((prev) => ({ ...prev, [key]: previousAssignments }));
      toast.error(err?.message || "Failed to save assignments");
    } finally {
      if (saveVersionRef.current[key] === nextVersion) {
        setSavingSchoolIds((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }, []);

  const applyAssignmentUpdate = useCallback(
    (schoolId, updater) => {
      if (!schoolId) return;
      const key = String(schoolId);
      const currentAssignments = Array.isArray(assignmentsBySchoolRef.current[key])
        ? assignmentsBySchoolRef.current[key]
        : [];
      const nextAssignments = updater(currentAssignments);
      if (nextAssignments === currentAssignments) return;
      setAssignmentsBySchool((prev) => ({ ...prev, [key]: nextAssignments }));
      persistAssignments(schoolId, nextAssignments, currentAssignments);
    },
    [persistAssignments]
  );

  const toggleModule = (schoolId, userId, role, moduleName) => {
    applyAssignmentUpdate(schoolId, (assignments) =>
      assignments.map((assignment) => {
        if (assignment.userId !== userId || assignment.role !== role) {
          return assignment;
        }
        const existing = Array.isArray(assignment.modules) ? assignment.modules : [];
        const hasModule = existing.includes(moduleName);
        const modules = hasModule
          ? existing.filter((item) => item !== moduleName)
          : [...existing, moduleName];
        return { ...assignment, modules };
      })
    );
  };

  const toggleAllModules = (schoolId, userId, role, shouldSelectAll) => {
    applyAssignmentUpdate(schoolId, (assignments) =>
      assignments.map((assignment) => {
        if (assignment.userId !== userId || assignment.role !== role) {
          return assignment;
        }
        return {
          ...assignment,
          modules: shouldSelectAll ? [...REQUIRED_MODULES] : [],
        };
      })
    );
  };

  const removeAssignment = (schoolId, userId) => {
    applyAssignmentUpdate(schoolId, (assignments) =>
      assignments.filter((assignment) => assignment.userId !== userId)
    );
  };

  const addAssignment = () => {
    if (!selectedSchool || !newUserId) return;
    const userId = Number(newUserId);
    if (!Number.isFinite(userId)) return;
    const roleToAssign = selectedAddUser?.role === "accountant" ? "accountant" : newRole;
    applyAssignmentUpdate(selectedSchool.id, (assignments) => {
      const alreadyAssigned = assignments.some(
        (assignment) => assignment.userId === userId
      );
      if (alreadyAssigned) return assignments;
      return [
        ...assignments,
        {
          userId,
          role: roleToAssign,
          modules: [],
        },
      ];
    });
    setNewUserId("");
  };

  const availableUsers = useMemo(() => {
    if (!selectedSchool) return [];
    const assignedIds = new Set(
      selectedAssignments.map((assignment) => assignment.userId)
    );
    return users.filter((user) => !assignedIds.has(user.id));
  }, [selectedAssignments, selectedSchool, users]);

  const selectedAddUser = useMemo(() => {
    if (!newUserId) return null;
    return users.find((user) => String(user.id) === String(newUserId)) || null;
  }, [newUserId, users]);

  const isAccountantSelection = selectedAddUser?.role === "accountant";

  useEffect(() => {
    if (!selectedAddUser) return;
    if (selectedAddUser.role === "accountant" && newRole !== "accountant") {
      setNewRole("accountant");
    } else if (selectedAddUser.role !== "accountant" && newRole === "accountant") {
      setNewRole("principal");
    }
  }, [selectedAddUser, newRole]);

  const editableRoles = useMemo(() => ["user", "principal", "hr"], []);

  const handleRoleDraftChange = (userId, value) => {
    setUserRoleDrafts((prev) => ({ ...prev, [userId]: value }));
  };

  const handleEmailDraftChange = (userId, value) => {
    setUserEmailDrafts((prev) => ({ ...prev, [userId]: value }));
  };

  const handleSaveUser = async (user) => {
    if (!user) return;
    const userId = user.id;
    const nextEmail = String(userEmailDrafts[userId] ?? user.email ?? "").trim();
    const nextRole = String(userRoleDrafts[userId] ?? user.role ?? "").trim().toLowerCase();
    const canEditRole = editableRoles.includes(user.role) || editableRoles.includes(nextRole);
    const changes = [];

    if (nextEmail && nextEmail !== user.email) {
      changes.push(() => api.managerUpdateUserEmail(userId, { email: nextEmail }));
    }
    if (canEditRole && nextRole && nextRole !== user.role) {
      changes.push(() => api.managerUpdateUserRole(userId, { role: nextRole }));
    }

    if (changes.length === 0) {
      toast.info("No changes to save");
      return;
    }

    setUpdatingUserIds((prev) => ({ ...prev, [userId]: true }));
    try {
      for (const fn of changes) {
        await fn();
      }
      toast.success("User updated");
      await loadUsers();
      setUserRoleDrafts((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setUserEmailDrafts((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to update user");
    } finally {
      setUpdatingUserIds((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  const handleResetPassword = async (user) => {
    if (!user) return;
    const userId = user.id;
    setResettingUserIds((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await api.managerResetUserPassword(userId);
      const tempPassword = response?.temporary_password;
      if (tempPassword) {
        setTemporaryPasswords((prev) => ({ ...prev, [userId]: tempPassword }));
      }
      toast.success("Temporary password generated");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to reset password");
    } finally {
      setResettingUserIds((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  /**
   * Handle creating a new user and optionally assigning them to a school.
   * The manager API will scope the new user to the caller's country.  If a
   * school is selected in the Create User tab, the newly created user will
   * be automatically assigned to that school with the chosen role and no
   * module responsibilities.  After creation the users and assignments
   * lists are refreshed.
   */
  const handleCreateUser = async (event) => {
    event?.preventDefault?.();
    const trimmedEmail = createEmail.trim();
    if (!trimmedEmail || !createPassword) {
      toast.error("Email and password are required");
      return;
    }
    if (createPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!["principal", "hr"].includes(createRole)) {
      toast.error("Role must be Principal or HR");
      return;
    }
    setCreatingUser(true);
    try {
      const payload = {
        full_name: createFullName ? createFullName.trim() : null,
        email: trimmedEmail,
        password: createPassword,
        role: createRole,
      };
      // Create the user in the manager's country
      const userResp = await api.managerCreateUser(payload);
      toast.success("User created");
      // Refresh users list so the new user is available for assignments
      await loadUsers();
      // If a school was selected, immediately assign the new user to that school
      const schoolId = createSchoolId;
      if (schoolId) {
        const newUserId = userResp?.id;
        if (newUserId) {
          const key = String(schoolId);
          const currentAssignments = Array.isArray(assignmentsBySchoolRef.current[key])
            ? assignmentsBySchoolRef.current[key]
            : [];
          const nextAssignments = [
            ...currentAssignments,
            { userId: newUserId, role: createRole, modules: [] },
          ];
          persistAssignments(schoolId, nextAssignments, currentAssignments);
        }
      }
      // Reset form fields
      setCreateFullName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("principal");
      setCreateSchoolId("");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCreateSchool = async (event) => {
    event?.preventDefault?.();
    const trimmedName = createSchoolName.trim();
    if (!trimmedName) {
      toast.error("School name is required");
      return;
    }
    setCreatingSchool(true);
    try {
      await api.createSchool({ name: trimmedName });
      toast.success("School created");
      setCreateSchoolName("");
      await loadSchools();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to create school");
    } finally {
      setCreatingSchool(false);
    }
  };

  return (
    <div className="permissions-page">
      <div className="container permissions-page-content" style={{ padding: "1rem" }}>
        {/* Top bar with tabs */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="access-hub-tabs">
            <div
              className={`access-hub-tab ${activeTab === "assignments" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("assignments");
                setSelectedSchoolId(null);
              }}
            >
              School assignments
            </div>
            <div
              className={`access-hub-tab ${activeTab === "createUser" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("createUser");
                setSelectedSchoolId(null);
              }}
            >
              Create user
            </div>
            <div
              className={`access-hub-tab ${activeTab === "createSchool" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("createSchool");
                setSelectedSchoolId(null);
              }}
            >
              Create school
            </div>
          </div>
        </div>
        {/* Tab content */}
        {activeTab === "assignments" && (
          <>
            {/* School assignments list */}
            <div className="school-assignments-page" style={{ paddingTop: 24 }}>
              <div className="school-assignments-header">
                <div>
                  <h2>School assignments</h2>
                  <p>Assign principals, HR users, and module responsibility by school.</p>
                </div>
              </div>
              <div className="school-assignments-table-wrap">
                <table className="table school-assignments-table">
                  <thead>
                    <tr>
                      <th>School</th>
                      <th>Principals</th>
                      <th>HR Users</th>
                      <th>Accountants</th>
                      <th>Missing Modules</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schoolsLoading ? (
                      <tr>
                        <td colSpan={5}>Loading schools...</td>
                      </tr>
                    ) : schools.length === 0 ? (
                      <tr>
                        <td colSpan={5}>No schools found.</td>
                      </tr>
                    ) : (
                      schools.map((school) => {
                        const key = String(school.id);
                        const assignments = assignmentsBySchool[key];
                        const assignmentsReady = Array.isArray(assignments);
                        const principals = assignmentsReady
                          ? assignments
                              .filter((assignment) => assignment.role === "principal")
                              .map((assignment) => getUserLabel(getUserById(assignment.userId)))
                          : [];
                        const hrUsers = assignmentsReady
                          ? assignments
                              .filter((assignment) => assignment.role === "hr")
                              .map((assignment) => getUserLabel(getUserById(assignment.userId)))
                          : [];
                        const accountants = assignmentsReady
                          ? assignments
                              .filter((assignment) => assignment.role === "accountant")
                              .map((assignment) => getUserLabel(getUserById(assignment.userId)))
                          : [];
                        const missingModules = assignmentsReady
                          ? getMissingModules(assignments)
                          : [];
                        return (
                          <tr
                            key={school.id}
                            className="school-assignments-row"
                            onClick={() => setSelectedSchoolId(school.id)}
                          >
                            <td>
                              <div className="school-assignments-name">{school.name}</div>
                            </td>
                            <td>
                              {assignmentsReady
                                ? principals.length > 0
                                  ? principals.join(", ")
                                  : "None"
                                : assignmentsLoading
                                  ? "Loading..."
                                  : "None"}
                            </td>
                            <td>
                              {assignmentsReady
                                ? hrUsers.length > 0
                                  ? hrUsers.join(", ")
                                  : "None"
                                : assignmentsLoading
                                  ? "Loading..."
                                  : "None"}
                            </td>
                            <td>
                              {assignmentsReady
                                ? accountants.length > 0
                                  ? accountants.join(", ")
                                  : "None"
                                : assignmentsLoading
                                  ? "Loading..."
                                  : "None"}
                            </td>
                            <td className="school-assignments-missing">
                              {assignmentsReady
                                ? missingModules.length > 0
                                  ? missingModules.join(", ")
                                  : "None"
                                : assignmentsLoading
                                  ? "Loading..."
                                  : "None"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Drawer and overlay for assignments */}
            <div
              className={`school-assignments-overlay ${selectedSchool ? "is-open" : ""}`}
              onClick={() => setSelectedSchoolId(null)}
              role="button"
              aria-label="Close school assignments"
              tabIndex={-1}
            />
            <aside className={`school-assignments-drawer ${selectedSchool ? "is-open" : ""}`}>
              <div className="school-assignments-drawer-header">
                <div>
                  <div className="school-assignments-drawer-title">School assignments</div>
                  <div className="school-assignments-drawer-subtitle">
                    {selectedSchool ? selectedSchool.name : "Select a school"}
                  </div>
                </div>
                <button
                  className="btn school-assignments-close"
                  onClick={() => setSelectedSchoolId(null)}
                  aria-label="Close drawer"
                  type="button"
                >
                  ×
                </button>
              </div>
              <div className="school-assignments-drawer-body">
                {!selectedSchool ? (
                  <div className="school-assignments-empty">Select a school to start editing.</div>
                ) : !Array.isArray(assignmentsBySchool[String(selectedSchool.id)]) ? (
                  <div className="school-assignments-empty">Loading assignments...</div>
                ) : (
                  <>
                    <div className="school-assignments-section-title">Assigned users</div>
                    {selectedAssignments.length === 0 ? (
                      <div className="school-assignments-empty">No users assigned yet.</div>
                    ) : (
                      selectedAssignments.map((assignment) => {
                        const user = getUserById(assignment.userId);
                        const allSelected =
                          REQUIRED_MODULES.length > 0 &&
                          REQUIRED_MODULES.every((module) =>
                            (assignment.modules || []).includes(module)
                          );
                        return (
                          <div
                            key={assignment.userId}
                            className="school-assignments-card"
                          >
                            <div className="school-assignments-card-header">
                              <div>
                                <div className="school-assignments-card-name">
                                  {getUserLabel(user)}
                                </div>
                                <div className="school-assignments-card-role">
                                  {ROLE_LABELS[assignment.role] || assignment.role}
                                </div>
                              </div>
                              <button
                                className="btn btn-sm danger"
                                onClick={() =>
                                  removeAssignment(selectedSchool.id, assignment.userId)
                                }
                                type="button"
                                disabled={isSavingSelected}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="school-assignments-modules">
                              <label className="school-assignments-module-item">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={(event) =>
                                    toggleAllModules(
                                      selectedSchool.id,
                                      assignment.userId,
                                      assignment.role,
                                      event.target.checked
                                    )
                                  }
                                  disabled={isSavingSelected}
                                />
                                <span>Select all</span>
                              </label>
                              {REQUIRED_MODULES.map((moduleName) => (
                                <label
                                  key={moduleName}
                                  className="school-assignments-module-item"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(assignment.modules || []).includes(moduleName)}
                                    onChange={() =>
                                      toggleModule(
                                        selectedSchool.id,
                                        assignment.userId,
                                        assignment.role,
                                        moduleName
                                      )
                                    }
                                    disabled={isSavingSelected}
                                  />
                                  <span>{moduleName}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div className="school-assignments-section-title">Add user</div>
                    <div className="school-assignments-add-card">
                      <div className="school-assignments-add-row">
                        <select
                          className="input"
                          value={newUserId}
                          onChange={(event) => setNewUserId(event.target.value)}
                          disabled={availableUsers.length === 0 || isSavingSelected || usersLoading}
                        >
                          <option value="">Select user</option>
                          {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {getUserLabel(user)}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input"
                          value={newRole}
                          onChange={(event) => setNewRole(event.target.value)}
                          disabled={isSavingSelected || isAccountantSelection}
                        >
                          {(isAccountantSelection
                            ? [{ value: "accountant", label: "Accountant" }]
                            : ROLE_OPTIONS
                          ).map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn primary"
                          onClick={addAssignment}
                          disabled={!newUserId || isSavingSelected}
                          type="button"
                        >
                          Add
                        </button>
                      </div>
                      {!usersLoading && availableUsers.length === 0 && (
                        <div className="small">All users are already assigned.</div>
                      )}
                      {usersLoading && <div className="small">Loading users...</div>}
                    </div>

                    <div className="school-assignments-missing-line">
                      <span className="school-assignments-missing-label">Missing modules:</span>{" "}
                      {getMissingModules(selectedAssignments).length > 0
                        ? getMissingModules(selectedAssignments).join(", ")
                        : "None"}
                      {isSavingSelected && <span className="small">Saving...</span>}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </>
        )}
        {activeTab === "createUser" && (
          /* Create user tab */
          <div className="access-hub-grid" style={{ marginTop: 16 }}>
            <div className="left-pane">
              {/* Left pane can display instructions or remain empty for now */}
              <div style={{ marginBottom: 12, fontWeight: 700 }}>Create a new user</div>
              <div className="small" style={{ marginBottom: 12 }}>
                Fill out the form to create a new Principal or HR user. You can optionally assign the user to a school in your country.
              </div>
            </div>
            <div className="right-pane">
              <form onSubmit={handleCreateUser} className="create-user-form">
                <div className="row" style={{ flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  <input
                    className="input full"
                    placeholder="Full name"
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                  />
                  <input
                    className="input full"
                    placeholder="Email"
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                  />
                  <input
                    className="input full"
                    placeholder="Temporary password"
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                  <select
                    className="input full"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                  >
                    <option value="principal">Principal</option>
                    <option value="hr">HR</option>
                  </select>
                  <select
                    className="input full"
                    value={createSchoolId}
                    onChange={(e) => setCreateSchoolId(e.target.value)}
                  >
                    <option value="">Unassigned to school</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={creatingUser}
                  >
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <FaUserPlus aria-hidden="true" />
                      <span>{creatingUser ? "Creating..." : "Create user"}</span>
                    </span>
                  </button>
                </div>
              </form>
              <div className="user-management-section">
                <div className="user-management-title">Users in your country</div>
                {usersLoading ? (
                  <div className="small">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="small">No users found.</div>
                ) : (
                  <div className="user-management-list">
                    <div className="user-management-header">
                      <div>User</div>
                      <div>Email</div>
                      <div>Role</div>
                      <div>Actions</div>
                    </div>
                    {users.map((user) => {
                      const userId = user.id;
                      const emailValue = userEmailDrafts[userId] ?? user.email ?? "";
                      const roleValue = userRoleDrafts[userId] ?? user.role ?? "user";
                      const canEditRole = editableRoles.includes(user.role);
                      const isUpdating = Boolean(updatingUserIds[userId]);
                      const isResetting = Boolean(resettingUserIds[userId]);
                      return (
                        <div key={userId} className="user-management-row">
                          <div className="user-management-name">
                            <div>{getUserLabel(user)}</div>
                            <div className="small">{user.email}</div>
                          </div>
                          <div>
                            <input
                              className="input full"
                              value={emailValue}
                              onChange={(event) =>
                                handleEmailDraftChange(userId, event.target.value)
                              }
                              disabled={isUpdating}
                            />
                          </div>
                          <div>
                            {canEditRole ? (
                              <select
                                className="input full"
                                value={roleValue}
                                onChange={(event) =>
                                  handleRoleDraftChange(userId, event.target.value)
                                }
                                disabled={isUpdating}
                              >
                                <option value="user">User</option>
                                <option value="principal">Principal</option>
                                <option value="hr">HR</option>
                              </select>
                            ) : (
                              <div className="user-management-role">{user.role}</div>
                            )}
                          </div>
                          <div className="user-management-actions">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleSaveUser(user)}
                              disabled={isUpdating}
                            >
                              {isUpdating ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleResetPassword(user)}
                              disabled={isResetting}
                            >
                              {isResetting ? "Resetting..." : "Reset password"}
                            </button>
                          </div>
                          {temporaryPasswords[userId] && (
                            <div className="user-management-temp">
                              Temporary password:{" "}
                              <span className="user-management-temp-value">
                                {temporaryPasswords[userId]}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "createSchool" && (
          <div className="access-hub-grid" style={{ marginTop: 16 }}>
            <div className="left-pane">
              <div style={{ marginBottom: 12, fontWeight: 700 }}>Create a new school</div>
              <div className="small" style={{ marginBottom: 12 }}>
                Add a school in your country to start assigning users and modules.
              </div>
            </div>
            <div className="right-pane">
              <form onSubmit={handleCreateSchool} className="create-school-form">
                <div className="row" style={{ flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  <input
                    className="input full"
                    placeholder="School name"
                    value={createSchoolName}
                    onChange={(e) => setCreateSchoolName(e.target.value)}
                  />
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={creatingSchool}
                  >
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <FaSchool aria-hidden="true" />
                      <span>{creatingSchool ? "Creating..." : "Create school"}</span>
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
