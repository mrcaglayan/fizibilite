//frontend/src/App.js
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import SchoolsPage from "./pages/SchoolsPage";
import SchoolPage from "./pages/SchoolPage";
import SelectPage from "./pages/SelectPage";
import ProfilePage from "./pages/ProfilePage";
import AdminRedirect from "./pages/AdminRedirect";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminCountriesPage from "./pages/AdminCountriesPage";
import AdminProgressPage from "./pages/AdminProgressPage";
import AdminApprovalsPage from "./pages/AdminApprovalsPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import ManagePermissionsPage from "./pages/ManagePermissionsPage";
import AdminPermissionsPage from "./pages/AdminPermissionsPage";
import ManagerReviewQueuePage from "./pages/ManagerReviewQueuePage";
import AppLayout from "./layouts/AppLayout";
import TemelBilgilerPage from "./pages/school/TemelBilgilerPage";
import KapasitePage from "./pages/school/KapasitePage";
import NormPage from "./pages/school/NormPage";
import IKPage from "./pages/school/IKPage";
import GelirlerPage from "./pages/school/GelirlerPage";
import GiderlerPage from "./pages/school/GiderlerPage";
import DetayliRaporPage from "./pages/school/DetayliRaporPage";
import RaporPage from "./pages/school/RaporPage";

function PrivateRoute({ children, allowReset = false }) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.token) return <Navigate to="/login" replace />;
  if (auth.user?.must_reset_password && !allowReset) {
    return <Navigate to="/profile" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  const auth = useAuth();
  const postLoginPath = auth.user?.must_reset_password
    ? "/profile"
    : auth.user?.role === "admin"
      ? "/countries"
      : "/schools";

  return (
    <Routes>
      <Route path="/login" element={auth.token ? <Navigate to={postLoginPath} replace /> : <LoginPage />} />
      <Route
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route path="/schools" element={<SchoolsPage />} />
        <Route path="/select" element={<SelectPage />} />
        <Route path="/schools/:id" element={<SchoolPage />}>
          <Route index element={<div />} />
          <Route path="temel-bilgiler" element={<TemelBilgilerPage />} />
          <Route path="kapasite" element={<KapasitePage />} />
          <Route path="norm" element={<NormPage />} />
          <Route path="ik" element={<IKPage />} />
          <Route path="gelirler" element={<GelirlerPage />} />
          <Route path="giderler" element={<GiderlerPage />} />
          <Route path="detayli-rapor" element={<DetayliRaporPage />} />
          <Route path="rapor" element={<RaporPage />} />
        </Route>
        <Route path="/users" element={<AdminUsersPage />} />
        <Route path="/countries" element={<AdminCountriesPage />} />
        <Route path="/progress" element={<AdminProgressPage />} />
        <Route path="/approvals" element={<AdminApprovalsPage />} />
        <Route path="/reports" element={<AdminReportsPage />} />
        <Route
          path="/manage-permissions"
          element={auth.user?.role === "admin" ? <AdminPermissionsPage /> : <ManagePermissionsPage />}
        />
        <Route path="/review-queue" element={<ManagerReviewQueuePage />} />
        {/* legacy deep-links like /admin?tab=countries */}
        <Route path="/admin" element={<AdminRedirect />} />
      </Route>
      <Route
        element={
          <PrivateRoute allowReset>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to={auth.token ? postLoginPath : "/login"} replace />} />
    </Routes>
  );
}
