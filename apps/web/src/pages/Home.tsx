import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export function HomePage() {
  const { host, loading, login } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  // If already logged in, go to dashboard
  useEffect(() => {
    if (!loading && host) {
      navigate("/dashboard", { replace: true });
    }
  }, [host, loading, navigate]);

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed) {
      navigate(`/join/${trimmed}`);
    } else {
      navigate("/join");
    }
  };

  return (
    <div className="landing">
      {/* ── Hero ── */}
      <header className="landing-hero">
        <div className="landing-logo" aria-hidden="true">
          <span className="landing-logo-icon">♫</span>
        </div>
        <h1 className="landing-title">Melo</h1>
        <p className="landing-tagline">
          Your crowd picks the vibe.&nbsp;
          <span className="landing-tagline-accent">Everyone votes, one queue plays.</span>
        </p>
      </header>

      {/* ── How It Works ── */}
      <section className="landing-steps" aria-label="How it works">
        <div className="landing-step">
          <span className="step-number">1</span>
          <div className="step-content">
            <h3>Create a Session</h3>
            <p>Log in with Spotify and start a room in seconds.</p>
          </div>
        </div>
        <div className="landing-step">
          <span className="step-number">2</span>
          <div className="step-content">
            <h3>Share the Code</h3>
            <p>Friends join with a 6-letter code — no account needed.</p>
          </div>
        </div>
        <div className="landing-step">
          <span className="step-number">3</span>
          <div className="step-content">
            <h3>Vote &amp; Vibe</h3>
            <p>Add songs, upvote favorites — the top pick plays next.</p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <div className="landing-cta">
        <button
          className="btn btn-primary btn-lg"
          onClick={login}
          disabled={loading}
        >
          <svg className="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          {loading ? "Connecting..." : "Start with Spotify"}
        </button>

        <div className="landing-divider">
          <span>or join a friend's session</span>
        </div>

        <div className="join-section">
          <input
            type="text"
            placeholder="Enter code"
            maxLength={6}
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <button className="btn btn-secondary" onClick={handleJoin}>
            Join
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <p>Built for parties, road trips &amp; good taste.</p>
      </footer>
    </div>
  );
}
