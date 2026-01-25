import React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ADMIN_TABS } from "../data/adminTabs";
import { readSelectedScenarioId } from "../utils/schoolNavStorage";
import {
  FaChevronRight,
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
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState("app.sidebarCollapsed", false);
  const [headerMeta, setHeaderMeta] = React.useState(null);
  const [headerPortalEl, setHeaderPortalEl] = React.useState(null);
  const captureHeaderPortalEl = React.useCallback((el) => {
    setHeaderPortalEl(el);
  }, []);
  const schoolMatch = location.pathname.match(/^\/schools\/([^/]+)/);
  const schoolId = schoolMatch ? schoolMatch[1] : null;
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

  const renderRouteLink = ({ to, label, icon }) => (
    <NavLink
      className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")}
      to={to}
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
          {renderAdminNavItems()}
          {showSchoolsMenu
            ? userNavItems.map((item) => {
              const isBlocked = !isScenarioReady || !item.path;
              const isActive = item.path ? location.pathname.startsWith(item.path) : false;
              return (
                <li key={item.id}>
                  {renderButtonItem({
                    label: item.label,
                    icon: item.icon,
                    onClick: () => {
                      if (isBlocked) {
                        navigate(selectPath);
                        return;
                      }
                      navigate(item.path);
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
                <>
                  <button type="button" className="nav-btn" onClick={() => navigate(selectPath)}>
                    Okul Degistir
                  </button>
                  <button type="button" className="nav-btn" onClick={() => navigate(selectPath)}>
                    Senaryo Degistir
                  </button>
                </>
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
    </div>
  );
}
