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

async function downloadXlsx(schoolId, scenarioId, reportCurrency = "usd") {
  const qs = toQuery({ reportCurrency });
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

  getNormConfig: (schoolId) => request(`/schools/${schoolId}/norm-config`),
  saveNormConfig: (schoolId, payload) => request(`/schools/${schoolId}/norm-config`, { method: "PUT", body: payload }),

  listScenarios: (schoolId) => request(`/schools/${schoolId}/scenarios`),
  createScenario: (schoolId, payload) => request(`/schools/${schoolId}/scenarios`, { method: "POST", body: payload }),
  updateScenario: (schoolId, scenarioId, payload) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}`, { method: "PATCH", body: payload }),
  deleteScenario: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}`, { method: "DELETE" }),
  getScenarioInputs: (schoolId, scenarioId) => request(`/schools/${schoolId}/scenarios/${scenarioId}/inputs`),
  saveScenarioInputs: (schoolId, scenarioId, inputs) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/inputs`, { method: "PUT", body: { inputs } }),
  calculateScenario: (schoolId, scenarioId) => request(`/schools/${schoolId}/scenarios/${scenarioId}/calculate`, { method: "POST" }),
  getReport: (schoolId, scenarioId) => request(`/schools/${schoolId}/scenarios/${scenarioId}/report`),
  submitScenario: (schoolId, scenarioId) =>
    request(`/schools/${schoolId}/scenarios/${scenarioId}/submit`, { method: "POST" }),
  getProgressRequirements: () => request("/meta/progress-requirements"),

  adminGetScenarioQueue: (params = {}) => request(`/admin/scenarios/queue${toQuery(params)}`),
  adminReviewScenario: (scenarioId, body) =>
    request(`/admin/scenarios/${scenarioId}/review`, { method: "PATCH", body }),
  adminGetRollup: (params = {}) => request(`/admin/reports/rollup${toQuery(params)}`),

  downloadXlsx,
  exportXlsxUrl: (schoolId, scenarioId, reportCurrency = "usd") =>
    `${API_BASE}/schools/${schoolId}/scenarios/${scenarioId}/export-xlsx${toQuery({ reportCurrency })}`,
  adminExportRollupXlsxUrl: (academicYear) =>
    `${API_BASE}/admin/reports/rollup.xlsx${toQuery({ academicYear })}`,
};

export { API_BASE };
