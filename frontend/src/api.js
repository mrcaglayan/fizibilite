import axios, { API_BASE } from "./components/axiosDefaultConfig";

export function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

export function setToken(token, options = {}) {
  const { remember } = options;
  if (!token) {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    return;
  }

  const hasLocal = localStorage.getItem("token");
  const useLocal = remember ?? Boolean(hasLocal);

  if (useLocal) {
    localStorage.setItem("token", token);
    sessionStorage.removeItem("token");
  } else {
    sessionStorage.setItem("token", token);
    localStorage.removeItem("token");
  }
}

function getAuthHeaders(token) {
  const t = token || getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    qs.set(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : "";
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json", ...getAuthHeaders(token) };

  try {
    const res = await axios.request({
      url: path,
      method,
      headers,
      data: body !== undefined ? body : undefined,
      silent: true,
    });
    return res.data;
  } catch (err) {
    const data = err?.response?.data;
    const msg = data?.error || data?.message || err?.message || "Request failed";
    const out = new Error(msg);
    out.status = err?.response?.status;
    out.data = data;
    throw out;
  }
}

async function downloadXlsx(schoolId, scenarioId, reportCurrency = "usd", mode = "original") {
  const qs = toQuery({ reportCurrency, mode });
  const res = await fetch(
    `${API_BASE}/schools/${schoolId}/scenarios/${scenarioId}/export-xlsx${qs}`,
    { method: "GET", headers: getAuthHeaders() }
  );

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();
    const msg = data?.error || data || "Download failed";
    throw new Error(msg);
  }

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match ? match[1] : `scenario-${scenarioId}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function downloadPdf(schoolId, scenarioId, reportCurrency = "usd", mode = "original") {
  const qs = toQuery({ reportCurrency, mode, format: "pdf" });
  const res = await fetch(
    `${API_BASE}/schools/${schoolId}/scenarios/${scenarioId}/export-xlsx${qs}`,
    { method: "GET", headers: getAuthHeaders() }
  );

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();
    const msg = data?.error || data || "Download failed";
    throw new Error(msg);
  }

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/.exec(cd);
  const contentType = res.headers.get("content-type") || "";
  let filename = match ? match[1] : `scenario-${scenarioId}.pdf`;
  if (contentType.includes("application/pdf") && !filename.toLowerCase().endsWith(".pdf")) {
    filename = `${filename.replace(/\.[^.]+$/, "") || `scenario-${scenarioId}`}.pdf`;
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  getMe: () => request("/auth/me"),

  listCountries: () => request("/admin/countries"),
  createCountry: (payload) => request("/admin/countries", { method: "POST", body: payload }),
  adminListCountrySchools: (countryId, params = {}) =>
    request(`/admin/countries/${countryId}/schools${toQuery(params)}`),
  adminCreateCountrySchool: (countryId, payload) =>
    request(`/admin/countries/${countryId}/schools`, { method: "POST", body: payload }),
  adminUpdateSchool: (schoolId, payload) =>
    request(`/admin/schools/${schoolId}`, { method: "PATCH", body: payload }),
  adminGetProgressRequirements: (countryId) =>
    request(`/admin/progress-requirements${toQuery({ countryId })}`),
  adminSaveProgressRequirements: (countryId, config) =>
    request(`/admin/progress-requirements${toQuery({ countryId })}`, {
      method: "PUT",
      body: { config },
    }),
  adminBulkSaveProgressRequirements: (countryIds, config) =>
    request("/admin/progress-requirements/bulk", {
      method: "PUT",
      body: { countryIds, config },
    }),
  listUsers: (opts = {}) => {
    const qs = opts.unassigned ? "?unassigned=1" : "";
    return request(`/admin/users${qs}`);
  },
  createUser: (payload) => request("/admin/users", { method: "POST", body: payload }),
  assignUserCountry: (userId, payload) => request(`/admin/users/${userId}/country`, { method: "PATCH", body: payload }),
  deleteUser: (userId) => request(`/admin/users/${userId}`, { method: "DELETE" }),

  changePassword: (payload) => request("/auth/change-password", { method: "POST", body: payload }),

  listSchools: () => request("/schools"),
  createSchool: (payload) => request("/schools", { method: "POST", body: payload }),
  deleteSchool: (id) => request(`/schools/${id}`, { method: "DELETE" }),
  getSchool: (id) => request(`/schools/${id}`),

  getNormConfig: (schoolId, scenarioId) => {
    const qs = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : "";
    return request(`/schools/${schoolId}/norm-config${qs}`);
  },
  saveNormConfig: (schoolId, scenarioId, payload) => {
    const qs = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : "";
    return request(`/schools/${schoolId}/norm-config${qs}`, { method: "PUT", body: payload });
  },

  listScenarios: (schoolId) => request(`/schools/${schoolId}/scenarios`),
  createScenario: (schoolId, payload) => request(`/schools/${schoolId}/scenarios`, { method: "POST", body: payload }),
  updateScenario: (schoolId, scenarioId, payload) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}`, { method: "PATCH", body: payload }),
  deleteScenario: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}`, { method: "DELETE" }),
  getScenarioInputs: (schoolId, scenarioId) => request(`/schools/${schoolId}/scenarios/${scenarioId}/inputs`),
  /**
   * Save scenario inputs. Optionally accept a list of modifiedPaths for non‑admin enforcement.
   *
   * The backend enforces that non‑admin users provide a list of modified input paths (e.g.
   * `inputs.temelBilgiler`, `inputs.temelBilgiler.kapasite`) when saving.  The modifiedPaths
   * argument should be an array of strings.  If the caller is an admin or does not need
   * enforcement, omit the modifiedPaths argument or pass undefined.
   */
  /**
   * Save scenario inputs.  In addition to the scenario data (`inputs`), callers
   * should provide a list of modified permission resources to allow the
   * backend to enforce fine‑grained write permissions.  The legacy
   * `modifiedPaths` argument is accepted as a fallback for backward
   * compatibility.  When both lists are provided the backend will prefer
   * `modifiedResources`.
   *
   * @param {number|string} schoolId
   * @param {number|string} scenarioId
   * @param {object} inputs
   * @param {string[]} [modifiedResources] List of permission resource keys (e.g. 'page.gelirler', 'section.giderler.isletme')
   * @param {string[]} [modifiedPaths] Legacy list of dirty input paths for fallback enforcement
   */
  saveScenarioInputs: (schoolId, scenarioId, inputs, modifiedResources, modifiedPaths) => {
    const body = { inputs };
    if (Array.isArray(modifiedResources) && modifiedResources.length > 0) {
      body.modifiedResources = modifiedResources;
    }
    if (Array.isArray(modifiedPaths) && modifiedPaths.length > 0) {
      body.modifiedPaths = modifiedPaths;
    }
    return request(`/schools/${schoolId}/scenarios/${scenarioId}/inputs`, {
      method: "PUT",
      body,
    });
  },
  calculateScenario: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/calculate`, { method: "POST" }),
  getReport: (schoolId, scenarioId, mode = "original") =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/report${toQuery({ mode })}`),
  getScenarioReport: (schoolId, scenarioId, mode = "original") =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/report${toQuery({ mode })}`),
  submitScenario: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/submit`, { method: "POST" }),
  expenseSplitTargets: (academicYear) =>
    request(`/expense-distributions/targets${toQuery({ academicYear })}`),
  previewExpenseSplit: (schoolId, scenarioId, payload) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/expense-split/preview`, {
      method: "POST",
      body: payload,
    }),
  applyExpenseSplit: (schoolId, scenarioId, payload) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/expense-split/apply`, {
      method: "POST",
      body: payload,
    }),

  // Work item API
  /**
   * Fetch the list of work items for a given scenario.  Returns an array
   * of { work_id, resource, state, updated_by, updated_at, submitted_at, reviewed_at, manager_comment } objects.
   */
  listWorkItems: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/work-items`),
  /**
   * Submit a work item (module) for review.  Accepts an optional body
   * containing a `resource` string to override the default
   * `section.<workId>` mapping.  Returns the updated work item.
   */
  submitWorkItem: (schoolId, scenarioId, workId, body) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/work-items/${workId}/submit`, {
      method: 'POST',
      body,
    }),
  /**
   * Review a work item as a manager or accountant.  Requires a body
   * with an `action` ('approve' or 'revise') and an optional `comment`.
   * Returns the updated work item and scenario metadata.
   */
  reviewWorkItem: (schoolId, scenarioId, workId, body) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/work-items/${workId}/review`, {
      method: 'POST',
      body,
    }),
  /**
   * Send a manager‑approved scenario to administrators for final approval.
   */
  sendForApproval: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/send-for-approval`, { method: 'POST' }),
  getProgressRequirements: () => request("/meta/progress-requirements"),

  adminGetScenarioQueue: (params = {}) => request(`/admin/scenarios/queue${toQuery(params)}`),
  adminReviewScenario: (scenarioId, body) =>
    request(`/admin/scenarios/${scenarioId}/review`, { method: "PATCH", body }),
  adminGetRollup: (params = {}) => request(`/admin/reports/rollup${toQuery(params)}`),

  // --- Role & Permission management (admin) ---
  /**
   * Update a user's role. Only admin can call this.
   * @param {number|string} userId
   * @param {{ role: string }} payload
   */
  adminUpdateUserRole: (userId, payload) =>
    request(`/admin/users/${userId}/role`, { method: "PATCH", body: payload }),

  /**
   * Fetch the full permissions catalog grouped by UI labels. Ensures permissions exist in DB.
   */
  adminGetPermissionsCatalog: () => request("/admin/permissions/catalog"),

  /**
   * Get all permissions assigned to a user, including scope information.
   * @param {number|string} userId
   */
  adminGetUserPermissions: (userId) => request(`/admin/users/${userId}/permissions`),

  /**
   * Replace a user's permissions with the provided list. Each permission entry should
   * contain resource, action, scope_country_id, and scope_school_id. Existing
   * permissions are deleted before inserting the new set.
   * @param {number|string} userId
   * @param {{ permissions: Array<{resource: string, action: string, scope_country_id?: number|null, scope_school_id?: number|null}> }} payload
   */
  adminSetUserPermissions: (userId, payload) =>
    request(`/admin/users/${userId}/permissions`, { method: "PUT", body: payload }),

  /**
   * Get the list of users assigned as principals for a given school.
   * @param {number|string} schoolId
   */
  adminGetSchoolPrincipals: (schoolId) =>
    request(`/admin/schools/${schoolId}/principals`),

  /**
   * Assign principals to a school. Accepts an array of user IDs. Existing assignments
   * are removed and replaced with the provided list. Admin only.
   * @param {number|string} schoolId
   * @param {{ userIds: number[] }} payload
   */
  adminSetSchoolPrincipals: (schoolId, payload) =>
    request(`/admin/schools/${schoolId}/principals`, { method: "PUT", body: payload }),
  /**
   * Get the list of principal/HR assignments (with module responsibility) for a school.
   * @param {number|string} schoolId
   */
  adminGetSchoolAssignments: (schoolId) =>
    request(`/admin/schools/${schoolId}/assignments`),
  /**
   * Replace principal/HR assignments (with module responsibility) for a school.
   * @param {number|string} schoolId
   * @param {{ assignments: Array<{userId: number, role: string, modules: string[]}> }} payload
   */
  adminSetSchoolAssignments: (schoolId, payload) =>
    request(`/admin/schools/${schoolId}/assignments`, { method: "PUT", body: payload }),

  // --- Role & Permission management (manager) ---
  /**
   * List users in the manager's country.  Requires manage_permissions permission.
   */
  managerListUsers: () => request("/manager/users"),
  /**
   * Create a new user (principal or HR) within the caller's country.
   * Requires user.create permission.
   */
  managerCreateUser: (payload) => request("/manager/users", { method: "POST", body: payload }),
  /**
   * Update a user's role.  Managers can only assign user, hr, or principal roles.
   * @param {number|string} userId
   * @param {{ role: string }} payload
   */
  managerUpdateUserRole: (userId, payload) =>
    request(`/manager/users/${userId}/role`, { method: "PATCH", body: payload }),
  /**
   * Update a user's email within the manager's country.
   * @param {number|string} userId
   * @param {{ email: string }} payload
   */
  managerUpdateUserEmail: (userId, payload) =>
    request(`/manager/users/${userId}/email`, { method: "PATCH", body: payload }),
  /**
   * Reset a user's password and return a temporary password.
   * @param {number|string} userId
   * @param {{ password?: string }} payload
   */
  managerResetUserPassword: (userId, payload = {}) =>
    request(`/manager/users/${userId}/reset-password`, { method: "POST", body: payload }),
  /**
   * Fetch the full permissions catalog grouped by UI labels. Ensures permissions exist in DB.
   */
  managerGetPermissionsCatalog: () => request("/manager/permissions/catalog"),
  /**
   * Get all permissions assigned to a user, including scope information.
   * @param {number|string} userId
   */
  managerGetUserPermissions: (userId) => request(`/manager/users/${userId}/permissions`),
  /**
   * Replace a user's permissions with the provided list.
   * @param {number|string} userId
   * @param {{ permissions: Array<{resource: string, action: string, scope_country_id?: number|null, scope_school_id?: number|null}> }} payload
   */
  managerSetUserPermissions: (userId, payload) =>
    request(`/manager/users/${userId}/permissions`, { method: "PUT", body: payload }),
  /**
   * Get the list of users assigned as principals for a given school.
   * @param {number|string} schoolId
   */
  managerGetSchoolPrincipals: (schoolId) =>
    request(`/manager/schools/${schoolId}/principals`),
  /**
   * Assign principals to a school.  Managers can only assign principals within their own country.
   * @param {number|string} schoolId
   * @param {{ userIds: number[] }} payload
   */
  managerSetSchoolPrincipals: (schoolId, payload) =>
    request(`/manager/schools/${schoolId}/principals`, { method: "PUT", body: payload }),
  /**
   * Get the list of principal/HR assignments (with module responsibility) for a school.
   * @param {number|string} schoolId
   */
  managerGetSchoolAssignments: (schoolId) =>
    request(`/manager/schools/${schoolId}/assignments`),
  /**
   * Replace principal/HR assignments (with module responsibility) for a school.
   * @param {number|string} schoolId
   * @param {{ assignments: Array<{userId: number, role: string, modules: string[]}> }} payload
   */
  managerSetSchoolAssignments: (schoolId, payload) =>
    request(`/manager/schools/${schoolId}/assignments`, { method: "PUT", body: payload }),
  /**
   * Fetch the manager review queue (scenarios + work items) in a single call.
   */
  managerGetReviewQueue: () => request("/manager/review-queue"),

  downloadXlsx,
  downloadPdf,
  exportXlsxUrl: (schoolId, scenarioId, reportCurrency = "usd") =>
    `${API_BASE}/schools/${schoolId}/scenarios/${scenarioId}/export-xlsx${toQuery({ reportCurrency })}`,
  adminExportRollupXlsxUrl: (academicYear) =>
    `${API_BASE}/admin/reports/rollup.xlsx${toQuery({ academicYear })}`,
};

export { API_BASE };
