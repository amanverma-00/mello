import type { FastifyInstance } from "fastify";
import { requireHost } from "../middleware/auth.js";
import { requireSessionAccess } from "../middleware/session-auth.js";
import { getSession } from "../services/session.js";
import {
  playNextFromQueue,
  pausePlayback,
  resumePlayback,
  skipTrack,
  getNowPlaying,
  PlaybackError,
} from "../services/playback.js";

export async function playbackRoutes(app: FastifyInstance) {
  // ── POST /sessions/:code/playback/play — Start / resume playback (host only) ──
  app.post<{ Params: { code: string } }>(
    "/sessions/:code/playback/play",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const { code } = request.params;
      const { redis, db, env } = app;
      const hostId = request.hostAuth!.hostId;

      try {
        const session = await getSession(redis, code);
        if (!session || session.status !== "active") {
          return reply.status(404).send({
            error: {
              code: "SESSION_NOT_FOUND",
              message: "Session not found or ended.",
              statusCode: 404,
            },
          });
        }

        if (session.hostId !== hostId) {
          return reply.status(403).send({
            error: {
              code: "NOT_HOST",
              message: "Only the host can control playback.",
              statusCode: 403,
            },
          });
        }

        // Check if there's a paused track to resume
        const current = await getNowPlaying(redis, code);
        if (current && current.isPaused) {
          await resumePlayback(redis, db, env, code, session);
          return reply.send({ status: "resumed" });
        }

        // Otherwise start playing the top song
        const np = await playNextFromQueue(redis, db, env, code, session);
        if (!np) {
          return reply.status(404).send({
            error: {
              code: "QUEUE_EMPTY",
              message: "Queue is empty — add some songs first!",
              statusCode: 404,
            },
          });
        }

        return reply.send({
          status: "playing",
          nowPlaying: {
            spotifyTrackId: np.spotifyTrackId,
            title: np.title,
            artist: np.artist,
            albumArt: np.albumArt,
            startedAt: np.startedAt,
            durationMs: np.durationMs,
          },
        });
      } catch (err) {
        if (err instanceof PlaybackError) {
          request.log.warn(
            { err, code: err.code, sessionCode: code, service: "spotify" },
            `Playback error: ${err.message}`,
          );
          return reply.status(err.statusCode).send({
            error: {
              code: err.code,
              message: err.message,
              statusCode: err.statusCode,
            },
          });
        }
        request.log.error(
          { err, sessionCode: code, service: "spotify" },
          "Unexpected playback error",
        );
        throw err;
      }
    },
  );

  // ── POST /sessions/:code/playback/pause — Pause playback (host only) ──
  app.post<{ Params: { code: string } }>(
    "/sessions/:code/playback/pause",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const { code } = request.params;
      const { redis, db, env } = app;
      const hostId = request.hostAuth!.hostId;

      try {
        const session = await getSession(redis, code);
        if (!session || session.status !== "active") {
          return reply.status(404).send({
            error: {
              code: "SESSION_NOT_FOUND",
              message: "Session not found or ended.",
              statusCode: 404,
            },
          });
        }

        if (session.hostId !== hostId) {
          return reply.status(403).send({
            error: {
              code: "NOT_HOST",
              message: "Only the host can control playback.",
              statusCode: 403,
            },
          });
        }

        await pausePlayback(redis, db, env, code, session);
        return reply.send({ status: "paused" });
      } catch (err) {
        if (err instanceof PlaybackError) {
          request.log.warn(
            { err, code: err.code, sessionCode: code, service: "spotify" },
            `Playback error: ${err.message}`,
          );
          return reply.status(err.statusCode).send({
            error: {
              code: err.code,
              message: err.message,
              statusCode: err.statusCode,
            },
          });
        }
        request.log.error({ err, sessionCode: code, service: "spotify" }, "Unexpected pause error");
        throw err;
      }
    },
  );

  // ── POST /sessions/:code/playback/skip — Skip to next song (host only) ──
  app.post<{ Params: { code: string } }>(
    "/sessions/:code/playback/skip",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const { code } = request.params;
      const { redis, db, env } = app;
      const hostId = request.hostAuth!.hostId;

      try {
        const session = await getSession(redis, code);
        if (!session || session.status !== "active") {
          return reply.status(404).send({
            error: {
              code: "SESSION_NOT_FOUND",
              message: "Session not found or ended.",
              statusCode: 404,
            },
          });
        }

        if (session.hostId !== hostId) {
          return reply.status(403).send({
            error: {
              code: "NOT_HOST",
              message: "Only the host can control playback.",
              statusCode: 403,
            },
          });
        }

        const np = await skipTrack(redis, db, env, code, session);
        if (!np) {
          return reply.send({
            status: "queue_empty",
            nowPlaying: null,
          });
        }

        return reply.send({
          status: "skipped",
          nowPlaying: {
            spotifyTrackId: np.spotifyTrackId,
            title: np.title,
            artist: np.artist,
            albumArt: np.albumArt,
            startedAt: np.startedAt,
            durationMs: np.durationMs,
          },
        });
      } catch (err) {
        if (err instanceof PlaybackError) {
          request.log.warn(
            { err, code: err.code, sessionCode: code, service: "spotify" },
            `Playback error: ${err.message}`,
          );
          return reply.status(err.statusCode).send({
            error: {
              code: err.code,
              message: err.message,
              statusCode: err.statusCode,
            },
          });
        }
        request.log.error({ err, sessionCode: code, service: "spotify" }, "Unexpected skip error");
        throw err;
      }
    },
  );

  // ── GET /sessions/:code/playback — Get current playback state (anyone in session) ──
  app.get<{ Params: { code: string } }>(
    "/sessions/:code/playback",
    { preHandler: [requireSessionAccess] },
    async (request, reply) => {
      const { code } = request.params;
      const { redis } = app;

      const np = await getNowPlaying(redis, code);
      if (!np) {
        return reply.send({ nowPlaying: null });
      }

      // Calculate current progress for client
      let progressMs: number;
      if (np.isPaused) {
        progressMs = np.progressMs;
      } else {
        progressMs = Date.now() - new Date(np.startedAt).getTime();
      }

      return reply.send({
        nowPlaying: {
          spotifyTrackId: np.spotifyTrackId,
          title: np.title,
          artist: np.artist,
          albumArt: np.albumArt,
          startedAt: np.startedAt,
          durationMs: np.durationMs,
          isPaused: np.isPaused,
          progressMs: Math.min(progressMs, np.durationMs),
        },
      });
    },
  );
}
