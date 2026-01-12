//frontend/src/auth/AuthContex.js

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, getToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTok] = useState(getToken());

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      if (!token) {
        setUser(null);
        return;
      }
      if (user) return;
      try {
        const me = await api.getMe();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (!cancelled) {
          if (e.status === 401 || e.status === 403) {
            setToken(null);
            setTok(null);
          }
          setUser(null);
        }
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const value = useMemo(() => ({
    user,
    token,
    async login(email, password, remember = true) {
      const data = await api.login({ email, password });
      setToken(data.token, { remember });
      setTok(data.token);
      setUser(data.user);
      return data.user;
    },
    setSession(data) {
      if (!data?.token) return;
      setToken(data.token);
      setTok(data.token);
      setUser(data.user || null);
    },
    logout() {
      setToken(null);
      setTok(null);
      setUser(null);
    }
  }), [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
