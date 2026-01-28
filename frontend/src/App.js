//frontend/src/App.js
import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./layouts/AppLayout";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const SchoolsPage = lazy(() => import("./pages/SchoolsPage"));
const SchoolPage = lazy(() => import("./pages/SchoolPage"));
const SelectPage = lazy(() => import("./pages/SelectPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminRedirect = lazy(() => import("./pages/AdminRedirect"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminCountriesPage = lazy(() => import("./pages/AdminCountriesPage"));
const AdminProgressPage = lazy(() => import("./pages/AdminProgressPage"));
const AdminApprovalsPage = lazy(() => import("./pages/AdminApprovalsPage"));
const AdminReportsPage = lazy(() => import("./pages/AdminReportsPage"));
const ManagePermissionsPage = lazy(() => import("./pages/ManagePermissionsPage"));
const AdminPermissionsPage = lazy(() => import("./pages/AdminPermissionsPage"));
const ManagerReviewQueuePage = lazy(() => import("./pages/ManagerReviewQueuePage"));
const TemelBilgilerPage = lazy(() => import("./pages/school/TemelBilgilerPage"));
const KapasitePage = lazy(() => import("./pages/school/KapasitePage"));
const NormPage = lazy(() => import("./pages/school/NormPage"));
const IKPage = lazy(() => import("./pages/school/IKPage"));
const GelirlerPage = lazy(() => import("./pages/school/GelirlerPage"));
const GiderlerPage = lazy(() => import("./pages/school/GiderlerPage"));
const DetayliRaporPage = lazy(() => import("./pages/school/DetayliRaporPage"));
const RaporPage = lazy(() => import("./pages/school/RaporPage"));

function RouteFallback() {
  return (
    <div className="container">
      <div className="card">Loading...</div>
    </div>
  );
}

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
      <Route
        path="/login"
        element={
          auth.token ? (
            <Navigate to={postLoginPath} replace />
          ) : (
            <Suspense fallback={<RouteFallback />}>
              <LoginPage />
            </Suspense>
          )
        }
      />
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
