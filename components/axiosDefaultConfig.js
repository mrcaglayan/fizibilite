import axios from "axios";
import { toast } from "react-toastify";

console.log("Axios default config loaded.");

// Same-origin base. Works in dev (proxy) and prod (single port).
const API_BASE = process.env.REACT_APP_API_BASE || "/api";

axios.defaults.baseURL = API_BASE.replace(/\/+$/, "");
axios.defaults.timeout = 30000;

// Prevent duplicate interceptor registration (HMR / multiple imports)
if (!window.__AXIOS_INTERCEPTORS_SET__) {
  window.__AXIOS_INTERCEPTORS_SET__ = true;

  // Attach token to every request
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem("token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Global response error handling
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const isCanceled =
        (axios.isCancel && axios.isCancel(error)) ||
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError" ||
        String(error?.message || "").toLowerCase() === "canceled";

      if (isCanceled) {
        return Promise.reject(error);
      }

      const status = error?.response?.status;
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Request failed";

      // Respect per-request silencing
      if (!error.config?.silent) {
        toast.error(msg);
      }

      // Auto logout on 401
      if (status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));
      }

      return Promise.reject(error);
    }
  );
}

// Fetch /auth/me and update localStorage + broadcast update
export async function fetchMe() {
  try {
    const res = await axios.get("/auth/me", { silent: true });
    const user = res.data;
    localStorage.setItem("user", JSON.stringify(user));
    window.dispatchEvent(new CustomEvent("auth:update", { detail: user }));
    return user;
  } catch (err) {
    console.error("fetchMe failed", err);
    throw err;
  }
}

export { API_BASE };
export default axios;
