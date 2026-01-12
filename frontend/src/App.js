//frontend/src/App.js
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import SchoolsPage from "./pages/SchoolsPage";
import SchoolPage from "./pages/SchoolPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";

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
  const postLoginPath = auth.user?.must_reset_password ? "/profile" : "/schools";

  return (
    <Routes>
      <Route path="/login" element={auth.token ? <Navigate to={postLoginPath} replace /> : <LoginPage />} />
      <Route path="/schools" element={<PrivateRoute><SchoolsPage /></PrivateRoute>} />
      <Route path="/schools/:id" element={<PrivateRoute><SchoolPage /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute allowReset><ProfilePage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to={auth.token ? postLoginPath : "/login"} replace />} />
    </Routes>
  );
}
