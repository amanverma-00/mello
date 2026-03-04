import type Redis from "ioredis";
import { keys } from "./session.js";

// ── Types ──────────────────────────────────────────────

export interface TrackMetadata {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  addedBy: string; // participant token or "host"
  addedAt: string; // ISO string
}

export interface HydratedQueueItem extends TrackMetadata {
  votes: number;
}

// ── Score Calculation ──────────────────────────────────
// Score = (voteCount * 1_000_000) + (MAX_TS - addedAtEpochMs)
// This ensures higher-voted songs rank first, with ties broken
// by earlier additions (FIFO for same vote count).

const MAX_TIMESTAMP = 9_999_999_999_999; // far-future epoch ms

export function calculateScore(voteCount: number, addedAtMs: number): number {
  return voteCount * 1_000_000 + (MAX_TIMESTAMP - addedAtMs);
}

// ── Queue Operations ───────────────────────────────────

/**
 * Add a song to the session queue.
 * Returns false if the track is already in the queue (duplicate).
 */
export async function addToQueue(
  redis: Redis,
  code: string,
  track: TrackMetadata,
  addedByToken: string,
): Promise<boolean> {
  const queueKey = keys.queue(code);
  const tracksKey = keys.tracks(code);
  const votesKey = keys.votes(code, track.spotifyTrackId);

  // Check for duplicate
  const existing = await redis.zscore(queueKey, track.spotifyTrackId);
  if (existing !== null) return false;

  const addedAtMs = new Date(track.addedAt).getTime();
  const initialScore = calculateScore(1, addedAtMs); // 1 vote (the adder)

  const pipeline = redis.multi();

  // Add to sorted set with initial score
  pipeline.zadd(queueKey, initialScore, track.spotifyTrackId);

  // Store track metadata
  pipeline.hset(tracksKey, track.spotifyTrackId, JSON.stringify(track));

  // Create vote set with the adder's first vote
  pipeline.sadd(votesKey, addedByToken);

  // Set TTLs (inherit session TTL — 6 hours)
  const ttl = 6 * 60 * 60;
  pipeline.expire(queueKey, ttl);
  pipeline.expire(tracksKey, ttl);
  pipeline.expire(votesKey, ttl);

  await pipeline.exec();
  return true;
}

/**
 * Toggle a vote on a track. Returns the new vote state.
 */
export async function toggleVote(
  redis: Redis,
  code: string,
  spotifyTrackId: string,
  voterToken: string,
): Promise<{ voted: boolean; voteCount: number }> {
  const queueKey = keys.queue(code);
  const votesKey = keys.votes(code, spotifyTrackId);
  const tracksKey = keys.tracks(code);

  // Check track exists in queue
  const score = await redis.zscore(queueKey, spotifyTrackId);
  if (score === null) {
    throw new QueueError("TRACK_NOT_IN_QUEUE", "Track not in queue.", 404);
  }

  // Check if already voted
  const alreadyVoted = await redis.sismember(votesKey, voterToken);

  if (alreadyVoted) {
    // Remove vote
    await redis.srem(votesKey, voterToken);
  } else {
    // Add vote
    await redis.sadd(votesKey, voterToken);
  }

  // Recalculate score
  const voteCount = await redis.scard(votesKey);
  const trackRaw = await redis.hget(tracksKey, spotifyTrackId);
  if (trackRaw) {
    const track = JSON.parse(trackRaw) as TrackMetadata;
    const addedAtMs = new Date(track.addedAt).getTime();
    const newScore = calculateScore(voteCount, addedAtMs);
    await redis.zadd(queueKey, newScore, spotifyTrackId);
  }

  return {
    voted: !alreadyVoted,
    voteCount,
  };
}

/**
 * Get the full hydrated queue, ordered by score (highest first).
 */
export async function getQueue(
  redis: Redis,
  code: string,
): Promise<HydratedQueueItem[]> {
  const queueKey = keys.queue(code);
  const tracksKey = keys.tracks(code);

  // Get all track IDs ordered by score DESC
  const trackIds = await redis.zrevrange(queueKey, 0, -1);
  if (trackIds.length === 0) return [];

  // Hydrate with metadata and vote counts
  const pipeline = redis.pipeline();
  for (const id of trackIds) {
    pipeline.hget(tracksKey, id);
    pipeline.scard(keys.votes(code, id));
  }

  const results = await pipeline.exec();
  if (!results) return [];

  const items: HydratedQueueItem[] = [];
  for (let i = 0; i < trackIds.length; i++) {
    const metaResult = results[i * 2];
    const votesResult = results[i * 2 + 1];

    if (!metaResult || !votesResult) continue;
    const [metaErr, metaRaw] = metaResult;
    const [votesErr, voteCount] = votesResult;

    if (metaErr || votesErr || !metaRaw) continue;

    const track = JSON.parse(metaRaw as string) as TrackMetadata;
    items.push({
      ...track,
      votes: voteCount as number,
    });
  }

  return items;
}

/**
 * Get the set of track IDs a specific user has voted for.
 */
export async function getUserVotes(
  redis: Redis,
  code: string,
  trackIds: string[],
  voterToken: string,
): Promise<Set<string>> {
  if (trackIds.length === 0) return new Set();

  const pipeline = redis.pipeline();
  for (const id of trackIds) {
    pipeline.sismember(keys.votes(code, id), voterToken);
  }

  const results = await pipeline.exec();
  if (!results) return new Set();

  const voted = new Set<string>();
  for (let i = 0; i < trackIds.length; i++) {
    const [err, isMember] = results[i]!;
    if (!err && isMember) {
      voted.add(trackIds[i]);
    }
  }
  return voted;
}

/**
 * Pop the top-scored track from the queue.
 * Returns null if queue is empty.
 */
export async function popTopTrack(
  redis: Redis,
  code: string,
): Promise<TrackMetadata | null> {
  const queueKey = keys.queue(code);
  const tracksKey = keys.tracks(code);

  // Get top track
  const topIds = await redis.zrevrange(queueKey, 0, 0);
  if (topIds.length === 0) return null;

  const trackId = topIds[0];

  // Get metadata before removing
  const raw = await redis.hget(tracksKey, trackId);
  if (!raw) return null;

  const track = JSON.parse(raw) as TrackMetadata;

  // Remove from queue, tracks hash, and vote set
  const pipeline = redis.multi();
  pipeline.zrem(queueKey, trackId);
  pipeline.hdel(tracksKey, trackId);
  pipeline.del(keys.votes(code, trackId));
  await pipeline.exec();

  return track;
}

// ── Custom Error ───────────────────────────────────────

export class QueueError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "QueueError";
  }
}
