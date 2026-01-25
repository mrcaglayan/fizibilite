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
} from "react-icons/fa";


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
  const showSchoolsMenu = auth.user ? auth.user.role !== "admin" : false;
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

  const schoolBase = schoolId ? `/schools/${schoolId}` : null;
  const isScenarioReady = Boolean(selectedScenarioId);
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
            ? userNavItems.map((item) => {
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
              if (!isActive && !location.pathname.startsWith("/schools") && lastVisitedRoute) {
                isActive = item.id === lastVisitedRoute;
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
            })
            : null}
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
            <div className="app-topbar-left">
            {showSchoolsMenu ? (
              <button
                type="button"
                className="nav-btn"
                onClick={() => handleGuardedNavigate(selectPath)}
                title="Okul / Senaryo Değiştir"
              >
                {/* Use a school icon followed by the combined label and a chevron, similar to the example design. */}
                <FaSchool aria-hidden="true" />
                <span style={{ whiteSpace: "nowrap" }}>Okul / Senaryo Değiştir</span>
                <FaChevronDown aria-hidden="true" />
              </button>
            ) : null}
            </div>

            {showDefaultHeader ? (
              <div className="app-topbar-text">
                <div className="app-topbar-title">{headerMeta?.title || defaultTitle(location.pathname)}</div>
                {headerMeta?.subtitle ? <div className="app-topbar-sub">{headerMeta.subtitle}</div> : null}
              </div>
            ) : null}

            <div className="app-topbar-slot" ref={captureHeaderPortalEl} />
          </div>
        </div>



        <div className="app-content">
          <Outlet context={outletContext} />
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
