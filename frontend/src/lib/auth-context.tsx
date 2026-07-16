"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "./api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  /**
   * 邮箱 + 验证码注册。后端自动从 email 派生 username，display_name 默认同 username。
   */
  register: (input: {
    email: string;
    code: string;
    password: string;
    confirm_password: string;
  }) => Promise<void>;
  /** OAuth 回调页使用：将后端下发的 JWT 托管到本地，并更新为已登入 */
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (api.isAuthenticated()) {
      api
        .getMe()
        .then(setUser)
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await api.login(username, password);
    const me = await api.getMe();
    setUser(me);
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      code: string;
      password: string;
      confirm_password: string;
    }) => {
      await api.register(input);
      const me = await api.getMe();
      setUser(me);
    },
    [],
  );

  /**
   * 使用外部注入的 token（主要给 OAuth 回调落地页使用），
   * 完成后入 user 并触发路由层重渲染。
   */
  const loginWithToken = useCallback(async (token: string) => {
    api.setToken(token);
    const me = await api.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithToken,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
