import type { QueueItem, NowPlaying } from "./types.js";

// ── Server → Client Events ──────────────────────────────

export interface ServerToClientEvents {
  "queue:updated": (queue: QueueItem[]) => void;
  "now_playing:updated": (track: NowPlaying | null) => void;
  "now_playing:paused": (data: { pausedAt: string }) => void;
  "now_playing:resumed": (data: { resumedAt: string }) => void;
  "session:ended": () => void;
  "participant:joined": (data: { displayName: string; count: number }) => void;
  "participant:left": (data: { displayName: string; count: number }) => void;
  error: (data: { code: string; message: string }) => void;
}

// ── Client → Server Events ──────────────────────────────
// Mutations go through REST. WebSocket is read-only broadcast.
// This type exists for Socket.IO typing only.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {
  // No client-to-server events in MVP — all mutations via REST
}

// ── Socket Auth ─────────────────────────────────────────

export interface SocketAuth {
  sessionCode: string;
  token: string;
}
