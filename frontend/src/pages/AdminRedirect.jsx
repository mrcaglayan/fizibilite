//frontend/src/pages/AdminRedirect.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ADMIN_TABS } from "../data/adminTabs";

function getTabFromSearch(search) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const value = params.get("tab");
  return value || null;
}

export default function AdminRedirect() {
  const location = useLocation();
  const key = getTabFromSearch(location.search);
  const fallback = ADMIN_TABS[0]?.path || "/users";
  const target = (ADMIN_TABS.find((t) => t.key === key)?.path || fallback);
  return <Navigate to={target} replace />;
}
