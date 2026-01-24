import { FaChartLine, FaFileAlt, FaGlobe, FaTasks, FaUsers } from "react-icons/fa";

export const ADMIN_TABS = [
  { key: "users", label: "Users", icon: FaUsers },
  { key: "countries", label: "Countries", icon: FaGlobe },
  { key: "progress", label: "Progress Tracking", icon: FaChartLine },
  { key: "approvals", label: "Çalışma Listeleri", icon: FaTasks },
  { key: "reports", label: "Reports", icon: FaFileAlt },
];
