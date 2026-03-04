import { z } from "zod";

// ── Session ──────────────────────────────────────────────

export const createSessionResponseSchema = z.object({
  code: z.string().length(6),
  shareLink: z.string().url(),
});

export const joinSessionRequestSchema = z.object({
  displayName: z.string().min(1).max(30).trim(),
});

export const joinSessionResponseSchema = z.object({
  participantToken: z.string(),
  session: z.object({
    code: z.string(),
    currentTrack: z
      .object({
        spotifyTrackId: z.string(),
        title: z.string(),
        artist: z.string(),
        albumArt: z.string(),
        startedAt: z.string(),
        durationMs: z.number(),
      })
      .nullable(),
    participantCount: z.number(),
  }),
});

// ── Queue ────────────────────────────────────────────────

export const addSongRequestSchema = z.object({
  spotifyTrackId: z.string().min(1),
});

export const queueItemSchema = z.object({
  spotifyTrackId: z.string(),
  title: z.string(),
  artist: z.string(),
  albumArt: z.string(),
  durationMs: z.number(),
  votes: z.number(),
  addedBy: z.string(),
  addedAt: z.string(),
});

// ── Vote ─────────────────────────────────────────────────

export const voteRequestSchema = z.object({
  spotifyTrackId: z.string().min(1),
});

// ── Search ───────────────────────────────────────────────

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const searchResultItemSchema = z.object({
  spotifyTrackId: z.string(),
  title: z.string(),
  artist: z.string(),
  albumArt: z.string(),
  durationMs: z.number(),
});

// ── Now Playing ──────────────────────────────────────────

export const nowPlayingSchema = z.object({
  spotifyTrackId: z.string(),
  title: z.string(),
  artist: z.string(),
  albumArt: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
});

// ── Error ────────────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number(),
  }),
});
