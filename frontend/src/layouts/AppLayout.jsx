import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Tooltip from "../components/ui/Tooltip";
import { ADMIN_TABS } from "../data/adminTabs";
import {
  FaBars,
  FaSchool,
  FaUser,
  FaSignOutAlt,
  FaChevronDown,
  FaListAlt,
  FaInfoCircle,
  FaUsers,
  FaBalanceScale,
  FaBriefcase,
  FaMoneyBillWave,
  FaFunnelDollar,
  FaRegFileAlt,
  FaFileInvoiceDollar,
} from "react-icons/fa";

const DEFAULT_ADMIN_TAB = ADMIN_TABS[0]?.key || "users";
const isValidAdminTab = (value) => ADMIN_TABS.some((tab) => tab.key === value);
const getAdminTabFromSearch = (search) => {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const value = params.get("tab");
  return isValidAdminTab(value) ? value : null;
};

const DEFAULT_SCHOOL_GROUPS = [
  {
    id: "school-default",
    items: [
      { id: "scenarios", label: "Senaryolar", icon: <FaListAlt /> },
      { id: "basics", label: "Temel Bilgiler", icon: <FaInfoCircle /> },
      { id: "kapasite", label: "Kapasite", icon: <FaUsers /> },
      { id: "norm", label: "Norm", icon: <FaBalanceScale /> },
      { id: "hr", label: "İK (HR)", icon: <FaBriefcase /> },
      { id: "income", label: "Gelirler", icon: <FaMoneyBillWave /> },
      { id: "expenses", label: "Giderler", icon: <FaFunnelDollar /> },
      { id: "detailedReport", label: "Detaylı Rapor", icon: <FaRegFileAlt /> },
      { id: "report", label: "Rapor", icon: <FaFileInvoiceDollar /> },
    ],
  },
];
const LOCKED_SCHOOL_TOOLTIP = ["Önce okul seçin."];

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
  if (pathname.startsWith("/schools/")) return "Okul";
  if (pathname.startsWith("/schools")) return "Okullar";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/profile")) return "Profil";
  return "Feasibility Studio";
}

export default function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const currentAdminTab = React.useMemo(
    () => getAdminTabFromSearch(location.search) || DEFAULT_ADMIN_TAB,
    [location.search]
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState("app.sidebarCollapsed", false);
  const [openMenus, setOpenMenus] = useLocalStorageState("app.sidebarOpenMenus", { schools: true, addon: true });
  const [sidebarAddon, setSidebarAddon] = React.useState(null);
  const [headerMeta, setHeaderMeta] = React.useState(null);
  const [headerPortalEl, setHeaderPortalEl] = React.useState(null);
  const captureHeaderPortalEl = React.useCallback((el) => {
    setHeaderPortalEl(el);
  }, []);
  const isSchoolRoute = location.pathname.startsWith("/schools/");
  const isSchoolsActive = location.pathname.startsWith("/schools");
  const schoolAddon = isSchoolRoute ? sidebarAddon : null;
  const otherAddon = isSchoolRoute ? null : sidebarAddon;
  const adminAddonActive = otherAddon?.label?.toLowerCase() === "admin";
  const showSchoolsMenu = auth.user ? auth.user.role !== "admin" : false;
  const clearSidebarAddon = React.useCallback(() => setSidebarAddon(null), [setSidebarAddon]);
  const clearHeaderMeta = React.useCallback(() => setHeaderMeta(null), [setHeaderMeta]);
  const showDefaultHeader = !headerMeta?.hideDefault;
  const outletContext = React.useMemo(
    () => ({
      setSidebarAddon,
      clearSidebarAddon,
      setHeaderMeta,
      clearHeaderMeta,
      headerPortalEl,
    }),
    [setSidebarAddon, clearSidebarAddon, setHeaderMeta, clearHeaderMeta, headerPortalEl]
  );

  const toggleMenu = (key) =>
    setOpenMenus((p) => ({ ...(p || {}), [key]: !(p?.[key] ?? true) }));
  const isMenuOpen = (key, fallback = true) => (openMenus?.[key] ?? fallback);

  const renderRouteLink = ({ to, label, icon }) => (
    <NavLink className={({ isActive }) => "app-nav-link" + (isActive ? " is-active" : "")} to={to}>
      {icon}
      <span className="app-label">{label}</span>
    </NavLink>
  );

  const renderButtonItem = ({
    label,
    icon,
    onClick,
    disabled,
    active,
    tooltipLines,
    rightNode,
    indent,
  }) => {
    const btn = (
      <button
        type="button"
        className={"app-nav-item" + (active ? " is-active" : "") + (indent ? " is-sub" : "")}
        onClick={onClick}
        disabled={disabled}
      >
        {icon ? <span className="app-nav-icon">{icon}</span> : null}
        <span className="app-label">{label}</span>
        <span className="app-right">{rightNode}</span>
      </button>
    );

    if (!tooltipLines) return btn;
    return (
      <Tooltip lines={tooltipLines} className="tab-tooltip">
        {btn}
      </Tooltip>
    );
  };

  const renderAdminNavItems = () => {
    if (auth.user?.role !== "admin") return null;
    return ADMIN_TABS.map((tab) => {
      const IconComponent = tab.icon;
      const active = currentAdminTab === tab.key;
      return (
        <li key={`admin-${tab.key}`}>
          <NavLink
            to={`/admin?tab=${tab.key}`}
            end
            className={() => "app-nav-link" + (active ? " is-active" : "")}
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

  return (
    <div className={"app-shell " + (sidebarCollapsed ? "is-collapsed" : "")}>
      <aside className={"app-sidebar " + (sidebarCollapsed ? "close" : "")}>
        <div className="app-logo-details">
          <div className="app-logo-mark">FS</div>
          <span className="app-logo-name">Feasibility Studio</span>
        </div>

        <ul className="app-nav-links">
          <li>
            <div className="app-sub-title">
              <span className="app-label">Menü</span>
            </div>
          </li>
          {renderAdminNavItems()}
          {showSchoolsMenu ? (
            <li className={isMenuOpen("schools") ? "showMenu" : ""}>
              <div className={"app-iocn-link" + (isSchoolsActive ? " is-active" : "")}>
                <NavLink
                  className={({ isActive }) => "app-group-btn app-nav-link" + (isActive ? " is-active" : "")}
                  to="/schools"
                >
                  <FaSchool />
                  <span className="app-label">Okullar</span>
                </NavLink>
                <button
                  type="button"
                  className="app-arrow-btn"
                  onClick={() => {
                    if (sidebarCollapsed) setSidebarCollapsed(false);
                    toggleMenu("schools");
                  }}
                  aria-label="Okullar menüsü aç/kapat"
                >
                  <FaChevronDown />
                </button>
              </div>

              <ul className="app-sub-menu">
                {(Array.isArray(schoolAddon?.groups) ? schoolAddon.groups : DEFAULT_SCHOOL_GROUPS).map((group) => (
                  <React.Fragment key={group.id}>
                    {Array.isArray(group.items)
                      ? group.items.map((it) => {
                        const locked = !schoolAddon;
                        return (
                          <li key={it.id}>
                            {renderButtonItem({
                              label: it.label,
                              icon: it.icon || null,
                              onClick: locked ? undefined : it.onClick,
                              disabled: locked ? true : !!it.disabled,
                              active: locked ? false : !!it.active,
                              tooltipLines: locked ? LOCKED_SCHOOL_TOOLTIP : it.tooltipLines,
                              rightNode: locked ? null : it.rightNode,
                              indent: true,
                            })}
                          </li>
                        );
                      })
                      : null}
                  </React.Fragment>
                ))}
              </ul>
            </li>
          ) : null}

          {!adminAddonActive && otherAddon ? (
            <li className={isMenuOpen("addon") ? "showMenu" : ""}>
              <div className="app-iocn-link">
                <button
                  type="button"
                  className="app-group-btn"
                  onClick={() => {
                    if (sidebarCollapsed) setSidebarCollapsed(false);
                    toggleMenu("addon");
                  }}
                >
                  <FaChevronDown style={{ opacity: 0.0 }} />
                  <span className="app-label">{otherAddon.label || "Sayfa"}</span>
                </button>
                <button
                  type="button"
                  className="app-arrow-btn"
                  onClick={() => {
                    if (sidebarCollapsed) setSidebarCollapsed(false);
                    toggleMenu("addon");
                  }}
                  aria-label="Sayfa menüsü aç/kapat"
                >
                  <FaChevronDown />
                </button>
              </div>

              <ul className="app-sub-menu">
                {Array.isArray(otherAddon.groups)
                  ? otherAddon.groups.map((group) => (
                    <React.Fragment key={group.id}>
                      {Array.isArray(group.items)
                        ? group.items.map((it) => (
                          <li key={it.id}>
                            {renderButtonItem({
                              label: it.label,
                              icon: it.icon || null,
                              onClick: it.onClick,
                              disabled: !!it.disabled,
                              active: !!it.active,
                              tooltipLines: it.tooltipLines,
                              rightNode: it.rightNode,
                              indent: true,
                            })}
                          </li>
                        ))
                        : null}
                    </React.Fragment>
                  ))
                  : null}
              </ul>
            </li>
          ) : null}

          <li>{renderRouteLink({ to: "/profile", label: "Profil", icon: <FaUser /> })}</li>
        </ul>

        <div className="app-profile-details">
          <div className="app-profile-text">
            <div className="app-profile-name">{auth.user?.full_name || auth.user?.email || ""}</div>
            <div className="app-profile-role">{auth.user?.role || ""}</div>
          </div>
          <button className="app-logout" type="button" onClick={() => auth.logout()} title="Çıkış">
            <FaSignOutAlt />
          </button>
        </div>
      </aside>

      <section className="app-home-section">
        <div className="app-topbar">
          <div className={`app-topbar-row${headerMeta?.centered ? " app-topbar-row--centered" : ""}`}>
            <button
              className="app-menu-btn"
              type="button"
              onClick={() => setSidebarCollapsed((p) => !p)}
              aria-label="Menü"
            >
              <FaBars />
            </button>

            {showDefaultHeader ? (
              <div className="app-topbar-text">
                <div className="app-topbar-title">{headerMeta?.title || defaultTitle(location.pathname)}</div>
                {headerMeta?.subtitle ? <div className="app-topbar-sub">{headerMeta.subtitle}</div> : null}
              </div>
            ) : null}

            {/* ✅ same row, right side */}
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
