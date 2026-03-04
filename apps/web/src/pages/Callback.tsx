import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleOAuthCallback } from "../context/AuthContext";

export function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation — auth codes are single-use
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get("code");

    if (!code) {
      setError("No authorization code received from Spotify.");
      return;
    }

    handleOAuthCallback(code)
      .then(() => {
        // Redirect to dashboard after successful login
        navigate("/dashboard", { replace: true });
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="app">
        <header className="hero">
          <h1>Melo</h1>
          <p className="error">Login failed: {error}</p>
        </header>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>Melo</h1>
        <p>Connecting to Spotify...</p>
      </header>
    </div>
  );
}
