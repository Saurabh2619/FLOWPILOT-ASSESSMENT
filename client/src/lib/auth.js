"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useState } from "react";
import * as client from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: "loading", user: null });

  const setUser = useCallback((user) => {
    setSession({ status: user ? "user" : "guest", user });
  }, []);

  const restore = useCallback(() => {
    setSession({ status: "loading", user: null });
    client
      .refreshSession()
      .then(setUser)
      .catch((error) => {
        if (error.status === 401) setUser(null);
        else setSession({ status: "error", user: null });
      });
  }, [setUser]);

  useEffect(() => {
    client
      .refreshSession()
      .then(setUser)
      .catch((error) => {
        if (error.status === 401) setUser(null);
        else setSession({ status: "error", user: null });
      });
    return client.onSessionExpired(() => setUser(null));
  }, [setUser]);

  const value = {
    ...session,
    retry: restore,
    login: async (credentials) => setUser(await client.login(credentials)),
    logout: async () => {
      await client.logout();
      setUser(null);
    },
    reloadUser: async () => setUser((await client.api("/auth/me")).user),
  };

  return (
    <AuthContext.Provider value={value}>
      <Fragment key={session.user?.id ?? "guest"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
