import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken } from "../lib/api";

export function DashboardPage() {
  const { host, logout } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await api<{ code: string; shareLink: string }>(
        "/sessions",
        { method: "POST" },
      );
      // Navigate to session room as host
      navigate(`/session/${data.code}`, {
        state: {
          role: "host",
          token: getAccessToken(),
          shareLink: data.shareLink,
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }, [navigate]);

  if (!host) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>Melo</h1>
        <p>Welcome, {host.displayName}!</p>
      </header>

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={createSession}
          disabled={creating}
        >
          {creating ? "Creating..." : "Create Session"}
        </button>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-secondary" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
