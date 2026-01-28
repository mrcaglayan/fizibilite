//frontend/src/pages/AdminPage.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import Tooltip from "../components/ui/Tooltip";
import { buildProgressCatalog, DEFAULT_PROGRESS_CONFIG } from "../utils/progressCatalog";
import { ADMIN_TABS } from "../data/adminTabs";



const YEAR_KEYS = ["y1", "y2", "y3"];

// Required module identifiers used in the scenario workflow.  When
// requesting a revision, the admin can choose which of these modules
// should be unlocked for editing.  These values must stay in sync
// with the backend REQUIRED_WORK_IDS constant defined in
// backend/src/utils/scenarioWorkflow.js.
const REQUIRED_WORK_IDS = [
  "temel_bilgiler",
  "kapasite",
  "norm.ders_dagilimi",
  "ik.local_staff",
  "gelirler.unit_fee",
  "giderler.isletme",
];

// Human-readable labels for each required module.  Used in the
// admin revision modal to present checkboxes to select which
// modules should be sent back for revision.
const WORK_ID_LABELS = {
  temel_bilgiler: "Temel Bilgiler",
  kapasite: "Kapasite",
  "norm.ders_dagilimi": "Norm",
  "ik.local_staff": "İK",
  "gelirler.unit_fee": "Gelirler",
  "giderler.isletme": "Giderler",
};
const DEFAULT_ADMIN_TAB = ADMIN_TABS[0]?.key || "users";
const isValidAdminTab = (value) => ADMIN_TABS.some((tab) => tab.key === value);
const getTabFromSearch = (search) => {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const value = params.get("tab");
  return isValidAdminTab(value) ? value : null;
};

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

// Compute status badge metadata for a scenario.  Accepts either a status
// string or a full scenario object.  When a scenario is approved but
// has not yet been forwarded to administrators (sent_at is null), it
// is considered manager-approved (“Kontrol edildi”).
const getStatusMeta = (scenarioOrStatus) => {
  const obj = scenarioOrStatus && typeof scenarioOrStatus === 'object' ? scenarioOrStatus : { status: scenarioOrStatus };
  const status = obj.status;
  const sentAt = obj.sent_at;
  switch (status) {
    case 'revision_requested':
      return { label: 'Revize istendi', className: 'is-bad' };
    case 'sent_for_approval':
      return { label: 'Merkeze iletildi', className: 'is-warn' };
    case 'approved':
      if (sentAt) {
        return { label: 'Onaylandı', className: 'is-ok' };
      }
      return { label: 'Kontrol edildi', className: 'is-ok' };
    case 'in_review':
      return { label: 'İncelemede', className: 'is-warn' };
    case 'submitted':
      return { label: 'Onayda', className: 'is-warn' };
    case 'draft':
      return { label: 'Taslak', className: 'is-muted' };
    default:
      return { label: 'Taslak', className: 'is-muted' };
  }
};

const getSchoolStatusMeta = (status) => {
  if (status === "closed") return { label: "Closed", className: "is-muted" };
  return { label: "Active", className: "is-ok" };
};

const getDynamicHint = (sectionId, field) => {
  if (!field) return null;
  const id = String(field.id || "");
  const label = String(field.label || "");
  if (sectionId === "gradesPlan.plan") {
    if (id.startsWith("gradesPlan.") || label.includes("Plan ")) return "grade";
  }
  if (sectionId === "ik.localStaff" && id.startsWith("ik.headcount.")) return "type";
  if (sectionId === "gelirler.unitFee" && id.startsWith("gelirler.tuition.")) return "type";
  return null;
};

export default function AdminPage({ forcedTab = null } = {}) {
  const auth = useAuth();
  const outlet = useOutletContext();
  const location = useLocation();
  const normalizedForcedTab = isValidAdminTab(forcedTab) ? forcedTab : null;
  const [activeTab, setActiveTab] = useState(() => {
    if (normalizedForcedTab) return normalizedForcedTab;
    const fromSearch = getTabFromSearch(location.search);
    if (fromSearch) return fromSearch;
    try {
      const stored = localStorage.getItem("admin.activeTab");
      if (isValidAdminTab(stored)) return stored;
    } catch (_) {
      // ignore
    }
    return DEFAULT_ADMIN_TAB;
  });
  useEffect(() => {
    if (normalizedForcedTab) return;
    const fromSearch = getTabFromSearch(location.search);
    if (fromSearch && fromSearch !== activeTab) {
      setActiveTab(fromSearch);
      return;
    }
    if (!fromSearch && activeTab !== DEFAULT_ADMIN_TAB) {
      setActiveTab(DEFAULT_ADMIN_TAB);
    }
  }, [location.search, activeTab, normalizedForcedTab]);
  useEffect(() => {
    if (!normalizedForcedTab) return;
    if (activeTab !== normalizedForcedTab) setActiveTab(normalizedForcedTab);
  }, [normalizedForcedTab, activeTab]);
  useEffect(() => {
    if (normalizedForcedTab) return;
    try {
      localStorage.setItem("admin.activeTab", activeTab);
    } catch (_) {
      // ignore
    }
  }, [activeTab, normalizedForcedTab]);

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
  const [newUserCountryId, setNewUserCountryId] = useState("");

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
  const [progressTargetIds, setProgressTargetIds] = useState(() => new Set());
  const [progressCountryListSearch, setProgressCountryListSearch] = useState("");
  const [progressBulkSaving, setProgressBulkSaving] = useState(false);
  const [showOnlySelectedBySection, setShowOnlySelectedBySection] = useState({});
  const [expandedProgressTabs, setExpandedProgressTabs] = useState(new Set());
  const [expandedProgressSections, setExpandedProgressSections] = useState(new Set());

  const [queueRows, setQueueRows] = useState([]);

  // Permissions catalog & user permissions state (for admin permission editor)
  const [permissionsCatalog, setPermissionsCatalog] = useState(null);
  // Map of permission key (resource|action) to boolean indicating selected for the current user
  const [permissionSelections, setPermissionSelections] = useState({});
  // Map of permission key to scope identifier: "country" or "school:<id>"
  const [permissionScopes, setPermissionScopes] = useState({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  // List of schools in the selected user's country for scope selection
  const [userSchools, setUserSchools] = useState([]);
  // Define role options for admin when editing a user's role.  Admins can
  // assign any role, including manager/accountant and admin.
  const roleOptions = useMemo(
    () => [
      { value: "user", label: "User" },
      { value: "principal", label: "Principal" },
      { value: "hr", label: "HR" },
      { value: "manager", label: "Manager" },
      { value: "accountant", label: "Accountant" },
      { value: "admin", label: "Admin" },
    ],
    []
  );

  // Track updating of a user's role when editing via the admin Users tab.
  const [roleUpdating, setRoleUpdating] = useState(false);

  // Principal assignments state per school
  // principalLists maps schoolId -> array of user objects assigned as principals
  const [principalLists, setPrincipalLists] = useState({});
  // principalDrafts maps schoolId -> array of userIds currently selected in the editor
  const [principalDrafts, setPrincipalDrafts] = useState({});
  // Track saving state per school when updating principal assignments
  const [principalSaving, setPrincipalSaving] = useState({});
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilters, setQueueFilters] = useState({
    status: "",
    academicYear: "",
    region: "",
    countryId: "",
  });

  const [queueSort, setQueueSort] = useState({ key: null, dir: null });

  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewIncludedYears, setReviewIncludedYears] = useState({
    y1: true,
    y2: true,
    y3: true,
  });

  // When the admin requests a revision on a scenario, they must select
  // which modules should be reopened for editing.  This state maps
  // module identifiers (work ids) to booleans indicating whether
  // that module is selected for revision.  It is initialized when
  // opening the revision modal.
  const [reviewRevisionSelection, setReviewRevisionSelection] = useState(() => {
    const initial = {};
    REQUIRED_WORK_IDS.forEach((id) => (initial[id] = false));
    return initial;
  });

  // Helpers to select or clear all modules in the revision selection.  These
  // functions are memoized via useCallback to avoid re-creating on
  // every render.
  const selectAllRevisionWork = useCallback(() => {
    const next = {};
    REQUIRED_WORK_IDS.forEach((id) => (next[id] = true));
    setReviewRevisionSelection(next);
  }, []);

  const clearRevisionWork = useCallback(() => {
    const next = {};
    REQUIRED_WORK_IDS.forEach((id) => (next[id] = false));
    setReviewRevisionSelection(next);
  }, []);
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

  useEffect(() => {
    outlet?.setHeaderMeta({
      title: "Admin",
      subtitle: "Create users, manage countries, and review scenarios.",
    });
    return () => {
      outlet?.clearHeaderMeta?.();
    };
  }, [outlet]);

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

  // Load principal lists for each school when the country schools list changes
  useEffect(() => {
    // Only load when we are on the countries tab and have schools for the selected country
    if (activeTab !== "countries") return;
    if (!Array.isArray(countrySchools) || countrySchools.length === 0) return;
    countrySchools.forEach((school) => {
      const id = school.id;
      // If we haven't loaded this school's principals yet, fetch them
      if (principalLists[id] === undefined) {
        (async () => {
          try {
            const list = await api.adminGetSchoolPrincipals(id);
            setPrincipalLists((prev) => ({ ...prev, [id]: Array.isArray(list) ? list : [] }));
            // Initialize draft selection with current principal IDs
            const ids = Array.isArray(list) ? list.map((u) => u.id) : [];
            setPrincipalDrafts((prev) => ({ ...prev, [id]: ids }));
          } catch (e) {
            console.error(e);
            // Do not toast here to avoid spam; errors will be shown on save
          }
        })();
      }
    });
  }, [activeTab, countrySchools, principalLists]);

  // Load permissions catalog, user permissions, and schools list for the selected user
  useEffect(() => {
    // derive simple IDs from the selectedUser to avoid stale object dependencies
    const userId = selectedUser?.id;
    const countryId = selectedUser?.country_id;
    // If no user selected, reset and exit early
    if (!userId) {
      setPermissionsCatalog(null);
      setPermissionSelections({});
      setPermissionScopes({});
      setUserSchools([]);
      return;
    }
    setPermissionsLoading(true);
    Promise.all([
      api.adminGetPermissionsCatalog(),
      api.adminGetUserPermissions(userId),
      countryId ? api.adminListCountrySchools(countryId) : Promise.resolve([]),
    ])
      .then(([catalogData, userPerms, schoolsData]) => {
        setPermissionsCatalog(catalogData || null);
        // Determine scope options: flatten schools list
        let schoolsList = [];
        if (Array.isArray(schoolsData)) {
          schoolsList = schoolsData;
        } else if (schoolsData && Array.isArray(schoolsData.items)) {
          schoolsList = schoolsData.items;
        }
        setUserSchools(schoolsList);
        // Initialize selection and scope state from existing user perms
        const sel = {};
        const scopeMap = {};
        (userPerms || []).forEach((p) => {
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
      })
      .catch((e) => {
        console.error(e);
        toast.error(e?.message || "Failed to load permissions");
      })
      .finally(() => {
        setPermissionsLoading(false);
      });
  }, [selectedUser]);

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
      ? `${selectedUser.country_name} (${selectedUser.country_code})${selectedUser.region ? ` - ${selectedUser.region}` : ""
      }`
      : "Unassigned"
    : "Select a user";

  const newAssignmentLabel = selectedCountry
    ? `${selectedCountry.name} (${selectedCountry.code})${selectedCountry.region ? ` - ${selectedCountry.region}` : ""
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

  // Group permissions by their catalog group for display
  const permissionsGrouped = useMemo(() => {
    // When no catalog loaded, return empty object
    if (!permissionsCatalog) return {};
    // Backend returns a grouped object (group -> array of permissions) via
    // /admin/permissions/catalog. When it's already grouped, return it as is.
    if (!Array.isArray(permissionsCatalog) && typeof permissionsCatalog === "object") {
      return permissionsCatalog;
    }
    // Otherwise if an array is provided, group by the `group` property on each entry.
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

  const queueCountryOptions = useMemo(() => {
    if (!queueFilters.region) return countries;
    return countries.filter((c) => c.region === queueFilters.region);
  }, [countries, queueFilters.region]);

  const toggleQueueSort = useCallback((key) => {
    const cycles = {
      academic_year: ["desc", "asc", null],
      country_name: ["asc", "desc", null],
      school_name: ["asc", "desc", null],
      scenario_name: ["asc", "desc", null],
      submitted_at: ["desc", "asc", null],
      status: ["asc", "desc", null],
    };

    setQueueSort((prev) => {
      const cycle = cycles[key] || ["asc", "desc", null];
      if (prev.key !== key) return { key, dir: cycle[0] };

      const i = cycle.indexOf(prev.dir);
      const next = cycle[(i + 1) % cycle.length];
      if (!next) return { key: null, dir: null };
      return { key, dir: next };
    });
  }, [setQueueSort]);

  const sortIndicator = useCallback(
    (key) => {
      if (queueSort.key !== key || !queueSort.dir) return "";
      return queueSort.dir === "asc" ? "▲" : "▼";
    },
    [queueSort]
  );

  const ariaSort = useCallback(
    (key) => {
      if (queueSort.key !== key || !queueSort.dir) return "none";
      return queueSort.dir === "asc" ? "ascending" : "descending";
    },
    [queueSort]
  );

  const sortedQueueRows = useMemo(() => {
    const base = Array.isArray(queueRows) ? queueRows : [];
    if (!queueSort?.key || !queueSort?.dir) return base;

    const parseAcademicYear = (value) => {
      const raw = String(value || "").trim();
      const nums = raw.match(/\d{4}/g) || [];
      const a = nums[0] ? Number(nums[0]) : -1;
      const b = nums[1] ? Number(nums[1]) : a;
      return { a, b, raw: raw.toLowerCase() };
    };

    const getValue = (row) => {
      switch (queueSort.key) {
        case "country_name":
          return String(row.country?.name || "");
        case "school_name":
          return String(row.school?.name || "");
        case "scenario_name":
          return String(row.scenario?.name || "");
        case "academic_year":
          return parseAcademicYear(row.scenario?.academic_year);
        case "submitted_at":
          return row.scenario?.submitted_at ? new Date(row.scenario.submitted_at).getTime() : -Infinity;
        case "status":
          return String(row.scenario?.status || "");
        default:
          return "";
      }
    };

    const dirMul = queueSort.dir === "desc" ? -1 : 1;
    const cmpStr = (a, b) =>
      String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });

    const decorated = base.map((row, idx) => ({ row, idx, val: getValue(row) }));

    decorated.sort((A, B) => {
      let c = 0;
      const av = A.val;
      const bv = B.val;

      if (queueSort.key === "academic_year") {
        c = (av?.a ?? -1) - (bv?.a ?? -1);
        if (c === 0) c = (av?.b ?? -1) - (bv?.b ?? -1);
        if (c === 0) c = cmpStr(av?.raw, bv?.raw);
      } else if (typeof av === "number" && typeof bv === "number") {
        c = av - bv;
      } else {
        c = cmpStr(av, bv);
      }

      if (c === 0) return A.idx - B.idx; // back to server order
      return c * dirMul;
    });

    return decorated.map((d) => d.row);
  }, [queueRows, queueSort]);

  const progressSearchValue = progressSearch.trim().toLowerCase();

  const filteredCountriesForApply = useMemo(() => {
    const q = progressCountryListSearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const code = String(c.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [countries, progressCountryListSearch]);

  const progressTargetCount = progressTargetIds.size;
  const progressBulkDisabled =
    !progressCountryId ||
    progressTargetCount === 0 ||
    progressSaving ||
    progressLoading ||
    progressBulkSaving;

  const filteredCountrySchools = useMemo(() => {
    const q = schoolsSearch.trim().toLowerCase();
    if (!q) return countrySchools;
    return countrySchools.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [countrySchools, schoolsSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [countriesRows, userData] = await Promise.all([
        api.listCountries(),
        api.listUsers({ limit: 50, offset: 0, fields: "brief", order: "id:desc" }),
      ]);
      setCountries(countriesRows);
      setUsers(Array.isArray(userData?.items) ? userData.items : []);
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
    if (newUserCountryId) {
      const nextId = Number(newUserCountryId);
      if (!Number.isFinite(nextId)) {
        toast.error("Invalid country selection");
        return;
      }
      payload.countryId = nextId;
    }
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
      setNewUserCountryId("");
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

  // --- Permission editor helpers ---
  /**
   * Toggle selection of a permission key (resource|action) in the UI.
   * When enabling a permission for the first time without a scope, defaults to country scope.
   */
  function togglePermission(key) {
    setPermissionSelections((prev) => {
      const next = { ...prev };
      next[key] = !prev[key];
      return next;
    });
    setPermissionScopes((prev) => {
      // When turning on a permission that doesn’t have a scope yet, default to country
      if (!permissionSelections[key] && !prev[key]) {
        return { ...prev, [key]: "country" };
      }
      return prev;
    });
  }

  /**
   * Change the scope for a permission key.
   * @param {string} key The permission key (resource|action)
   * @param {string} value The selected scope: "country" or "school:<id>"
   */
  function changePermissionScope(key, value) {
    setPermissionScopes((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Persist the current permission selections for the selected user.
   * Constructs the payload based on selected permissions and scopes and sends
   * it to the backend. Afterwards reloads the user’s permissions from the
   * server to ensure UI consistency.
   */
  async function saveUserPermissions() {
    if (!selectedUser) {
      toast.error("Select a user to edit permissions");
      return;
    }
    const perms = [];
    const keys = Object.keys(permissionSelections || {});
    keys.forEach((key) => {
      if (!permissionSelections[key]) return;
      const [resource, action] = key.split("|");
      let scopeVal = permissionScopes[key] || "country";
      let scope_country_id = null;
      let scope_school_id = null;
      // Determine scope
      if (scopeVal === "country") {
        // assign scope_country_id based on user's country_id if available
        if (selectedUser.country_id != null) {
          scope_country_id = Number(selectedUser.country_id);
        }
      } else if (scopeVal.startsWith("school:")) {
        const idStr = scopeVal.split(":")[1];
        const sid = Number(idStr);
        if (Number.isFinite(sid)) {
          scope_school_id = sid;
        }
        // set country_id if available
        if (selectedUser.country_id != null) {
          scope_country_id = Number(selectedUser.country_id);
        }
      }
      perms.push({ resource, action, scope_country_id, scope_school_id });
    });
    setPermissionsSaving(true);
    try {
      await api.adminSetUserPermissions(selectedUser.id, { permissions: perms });
      // Reload user permissions to reflect server state
      const updated = await api.adminGetUserPermissions(selectedUser.id);
      // Recompute selections and scopes based on the latest permissions returned
      const sel = {};
      const scopeMap = {};
      (updated || []).forEach((p) => {
        const k = `${p.resource}|${p.action}`;
        sel[k] = true;
        if (p.scope_school_id != null) {
          scopeMap[k] = `school:${p.scope_school_id}`;
        } else {
          scopeMap[k] = "country";
        }
      });
      setPermissionSelections(sel);
      setPermissionScopes(scopeMap);
      toast.success("Permissions saved");
    } catch (e) {
      toast.error(e?.message || "Save permissions failed");
    } finally {
      setPermissionsSaving(false);
    }
  }

  /**
   * Update the role of the currently selected user.  This is triggered
   * when an admin chooses a new role from the role selector.  The
   * function calls the adminUpdateUserRole API and then refreshes
   * the list of users to reflect the change.  Displays success or
   * error messages via toast notifications.
   *
   * @param {string} role The new role to assign to the user
   */
  async function updateSelectedUserRole(role) {
    // Ensure there is a selected user before updating
    if (!selectedUser) return;
    setRoleUpdating(true);
    try {
      await api.adminUpdateUserRole(selectedUser.id, { role });
      // Reload data so the user list reflects the new role
      await load();
      // Maintain the current selection after reload
      setAssignUserId(String(selectedUser.id));
      toast.success("Role updated");
    } catch (e) {
      toast.error(e?.message || "Failed to update role");
    } finally {
      setRoleUpdating(false);
    }
  }

  // --- Principal assignment helpers ---
  /**
   * Handle selection of principal users for a school. Updates the draft state.
   * @param {number} schoolId
   * @param {string[]} valueIds Array of selected userId strings from a multi‑select element
   */
  function handlePrincipalSelectionChange(schoolId, valueIds) {
    const ids = valueIds.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    setPrincipalDrafts((prev) => ({ ...prev, [schoolId]: ids }));
  }

  /**
   * Save principal assignments for a given school. Sends the current draft
   * selection to the backend and updates the local principal list.
   * @param {number} schoolId
   */
  async function savePrincipalAssignments(schoolId) {
    const userIds = principalDrafts[schoolId] || [];
    setPrincipalSaving((prev) => ({ ...prev, [schoolId]: true }));
    try {
      await api.adminSetSchoolPrincipals(schoolId, { userIds });
      // Update local list with selected principal user objects
      const newList = users.filter((u) => u.role === "principal" && userIds.includes(u.id));
      setPrincipalLists((prev) => ({ ...prev, [schoolId]: newList }));
      toast.success("Principals updated");
    } catch (e) {
      toast.error(e?.message || "Failed to update principals");
    } finally {
      setPrincipalSaving((prev) => ({ ...prev, [schoolId]: false }));
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

  const toggleTargetCountry = (countryId) => {
    const id = Number(countryId);
    if (!Number.isFinite(id)) return;
    setProgressTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllTargets = () => {
    setProgressTargetIds((prev) => {
      const next = new Set(prev);
      filteredCountriesForApply.forEach((country) => {
        const id = Number(country.id);
        if (Number.isFinite(id)) next.add(id);
      });
      return next;
    });
  };

  const clearTargets = () => {
    setProgressTargetIds(new Set());
  };

  const applyProgressConfigToSelectedCountries = async () => {
    const ids = Array.from(progressTargetIds)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      toast.error("Select at least one country");
      return;
    }
    if (!progressCountryId) {
      toast.error("Select a country to edit rules first");
      return;
    }
    const ok = window.confirm(
      `Apply this configuration to ${uniqueIds.length} countries? This will overwrite their current rules.`
    );
    if (!ok) return;

    setProgressBulkSaving(true);
    try {
      const result = await api.adminBulkSaveProgressRequirements(uniqueIds, progressConfigNormalized);
      const updatedCount = Number.isFinite(Number(result?.updatedCount))
        ? Number(result.updatedCount)
        : uniqueIds.length;
      toast.success(`Applied to ${updatedCount} countries`);
      if (uniqueIds.some((id) => String(id) === String(progressCountryId))) {
        await loadProgressRequirements(progressCountryId);
      }
    } catch (e) {
      toast.error(e.message || "Failed to apply progress requirements");
    } finally {
      setProgressBulkSaving(false);
    }
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
    if (action === "revise") {
      // Reset revision selection: all modules unchecked by default
      const initial = {};
      REQUIRED_WORK_IDS.forEach((id) => (initial[id] = false));
      setReviewRevisionSelection(initial);
    }
  };

  const closeReviewModal = () => {
    setReviewModal(null);
    setReviewNote("");
    setReviewIncludedYears({ y1: true, y2: true, y3: true });
    // Reset revision selections on close
    const reset = {};
    REQUIRED_WORK_IDS.forEach((id) => (reset[id] = false));
    setReviewRevisionSelection(reset);
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
    } else if (action === "revise") {
      // Collect selected revision work ids.  At least one must be selected.
      const revisionWorkIds = REQUIRED_WORK_IDS.filter((id) => reviewRevisionSelection[id]);
      if (!revisionWorkIds.length) {
        toast.error("Select at least one module");
        return;
      }
      payload.revisionWorkIds = revisionWorkIds;
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
  const refreshDisabled = loading || queueLoading || rollupLoading || progressLoading;
  const renderRefreshButton = () => (
    <button className="btn" onClick={handleRefresh} disabled={refreshDisabled}>
      Refresh
    </button>
  );

  return (
    <>
      {outlet?.headerPortalEl ? createPortal(renderRefreshButton(), outlet.headerPortalEl) : null}
      <div className="container">
        {!outlet?.headerPortalEl && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>Admin</div>
              <div className="small">Create users, manage countries, and review scenarios.</div>
            </div>
            {renderRefreshButton()}
          </div>
        )}

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

            {reviewModal.action === "revise" ? (
              <div style={{ marginBottom: 10 }}>
                <div className="small" style={{ marginBottom: 6 }}>
                  Sadece seçilen modüller revizeye açılacak (editable).
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {REQUIRED_WORK_IDS.map((id) => (
                    <label
                      key={id}
                      className="small"
                      style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(reviewRevisionSelection[id])}
                        onChange={(e) =>
                          setReviewRevisionSelection((prev) => ({ ...prev, [id]: e.target.checked }))
                        }
                      />
                      {WORK_ID_LABELS[id] || id}
                    </label>
                  ))}
                  <button type="button" className="btn sm" onClick={selectAllRevisionWork}>
                    Tümünü seç
                  </button>
                  <button type="button" className="btn sm" onClick={clearRevisionWork}>
                    Temizle
                  </button>
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
                  <option value="principal">Principal</option>
                  <option value="hr">HR</option>
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
                </select>
                <select
                  className="input"
                  value={newUserCountryId}
                  onChange={(e) => setNewUserCountryId(e.target.value)}
                >
                  <option value="">Assign country (optional)</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}){c.region ? ` - ${c.region}` : ""}
                    </option>
                  ))}
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
                  ? `Editing: ${selectedUser.email}${selectedUser.full_name ? ` (${selectedUser.full_name})` : ""
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

            {/* Permissions editor for the selected user */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissions</div>
              {/* Only render the editor when a user is selected */}
              {!selectedUser ? (
                <div className="small">Select a user above to edit permissions.</div>
              ) : permissionsLoading ? (
                <div className="small">Loading permissions...</div>
              ) : (
                <>
                  {/* Role selector for admin to change the user's role */}
                  <div style={{ marginBottom: 8 }}>
                    <label className="small" style={{ marginRight: 8 }}>Role:</label>
                    <select
                      className="input sm"
                      value={selectedUser?.role || "user"}
                      onChange={(e) => updateSelectedUserRole(e.target.value)}
                      disabled={roleUpdating}
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {Object.keys(permissionsGrouped).length === 0 ? (
                    <div className="small">No permissions defined.</div>
                  ) : (
                    Object.entries(permissionsGrouped).map(([groupName, perms]) => (
                      <div key={groupName} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{groupName}</div>
                        {perms.map((perm) => {
                          const key = `${perm.resource}|${perm.action}`;
                          const isSelected = Boolean(permissionSelections[key]);
                          const scopeValue = permissionScopes[key] || "country";
                          return (
                            <div key={key} className="row" style={{ alignItems: "center", marginBottom: 4 }}>
                              <label className="small" style={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePermission(key)}
                                />
                                {perm.label}
                              </label>
                              {/* Scope selector */}
                              <select
                                className="input sm"
                                disabled={!isSelected}
                                value={scopeValue}
                                onChange={(e) => changePermissionScope(key, e.target.value)}
                              >
                                <option value="country">Country</option>
                                {userSchools && userSchools.map((s) => (
                                  <option key={s.id} value={`school:${s.id}`}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn primary" onClick={saveUserPermissions} disabled={permissionsSaving}>
                      {permissionsSaving ? "Saving..." : "Save Permissions"}
                    </button>
                  </div>
                </>
              )}
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
                    <th>Principals</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {countrySchoolsLoading ? (
                    <tr>
                      <td colSpan="6" className="small">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredCountrySchools.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="small">
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
                          {/* Principals column: show assigned principal names */}
                          <td>
                            {Array.isArray(principalLists[school.id]) && principalLists[school.id].length > 0 ? (
                              <span>{principalLists[school.id].map((u) => u.full_name || u.email).join(", ")}</span>
                            ) : (
                              <span className="small muted">-</span>
                            )}
                          </td>
                          <td>
                            {/* School name edit and status toggle */}
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
                            {/* Principal assignment editor */}
                            <div className="row" style={{ marginTop: 4 }}>
                              <select
                                multiple
                                className="input sm"
                                value={(principalDrafts[school.id] || []).map(String)}
                                onChange={(e) => {
                                  const opts = Array.from(e.target.selectedOptions || []);
                                  const values = opts.map((o) => o.value);
                                  handlePrincipalSelectionChange(school.id, values);
                                }}
                              >
                                {users
                                  .filter((u) => u.role === "principal")
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.email} {u.full_name ? `(${u.full_name})` : ""} #{u.id}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="btn"
                                onClick={() => savePrincipalAssignments(school.id)}
                                disabled={Boolean(principalSaving[school.id])}
                              >
                                {principalSaving[school.id] ? "Saving..." : "Save"}
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

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Apply to multiple countries</div>
            <div className="row" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <input
                className="input sm"
                placeholder="Search countries"
                value={progressCountryListSearch}
                onChange={(e) => setProgressCountryListSearch(e.target.value)}
              />
              <button
                className="btn"
                onClick={selectAllTargets}
                disabled={filteredCountriesForApply.length === 0 || progressBulkSaving}
              >
                Select all
              </button>
              <button
                className="btn"
                onClick={clearTargets}
                disabled={progressTargetCount === 0 || progressBulkSaving}
              >
                Clear
              </button>
              <button
                className="btn primary"
                onClick={applyProgressConfigToSelectedCountries}
                disabled={progressBulkDisabled}
              >
                {progressBulkSaving ? "Applying..." : `Apply to Selected (${progressTargetCount})`}
              </button>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 10,
                background: "#fff",
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {filteredCountriesForApply.length === 0 ? (
                <div className="small">No countries found.</div>
              ) : (
                filteredCountriesForApply.map((country) => {
                  const id = Number(country.id);
                  const checked = progressTargetIds.has(id);
                  return (
                    <label
                      key={country.id}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTargetCountry(id)}
                      />
                      <span>{country.name || "-"}</span>
                    </label>
                  );
                })
              )}
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
                              const totalCount = allFields.length;
                              const showOnlySelected = Boolean(showOnlySelectedBySection[section.id]);
                              const visibleFields = showOnlySelected
                                ? filteredFields.filter((field) => sectionConfig.selectedFields?.[field.id] !== false)
                                : filteredFields;
                              const minValue = sectionMode === "MIN" ? sectionMin : null;
                              const minTooHigh = sectionMode === "MIN" && minValue > selectedCount;
                              const ruleSummary =
                                sectionMode === "ALL"
                                  ? `✅ Rule: Must complete ALL selected fields (${selectedCount} selected)`
                                  : minTooHigh
                                    ? `⚠️ MIN (${minValue}) is greater than selected (${selectedCount}). It will behave like ALL.`
                                    : `✅ Rule: Must complete AT LEAST ${minValue} of ${selectedCount} selected fields`;
                              const requiredCount = sectionMode === "MIN" ? minValue : selectedCount;

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
                                          checked={showOnlySelected}
                                          onChange={() =>
                                            setShowOnlySelectedBySection((prev) => ({
                                              ...prev,
                                              [section.id]: !prev?.[section.id],
                                            }))
                                          }
                                        />{" "}
                                        Show only selected
                                      </label>
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
                                  <div className="small" style={{ marginTop: 6 }}>
                                    {ruleSummary}
                                  </div>
                                  <div className="small" style={{ marginTop: 4, color: "#6b7280" }}>
                                    Selected: {selectedCount}/{totalCount} · Mode: {sectionMode} · Required: {requiredCount}
                                  </div>

                                  {sectionExpanded ? (
                                    <div style={{ marginTop: 8 }}>
                                      {!visibleFields.length ? (
                                        <div className="small">No fields available for this section.</div>
                                      ) : (
                                        <div className="grid2" style={{ gap: 8 }}>
                                          {visibleFields.map((field) => {
                                            const checked = sectionConfig.selectedFields?.[field.id] !== false;
                                            const dynamicHint = getDynamicHint(section.id, field);
                                            return (
                                              <label
                                                key={field.id}
                                                className="small"
                                                style={{
                                                  display: "flex",
                                                  gap: 8,
                                                  alignItems: "center",
                                                  justifyContent: "space-between",
                                                  width: "100%",
                                                }}
                                              >
                                                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) =>
                                                      setProgressFieldSelected(section.id, field.id, e.target.checked)
                                                    }
                                                    disabled={!sectionEnabled}
                                                  />
                                                  <span>{field.label || field.id}</span>
                                                </span>
                                                {dynamicHint ? (
                                                  <span
                                                    style={{
                                                      padding: "2px 8px",
                                                      borderRadius: 999,
                                                      background: "#eef2f7",
                                                      color: "#374151",
                                                      fontSize: 11,
                                                      lineHeight: 1.4,
                                                      whiteSpace: "nowrap",
                                                    }}
                                                  >
                                                    Dynamic: {dynamicHint}
                                                  </span>
                                                ) : null}
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
              <div style={{ fontWeight: 700 }}>Çalışma Listeleri</div>
              <div className="small">Review submitted scenarios and approve for rollups.</div>
            </div>
            <div className="row admin-filter-row">
              <select
                className="input sm"
                value={queueFilters.status}
                onChange={(e) => setQueueFilters((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="sent_for_approval">Sent for approval</option>
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
                <th aria-sort={ariaSort("country_name")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("country_name")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    Ülke <span aria-hidden>{sortIndicator("country_name")}</span>
                  </button>
                </th>
                <th aria-sort={ariaSort("school_name")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("school_name")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    School <span aria-hidden>{sortIndicator("school_name")}</span>
                  </button>
                </th>
                <th aria-sort={ariaSort("scenario_name")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("scenario_name")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    Scenario <span aria-hidden>{sortIndicator("scenario_name")}</span>
                  </button>
                </th>
                <th aria-sort={ariaSort("academic_year")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("academic_year")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    Academic Year <span aria-hidden>{sortIndicator("academic_year")}</span>
                  </button>
                </th>
                <th aria-sort={ariaSort("submitted_at")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("submitted_at")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    Submitted <span aria-hidden>{sortIndicator("submitted_at")}</span>
                  </button>
                </th>
                <th aria-sort={ariaSort("status")}>
                  <button
                    type="button"
                    onClick={() => toggleQueueSort("status")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                    title="Sort"
                  >
                    Status <span aria-hidden>{sortIndicator("status")}</span>
                  </button>
                </th>
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
                  <td colSpan="11" className="small">
                    Loading...
                  </td>
                </tr>
              ) : sortedQueueRows.length === 0 ? (
                <tr>
                  <td colSpan="11" className="small">
                    No scenarios found.
                  </td>
                </tr>
              ) : (
                sortedQueueRows.map((row) => {
                  const statusMeta = getStatusMeta(row.scenario);
                  const canApprove =
                    row.scenario?.status === 'sent_for_approval' || row.scenario?.status === 'submitted';
                  const canRevise = ['sent_for_approval', 'approved', 'submitted'].includes(row.scenario?.status);
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
                        <div style={{ fontWeight: 700 }}>{row.country?.name || "-"}</div>
                        {row.country?.region ? <div className="small">{row.country.region}</div> : null}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.school?.name || "-"}</div>
                      </td>
                      <td>
                        <div>{row.scenario?.name || "-"}</div>
                        {missing ? <span className="status-badge is-bad">Missing KPIs</span> : null}
                      </td>
                      <td className="small">{row.scenario?.academic_year || "-"}</td>
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
                            Onayla
                          </button>
                          <button
                            className="btn"
                            onClick={() => openReviewModal(row, "revise")}
                            disabled={!canRevise || reviewSaving}
                          >
                            Revizyon İste
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
    </>
  );
}
