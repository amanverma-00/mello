import type Redis from "ioredis";
import type { Kysely } from "kysely";
import type { Database } from "../db/index.js";
import type { Env } from "../config/env.js";
import SpotifyWebApi from "spotify-web-api-node";
import {
  ensureFreshSpotifyToken,
  createHostSpotifyClient,
} from "../lib/spotify.js";
import { getSession, keys, type SessionData } from "./session.js";
import { popTopTrack, getQueue } from "./queue.js";
import { emitToSession } from "../lib/socket.js";

// ── Types ──────────────────────────────────────────────

export interface NowPlayingData {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  startedAt: string; // ISO
  isPaused: boolean;
  pausedAt: string | null; // ISO
  progressMs: number; // progress at pause time, or computed
}

// ── Redis Keys ─────────────────────────────────────────

const playbackKeys = {
  nowPlaying: (code: string) => `session:${code}:now_playing`,
} as const;

const NP_TTL = (Number(process.env.SESSION_TTL_HOURS) || 6) * 60 * 60;

// ── Playback Service ───────────────────────────────────

/**
 * Get the host's Spotify client with a fresh token.
 */
async function getHostClient(
  hostId: string,
  db: Kysely<Database>,
  env: Env,
): Promise<SpotifyWebApi> {
  const accessToken = await ensureFreshSpotifyToken(hostId, db, env);

  // Get refresh token from DB for client construction
  const row = await db
    .selectFrom("spotify_tokens")
    .select("refresh_token")
    .where("host_id", "=", hostId)
    .executeTakeFirstOrThrow();

  return createHostSpotifyClient(accessToken, row.refresh_token, env);
}

/**
 * Play the top song from the queue on the host's Spotify.
 * Returns the now-playing data or null if queue is empty.
 */
export async function playNextFromQueue(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
  code: string,
  session: SessionData,
): Promise<NowPlayingData | null> {
  const track = await popTopTrack(redis, code);
  if (!track) {
    // Queue is empty — clear now playing
    await clearNowPlaying(redis, code);
    emitToSession(code, "now_playing:updated", null);
    return null;
  }

  const client = await getHostClient(session.hostId, db, env);

  // Start playback on Spotify
  try {
    await client.play({
      uris: [`spotify:track:${track.spotifyTrackId}`],
    });
  } catch (err: unknown) {
    const spotifyErr = err as { statusCode?: number; body?: { error?: { reason?: string } } };
    const status = spotifyErr.statusCode ?? 0;
    const reason = spotifyErr.body?.error?.reason ?? "";

    if (status === 404 || reason === "NO_ACTIVE_DEVICE") {
      throw new PlaybackError(
        "NO_ACTIVE_DEVICE",
        "No active Spotify device found. Open Spotify on any device and try again.",
        404,
      );
    }
    if (status === 403 || reason === "PREMIUM_REQUIRED") {
      throw new PlaybackError(
        "PREMIUM_REQUIRED",
        "Spotify Premium is required for playback control.",
        403,
      );
    }
    throw new PlaybackError(
      "SPOTIFY_ERROR",
      "Failed to start playback on Spotify.",
      502,
    );
  }

  const now = new Date().toISOString();
  const npData: NowPlayingData = {
    spotifyTrackId: track.spotifyTrackId,
    title: track.title,
    artist: track.artist,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    startedAt: now,
    isPaused: false,
    pausedAt: null,
    progressMs: 0,
  };

  await saveNowPlaying(redis, code, npData);

  // Update session hash with current track info
  await redis.hset(keys.session(code), {
    currentTrackId: track.spotifyTrackId,
    currentTrackStartedAt: now,
  });

  // Broadcast to all clients
  emitToSession(code, "now_playing:updated", {
    spotifyTrackId: npData.spotifyTrackId,
    title: npData.title,
    artist: npData.artist,
    albumArt: npData.albumArt,
    startedAt: npData.startedAt,
    durationMs: npData.durationMs,
  });

  // Also broadcast updated queue (since we popped the top track)
  const updatedQueue = await getQueue(redis, code);
  const queueItems = updatedQueue.map((item) => ({
    spotifyTrackId: item.spotifyTrackId,
    title: item.title,
    artist: item.artist,
    albumArt: item.albumArt,
    durationMs: item.durationMs,
    votes: item.votes,
    addedBy: item.addedBy,
    addedAt: item.addedAt,
  }));
  emitToSession(code, "queue:updated", queueItems);

  return npData;
}

/**
 * Pause the host's Spotify playback.
 */
export async function pausePlayback(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
  code: string,
  session: SessionData,
): Promise<void> {
  const np = await getNowPlaying(redis, code);
  if (!np || np.isPaused) return;

  const client = await getHostClient(session.hostId, db, env);
  try {
    await client.pause();
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    // 403 = premium required, 404 = no active device
    if (status === 403 || status === 404) {
      throw new Error(status === 403 ? "Spotify Premium is required for playback control." : "No active Spotify device found.");
    }
    throw err;
  }

  const now = new Date().toISOString();
  const elapsed = Date.now() - new Date(np.startedAt).getTime();
  np.isPaused = true;
  np.pausedAt = now;
  np.progressMs = elapsed;

  await saveNowPlaying(redis, code, np);
  emitToSession(code, "now_playing:paused", { pausedAt: now });
}

/**
 * Resume the host's Spotify playback.
 */
export async function resumePlayback(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
  code: string,
  session: SessionData,
): Promise<void> {
  const np = await getNowPlaying(redis, code);
  if (!np || !np.isPaused) return;

  const client = await getHostClient(session.hostId, db, env);
  try {
    await client.play();
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 403 || status === 404) {
      throw new Error(status === 403 ? "Spotify Premium is required for playback control." : "No active Spotify device found.");
    }
    throw err;
  }

  const now = new Date();
  // Adjust startedAt to account for paused time
  // New startedAt = now - progressMs at pause time
  const adjustedStart = new Date(now.getTime() - np.progressMs);
  np.isPaused = false;
  np.pausedAt = null;
  np.startedAt = adjustedStart.toISOString();

  await saveNowPlaying(redis, code, np);
  emitToSession(code, "now_playing:resumed", {
    resumedAt: now.toISOString(),
  });
}

/**
 * Skip to the next song in the queue.
 */
export async function skipTrack(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
  code: string,
  session: SessionData,
): Promise<NowPlayingData | null> {
  return playNextFromQueue(redis, db, env, code, session);
}

/**
 * Get the current now-playing state from Redis.
 */
export async function getNowPlaying(
  redis: Redis,
  code: string,
): Promise<NowPlayingData | null> {
  const raw = await redis.get(playbackKeys.nowPlaying(code));
  if (!raw) return null;
  return JSON.parse(raw) as NowPlayingData;
}

/**
 * Save now-playing state to Redis.
 */
async function saveNowPlaying(
  redis: Redis,
  code: string,
  data: NowPlayingData,
): Promise<void> {
  await redis.setex(
    playbackKeys.nowPlaying(code),
    NP_TTL,
    JSON.stringify(data),
  );
}

/**
 * Clear now-playing state.
 */
async function clearNowPlaying(redis: Redis, code: string): Promise<void> {
  await redis.del(playbackKeys.nowPlaying(code));
  await redis.hset(keys.session(code), {
    currentTrackId: "",
    currentTrackStartedAt: "",
  });
}

// ── Auto-Advance Engine ────────────────────────────────
// Polls active sessions every 3 seconds for track completion.

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoAdvance(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
): void {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    try {
      await pollActiveSessions(redis, db, env);
    } catch (err) {
      console.error("[AutoAdvance] Polling error:", err);
    }
  }, 3000);

  console.log("[AutoAdvance] Started (3s interval)");
}

export function stopAutoAdvance(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[AutoAdvance] Stopped");
  }
}

/**
 * Scan for sessions with active now-playing tracks and check
 * if they've finished. If so, play the next song.
 */
async function pollActiveSessions(
  redis: Redis,
  db: Kysely<Database>,
  env: Env,
): Promise<void> {
  // Find sessions with active now_playing keys
  let cursor = "0";
  const matchPattern = "session:*:now_playing";

  do {
    const [nextCursor, foundKeys] = await redis.scan(
      cursor,
      "MATCH",
      matchPattern,
      "COUNT",
      50,
    );
    cursor = nextCursor;

    for (const npKey of foundKeys) {
      try {
        const raw = await redis.get(npKey);
        if (!raw) continue;

        const np = JSON.parse(raw) as NowPlayingData;
        if (np.isPaused) continue;

        // Check if track should have ended
        const elapsed = Date.now() - new Date(np.startedAt).getTime();
        // Add 1.5s buffer for network latency
        if (elapsed < np.durationMs + 1500) continue;

        // Extract session code from key: session:{code}:now_playing
        const parts = npKey.split(":");
        const code = parts[1];

        const session = await getSession(redis, code);
        if (!session || session.status !== "active") {
          // Session is gone — clean up the key
          await redis.del(npKey);
          continue;
        }

        console.log(
          `[AutoAdvance] Track ended in session ${code}, advancing...`,
        );

        // Play next song from queue
        await playNextFromQueue(redis, db, env, code, session);
      } catch (err) {
        // Log and continue — don't break the loop for one session
        console.error(`[AutoAdvance] Error processing ${npKey}:`, err);
      }
    }
  } while (cursor !== "0");
}

// ── Custom Error ───────────────────────────────────────

export class PlaybackError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "PlaybackError";
  }
}
