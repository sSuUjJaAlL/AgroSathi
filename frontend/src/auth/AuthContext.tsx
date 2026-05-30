import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setToken,
  type Role,
} from "../services/api";

type AuthState = {
  token: string | null;
  email: string | null;
  role: Role | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: Role) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadInitial(): AuthState {
  const token = getToken();
  const raw = sessionStorage.getItem("agri_user");
  if (raw) {
    try {
      const u = JSON.parse(raw) as { email: string; role: Role };
      return { token, email: u.email, role: u.role };
    } catch {
      /* ignore */
    }
  }
  return { token, email: null, role: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token || sessionStorage.getItem("agri_user")) return;
    void fetchMe()
      .then((me) => {
        sessionStorage.setItem("agri_user", JSON.stringify({ email: me.email, role: me.role }));
        setState({ token, email: me.email, role: me.role });
      })
      .catch(() => {
        setToken(null);
        setState({ token: null, email: null, role: null });
      });
  }, []);

  const persistUser = useCallback((email: string, role: Role) => {
    sessionStorage.setItem("agri_user", JSON.stringify({ email, role }));
    setState((s) => ({ ...s, email, role }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      setToken(res.token);
      persistUser(res.user.email, res.user.role);
      setState({ token: res.token, email: res.user.email, role: res.user.role });
      navigate("/dashboard");
    },
    [navigate, persistUser]
  );

  const register = useCallback(
    async (email: string, password: string, role: Role) => {
      const res = await apiRegister(email, password, role);
      setToken(res.token);
      persistUser(res.user.email, res.user.role);
      setState({ token: res.token, email: res.user.email, role: res.user.role });
      navigate("/dashboard");
    },
    [navigate, persistUser]
  );

  const logout = useCallback(() => {
    setToken(null);
    sessionStorage.removeItem("agri_user");
    setState({ token: null, email: null, role: null });
    navigate("/login");
  }, [navigate]);

  const value = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
    }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
