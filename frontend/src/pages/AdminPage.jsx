//frontend/src/pages/AdminPage.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import Tooltip from "../components/ui/Tooltip";
import { buildProgressCatalog, DEFAULT_PROGRESS_CONFIG } from "../utils/progressCatalog";

const ADMIN_TABS = [
  { key: "users", label: "Users" },
  { key: "countries", label: "Countries" },
  { key: "progress", label: "Progress Tracking" },
  { key: "approvals", label: "Approvals" },
  { key: "reports", label: "Reports" },
];

const YEAR_KEYS = ["y1", "y2", "y3"];

const fmt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "-";
};

const fmtPct = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? (n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%"
    : "-";
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "-";
};

const SAMPLE_DISCOUNTS = [
  "Magis Basari Bursu",
  "Maarif Yetenek Bursu",
  "Ihtiyac Bursu",
  "Okul Basari Bursu",
  "Tam Egitim Bursu",
  "Barinma Bursu",
  "Turkce Basari Bursu",
  "Uluslararasi Yukumluluk Indirimi",
  "Vakif Calisani Indirimi",
  "Kardes Indirimi",
  "Erken Kayit Indirimi",
  "Pesin Odeme Indirimi",
  "Kademe Gecis Indirimi",
  "Temsil Indirimi",
  "Kurum Indirimi",
  "Istisnai Indirim",
  "Yerel Mevzuat Indirimi",
];

function normalizeProgressConfig(config) {
  const defaults = DEFAULT_PROGRESS_CONFIG();
  const input = config && typeof config === "object" ? config : {};
  const sectionsInput = input.sections && typeof input.sections === "object" ? input.sections : {};
  const out = { version: defaults.version, sections: {} };

  Object.keys(defaults.sections).forEach((id) => {
    const base = defaults.sections[id] || {};
    const incoming = sectionsInput[id] && typeof sectionsInput[id] === "object" ? sectionsInput[id] : {};
    out.sections[id] = {
      enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : base.enabled !== false,
      mode: typeof incoming.mode === "string" && incoming.mode ? incoming.mode : base.mode,
      min: incoming.min != null ? Number(incoming.min) : base.min,
      selectedFields:
        incoming.selectedFields && typeof incoming.selectedFields === "object" ? incoming.selectedFields : {},
    };
  });

  return out;
}

const getStatusMeta = (status) => {
  switch (status) {
    case "submitted":
      return { label: "Submitted", className: "is-warn" };
    case "revision_requested":
      return { label: "Revision requested", className: "is-bad" };
    case "approved":
      return { label: "Approved", className: "is-ok" };
    default:
      return { label: "Draft", className: "is-muted" };
  }
};

const getSchoolStatusMeta = (status) => {
  if (status === "closed") return { label: "Closed", className: "is-muted" };
  return { label: "Active", className: "is-ok" };
};

export default function AdminPage() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  const [countries, setCountries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userUpdateLoading, setUserUpdateLoading] = useState(false);
  const [confirmAssign, setConfirmAssign] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [resetLoadingId, setResetLoadingId] = useState(null);

  const [countryName, setCountryName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryRegion, setCountryRegion] = useState("");

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");

  const [assignUserId, setAssignUserId] = useState("");
  const [assignCountryId, setAssignCountryId] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(true);

  const [schoolsCountryId, setSchoolsCountryId] = useState("");
  const [countrySchools, setCountrySchools] = useState([]);
  const [countrySchoolsLoading, setCountrySchoolsLoading] = useState(false);
  const [schoolsSearch, setSchoolsSearch] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [schoolCreateLoading, setSchoolCreateLoading] = useState(false);
  const [schoolSavingId, setSchoolSavingId] = useState(null);
  const [schoolNameDrafts, setSchoolNameDrafts] = useState({});

  const [progressCountryId, setProgressCountryId] = useState("");
  const [progressConfig, setProgressConfig] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressSearch, setProgressSearch] = useState("");
  const [expandedProgressTabs, setExpandedProgressTabs] = useState(new Set());
  const [expandedProgressSections, setExpandedProgressSections] = useState(new Set());

  const [queueRows, setQueueRows] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilters, setQueueFilters] = useState({
    status: "submitted",
    academicYear: "",
    region: "",
    countryId: "",
  });

  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewIncludedYears, setReviewIncludedYears] = useState({
    y1: true,
    y2: true,
    y3: true,
  });
  const [reviewSaving, setReviewSaving] = useState(false);

  const [rollupYear, setRollupYear] = useState("");
  const [rollupData, setRollupData] = useState(null);
  const [rollupLoading, setRollupLoading] = useState(false);
  const [rollupExportOpen, setRollupExportOpen] = useState(false);
  const rollupExportRef = useRef(null);
  const [expandedRegions, setExpandedRegions] = useState(new Set());
  const [expandedCountries, setExpandedCountries] = useState(new Set());

  useEffect(() => {
    document.title = "Admin · Feasibility Studio";
  }, []);

  // Keep latest queue filters without making loadQueue depend on queueFilters
  const queueFiltersRef = useRef(queueFilters);
  useEffect(() => {
    queueFiltersRef.current = queueFilters;
  }, [queueFilters]);

  const selectedUser = useMemo(
    () => users.find((u) => String(u.id) === String(assignUserId)) || null,
    [users, assignUserId]
  );

  const selectedCountry = useMemo(
    () => countries.find((c) => String(c.id) === String(assignCountryId)) || null,
    [countries, assignCountryId]
  );

  const selectedSchoolsCountry = useMemo(
    () => countries.find((c) => String(c.id) === String(schoolsCountryId)) || null,
    [countries, schoolsCountryId]
  );

  const progressCatalogInputs = useMemo(
    () => ({
      discounts: SAMPLE_DISCOUNTS.map((name) => ({ name, ratio: 0, value: 0 })),
    }),
    []
  );

  const progressCatalog = useMemo(
    () => buildProgressCatalog({ inputs: progressCatalogInputs, norm: null }),
    [progressCatalogInputs]
  );

  const progressConfigNormalized = useMemo(
    () => normalizeProgressConfig(progressConfig),
    [progressConfig]
  );

  const isSameCountry =
    selectedUser &&
    selectedCountry &&
    selectedUser.country_id != null &&
    String(selectedUser.country_id) === String(selectedCountry.id);

  const currentAssignmentLabel = selectedUser
    ? selectedUser.country_name
      ? `${selectedUser.country_name} (${selectedUser.country_code})${
          selectedUser.region ? ` - ${selectedUser.region}` : ""
        }`
      : "Unassigned"
    : "Select a user";

  const newAssignmentLabel = selectedCountry
    ? `${selectedCountry.name} (${selectedCountry.code})${
        selectedCountry.region ? ` - ${selectedCountry.region}` : ""
      }`
    : "Select a country";

  const actionLabel = selectedUser?.country_id != null ? "Update Country" : "Assign Country";

  const filteredUsers = useMemo(() => {
    if (!showUnassigned) return users;
    return users.filter((u) => u.country_id == null);
  }, [users, showUnassigned]);

  const regionOptions = useMemo(() => {
    const set = new Set();
    countries.forEach((c) => {
      if (c.region) set.add(c.region);
    });
    return Array.from(set).sort();
  }, [countries]);

  const queueCountryOptions = useMemo(() => {
    if (!queueFilters.region) return countries;
    return countries.filter((c) => c.region === queueFilters.region);
  }, [countries, queueFilters.region]);

  const progressSearchValue = progressSearch.trim().toLowerCase();

  const filteredCountrySchools = useMemo(() => {
    const q = schoolsSearch.trim().toLowerCase();
    if (!q) return countrySchools;
    return countrySchools.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [countrySchools, schoolsSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [countriesRows, userRows] = await Promise.all([api.listCountries(), api.listUsers()]);
      setCountries(countriesRows);
      setUsers(userRows);
    } catch (e) {
      toast.error(e.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCountrySchools = useCallback(async (countryIdArg) => {
    const countryId = Number(countryIdArg);
    if (!Number.isFinite(countryId)) {
      setCountrySchools([]);
      return;
    }
    setCountrySchoolsLoading(true);
    try {
      const rows = await api.adminListCountrySchools(countryId, { includeClosed: 1 });
      setCountrySchools(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(e.message || "Failed to load schools");
    } finally {
      setCountrySchoolsLoading(false);
    }
  }, []);

  const loadProgressRequirements = useCallback(async (countryIdArg) => {
    const countryId = Number(countryIdArg);
    if (!Number.isFinite(countryId)) {
      setProgressConfig(null);
      return;
    }
    setProgressLoading(true);
    try {
      const data = await api.adminGetProgressRequirements(countryId);
      setProgressConfig(normalizeProgressConfig(data?.config || data));
    } catch (e) {
      toast.error(e.message || "Failed to load progress requirements");
      setProgressConfig(normalizeProgressConfig(null));
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async (filtersArg) => {
    const f = filtersArg || queueFiltersRef.current || {};
    setQueueLoading(true);
    try {
      const params = {
        status: f.status,
        academicYear: f.academicYear,
        region: f.region,
        countryId: f.countryId,
      };
      const rows = await api.adminGetScenarioQueue(params);
      setQueueRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(e.message || "Failed to load approvals queue");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadRollup = useCallback(async (academicYearArg) => {
    const academicYear = (academicYearArg ?? rollupYear).trim();
    if (!academicYear) {
      toast.error("Academic year is required");
      return;
    }
    setRollupLoading(true);
    try {
      const data = await api.adminGetRollup({ academicYear });
      setRollupData(data);
    } catch (e) {
      toast.error(e.message || "Failed to load rollup report");
    } finally {
      setRollupLoading(false);
    }
  }, [rollupYear]);

  useEffect(() => {
    if (auth.user?.role === "admin") load();
  }, [auth.user?.role, load]);

  useEffect(() => {
    if (activeTab === "approvals" && auth.user?.role === "admin") {
      loadQueue(); // uses latest filters via ref
    }
  }, [activeTab, auth.user?.role, loadQueue]);

  useEffect(() => {
    if (activeTab !== "countries") return;
    if (!schoolsCountryId) {
      setCountrySchools([]);
      return;
    }
    loadCountrySchools(schoolsCountryId);
  }, [activeTab, loadCountrySchools, schoolsCountryId]);

  useEffect(() => {
    if (activeTab !== "progress") return;
    if (!progressCountryId) {
      setProgressConfig(null);
      return;
    }
    loadProgressRequirements(progressCountryId);
  }, [activeTab, loadProgressRequirements, progressCountryId]);

  useEffect(() => {
    setProgressSearch("");
    setExpandedProgressTabs(new Set());
    setExpandedProgressSections(new Set());
  }, [progressCountryId]);

  useEffect(() => {
    if (!rollupExportOpen) return;
    const handleClick = (event) => {
      const el = rollupExportRef.current;
      if (!el || el.contains(event.target)) return;
      setRollupExportOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setRollupExportOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [rollupExportOpen]);

  useEffect(() => {
    if (!rollupData?.regions) return;
    const regionSet = new Set();
    const countrySet = new Set();
    rollupData.regions.forEach((region) => {
      regionSet.add(region.region);
      region.countries.forEach((country) => {
        countrySet.add(`${region.region}::${country.id}`);
      });
    });
    setExpandedRegions(regionSet);
    setExpandedCountries(countrySet);
  }, [rollupData]);

  useEffect(() => {
    if (!assignUserId) {
      setAssignCountryId("");
      return;
    }
    const user = users.find((u) => String(u.id) === String(assignUserId));
    if (!user) {
      setAssignCountryId("");
      return;
    }
    if (user.country_id != null) setAssignCountryId(String(user.country_id));
    else setAssignCountryId("");
  }, [assignUserId, users]);

  useEffect(() => {
    setSchoolNameDrafts({});
    setSchoolsSearch("");
    setNewSchoolName("");
  }, [schoolsCountryId]);

  async function createCountry() {
    const payload = {
      name: countryName.trim(),
      code: countryCode.trim().toUpperCase(),
      region: countryRegion.trim(),
    };
    if (!payload.name || !payload.code || !payload.region) {
      toast.error("Name, code, and region are required");
      return;
    }
    try {
      await api.createCountry(payload);
      setCountryName("");
      setCountryCode("");
      setCountryRegion("");
      await load();
      toast.success("Country created");
    } catch (e) {
      toast.error(e.message || "Create country failed");
    }
  }

  async function createCountrySchool() {
    if (!schoolsCountryId) {
      toast.error("Select a country");
      return;
    }
    const name = newSchoolName.trim();
    if (!name) {
      toast.error("School name is required");
      return;
    }
    setSchoolCreateLoading(true);
    try {
      await api.adminCreateCountrySchool(schoolsCountryId, { name });
      setNewSchoolName("");
      await loadCountrySchools(schoolsCountryId);
      toast.success("School created");
    } catch (e) {
      toast.error(e.message || "Create school failed");
    } finally {
      setSchoolCreateLoading(false);
    }
  }

  async function createUser() {
    const payload = {
      fullName: newUserName.trim() || null,
      email: newUserEmail.trim(),
      password: newUserPassword,
      role: newUserRole,
    };
    if (!payload.email || !payload.password) {
      toast.error("Email and password are required");
      return;
    }
    if (payload.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    try {
      await api.createUser(payload);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("user");
      await load();
      toast.success("User created (password reset required on first login)");
    } catch (e) {
      toast.error(e.message || "Create user failed");
    }
  }

  async function assignCountry() {
    if (!selectedUser) {
      toast.error("Select a user");
      return;
    }
    if (!assignCountryId) {
      toast.error("Select a country");
      return;
    }
    if (userUpdateLoading) return;
    const nextId = Number(assignCountryId);
    if (!Number.isFinite(nextId)) {
      toast.error("Invalid country selection");
      return;
    }
    if (isSameCountry) {
      toast.error("Selected country is already assigned to this user");
      return;
    }
    if (selectedUser.country_id != null) {
      const currentLabel = selectedUser.country_name
        ? `${selectedUser.country_name} (${selectedUser.country_code})`
        : "Unassigned";
      const nextLabel = selectedCountry ? `${selectedCountry.name} (${selectedCountry.code})` : `#${nextId}`;
      setConfirmAssign({
        userId: selectedUser.id,
        nextId,
        email: selectedUser.email,
        currentLabel,
        nextLabel,
        hadCountry: true,
      });
      return;
    }
    setUserUpdateLoading(true);
    try {
      await api.assignUserCountry(assignUserId, { countryId: nextId });
      await load();
      toast.success("User assigned");
    } catch (e) {
      toast.error(e.message || "Assignment failed");
    } finally {
      setUserUpdateLoading(false);
    }
  }

  async function confirmAssignCountry(data) {
    if (!data) return;
    if (userUpdateLoading) return;
    setUserUpdateLoading(true);
    try {
      await api.assignUserCountry(data.userId, { countryId: data.nextId });
      await load();
      toast.success(data.hadCountry ? "User country updated" : "User assigned");
    } catch (e) {
      toast.error(e.message || "Assignment failed");
    } finally {
      setUserUpdateLoading(false);
    }
  }

  async function deleteUser(user) {
    if (!user || !user.id) return;
    const label = user.email || `User #${user.id}`;
    setConfirmDelete({ id: user.id, label });
  }

  async function confirmDeleteUser(data) {
    if (!data) return;
    try {
      await api.deleteUser(data.id);
      await load();
      toast.success("User deleted");
    } catch (e) {
      toast.error(e.message || "Delete failed");
    }
  }

  function getAuthTokenFromStorage() {
    try {
      const keys = ["token", "auth_token", "jwt", "access_token"];
      for (const k of keys) {
        const v = window?.localStorage?.getItem(k);
        if (v) return String(v);
      }
    } catch {
      // ignore
    }
    return "";
  }

  async function adminResetUserPassword(userId) {
    const token = getAuthTokenFromStorage();
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const msg = data?.error || data?.details || `Reset failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function resetPasswordForUser(user) {
    if (!user?.id) return;
    setConfirmReset({ id: user.id, email: user.email, full_name: user.full_name || null });
  }

  async function confirmResetPassword(data) {
    if (!data?.id) return;
    if (resetLoadingId) return;
    setResetLoadingId(data.id);
    try {
      const out = await adminResetUserPassword(data.id);
      setResetResult({
        id: data.id,
        email: data.email,
        full_name: data.full_name || null,
        temporary_password: out.temporary_password,
      });
      await load();
      toast.success("Temporary password generated");
    } catch (e) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResetLoadingId(null);
    }
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
      return;
    } catch {
      // fallback
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function saveSchoolName(school) {
    if (!school?.id) return;
    const draft = schoolNameDrafts[school.id];
    const nextName = String(draft != null ? draft : school.name || "").trim();
    if (!nextName) {
      toast.error("Name is required");
      return;
    }
    if (nextName === school.name) return;

    setSchoolSavingId(school.id);
    try {
      await api.adminUpdateSchool(school.id, { name: nextName });
      await loadCountrySchools(schoolsCountryId);
      setSchoolNameDrafts((prev) => ({ ...prev, [school.id]: nextName }));
      toast.success("School updated");
    } catch (e) {
      toast.error(e.message || "Update failed");
    } finally {
      setSchoolSavingId(null);
    }
  }

  async function toggleSchoolStatus(school) {
    if (!school?.id) return;
    const nextStatus = school.status === "closed" ? "active" : "closed";
    setSchoolSavingId(school.id);
    try {
      await api.adminUpdateSchool(school.id, { status: nextStatus });
      await loadCountrySchools(schoolsCountryId);
      toast.success(nextStatus === "closed" ? "School closed" : "School reopened");
    } catch (e) {
      toast.error(e.message || "Update failed");
    } finally {
      setSchoolSavingId(null);
    }
  }

  const toggleProgressTab = (tabKey) => {
    setExpandedProgressTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabKey)) next.delete(tabKey);
      else next.add(tabKey);
      return next;
    });
  };

  const toggleProgressSection = (sectionId) => {
    setExpandedProgressSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const updateProgressSection = (sectionId, updater) => {
    setProgressConfig((prev) => {
      const base = normalizeProgressConfig(prev);
      const next = structuredClone(base);
      const section = next.sections?.[sectionId];
      if (!section) return base;
      updater(section);
      return next;
    });
  };

  const setProgressFieldSelected = (sectionId, fieldId, checked) => {
    updateProgressSection(sectionId, (section) => {
      if (!section.selectedFields) section.selectedFields = {};
      if (checked) delete section.selectedFields[fieldId];
      else section.selectedFields[fieldId] = false;
    });
  };

  const setProgressSectionEnabled = (sectionId, enabled) => {
    updateProgressSection(sectionId, (section) => {
      section.enabled = !!enabled;
    });
  };

  const setProgressSectionMode = (sectionId, mode) => {
    updateProgressSection(sectionId, (section) => {
      section.mode = mode;
    });
  };

  const setProgressSectionMin = (sectionId, value) => {
    const num = Number(value);
    updateProgressSection(sectionId, (section) => {
      section.min = Number.isFinite(num) ? Math.max(1, num) : 1;
    });
  };

  const selectAllSectionFields = (sectionId, fieldIds) => {
    updateProgressSection(sectionId, (section) => {
      if (!section.selectedFields) section.selectedFields = {};
      fieldIds.forEach((id) => {
        if (section.selectedFields) delete section.selectedFields[id];
      });
    });
  };

  const unselectAllSectionFields = (sectionId, fieldIds) => {
    updateProgressSection(sectionId, (section) => {
      if (!section.selectedFields) section.selectedFields = {};
      fieldIds.forEach((id) => {
        if (section.selectedFields) section.selectedFields[id] = false;
      });
    });
  };

  const saveProgressConfig = async () => {
    if (!progressCountryId) {
      toast.error("Select a country");
      return;
    }
    setProgressSaving(true);
    try {
      const saved = await api.adminSaveProgressRequirements(progressCountryId, progressConfigNormalized);
      setProgressConfig(normalizeProgressConfig(saved?.config || saved));
      toast.success("Progress requirements saved");
    } catch (e) {
      toast.error(e.message || "Failed to save progress requirements");
    } finally {
      setProgressSaving(false);
    }
  };

  const openReviewModal = (row, action) => {
    setReviewModal({ row, action });
    setReviewNote("");
    setReviewIncludedYears({ y1: true, y2: true, y3: true });
  };

  const closeReviewModal = () => {
    setReviewModal(null);
    setReviewNote("");
    setReviewIncludedYears({ y1: true, y2: true, y3: true });
  };

  const submitReview = async () => {
    if (!reviewModal?.row?.scenario?.id) return;
    const action = reviewModal.action;
    const note = reviewNote.trim();
    if (action === "revise" && !note) {
      toast.error("Note is required for revision requests");
      return;
    }
    const payload = { action, note: note || null };
    if (action === "approve") {
      const includedYears = YEAR_KEYS.filter((key) => reviewIncludedYears[key]);
      if (!includedYears.length) {
        toast.error("Select at least one year");
        return;
      }
      payload.includedYears = includedYears;
    }
    setReviewSaving(true);
    try {
      await api.adminReviewScenario(reviewModal.row.scenario.id, payload);
      toast.success(action === "approve" ? "Scenario approved" : "Revision requested");
      closeReviewModal();
      await loadQueue(); // uses latest filters via ref
    } catch (e) {
      toast.error(e.message || "Review failed");
    } finally {
      setReviewSaving(false);
    }
  };

  const toggleRegion = (regionKey) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionKey)) next.delete(regionKey);
      else next.add(regionKey);
      return next;
    });
  };

  const toggleCountry = (regionKey, countryId) => {
    const key = `${regionKey}::${countryId}`;
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderQueueKpis = (kpi) => {
    if (!kpi) {
      return <div className="kpi-mini kpi-mini-missing">Missing KPIs</div>;
    }
    const margin = kpi.net_ciro ? kpi.net_result / kpi.net_ciro : null;
    return (
      <div className="kpi-mini">
        <div className="kpi-mini-row">
          <span className="kpi-mini-label">Net ciro</span>
          <span className="kpi-mini-value">{fmt(kpi.net_ciro)}</span>
        </div>
        <div className="kpi-mini-row">
          <span className="kpi-mini-label">Net result</span>
          <span className="kpi-mini-value">{fmt(kpi.net_result)}</span>
        </div>
        <div className="kpi-mini-row">
          <span className="kpi-mini-label">Margin</span>
          <span className="kpi-mini-value">{fmtPct(margin)}</span>
        </div>
      </div>
    );
  };

  const renderYearCell = (year) => {
    if (!year) return <div className="rollup-year-cell is-empty">-</div>;
    return (
      <div className="rollup-year-cell">
        <div className="rollup-metric">
          <span className="rollup-label">Net ciro</span>
          <span className="rollup-value">{fmt(year.net_ciro)}</span>
        </div>
        <div className="rollup-metric">
          <span className="rollup-label">Net income</span>
          <span className="rollup-value">{fmt(year.net_income)}</span>
        </div>
        <div className="rollup-metric">
          <span className="rollup-label">Expenses</span>
          <span className="rollup-value">{fmt(year.total_expenses)}</span>
        </div>
        <div className="rollup-metric">
          <span className="rollup-label">Net result</span>
          <span className="rollup-value">{fmt(year.net_result)}</span>
        </div>
        <div className="rollup-metric">
          <span className="rollup-label">Margin</span>
          <span className="rollup-value">{fmtPct(year.profitMargin)}</span>
        </div>
        <div className="rollup-metric">
          <span className="rollup-label">Students</span>
          <span className="rollup-value">{fmt(year.students_total)}</span>
        </div>
      </div>
    );
  };

  const handleRefresh = () => {
    if (activeTab === "approvals") {
      loadQueue(queueFilters);
      return;
    }
    if (activeTab === "progress") {
      if (progressCountryId) loadProgressRequirements(progressCountryId);
      return;
    }
    if (activeTab === "reports") {
      loadRollup(rollupYear);
      return;
    }
    if (activeTab === "countries") {
      load();
      if (schoolsCountryId) loadCountrySchools(schoolsCountryId);
      return;
    }
    load();
  };

  if (!auth.user) {
    return (
      <div className="container">
        <div className="card">Loading...</div>
      </div>
    );
  }

  if (auth.user.role !== "admin") {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 700 }}>Admin only</div>
          <div className="small" style={{ marginTop: 6 }}>
            You do not have permission to view this page.
          </div>
          <div style={{ marginTop: 10 }}>
            <Link to="/schools">Back to Schools</Link>
          </div>
        </div>
      </div>
    );
  }

  const rollupExportDisabled = rollupLoading || !rollupData;
  const rollupXlsxReady = false;

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Admin</div>
          <div className="small">Create users, manage countries, and review scenarios.</div>
        </div>
        <div className="row">
          <Link className="btn" to="/profile">
            Profile
          </Link>
          <Link className="btn" to="/schools">
            Back
          </Link>
          <button
            className="btn"
            onClick={handleRefresh}
            disabled={loading || queueLoading || rollupLoading || progressLoading}
          >
            Refresh
          </button>
          <button className="btn danger" onClick={() => auth.logout()}>
            Logout
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 12 }}>
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ToastContainer position="top-right" autoClose={3500} newestOnTop closeOnClick pauseOnFocusLoss pauseOnHover />

      {userUpdateLoading ? (
        <div className="modal-backdrop" role="status" aria-live="polite" aria-busy="true">
          <style>{`@keyframes adminSpin{to{transform:rotate(360deg)}}`}</style>
          <div
            className="card"
            style={{
              width: "min(360px, 92vw)",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                margin: "0 auto",
                borderRadius: "50%",
                border: "3px solid rgba(0,0,0,.15)",
                borderTopColor: "rgba(0,0,0,.75)",
                animation: "adminSpin .8s linear infinite",
              }}
            />
            <div style={{ fontWeight: 700, marginTop: 10 }}>Updating user...</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Please wait.
            </div>
          </div>
        </div>
      ) : null}

      {confirmAssign ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm Change</div>
            <div className="small" style={{ marginBottom: 12 }}>
              {`Change ${confirmAssign.email} from ${confirmAssign.currentLabel} to ${confirmAssign.nextLabel}?`}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirmAssign(null)} disabled={userUpdateLoading}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const data = confirmAssign;
                  setConfirmAssign(null);
                  confirmAssignCountry(data);
                }}
                disabled={userUpdateLoading}
              >
                {userUpdateLoading ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Confirm Delete</div>
            <div className="small" style={{ marginBottom: 12 }}>
              {`Delete ${confirmDelete.label}? This only works if the user has no related records.`}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const data = confirmDelete;
                  setConfirmDelete(null);
                  confirmDeleteUser(data);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetLoadingId ? (
        <div className="modal-backdrop" role="status" aria-live="polite" aria-busy="true">
          <style>{`@keyframes adminSpin{to{transform:rotate(360deg)}}`}</style>
          <div
            className="card"
            style={{
              width: "min(360px, 92vw)",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                margin: "0 auto",
                borderRadius: "50%",
                border: "3px solid rgba(0,0,0,.15)",
                borderTopColor: "rgba(0,0,0,.75)",
                animation: "adminSpin .8s linear infinite",
              }}
            />
            <div style={{ fontWeight: 700, marginTop: 10 }}>Resetting password...</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Please wait.
            </div>
          </div>
        </div>
      ) : null}

      {confirmReset ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Reset Password</div>
            <div className="small" style={{ marginBottom: 12 }}>
              {`Generate a new temporary password for ${confirmReset.email}? The user will be forced to change it on next login.`}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirmReset(null)} disabled={Boolean(resetLoadingId)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const data = confirmReset;
                  setConfirmReset(null);
                  confirmResetPassword(data);
                }}
                disabled={Boolean(resetLoadingId)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetResult ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Temporary Password</div>
            <div className="small" style={{ marginBottom: 10 }}>
              Share this password securely with the user. It will only be shown once here.
            </div>
            <div className="card" style={{ padding: 12, background: "rgba(0,0,0,.03)" }}>
              <div className="small" style={{ marginBottom: 6 }}>
                User: <strong>{resetResult.email}</strong>
              </div>
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 18 }}>
                  {resetResult.temporary_password}
                </div>
                <button className="btn" onClick={() => copyText(resetResult.temporary_password)}>
                  Copy
                </button>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn primary" onClick={() => setResetResult(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {reviewModal.action === "approve" ? "Approve Scenario" : "Request Revision"}
            </div>
            <div className="small" style={{ marginBottom: 12 }}>
              {reviewModal.row?.school?.name ? `${reviewModal.row.school.name} - ` : ""}
              {reviewModal.row?.scenario?.name || "Scenario"}
            </div>

            {reviewModal.action === "approve" ? (
              <div style={{ marginBottom: 10 }}>
                <div className="small" style={{ marginBottom: 6 }}>
                  Included years
                </div>
                <div className="row">
                  {YEAR_KEYS.map((key) => (
                    <label key={key} className="small" style={{ display: "inline-flex", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={reviewIncludedYears[key]}
                        onChange={(e) => setReviewIncludedYears((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      {key.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ marginBottom: 12 }}>
              <div className="small" style={{ marginBottom: 6 }}>
                Note {reviewModal.action === "revise" ? "(required)" : "(optional)"}
              </div>
              <textarea
                className="input"
                style={{ width: "100%", minHeight: 90 }}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={closeReviewModal}>
                Cancel
              </button>
              <button className="btn primary" onClick={submitReview} disabled={reviewSaving}>
                {reviewSaving ? "Saving..." : reviewModal.action === "approve" ? "Approve" : "Request Revision"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "users" && (
        <>
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Create User</div>
              <div className="row">
                <input
                  className="input"
                  placeholder="Full name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Temporary password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <select className="input sm" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="btn primary" onClick={createUser} disabled={loading}>
                  Create
                </button>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                New users must reset their password on first login.
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Assign / Edit User Country</div>
              <div className="small" style={{ marginBottom: 6 }}>
                {selectedUser
                  ? `Editing: ${selectedUser.email}${
                      selectedUser.full_name ? ` (${selectedUser.full_name})` : ""
                    } #${selectedUser.id}`
                  : "Select a user to assign or edit."}
              </div>
              <div className="row">
                <select className="input" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} {u.full_name ? `(${u.full_name})` : ""} #{u.id}
                    </option>
                  ))}
                </select>
                <select className="input" value={assignCountryId} onChange={(e) => setAssignCountryId(e.target.value)}>
                  <option value="">Select country</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - {c.region}
                    </option>
                  ))}
                </select>
                <button
                  className="btn primary"
                  onClick={assignCountry}
                  disabled={loading || userUpdateLoading || !assignUserId || !assignCountryId || isSameCountry}
                >
                  {userUpdateLoading ? "Updating..." : actionLabel}
                </button>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                <div>Current: {currentAssignmentLabel}</div>
                <div>New: {newAssignmentLabel}</div>
                {selectedUser && selectedCountry && selectedUser.country_id != null && !isSameCountry ? (
                  <div style={{ color: "#b45309" }}>You are changing this user's assignment.</div>
                ) : null}
                {isSameCountry ? <div style={{ color: "#6b7280" }}>Selected country matches current assignment.</div> : null}
                Users must re-login after assignment to refresh their token.
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>Users</div>
              <label className="small">
                <input type="checkbox" checked={showUnassigned} onChange={(e) => setShowUnassigned(e.target.checked)} />{" "}
                Unassigned only
              </label>
            </div>
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Reset</th>
                  <th>Country</th>
                  <th>Region</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="small">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="small">{u.id}</td>
                      <td>{u.full_name || "-"}</td>
                      <td>{u.email}</td>
                      <td className="small">{u.role}</td>
                      <td>{u.must_reset_password ? <span className="badge">Yes</span> : <span className="small">No</span>}</td>
                      <td>
                        {u.country_name ? <span>{u.country_name} ({u.country_code})</span> : <span className="badge">Unassigned</span>}
                      </td>
                      <td>{u.region || "-"}</td>
                      <td>
                        <div className="row">
                          <button className="btn" onClick={() => setAssignUserId(String(u.id))}>
                            Edit
                          </button>
                          <button
                            className="btn"
                            onClick={() => resetPasswordForUser(u)}
                            disabled={Boolean(resetLoadingId)}
                          >
                            Reset password
                          </button>
                          <button className="btn" onClick={() => deleteUser(u)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="small" style={{ marginTop: 8 }}>
              Delete is blocked if the user has created or updated records.
            </div>
          </div>
        </>
      )}

      {activeTab === "countries" && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Create Country</div>
            <div className="row">
              <input
                className="input"
                placeholder="Country name"
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
              />
              <input
                className="input sm"
                placeholder="Code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              />
              <input
                className="input"
                placeholder="Region"
                value={countryRegion}
                onChange={(e) => setCountryRegion(e.target.value)}
              />
              <button className="btn primary" onClick={createCountry} disabled={loading}>
                Create
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Countries</div>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {countries.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="small">
                      No countries yet.
                    </td>
                  </tr>
                ) : (
                  countries.map((c) => (
                    <tr key={c.id}>
                      <td className="small">{c.id}</td>
                      <td>{c.name}</td>
                      <td className="small">{c.code}</td>
                      <td>{c.region}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Country Schools</div>
            <div className="row" style={{ marginBottom: 10 }}>
              <select
                className="input"
                value={schoolsCountryId}
                onChange={(e) => setSchoolsCountryId(e.target.value)}
              >
                <option value="">Select a country</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Search schools"
                value={schoolsSearch}
                onChange={(e) => setSchoolsSearch(e.target.value)}
                disabled={!schoolsCountryId}
              />
            </div>

            <div className="row" style={{ marginBottom: 10 }}>
              <input
                className="input"
                placeholder="New school name"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                disabled={!schoolsCountryId || schoolCreateLoading}
              />
              <button
                className="btn primary"
                onClick={createCountrySchool}
                disabled={!schoolsCountryId || schoolCreateLoading}
              >
                {schoolCreateLoading ? "Creating..." : "Create"}
              </button>
            </div>

            {!selectedSchoolsCountry ? (
              <div className="small">Select a country to manage its schools.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Closed At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {countrySchoolsLoading ? (
                    <tr>
                      <td colSpan="5" className="small">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredCountrySchools.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="small">
                        No schools found.
                      </td>
                    </tr>
                  ) : (
                    filteredCountrySchools.map((school) => {
                      const statusMeta = getSchoolStatusMeta(school.status);
                      const draftName = schoolNameDrafts[school.id] ?? school.name ?? "";
                      const isSaving = schoolSavingId === school.id;

                      return (
                        <tr key={school.id}>
                          <td>{school.name}</td>
                          <td>
                            <span className={`status-badge ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="small">{formatDateTime(school.created_at)}</td>
                          <td className="small">{formatDateTime(school.closed_at)}</td>
                          <td>
                            <div className="row">
                              <input
                                className="input sm"
                                value={draftName}
                                onChange={(e) =>
                                  setSchoolNameDrafts((prev) => ({
                                    ...prev,
                                    [school.id]: e.target.value,
                                  }))
                                }
                                disabled={isSaving}
                              />
                              <button
                                className="btn primary"
                                onClick={() => saveSchoolName(school)}
                                disabled={isSaving}
                              >
                                Save
                              </button>
                              <button
                                className="btn"
                                onClick={() => toggleSchoolStatus(school)}
                                disabled={isSaving}
                              >
                                {school.status === "closed" ? "Reopen" : "Close"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === "progress" && (
        <div style={{ marginTop: 12 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Progress Tracking</div>
                <div className="small">Configure per-field requirements by country.</div>
              </div>
              <div className="row">
                <select
                  className="input sm"
                  value={progressCountryId}
                  onChange={(e) => setProgressCountryId(e.target.value)}
                >
                  <option value="">Select country</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input sm"
                  placeholder="Search fields"
                  value={progressSearch}
                  onChange={(e) => setProgressSearch(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={saveProgressConfig}
                  disabled={!progressCountryId || progressSaving || progressLoading}
                >
                  {progressSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          {!progressCountryId ? (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="small">Select a country to edit progress rules.</div>
            </div>
          ) : (
            <div className="card" style={{ marginTop: 12 }}>
              {progressLoading ? (
                <div className="small">Loading...</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {progressCatalog.tabs.map((tab) => {
                    const tabSections = progressCatalog.sections.filter((s) => s.tabKey === tab.key);
                    const visibleSections = tabSections.filter((section) => {
                      if (!progressSearchValue) return true;
                      const sectionMatch = String(section.label || "").toLowerCase().includes(progressSearchValue);
                      const fields = (section.fields || [])
                        .map((id) => progressCatalog.fieldsById[id])
                        .filter(Boolean);
                      const fieldMatch = fields.some((f) => {
                        const label = String(f.label || "").toLowerCase();
                        const id = String(f.id || "").toLowerCase();
                        return label.includes(progressSearchValue) || id.includes(progressSearchValue);
                      });
                      return sectionMatch || fieldMatch;
                    });

                    if (!visibleSections.length) return null;
                    const tabExpanded = expandedProgressTabs.has(tab.key) || Boolean(progressSearchValue);

                    return (
                      <div key={tab.key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <div className="row">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => toggleProgressTab(tab.key)}
                            >
                              {tabExpanded ? "-" : "+"}
                            </button>
                            <div style={{ fontWeight: 700 }}>{tab.label}</div>
                          </div>
                          <div className="small">{tabSections.length} sections</div>
                        </div>

                        {tabExpanded ? (
                          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                            {visibleSections.map((section) => {
                              const sectionConfig = progressConfigNormalized.sections?.[section.id] || {};
                              const sectionEnabled = sectionConfig.enabled !== false;
                              const sectionMode = String(sectionConfig.mode || section.modeDefault || "ALL").toUpperCase();
                              const sectionMin =
                                Number.isFinite(Number(sectionConfig.min)) && Number(sectionConfig.min) > 0
                                  ? Number(sectionConfig.min)
                                  : section.minDefault || 1;

                              const allFields = (section.fields || [])
                                .map((id) => progressCatalog.fieldsById[id])
                                .filter(Boolean);
                              const filteredFields = progressSearchValue
                                ? allFields.filter((field) => {
                                    const label = String(field.label || "").toLowerCase();
                                    const id = String(field.id || "").toLowerCase();
                                    return label.includes(progressSearchValue) || id.includes(progressSearchValue);
                                  })
                                : allFields;

                              if (!filteredFields.length && progressSearchValue) return null;

                              const sectionExpanded = expandedProgressSections.has(section.id) || Boolean(progressSearchValue);
                              const fieldIdsForBulk = (progressSearchValue ? filteredFields : allFields).map((f) => f.id);
                              const selectedCount = allFields.filter(
                                (field) => sectionConfig.selectedFields?.[field.id] !== false
                              ).length;

                              return (
                                <div key={section.id} style={{ borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
                                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                                    <div className="row">
                                      <button
                                        type="button"
                                        className="btn"
                                        onClick={() => toggleProgressSection(section.id)}
                                      >
                                        {sectionExpanded ? "-" : "+"}
                                      </button>
                                      <div style={{ fontWeight: 700 }}>{section.label}</div>
                                      <span className={`status-badge ${sectionEnabled ? "is-ok" : "is-muted"}`}>
                                        {sectionEnabled ? "Enabled" : "Disabled"}
                                      </span>
                                      <span className="small">
                                        {selectedCount}/{allFields.length || 0} selected
                                      </span>
                                    </div>

                                    <div className="row">
                                      <label className="small">
                                        <input
                                          type="checkbox"
                                          checked={sectionEnabled}
                                          onChange={(e) => setProgressSectionEnabled(section.id, e.target.checked)}
                                        />{" "}
                                        Enabled
                                      </label>
                                      <select
                                        className="input xs"
                                        value={sectionMode}
                                        onChange={(e) => setProgressSectionMode(section.id, e.target.value)}
                                      >
                                        <option value="ALL">ALL</option>
                                        <option value="MIN">MIN</option>
                                      </select>
                                      {sectionMode === "MIN" ? (
                                        <input
                                          className="input xs"
                                          type="number"
                                          min="1"
                                          value={sectionMin}
                                          onChange={(e) => setProgressSectionMin(section.id, e.target.value)}
                                        />
                                      ) : null}
                                      <button
                                        className="btn"
                                        onClick={() => selectAllSectionFields(section.id, fieldIdsForBulk)}
                                        disabled={!fieldIdsForBulk.length}
                                      >
                                        Select all
                                      </button>
                                      <button
                                        className="btn"
                                        onClick={() => unselectAllSectionFields(section.id, fieldIdsForBulk)}
                                        disabled={!fieldIdsForBulk.length}
                                      >
                                        Unselect all
                                      </button>
                                    </div>
                                  </div>

                                  {sectionExpanded ? (
                                    <div style={{ marginTop: 8 }}>
                                      {!filteredFields.length ? (
                                        <div className="small">No fields available for this section.</div>
                                      ) : (
                                        <div className="grid2" style={{ gap: 8 }}>
                                          {filteredFields.map((field) => {
                                            const checked = sectionConfig.selectedFields?.[field.id] !== false;
                                            return (
                                              <label key={field.id} className="small" style={{ display: "flex", gap: 8 }}>
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  onChange={(e) =>
                                                    setProgressFieldSelected(section.id, field.id, e.target.checked)
                                                  }
                                                  disabled={!sectionEnabled}
                                                />
                                                <span>{field.label || field.id}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "approvals" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Scenario Approvals</div>
              <div className="small">Review submitted scenarios and approve for rollups.</div>
            </div>
            <div className="row admin-filter-row">
              <select
                className="input sm"
                value={queueFilters.status}
                onChange={(e) => setQueueFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="revision_requested">Revision requested</option>
                <option value="draft">Draft</option>
              </select>
              <input
                className="input sm"
                placeholder="Academic year"
                value={queueFilters.academicYear}
                onChange={(e) => setQueueFilters((prev) => ({ ...prev, academicYear: e.target.value }))}
              />
              <select
                className="input sm"
                value={queueFilters.region}
                onChange={(e) => setQueueFilters((prev) => ({ ...prev, region: e.target.value, countryId: "" }))}
              >
                <option value="">All regions</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                className="input sm"
                value={queueFilters.countryId}
                onChange={(e) => setQueueFilters((prev) => ({ ...prev, countryId: e.target.value }))}
              >
                <option value="">All countries</option>
                {queueCountryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* ✅ don't pass click event */}
              <button className="btn" onClick={() => loadQueue(queueFilters)} disabled={queueLoading}>
                Apply
              </button>
            </div>
          </div>

          <table className="table admin-approvals-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>School</th>
                <th>Scenario</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Y1 KPIs</th>
                <th>Y2 KPIs</th>
                <th>Y3 KPIs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queueLoading ? (
                <tr>
                  <td colSpan="9" className="small">
                    Loading...
                  </td>
                </tr>
              ) : queueRows.length === 0 ? (
                <tr>
                  <td colSpan="9" className="small">
                    No scenarios found.
                  </td>
                </tr>
              ) : (
                queueRows.map((row) => {
                  const statusMeta = getStatusMeta(row.scenario?.status);
                  const canApprove = row.scenario?.status === "submitted";
                  const canRevise = ["submitted", "approved"].includes(row.scenario?.status);
                  const missing = row.missingKpis?.y1 || row.missingKpis?.y2 || row.missingKpis?.y3;
                  const progressPct = Number.isFinite(Number(row.scenario?.progress_pct))
                    ? Math.round(Number(row.scenario.progress_pct))
                    : null;
                  const progressLines = row.scenario?.progress_json?.missingDetailsLines;
                  const progressTooltipLines =
                    progressPct == null
                      ? []
                      : Array.isArray(progressLines) && progressLines.length
                        ? ["Eksik:", ...progressLines]
                        : ["Tum tablar tamamlandi"];

                  return (
                    <tr key={row.scenario?.id || `${row.school?.id}-${row.scenario?.name}`}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.school?.name || "-"}</div>
                        <div className="small">{row.country?.name || ""}</div>
                      </td>
                      <td>
                        <div>{row.scenario?.name || "-"}</div>
                        {missing ? <span className="status-badge is-bad">Missing KPIs</span> : null}
                      </td>
                      <td className="small">{formatDateTime(row.scenario?.submitted_at)}</td>
                      <td>
                        <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                      </td>
                      <td>
                        {progressPct == null ? (
                          <span className="small">-</span>
                        ) : (
                          <Tooltip lines={progressTooltipLines}>
                            <span className="badge">{progressPct}%</span>
                          </Tooltip>
                        )}
                      </td>
                      <td>{renderQueueKpis(row.kpis?.y1)}</td>
                      <td>{renderQueueKpis(row.kpis?.y2)}</td>
                      <td>{renderQueueKpis(row.kpis?.y3)}</td>
                      <td>
                        <div className="row">
                          <button
                            className="btn primary"
                            onClick={() => openReviewModal(row, "approve")}
                            disabled={!canApprove || reviewSaving}
                          >
                            Approve
                          </button>
                          <button
                            className="btn"
                            onClick={() => openReviewModal(row, "revise")}
                            disabled={!canRevise || reviewSaving}
                          >
                            Revise
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "reports" && (
        <div style={{ marginTop: 12 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Rollup Reports</div>
                <div className="small">Approved scenarios only. Select an academic year.</div>
              </div>
              <div className="row">
                <input
                  className="input sm"
                  placeholder="Academic year"
                  value={rollupYear}
                  onChange={(e) => setRollupYear(e.target.value)}
                />
                <button className="btn" onClick={() => loadRollup(rollupYear)} disabled={rollupLoading}>
                  {rollupLoading ? "Loading..." : "Load"}
                </button>

                <div className="action-menu" ref={rollupExportRef}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (rollupExportDisabled) return;
                      setRollupExportOpen((prev) => !prev);
                    }}
                    disabled={rollupExportDisabled}
                    aria-haspopup="menu"
                    aria-expanded={rollupExportOpen}
                  >
                    Export
                  </button>
                  {rollupExportOpen ? (
                    <div className="action-menu-panel" role="menu">
                      <button
                        type="button"
                        className="action-menu-item"
                        onClick={() => {
                          setRollupExportOpen(false);
                          if (!rollupXlsxReady) return;
                          const url = api.adminExportRollupXlsxUrl(rollupYear.trim());
                          window.location.assign(url);
                        }}
                        disabled={!rollupXlsxReady}
                        title={rollupXlsxReady ? "Download Excel" : "Excel export coming soon"}
                        role="menuitem"
                      >
                        Excel (.xlsx){rollupXlsxReady ? "" : " (coming soon)"}
                      </button>
                      <button type="button" className="action-menu-item" disabled role="menuitem">
                        PDF (coming soon)
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {rollupData ? (
            <>
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Consolidated KPIs</div>
                <div className="admin-kpi-strip" style={{ marginTop: 10 }}>
                  {YEAR_KEYS.map((key) => (
                    <div key={key} className="admin-kpi-year">
                      <div className="admin-kpi-year-title">{key.toUpperCase()}</div>
                      <div className="admin-kpi-grid">
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Net ciro</div>
                          <div className="admin-kpi-value">{fmt(rollupData.totals?.[key]?.net_ciro)}</div>
                        </div>
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Net income</div>
                          <div className="admin-kpi-value">{fmt(rollupData.totals?.[key]?.net_income)}</div>
                        </div>
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Expenses</div>
                          <div className="admin-kpi-value">{fmt(rollupData.totals?.[key]?.total_expenses)}</div>
                        </div>
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Net result</div>
                          <div className="admin-kpi-value">{fmt(rollupData.totals?.[key]?.net_result)}</div>
                        </div>
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Margin</div>
                          <div className="admin-kpi-value">{fmtPct(rollupData.totals?.[key]?.profitMargin)}</div>
                        </div>
                        <div className="admin-kpi">
                          <div className="admin-kpi-label">Students</div>
                          <div className="admin-kpi-value">{fmt(rollupData.totals?.[key]?.students_total)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Rollup Tree</div>
                <div className="small" style={{ marginTop: 4 }}>
                  Only approved scenarios are consolidated. Excluded years show as blank.
                </div>

                <div className="rollup-table-wrap" style={{ marginTop: 10 }}>
                  <table className="table rollup-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 220 }}>Unit</th>
                        <th style={{ minWidth: 220 }}>Y1</th>
                        <th style={{ minWidth: 220 }}>Y2</th>
                        <th style={{ minWidth: 220 }}>Y3</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="rollup-row rollup-total">
                        <td className="rollup-name">Totals</td>
                        <td>{renderYearCell(rollupData.totals?.y1)}</td>
                        <td>{renderYearCell(rollupData.totals?.y2)}</td>
                        <td>{renderYearCell(rollupData.totals?.y3)}</td>
                      </tr>

                      {rollupData.regions?.map((region) => {
                        const regionKey = region.region || "Unknown";
                        const regionExpanded = expandedRegions.has(regionKey);
                        return (
                          <React.Fragment key={`region-${regionKey}`}>
                            <tr className="rollup-row rollup-region">
                              <td className="rollup-name">
                                <button
                                  type="button"
                                  className="tree-toggle"
                                  onClick={() => toggleRegion(regionKey)}
                                  aria-label="Toggle region"
                                >
                                  {regionExpanded ? "-" : "+"}
                                </button>
                                <span className="rollup-title">{region.region || "Unknown region"}</span>
                              </td>
                              <td>{renderYearCell(region.years?.y1)}</td>
                              <td>{renderYearCell(region.years?.y2)}</td>
                              <td>{renderYearCell(region.years?.y3)}</td>
                            </tr>

                            {regionExpanded
                              ? region.countries?.map((country) => {
                                  const countryKey = `${regionKey}::${country.id}`;
                                  const countryExpanded = expandedCountries.has(countryKey);
                                  return (
                                    <React.Fragment key={countryKey}>
                                      <tr className="rollup-row rollup-country">
                                        <td className="rollup-name level-1">
                                          <button
                                            type="button"
                                            className="tree-toggle"
                                            onClick={() => toggleCountry(regionKey, country.id)}
                                            aria-label="Toggle country"
                                          >
                                            {countryExpanded ? "-" : "+"}
                                          </button>
                                          <span className="rollup-title">{country.name}</span>
                                        </td>
                                        <td>{renderYearCell(country.years?.y1)}</td>
                                        <td>{renderYearCell(country.years?.y2)}</td>
                                        <td>{renderYearCell(country.years?.y3)}</td>
                                      </tr>

                                      {countryExpanded
                                        ? country.schools?.map((school) => (
                                            <tr key={`school-${school.id}`} className="rollup-row rollup-school">
                                              <td className="rollup-name level-2">
                                                {school.name}
                                                {school.included_years?.length ? (
                                                  <span className="rollup-sub">({school.included_years.join(", ")})</span>
                                                ) : null}
                                              </td>
                                              <td>{renderYearCell(school.years?.y1)}</td>
                                              <td>{renderYearCell(school.years?.y2)}</td>
                                              <td>{renderYearCell(school.years?.y3)}</td>
                                            </tr>
                                          ))
                                        : null}
                                    </React.Fragment>
                                  );
                                })
                              : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {rollupData.missingNoApproved?.length ? (
                <div className="card admin-alert" style={{ marginTop: 12 }}>
                  <div className="admin-alert-title">Schools without an approved scenario</div>
                  <ul>
                    {rollupData.missingNoApproved.map((row) => (
                      <li key={`missing-${row.id}`}>
                        {row.name} ({row.country_name})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {rollupData.missingKpis?.length ? (
                <div className="card admin-alert" style={{ marginTop: 12 }}>
                  <div className="admin-alert-title">Approved scenarios missing KPI snapshots</div>
                  <ul>
                    {rollupData.missingKpis.map((row) => (
                      <li key={`missing-kpi-${row.scenario_id}`}>
                        Scenario #{row.scenario_id} (School #{row.school_id}) - missing {row.missingYears.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="small">Select an academic year to view the rollup report.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
