import React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ADMIN_TABS } from "../data/adminTabs";
import {
  readSelectedScenarioId,
  readLastVisitedPath,
  writeLastActiveSchoolId,
  readLastActiveSchoolId,
} from "../utils/schoolNavStorage";
import {
  FaChevronRight,
  FaChevronDown,
  FaUser,
  FaSignOutAlt,
  FaInfoCircle,
  FaUsers,
  FaBalanceScale,
  FaBriefcase,
  FaMoneyBillWave,
  FaFunnelDollar,
  FaRegFileAlt,
  FaFileInvoiceDollar,
  FaSchool,
  FaTachometerAlt,
  FaUserShield,
  FaTasks,
} from "react-icons/fa";

// Permission helper to determine visibility of navigation items based on user permissions.
import { can } from "../utils/permissions";

function RouteFallback() {
  return <div className="card">Loading...</div>;
}


function useLocalStorageState(key, defaultValue) {
  const [state, setState] = React.useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : defaultValue;
    } catch (_) {
      return defaultValue;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (_) { }
  }, [key, state]);
  return [state, setState];
}

function defaultTitle(pathname) {
  if (pathname.startsWith("/select")) return "Okul & Senaryo Sec";
  if (pathname.startsWith("/schools/")) return "Okul";
  if (pathname.startsWith("/schools")) return "Okullar";
  if (pathname.startsWith("/users")) return "Users";
  if (pathname.startsWith("/countries")) return "Countries";
  if (pathname.startsWith("/progress")) return "Progress Tracking";
  if (pathname.startsWith("/approvals")) return "Çalışma Listeleri";
  if (pathname.startsWith("/review-queue")) return "Review Queue";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/profile")) return "Profil";
  return "Feasibility Studio";
}

export default function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  // Extract schoolId from either the URL path (`/schools/:id/...`) or the
  // query string (`?schoolId=...`) so that when we are on the /select
  // page we still have access to the last visited school. Without this,
  // navigating to /select would clear the `schoolId` and cause the sidebar
  // to lose its active state.
  const params = new URLSearchParams(location.search);
  const querySchoolId = params.get("schoolId");
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState("app.sidebarCollapsed", false);
  const [headerMeta, setHeaderMeta] = React.useState(null);
  const [headerPortalEl, setHeaderPortalEl] = React.useState(null);
  const captureHeaderPortalEl = React.useCallback((el) => {
    setHeaderPortalEl(el);
  }, []);
  const schoolMatch = location.pathname.match(/^\/schools\/([^/]+)/);
  let schoolId = schoolMatch ? schoolMatch[1] : querySchoolId || null;
  // When navigating away from a school page (e.g. to /profile), there is no
  // schoolId in the path or query string. Fallback to the last active
  // schoolId stored in localStorage so that we can retain context and keep
  // sidebar items enabled.
  if (!schoolId) {
    const lastActive = readLastActiveSchoolId();
    if (lastActive) schoolId = lastActive;
  }
  const selectedScenarioId = schoolId ? readSelectedScenarioId(schoolId) : null;
  // Determine if the school navigation sidebar should be shown.  When
  // `auth.user` is null (e.g. during initial load), we still want to
  // display the schools menu for non-admin users.  Only hide the menu
  // when a logged-in user has the admin role.  Previously this was
  // `false` when `auth.user` was null, which caused the sidebar to
  // disappear until the page was refreshed after selecting a scenario.
  const showSchoolsMenu = auth.user
    ? auth.user.role !== "admin"
    : true;
  const selectPath = schoolId ? `/select?schoolId=${schoolId}` : "/select";
  const clearHeaderMeta = React.useCallback(() => setHeaderMeta(null), [setHeaderMeta]);
  const showDefaultHeader = !headerMeta?.hideDefault;
  const outletContext = React.useMemo(
    () => ({
      setHeaderMeta,
      clearHeaderMeta,
      headerPortalEl,
    }),
    [setHeaderMeta, clearHeaderMeta, headerPortalEl]
  );

  // When navigating away from a school page with unsaved changes we show a
  // custom modal instead of relying on the browser's built-in confirm. This
  // state holds the target path to navigate to once the user confirms.
  const [confirmNav, setConfirmNav] = React.useState(null);
  const handleGuardedNavigate = React.useCallback(
    (path) => {
      try {
        if (window.__fsUnsavedChanges) {
          setConfirmNav({ path });
          return;
        }
      } catch (_) {
        // ignore if window is not defined (e.g. SSR)
      }
      navigate(path);
    },
    [navigate, setConfirmNav]
  );
  const handleGuardedNavLink = React.useCallback(
    (path) => (event) => {
      try {
        if (window.__fsUnsavedChanges) {
          event.preventDefault();
          setConfirmNav({ path });
        }
      } catch (_) {
        // ignore if window is not defined (e.g. SSR)
      }
    },
    [setConfirmNav]
  );

  // Persist the last active school ID in localStorage so that when navigating
  // to non-school pages (like /profile) we can still determine the most
  // recently viewed school. This hook runs whenever `schoolId` changes.
  React.useEffect(() => {
    if (schoolId) {
      writeLastActiveSchoolId(schoolId);
    }
  }, [schoolId]);

  const renderRouteLink = ({ to, label, icon }) => (
    <NavLink
      className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")}
      to={to}
      onClick={handleGuardedNavLink(to)}
    >
      {/* Wrap icons in a span to consistently apply sizing and color styles. */}
      {icon ? <span className="app-nav-icon">{icon}</span> : null}
      <span className="app-label">{label}</span>
    </NavLink>
  );

  const renderButtonItem = ({
    label,
    icon,
    onClick,
    disabled,
    blocked,
    active,
    rightNode,
    indent,
  }) => (
      <button
        type="button"
        className={
          "app-nav-item" +
          (active ? " is-active" : "") +
          (indent ? " is-sub" : "") +
          (blocked ? " is-blocked" : "")
        }
        onClick={onClick}
        disabled={disabled}
        aria-disabled={blocked || disabled ? "true" : undefined}
      >
        {icon ? <span className="app-nav-icon">{icon}</span> : null}
        <span className="app-label">{label}</span>
        <span className="app-right">{rightNode}</span>
      </button>
    );

  const renderAdminNavItems = () => {
    if (auth.user?.role !== "admin") return null;
    return ADMIN_TABS.map((tab) => {
      const IconComponent = tab.icon;
      const to = tab.path || `/admin?tab=${tab.key}`;
      return (
        <li key={`admin-${tab.key}`}>
          <NavLink
            to={to}
            className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")}
            onClick={handleGuardedNavLink(to)}
          >
            {IconComponent ? (
              <span className="app-nav-icon">
                <IconComponent aria-hidden="true" />
              </span>
            ) : null}
            <span className="app-label">{tab.label}</span>
          </NavLink>
        </li>
      );
    });
  };

  // Determine if the user should see the Manage Permissions page.  Users
  // with the manager or accountant roles implicitly have this ability.  In
  // addition, any user granted the page.manage_permissions read or write
  // permission should see the link.  Checking the role here avoids
  // requiring explicit user_permissions assignments for managers and
  // accountants.
  const canManagePermissions = React.useMemo(() => {
    const role = auth.user?.role;
    // Only managers (not accountants) are implicitly granted access to Manage Permissions.
    if (role === "manager") return true;
    const perms = auth.user?.permissions;
    if (!Array.isArray(perms)) return false;
    return perms.some(
      (p) => p.resource === "page.manage_permissions" && (p.action === "read" || p.action === "write")
    );
  }, [auth.user?.permissions, auth.user?.role]);

  // Determine if the user should see the Manager Review Queue page.  Users
  // with the manager, accountant, or admin roles have implicit access.  In
  // addition, any user granted the page.manage_permissions read or write
  // permission can review scenarios.  This mirrors the backend reviewer
  // policy.
  const canReviewQueue = React.useMemo(() => {
    const role = auth.user?.role;
    if (role === 'admin' || role === 'manager' || role === 'accountant') return true;
    const perms = auth.user?.permissions;
    if (!Array.isArray(perms)) return false;
    return perms.some(
      (p) => p.resource === 'page.manage_permissions' && (p.action === 'read' || p.action === 'write')
    );
  }, [auth.user?.permissions, auth.user?.role]);

  const schoolBase = schoolId ? `/schools/${schoolId}` : null;
  const isScenarioReady = Boolean(selectedScenarioId);
  const permissionsLoading = Boolean(auth.token) && (!auth.user || !Array.isArray(auth.user.permissions));
  // While on the /select page the side navigation should still indicate which
  // route was last visited for the active school/scenario. We read this value
  // from localStorage via readLastVisitedPath. When `selectedScenarioId` is
  // null there is nothing to highlight.
  // Always compute the last visited route for the current school. When
  // `selectedScenarioId` is null we treat it as "none" internally. This
  // allows us to remember a last visited page even when no scenario has been
  // selected yet.
  const lastVisitedRoute = schoolId
    ? readLastVisitedPath(schoolId, selectedScenarioId)
    : null;
  const userNavItems = [
    {
      id: "temel-bilgiler",
      label: "Temel Bilgiler",
      icon: <FaInfoCircle />,
      path: schoolBase ? `${schoolBase}/temel-bilgiler` : null,
    },
    {
      id: "kapasite",
      label: "Kapasite",
      icon: <FaUsers />,
      path: schoolBase ? `${schoolBase}/kapasite` : null,
    },
    {
      id: "norm",
      label: "Norm",
      icon: <FaBalanceScale />,
      path: schoolBase ? `${schoolBase}/norm` : null,
    },
    {
      id: "ik",
      label: "IK (HR)",
      icon: <FaBriefcase />,
      path: schoolBase ? `${schoolBase}/ik` : null,
    },
    {
      id: "gelirler",
      label: "Gelirler",
      icon: <FaMoneyBillWave />,
      path: schoolBase ? `${schoolBase}/gelirler` : null,
    },
    {
      id: "giderler",
      label: "Giderler",
      icon: <FaFunnelDollar />,
      path: schoolBase ? `${schoolBase}/giderler` : null,
    },
    {
      id: "detayli-rapor",
      label: "Detayli Rapor",
      icon: <FaRegFileAlt />,
      path: schoolBase ? `${schoolBase}/detayli-rapor` : null,
    },
    {
      id: "rapor",
      label: "Rapor",
      icon: <FaFileInvoiceDollar />,
      path: schoolBase ? `${schoolBase}/rapor` : null,
    },
  ];

  // Filter the navigation items based on read permissions.  A nav item is
  // shown only if the authenticated user has read access to the corresponding
  // page resource within the current school context.  When schoolId is
  // undefined (e.g. on the schools list page) all items are shown.
  // Do not wrap this in a memoization hook so that it recomputes whenever
  // auth.user or schoolId changes.  Previously this used React.useMemo,
  // but users reported that the navigation would not update immediately
  // after selecting a scenario; computing it inline ensures the sidebar
  // updates whenever its dependencies change.
  // Compute the list of navigation items the user can see.  In addition to
  // standard page-level read permissions, treat a write permission on any
  // section of a module as sufficient to show the page.  Without this,
  // users who only have section-level write permissions (e.g. Giderler
  // expenses) would not see the Giderler page in the sidebar.  We reuse
  // the `can()` helper for scope checks but add a fallback for
  // section-level permissions.  Admin users bypass checks via `can()`.
  let permittedNavItems;
  if (!schoolId) {
    // When there is no school context (e.g. /schools list), show all items
    permittedNavItems = userNavItems;
  } else if (permissionsLoading) {
    // Permissions still loading; avoid flashing unauthorized items.
    permittedNavItems = [];
  } else if (!auth.user || !Array.isArray(auth.user.permissions)) {
    permittedNavItems = [];
  } else {
    const countryId = auth.user.country_id;
    permittedNavItems = userNavItems.filter((item) => {
      const pageKey = item.id.replace(/-/g, "_");
      const pageResource = `page.${pageKey}`;
      // First, check standard page-level read permission
      if (can(auth.user, pageResource, 'read', { schoolId: Number(schoolId), countryId })) {
        return true;
      }
      // Fallback: if the user has any read or write permission on a section
      // under this page, show the page.  We need to manually check the
      // user's permissions list because `can()` does not treat a section
      // permission as covering its parent page.
      return auth.user.permissions.some((perm) => {
        // Only consider read/write actions
        if (perm.action !== 'read' && perm.action !== 'write') return false;
        const res = String(perm.resource || '');
        // Match section.<pageKey>.<...>
        if (!res.startsWith(`section.${pageKey}.`)) return false;
        // Check scope: country and school restrictions
        const permCountry = perm.scope_country_id != null ? Number(perm.scope_country_id) : null;
        const permSchool = perm.scope_school_id != null ? Number(perm.scope_school_id) : null;
        // A permission is valid if it is global or matches the provided scope
        if (permCountry != null && countryId != null && Number(permCountry) !== Number(countryId)) {
          return false;
        }
        if (permSchool != null && schoolId != null && Number(permSchool) !== Number(schoolId)) {
          return false;
        }
        // If permSchool is non-null but provided schoolId is null, skip
        if (permSchool != null && schoolId == null) return false;
        // If permCountry is non-null but provided countryId is null, skip
        if (permCountry != null && countryId == null) return false;
        return true;
      });
    });
  }

  return (
    <div className={"app-shell " + (sidebarCollapsed ? "is-collapsed" : "")}>
      <aside className={"app-sidebar " + (sidebarCollapsed ? "close" : "")}> 
        <div className="app-logo-details">
          <div className="app-logo-mark">FS</div>
          <span className="app-logo-name">Feasibility Studio</span>
          {/* Sidebar toggle placed next to the logo. When clicked, it collapses/expands the sidebar. */}
          <button
            type="button"
            className="app-sidebar-toggle"
            onClick={() => setSidebarCollapsed((p) => !p)}
            aria-label="Toggle sidebar"
          >
            <FaChevronRight
              style={{
                transform: sidebarCollapsed ? "rotate(0deg)" : "rotate(180deg)",
                transition: "transform 0.3s ease",
              }}
            />
          </button>
        </div>

        <ul className="app-nav-links">
          {/* Top-level dashboard link to the schools list. Use the `end` prop on NavLink
             so it only appears active when the path is exactly "/schools", not when
             viewing nested school routes. */}
          <li key="dashboard">
            <NavLink
              to="/schools"
              end
              className={({ isActive }) =>
                "app-nav-link" + (isActive ? " is-active" : "")
              }
              onClick={handleGuardedNavLink("/schools")}
            >
              <span className="app-nav-icon">
                <FaTachometerAlt aria-hidden="true" />
              </span>
              <span className="app-label">Dashboard</span>
            </NavLink>
          </li>
          {renderAdminNavItems()}
          {showSchoolsMenu
            ? (permissionsLoading
              ? userNavItems.map((item) => (
                <li key={`placeholder-${item.id}`} className="app-nav-placeholder" aria-hidden="true">
                  <span className="app-nav-placeholder-line" />
                </li>
              ))
              : permittedNavItems.map((item) => {
              // A nav item is blocked only if there is no scenario selected
              // (meaning the user hasn't chosen one yet) and we are not on
              // the select page. When on `/select`, we allow navigation back
              // to the last visited pages even if no scenario is ready.
              const isBlocked = !((isScenarioReady) || location.pathname.startsWith("/select")) || !item.path;
              // Determine whether this nav item should appear active. Normally
              // an item is active if the current path begins with its path. When
              // the user is on the `/select` page, we instead consider the last
              // visited route (stored via writeLastVisitedPath) to determine
              // which nav item should remain highlighted. The `item.id`
              // corresponds to the route segment (e.g. "temel-bilgiler").
              let isActive = false;
              if (item.path) {
                isActive = location.pathname.startsWith(item.path);
              }
              // If we are not on a school page (e.g. /select, /profile), use the
              // last visited route to determine which nav item should appear
              // active. This ensures the sidebar keeps its highlight when
              // navigating away from school contexts.
              // When not on a specific school page, we normally highlight the last visited
              // route to preserve context when switching to the Select page.  However,
              // we only apply this on the /select page itself.  For other top-level
              // pages (e.g. /profile, /manage-permissions, /admin), we do not
              // highlight any school nav item.
              if (!isActive && location.pathname.startsWith("/select") && lastVisitedRoute) {
                isActive = item.id === lastVisitedRoute;
              }
              // Prevent highlighting of school navigation items when on the Manage Permissions page
              if (location.pathname.startsWith("/manage-permissions") || location.pathname.startsWith("/profile")) {
                isActive = false;
              }
              return (
                <li key={item.id}>
                  {renderButtonItem({
                    label: item.label,
                    icon: item.icon,
                    onClick: () => {
                      if (isBlocked) {
                        handleGuardedNavigate(selectPath);
                        return;
                      }
                      handleGuardedNavigate(item.path);
                    },
                    active: isActive,
                    blocked: isBlocked,
                  })}
                </li>
              );
            }))
            : null}
          {/* Insert Manage Permissions link right above the Profile option if applicable */}
          {canManagePermissions ? (
            <li key="manage-permissions">
              <NavLink
                to="/manage-permissions"
                className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")}
                onClick={handleGuardedNavLink("/manage-permissions")}
              >
                <span className="app-nav-icon">
                  <FaUserShield aria-hidden="true" />
                </span>
                <span className="app-label">Manage Permissions</span>
              </NavLink>
            </li>
          ) : null}

          {/* Insert Manager Review Queue link above Manage Permissions if applicable */}
          {canReviewQueue ? (
            <li key="review-queue">
              <NavLink
                to="/review-queue"
                className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")}
                onClick={handleGuardedNavLink("/review-queue")}
              >
                <span className="app-nav-icon">
                  <FaTasks aria-hidden="true" />
                </span>
                <span className="app-label">Review Queue</span>
              </NavLink>
            </li>
          ) : null}
          <li>{renderRouteLink({ to: "/profile", label: "Profil", icon: <FaUser /> })}</li>
        </ul>

        <div className="app-profile-details">
          <div className="app-profile-text">
            <div className="app-profile-name">{auth.user?.full_name || auth.user?.email || ""}</div>
            <div className="app-profile-role">{auth.user?.role || ""}</div>
          </div>
          <button className="app-logout" type="button" onClick={() => auth.logout()} aria-label="Cikis">
            <FaSignOutAlt />
          </button>
        </div>
      </aside>

      <section className="app-home-section">
        <div className="app-topbar">
          <div className={`app-topbar-row${headerMeta?.centered ? " app-topbar-row--centered" : ""}`}>
            <div className="app-topbar-left" />

            {showDefaultHeader ? (
              <div className="app-topbar-text">
                <div className="app-topbar-title">{headerMeta?.title || defaultTitle(location.pathname)}</div>
                {headerMeta?.subtitle ? <div className="app-topbar-sub">{headerMeta.subtitle}</div> : null}
              </div>
            ) : null}
            <div className="app-topbar-slot" ref={captureHeaderPortalEl}>
              {showSchoolsMenu ? (
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => handleGuardedNavigate(selectPath)}
                  title="Okul / Senaryo Degistir"
                >
                  {/* Use a school icon followed by the combined label and a chevron, similar to the example design. */}
                  <FaSchool aria-hidden="true" />
                  <span style={{ whiteSpace: "nowrap" }}>Okul / Senaryo Degistir</span>
                  <FaChevronDown aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>



        <div className="app-content">
          <React.Suspense fallback={<RouteFallback />}>
            <Outlet context={outletContext} />
          </React.Suspense>
        </div>
        </section>
        {confirmNav ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Unsaved Changes</div>
              <div className="small" style={{ marginBottom: 12 }}>
                You have unsaved changes. If you leave this page, unsaved changes may be lost.
              </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setConfirmNav(null)}>Stay</button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      if (confirmNav?.path) navigate(confirmNav.path);
                      setConfirmNav(null);
                    }}
                  >
                    Leave
                  </button>
                </div>
            </div>
          </div>
        ) : null}
      </div>
  );
}
