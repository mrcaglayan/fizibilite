//frontend/src/pages/ProfilePage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/ui/Button";

export default function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Profile · Feasibility Studio";
  }, []);

  const mustReset = useMemo(() => Boolean(auth.user?.must_reset_password), [auth.user?.must_reset_password]);

  async function handleChangePassword(e) {
    e.preventDefault();
    setStatus(null);

    if (!currentPassword || !newPassword) {
      setStatus({ type: "error", message: "Current and new password are required." });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }

    setLoading(true);
    const wasForced = mustReset;
    try {
      const data = await api.changePassword({ currentPassword, newPassword });
      auth.setSession(data);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ type: "success", message: "Password updated successfully." });
      if (wasForced) navigate("/schools", { replace: true });
    } catch (e2) {
      setStatus({ type: "error", message: e2.message || "Password update failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Profile</div>
          <div className="small">Update your password and account info.</div>
        </div>
        <div className="row">
          {auth.user?.role === "admin" ? <Button as={Link} variant="ghost" to="/admin">Admin</Button> : null}
          <Button as={Link} variant="ghost" to="/schools">Geri</Button>
          <Button variant="danger" onClick={() => auth.logout()}>Çıkış</Button>
        </div>
      </div>

      {mustReset ? (
        <div className="card" style={{ marginTop: 12, borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div style={{ fontWeight: 700 }}>Şifre değiştirme gerekli</div>
          <div className="small" style={{ marginTop: 6 }}>
            Bu ilk girişiniz. Devam etmek için yeni bir şifre belirleyin.
          </div>
        </div>
      ) : null}

      {status ? (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderColor: status.type === "error" ? "#fecaca" : "#bbf7d0",
            background: status.type === "error" ? "#fff1f2" : "#f0fdf4",
          }}
        >
          {status.message}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Hesap</div>
        <div className="row">
          <input className="input" value={auth.user?.full_name || ""} disabled placeholder="Full name" />
          <input className="input" value={auth.user?.email || ""} disabled placeholder="Email" />
          <input className="input sm" value={auth.user?.role || ""} disabled placeholder="Role" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Şifre Değiştir</div>
        <form onSubmit={handleChangePassword}>
          <div className="row">
            <input
              className="input"
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={loading}>
              Update Password
            </Button>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            En az 8 karakter kullanın. Bu işlemi daha sonra herhangi bir zamanda değiştirebilirsiniz.
          </div>
        </form>
      </div>
    </div>
  );
}
