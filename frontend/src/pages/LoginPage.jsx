//frontend/src/pages/LoginPage.jsx


import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const auth = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    const pref = localStorage.getItem("remember_me");
    if (pref === "1") return true;
    if (pref === "0") return false;
    return Boolean(localStorage.getItem("token"));
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Sign in · Feasibility Studio";
  }, []);

  async function doLogin(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await auth.login(email, password, rememberMe);
    } catch (e2) {
      setErr(e2.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="auth-shell"
      style={{ "--auth-bg": `url(${process.env.PUBLIC_URL}/login-bg.png)` }}
    >
      <div className="auth-grid">
        <section className="auth-hero">
          <div className="auth-badge">Feasibility Studio</div>
          <h1 className="auth-title">Ücret Belirleme Modülüne hoş geldiniz.</h1>
          <p className="auth-subtitle">
            Gelir, kapasite ve personel ihtiyaçlarını tek bir yerde modelleyin. Yöneticiler hesap sağlar ve kimlik bilgilerini güvenli şekilde paylaşır.
          </p>
          <div className="auth-highlights">
            <div>
              <div className="auth-metric">150+</div>
              <div className="auth-caption">Senaryo başına takip edilen girdi sayısı</div>
            </div>
            <div>
              <div className="auth-metric">3</div>
              <div className="auth-caption">Yıllık planlama dönemi</div>
            </div>
            <div>
              <div className="auth-metric">1</div>
              <div className="auth-caption">Tek doğruluk kaynağı</div>
            </div>
          </div>
        </section>

        <section className="auth-card" aria-label="Giriş">
          <div className="auth-card-head">
            <div className="auth-card-title">Giriş yap</div>
            <div className="auth-card-sub"></div>
          </div>

          {err ? <div className="auth-error">{err}</div> : null}

          <form onSubmit={doLogin} className="auth-form">
            <label className="auth-label" htmlFor="login-email">E-posta</label>
            <input
              id="login-email"
              className="auth-input"
              placeholder="e-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <label className="auth-label" htmlFor="login-password">Parola</label>
            <div className="auth-input-wrap">
              <input
                id="login-password"
                className="auth-input"
                placeholder="Şifreniz"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                className="auth-input-eye"
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Parolay? gizle" : "Parolay? g?ster"}
                title={showPassword ? "Parolay? gizle" : "Parolay? g?ster"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 5C6.5 5 2 9.2 1 12c1 2.8 5.5 7 11 7s10-4.2 11-7c-1-2.8-5.5-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                  />
                </svg>
              </button>
            </div>

            <div className="auth-options">
              <label className="auth-option">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRememberMe(next);
                    if (next) localStorage.setItem("remember_me", "1");
                    else localStorage.removeItem("remember_me");
                  }}
                />
                Beni hatırla
              </label>
            </div>

            <button className="btn primary full" type="submit" disabled={loading}>
              {loading ? "Giriş yapılıyor..." : "Giriş yap"}
            </button>
          </form>

          <div className="auth-help">
            Erişim mi gerekiyor? Yeni bir hesap için yöneticinize başvurun.
          </div>
        </section>
      </div>
    </div>
  );
}
