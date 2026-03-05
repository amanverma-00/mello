import { useEffect, useState, useRef } from "react";

interface NowPlayingProps {
  nowPlaying: NowPlayingState | null;
  role: "host" | "participant";
  code: string;
  token: string;
  onPlaybackAction?: () => void;
}

export interface NowPlayingState {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  startedAt: string;
  durationMs: number;
  isPaused: boolean;
  progressMs: number;
}

export function NowPlayingBar({
  nowPlaying,
  role,
  code,
  token,
  onPlaybackAction,
}: NowPlayingProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const animRef = useRef<number | null>(null);
  const startRef = useRef<{ startedAt: number; durationMs: number } | null>(
    null,
  );

  // Update progress from now-playing state
  useEffect(() => {
    if (!nowPlaying) {
      setProgress(0);
      setIsPaused(false);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    setIsPaused(nowPlaying.isPaused);

    if (nowPlaying.isPaused) {
      setProgress(nowPlaying.progressMs);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    // Start client-side interpolation
    const startedAt = new Date(nowPlaying.startedAt).getTime();
    startRef.current = { startedAt, durationMs: nowPlaying.durationMs };

    const tick = () => {
      if (!startRef.current) return;
      const elapsed = Date.now() - startRef.current.startedAt;
      const clamped = Math.min(elapsed, startRef.current.durationMs);
      setProgress(clamped);

      if (clamped < startRef.current.durationMs) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [nowPlaying]);

  if (!nowPlaying) return null;

  const pct =
    nowPlaying.durationMs > 0
      ? Math.min((progress / nowPlaying.durationMs) * 100, 100)
      : 0;

  const formatTime = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handlePlay = async () => {
    setLoading(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/playback/play`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      onPlaybackAction?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    setLoading(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/playback/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      onPlaybackAction?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/playback/skip`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      onPlaybackAction?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="now-playing-bar">
      <div className="np-progress-track">
        <div className="np-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="np-content">
        <img
          className="np-album-art"
          src={nowPlaying.albumArt}
          alt={nowPlaying.title}
        />

        <div className="np-info">
          <span className="np-title">{nowPlaying.title}</span>
          <span className="np-artist">{nowPlaying.artist}</span>
        </div>

        <div className="np-time">
          {formatTime(progress)} / {formatTime(nowPlaying.durationMs)}
        </div>

        {role === "host" && (
          <div className="np-controls">
            {isPaused ? (
              <button
                className="np-btn np-btn-play"
                onClick={handlePlay}
                disabled={loading}
                title="Resume"
              >
                ▶
              </button>
            ) : (
              <button
                className="np-btn np-btn-pause"
                onClick={handlePause}
                disabled={loading}
                title="Pause"
              >
                ⏸
              </button>
            )}
            <button
              className="np-btn np-btn-skip"
              onClick={handleSkip}
              disabled={loading}
              title="Skip"
            >
              ⏭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
