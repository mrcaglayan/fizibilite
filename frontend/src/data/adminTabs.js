import { FaChartLine, FaFileAlt, FaGlobe, FaTasks, FaUsers, FaUserShield } from "react-icons/fa";

export const ADMIN_TABS = [
  { key: "users", label: "Users", icon: FaUsers, path: "/users" },
  { key: "manage-permissions", label: "Manage Permissions", icon: FaUserShield, path: "/manage-permissions" },
  { key: "countries", label: "Countries", icon: FaGlobe, path: "/countries" },
  { key: "progress", label: "Progress Tracking", icon: FaChartLine, path: "/progress" },
  { key: "approvals", label: "Çalışma Listeleri", icon: FaTasks, path: "/approvals" },
  { key: "reports", label: "Reports", icon: FaFileAlt, path: "/reports" },
];
