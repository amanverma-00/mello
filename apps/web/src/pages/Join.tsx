import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export function JoinPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(urlCode ?? "");
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = displayName.trim();

    if (!trimmedCode || trimmedCode.length !== 6) {
      setError("Enter a valid 6-character session code.");
      return;
    }
    if (!trimmedName) {
      setError("Enter your display name.");
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/sessions/${trimmedCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmedName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ??
            `Failed to join (${res.status})`,
        );
      }

      const data = (await res.json()) as {
        participantToken: string;
        session: {
          code: string;
          participantCount: number;
        };
      };

      navigate(`/session/${trimmedCode}`, {
        state: {
          role: "participant",
          token: data.participantToken,
          displayName: trimmedName,
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <h1>Melo</h1>
        <p>Join a session</p>
      </header>

      <div className="actions">
        <input
          type="text"
          placeholder="Session code"
          maxLength={6}
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <input
          type="text"
          placeholder="Your display name"
          maxLength={30}
          className="code-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? "Joining..." : "Join Session"}
        </button>
        {error && <p className="error">{error}</p>}
        <button
          className="btn btn-secondary"
          onClick={() => navigate("/")}
        >
          Back
        </button>
      </div>
    </div>
  );
}
