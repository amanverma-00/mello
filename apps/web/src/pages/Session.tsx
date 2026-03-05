import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { SearchModal } from "../components/SearchModal";
import { QueueList } from "../components/QueueList";
import { NowPlayingBar, type NowPlayingState } from "../components/NowPlaying";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { useToast } from "../components/Toast";

interface QueueItemData {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  votes: number;
  addedBy: string;
  addedAt: string;
}

interface LocationState {
  role: "host" | "participant";
  token: string;
  shareLink?: string;
  displayName?: string;
}

export function SessionPage() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const rawState = location.state as LocationState | null;

  // Persist session state in sessionStorage so it survives page refresh
  const storageKey = code ? `melo_session_${code}` : null;
  const state = (() => {
    if (rawState && storageKey) {
      sessionStorage.setItem(storageKey, JSON.stringify(rawState));
      return rawState;
    }
    if (storageKey) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try { return JSON.parse(saved) as LocationState; } catch { /* ignore */ }
      }
    }
    return null;
  })();

  // If no state (direct URL visit without joining), redirect to join page
  if (!state || !code) {
    return (
      <div className="app">
        <header className="hero">
          <h1>Melo</h1>
          <p>Invalid session. Please join via a code.</p>
        </header>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate(code ? `/join/${code}` : "/")}>
            {code ? "Join This Session" : "Go Home"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <SessionRoom
      code={code}
      role={state.role}
      token={state.token}
      shareLink={state.shareLink}
    />
  );
}

function SessionRoom({
  code,
  role,
  token,
  shareLink,
}: {
  code: string;
  role: "host" | "participant";
  token: string;
  shareLink?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [queue, setQueue] = useState<QueueItemData[]>([]);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [playLoading, setPlayLoading] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const { connected, participantCount, sessionEnded, setParticipantCount, socket } =
    useSocket({ sessionCode: code, token });

  // Auth headers helper
  const getHeaders = useCallback((): Record<string, string> => {
    if (role === "host") return { Authorization: `Bearer ${token}` };
    return { "x-participant-token": token };
  }, [role, token]);

  // Fetch queue
  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/queue`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          queue: QueueItemData[];
          userVotes: string[];
        };
        setQueue(data.queue);
        setUserVotes(new Set(data.userVotes));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingQueue(false);
    }
  }, [code, getHeaders]);

  // Fetch playback state
  const fetchPlayback = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/playback`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { nowPlaying: NowPlayingState | null };
        setNowPlaying(data.nowPlaying);
      }
    } catch {
      // silently fail
    }
  }, [code, getHeaders]);

  // Initial load — session info, queue, playback state
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((data: { participantCount?: number }) => {
        if (data.participantCount !== undefined) {
          setParticipantCount(data.participantCount);
        }
      })
      .catch(() => {});

    fetchQueue();
    fetchPlayback();
  }, [code, getHeaders, setParticipantCount, fetchQueue, fetchPlayback]);

  // Reconnection recovery — re-fetch state when socket reconnects
  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      fetchQueue();
      fetchPlayback();
      fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}`, { headers: getHeaders() })
        .then((r) => r.json())
        .then((data: { participantCount?: number }) => {
          if (data.participantCount !== undefined) {
            setParticipantCount(data.participantCount);
          }
        })
        .catch(() => {});
    };

    socket.on("connect", handleReconnect);
    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket, code, getHeaders, setParticipantCount, fetchQueue, fetchPlayback]);

  // Listen for queue:updated events from Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleQueueUpdate = (updatedQueue: QueueItemData[]) => {
      setQueue(updatedQueue);
      fetchQueue(); // re-fetch for user votes
    };

    socket.on("queue:updated", handleQueueUpdate);
    return () => {
      socket.off("queue:updated", handleQueueUpdate);
    };
  }, [socket, fetchQueue]);

  // Listen for playback events from Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNowPlayingUpdate = (
      track: {
        spotifyTrackId: string;
        title: string;
        artist: string;
        albumArt: string;
        startedAt: string;
        durationMs: number;
      } | null,
    ) => {
      if (track) {
        setNowPlaying({ ...track, isPaused: false, progressMs: 0 });
      } else {
        setNowPlaying(null);
      }
    };

    const handlePaused = ({ pausedAt }: { pausedAt: string }) => {
      setNowPlaying((prev) => {
        if (!prev) return null;
        const elapsed =
          new Date(pausedAt).getTime() - new Date(prev.startedAt).getTime();
        return { ...prev, isPaused: true, progressMs: Math.min(elapsed, prev.durationMs) };
      });
    };

    const handleResumed = () => {
      fetchPlayback();
    };

    socket.on("now_playing:updated", handleNowPlayingUpdate);
    socket.on("now_playing:paused", handlePaused);
    socket.on("now_playing:resumed", handleResumed);

    return () => {
      socket.off("now_playing:updated", handleNowPlayingUpdate);
      socket.off("now_playing:paused", handlePaused);
      socket.off("now_playing:resumed", handleResumed);
    };
  }, [socket, fetchPlayback]);

  // ── Share button — try Web Share API first, then clipboard ──
  const handleShare = async () => {
    const url = shareLink ?? `${window.location.origin}/join/${code}`;
    const shareData = {
      title: "Melo Session",
      text: `Join my Melo session! 🎵`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartPlaying = async () => {
    setPlayLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/playback/play`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.show(body.error?.message ?? "Failed to start playback", "error");
      }
    } catch {
      toast.show("Failed to start playback", "error");
    } finally {
      setPlayLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!confirm("Are you sure you want to end this session?")) return;
    setEnding(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate("/dashboard", { replace: true });
    } catch {
      setEnding(false);
      toast.show("Failed to end session", "error");
    }
  };

  if (sessionEnded) {
    return (
      <div className="app">
        <header className="hero">
          <h1>Melo</h1>
          <p>This session has ended.</p>
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
      <ConnectionBanner connected={connected} />

      <header className="hero">
        <h1>Melo</h1>
        <div className="session-info">
          <span className="session-code" aria-label={`Session code: ${code.split("").join(" ")}`}>
            {code}
          </span>
          <button
            className="btn-copy"
            onClick={handleShare}
            aria-label="Share session link"
          >
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
        <p className="participant-count" aria-live="polite">
          {participantCount} participant{participantCount !== 1 ? "s" : ""}
        </p>
      </header>

      {/* Now Playing Bar */}
      <NowPlayingBar
        nowPlaying={nowPlaying}
        role={role}
        code={code}
        token={token}
        onPlaybackAction={fetchPlayback}
      />

      <div className="session-body" role="main">
        <div className="session-actions-row">
          <button
            className="btn btn-primary btn-add-song"
            onClick={() => setShowSearch(true)}
            aria-label="Add a song to the queue"
          >
            + Add Song
          </button>

          {role === "host" && !nowPlaying && queue.length > 0 && (
            <button
              className="btn btn-accent btn-start-playing"
              onClick={handleStartPlaying}
              disabled={playLoading}
              aria-label="Start playing the top voted song"
            >
              {playLoading ? <span className="spinner" /> : "▶ Play"}
            </button>
          )}
        </div>

        {loadingQueue ? (
          <QueueSkeleton />
        ) : (
          <QueueList
            queue={queue}
            userVotes={userVotes}
            code={code}
            token={token}
            role={role}
            onVoteToggled={fetchQueue}
          />
        )}
      </div>

      {role === "host" && (
        <div className="host-controls">
          <button
            className="btn btn-danger"
            onClick={handleEndSession}
            disabled={ending}
            aria-label="End this session"
          >
            {ending ? "Ending..." : "End Session"}
          </button>
        </div>
      )}

      {showSearch && (
        <SearchModal
          code={code}
          token={token}
          role={role}
          onClose={() => setShowSearch(false)}
          onAdded={fetchQueue}
        />
      )}
    </div>
  );
}

/** Skeleton placeholder while queue is loading */
function QueueSkeleton() {
  return (
    <div className="queue-list" aria-label="Loading queue">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton-queue-item">
          <div className="skeleton skeleton-art" />
          <div className="skeleton-text-group">
            <div className="skeleton skeleton-line skeleton-line-long" />
            <div className="skeleton skeleton-line skeleton-line-short" />
          </div>
        </div>
      ))}
    </div>
  );
}
