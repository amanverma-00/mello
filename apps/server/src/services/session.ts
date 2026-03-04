import type Redis from "ioredis";
import { nanoid, customAlphabet } from "nanoid";

// 6-char uppercase alphanumeric code (no ambiguous chars)
const generateCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

// ── Redis Key Helpers ──────────────────────────────────

export const keys = {
  session: (code: string) => `session:${code}`,
  participants: (code: string) => `session:${code}:participants`,
  queue: (code: string) => `session:${code}:queue`,
  tracks: (code: string) => `session:${code}:tracks`,
  votes: (code: string, trackId: string) =>
    `session:${code}:votes:${trackId}`,
} as const;

// ── Types ──────────────────────────────────────────────

export interface SessionData {
  code: string;
  hostId: string;
  status: "active" | "ended";
  createdAt: string;
  currentTrackId: string | null;
  currentTrackStartedAt: string | null;
}

export interface Participant {
  token: string;
  displayName: string;
  joinedAt: string;
}

// ── Session Service ────────────────────────────────────

const SESSION_TTL = 6 * 60 * 60; // 6 hours in seconds

/**
 * Create a new session with a unique 6-char code.
 * Retries up to 3 times if a code collision occurs.
 */
export async function createSession(
  redis: Redis,
  hostId: string,
  appUrl: string,
): Promise<{ code: string; shareLink: string }> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const code = generateCode();
    const key = keys.session(code);

    // Check if code already exists
    const exists = await redis.exists(key);
    if (exists) {
      attempts++;
      continue;
    }

    const sessionData: SessionData = {
      code,
      hostId,
      status: "active",
      createdAt: new Date().toISOString(),
      currentTrackId: null,
      currentTrackStartedAt: null,
    };

    // Store session hash with TTL
    await redis
      .multi()
      .hset(key, sessionData as unknown as Record<string, string>)
      .expire(key, SESSION_TTL)
      .expire(keys.participants(code), SESSION_TTL)
      .expire(keys.queue(code), SESSION_TTL)
      .exec();

    const shareLink = `${appUrl}/join/${code}`;
    return { code, shareLink };
  }

  throw new Error("Failed to generate a unique session code after 3 attempts.");
}

/**
 * Get session data by code. Returns null if not found.
 */
export async function getSession(
  redis: Redis,
  code: string,
): Promise<SessionData | null> {
  const data = await redis.hgetall(keys.session(code));
  if (!data || !data.code) return null;
  return data as unknown as SessionData;
}

/**
 * Add a participant to a session. Returns the participant token.
 */
export async function joinSession(
  redis: Redis,
  code: string,
  displayName: string,
  maxParticipants: number,
): Promise<{ token: string; participant: Participant }> {
  const session = await getSession(redis, code);
  if (!session) throw new SessionError("SESSION_NOT_FOUND", "Session not found.", 404);
  if (session.status !== "active")
    throw new SessionError("SESSION_ENDED", "This session has ended.", 410);

  // Check participant cap
  const count = await redis.hlen(keys.participants(code));
  if (count >= maxParticipants)
    throw new SessionError("SESSION_FULL", "This session is full.", 403);

  const token = `p_${nanoid(24)}`;
  const participant: Participant = {
    token,
    displayName,
    joinedAt: new Date().toISOString(),
  };

  await redis.hset(
    keys.participants(code),
    token,
    JSON.stringify(participant),
  );

  return { token, participant };
}

/**
 * Get a participant by token. Returns null if not found.
 */
export async function getParticipant(
  redis: Redis,
  code: string,
  token: string,
): Promise<Participant | null> {
  const raw = await redis.hget(keys.participants(code), token);
  if (!raw) return null;
  return JSON.parse(raw) as Participant;
}

/**
 * Get all participants in a session.
 */
export async function getParticipants(
  redis: Redis,
  code: string,
): Promise<Participant[]> {
  const all = await redis.hgetall(keys.participants(code));
  return Object.values(all).map((raw) => JSON.parse(raw) as Participant);
}

/**
 * Get current participant count.
 */
export async function getParticipantCount(
  redis: Redis,
  code: string,
): Promise<number> {
  return redis.hlen(keys.participants(code));
}

/**
 * End a session. Sets status to "ended".
 */
export async function endSession(
  redis: Redis,
  code: string,
  hostId: string,
): Promise<void> {
  const session = await getSession(redis, code);
  if (!session) throw new SessionError("SESSION_NOT_FOUND", "Session not found.", 404);
  if (session.hostId !== hostId)
    throw new SessionError("FORBIDDEN", "Only the host can end this session.", 403);

  await redis.hset(keys.session(code), "status", "ended");

  // Set a short TTL so data is cleaned up soon
  const cleanupTtl = 60; // 1 minute
  const sessionKeys = [
    keys.session(code),
    keys.participants(code),
    keys.queue(code),
    keys.tracks(code),
  ];

  // Also clean up any vote sets (by pattern scanning)
  const votePattern = `session:${code}:votes:*`;
  let cursor = "0";
  const voteKeys: string[] = [];
  do {
    const [nextCursor, foundKeys] = await redis.scan(
      cursor,
      "MATCH",
      votePattern,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    voteKeys.push(...foundKeys);
  } while (cursor !== "0");

  const allKeys = [...sessionKeys, ...voteKeys];
  const pipeline = redis.multi();
  for (const key of allKeys) {
    pipeline.expire(key, cleanupTtl);
  }
  await pipeline.exec();
}

/**
 * Validate that a token belongs to a participant in the session,
 * or that the JWT corresponds to the session host.
 */
export async function validateSessionAccess(
  redis: Redis,
  code: string,
  participantToken?: string,
  hostId?: string,
): Promise<{ role: "host" | "participant"; displayName: string }> {
  const session = await getSession(redis, code);
  if (!session) throw new SessionError("SESSION_NOT_FOUND", "Session not found.", 404);

  // Host check
  if (hostId && session.hostId === hostId) {
    return { role: "host", displayName: "Host" };
  }

  // Participant check
  if (participantToken) {
    const participant = await getParticipant(redis, code, participantToken);
    if (participant) {
      return { role: "participant", displayName: participant.displayName };
    }
  }

  throw new SessionError("UNAUTHORIZED", "Not a member of this session.", 401);
}

// ── Custom Error ───────────────────────────────────────

export class SessionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "SessionError";
  }
}
