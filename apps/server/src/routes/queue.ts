import type { FastifyInstance } from "fastify";
import SpotifyWebApi from "spotify-web-api-node";
import { requireSessionAccess } from "../middleware/session-auth.js";
import { ensureFreshSpotifyToken } from "../lib/spotify.js";
import { getSession, SessionError } from "../services/session.js";
import {
  addToQueue,
  toggleVote,
  getQueue,
  getUserVotes,
  QueueError,
  type TrackMetadata,
} from "../services/queue.js";
import { emitToSession } from "../lib/socket.js";
import {
  addSongRequestSchema,
  voteRequestSchema,
  searchQuerySchema,
} from "@melo/shared";

export async function queueRoutes(app: FastifyInstance) {
  const redis = app.redis;
  const db = app.db;
  const env = app.env;

  // ── Error handler for custom errors ────────────────
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof QueueError) {
      request.log.warn(
        { err: error, code: error.code, sessionCode: (request.params as Record<string, string>).code },
        `Queue error: ${error.message}`,
      );
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }
    if (error instanceof SessionError) {
      request.log.warn(
        { err: error, code: error.code, sessionCode: (request.params as Record<string, string>).code },
        `Session error: ${error.message}`,
      );
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }
    // Log unexpected errors with full context
    request.log.error(
      { err: error, sessionCode: (request.params as Record<string, string>).code },
      `Unexpected error in queue route: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error; // re-throw to parent error handler
  });

  // ── GET /sessions/:code/search?q= — Spotify search proxy ──
  app.get<{ Params: { code: string }; Querystring: { q: string } }>(
    "/sessions/:code/search",
    { preHandler: [requireSessionAccess] },
    async (request, reply) => {
      const { code } = request.params;
      const parseResult = searchQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Missing or invalid search query.",
            statusCode: 400,
          },
        });
      }

      const { q } = parseResult.data;

      // Check cache first (60s TTL)
      const cacheKey = `search:${code}:${q.toLowerCase().trim()}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      // Get session to find host
      const session = await getSession(redis, code);
      if (!session) {
        return reply.status(404).send({
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Session not found.",
            statusCode: 404,
          },
        });
      }

      // Get fresh Spotify token for the host
      const accessToken = await ensureFreshSpotifyToken(
        session.hostId,
        db,
        env,
      );

      // Search Spotify
      const spotifyApi = new SpotifyWebApi();
      spotifyApi.setAccessToken(accessToken);

      let searchResult;
      try {
        searchResult = await spotifyApi.searchTracks(q, { limit: 10 });
      } catch (spotifyErr) {
        request.log.error(
          { err: spotifyErr, query: q, sessionCode: code, service: "spotify" },
          "Spotify searchTracks API call failed",
        );
        return reply.status(502).send({
          error: {
            code: "SPOTIFY_API_ERROR",
            message: "Failed to search Spotify. Please try again.",
            statusCode: 502,
          },
        });
      }

      const tracks = searchResult.body.tracks?.items ?? [];

      const results = tracks.map((t) => ({
        spotifyTrackId: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        albumArt: t.album.images[0]?.url ?? "",
        durationMs: t.duration_ms,
      }));

      request.log.debug(
        { sessionCode: code, query: q, resultCount: results.length },
        "Spotify search completed",
      );

      // Cache for 60 seconds
      await redis.set(cacheKey, JSON.stringify(results), "EX", 60);

      return reply.send(results);
    },
  );

  // ── POST /sessions/:code/queue — Add song to queue ──
  app.post<{ Params: { code: string }; Body: { spotifyTrackId: string } }>(
    "/sessions/:code/queue",
    { preHandler: [requireSessionAccess] },
    async (request, reply) => {
      const { code } = request.params;
      const parseResult = addSongRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid request body.",
            statusCode: 400,
          },
        });
      }

      const { spotifyTrackId } = parseResult.data;

      // Determine who added it
      const addedBy =
        request.participantToken ?? request.hostAuth?.hostId ?? "unknown";

      // We need track metadata — fetch from Spotify
      const session = await getSession(redis, code);
      if (!session) {
        return reply.status(404).send({
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Session not found.",
            statusCode: 404,
          },
        });
      }

      const accessToken = await ensureFreshSpotifyToken(
        session.hostId,
        db,
        env,
      );

      const spotifyApi = new SpotifyWebApi();
      spotifyApi.setAccessToken(accessToken);

      let trackResult;
      try {
        trackResult = await spotifyApi.getTrack(spotifyTrackId);
      } catch (spotifyErr) {
        request.log.error(
          { err: spotifyErr, spotifyTrackId, sessionCode: code, service: "spotify" },
          "Spotify getTrack API call failed",
        );
        return reply.status(502).send({
          error: {
            code: "SPOTIFY_API_ERROR",
            message: "Failed to fetch track from Spotify. Please try again.",
            statusCode: 502,
          },
        });
      }

      const t = trackResult.body;

      const track: TrackMetadata = {
        spotifyTrackId: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        albumArt: t.album.images[0]?.url ?? "",
        durationMs: t.duration_ms,
        addedBy,
        addedAt: new Date().toISOString(),
      };

      const added = await addToQueue(redis, code, track, addedBy);

      if (!added) {
        return reply.status(409).send({
          error: {
            code: "DUPLICATE_TRACK",
            message: "This song is already in the queue. Upvote it instead!",
            statusCode: 409,
          },
        });
      }

      // Broadcast updated queue
      const queue = await getQueue(redis, code);
      emitToSession(code, "queue:updated", queue);

      return reply.status(201).send({ message: "Song added to queue." });
    },
  );

  // ── POST /sessions/:code/vote — Toggle vote ──
  app.post<{
    Params: { code: string };
    Body: { spotifyTrackId: string };
  }>(
    "/sessions/:code/vote",
    {
      preHandler: [requireSessionAccess],
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 1000, // 1 request per second
          keyGenerator: (request: { headers: Record<string, string | string[] | undefined> }) => {
            // Rate limit per participant/host token
            return (
              (request.headers["x-participant-token"] as string) ??
              (request.headers["authorization"] as string) ??
              "unknown"
            );
          },
        },
      },
    },
    async (request, reply) => {
      const { code } = request.params;
      const parseResult = voteRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid request body.",
            statusCode: 400,
          },
        });
      }

      const { spotifyTrackId } = parseResult.data;
      const voterToken =
        request.participantToken ?? request.hostAuth?.hostId ?? "unknown";

      const { voted, voteCount } = await toggleVote(
        redis,
        code,
        spotifyTrackId,
        voterToken,
      );

      // Broadcast updated queue
      const queue = await getQueue(redis, code);
      emitToSession(code, "queue:updated", queue);

      return reply.send({ voted, voteCount });
    },
  );

  // ── GET /sessions/:code/queue — Get ordered queue ──
  app.get<{ Params: { code: string } }>(
    "/sessions/:code/queue",
    { preHandler: [requireSessionAccess] },
    async (request, reply) => {
      const { code } = request.params;

      const queue = await getQueue(redis, code);

      // Also compute user's votes
      const voterToken =
        request.participantToken ?? request.hostAuth?.hostId ?? "unknown";
      const trackIds = queue.map((q) => q.spotifyTrackId);
      const userVotes = await getUserVotes(redis, code, trackIds, voterToken);

      return reply.send({
        queue,
        userVotes: Array.from(userVotes),
      });
    },
  );
}
