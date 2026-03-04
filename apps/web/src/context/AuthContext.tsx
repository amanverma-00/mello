import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, getAccessToken, setAccessToken, clearTokens } from "../lib/api";

interface Host {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  host: Host | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if we already have a valid token
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api<{ id: string; email: string; displayName: string }>("/auth/me")
      .then((data) => setHost(data))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    const { url } = await api<{ url: string; state: string }>(
      "/auth/spotify/url",
    );
    // Redirect to Spotify
    window.location.href = url;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setHost(null);
  }, []);

  return (
    <AuthContext.Provider value={{ host, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Handle the OAuth callback — exchangeCode and set token */
export async function handleOAuthCallback(
  code: string,
): Promise<{ host: Host; accessToken: string }> {
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/auth/spotify/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        "OAuth callback failed",
    );
  }

  const data = (await res.json()) as {
    accessToken: string;
    host: Host;
  };

  setAccessToken(data.accessToken);
  return data;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
