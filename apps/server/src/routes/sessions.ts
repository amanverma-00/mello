import type { FastifyInstance } from "fastify";
import {
  createSession,
  getSession,
  joinSession,
  endSession,
  getParticipants,
  getParticipantCount,
  SessionError,
} from "../services/session.js";
import { requireHost } from "../middleware/auth.js";
import { requireSessionAccess } from "../middleware/session-auth.js";
import { emitToSession } from "../lib/socket.js";
import { joinSessionRequestSchema } from "@melo/shared";

export async function sessionRoutes(app: FastifyInstance) {
  const redis = app.redis;
  const env = app.env;

  // ── Error handler for SessionError ───────────────
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof SessionError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }
    throw error; // re-throw to parent error handler
  });

  // ── POST /sessions — Create a new session (host only) ──
  app.post(
    "/sessions",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const hostId = request.hostAuth!.hostId;
      const { code, shareLink } = await createSession(
        redis,
        hostId,
        env.APP_URL,
      );

      return reply.status(201).send({ code, shareLink });
    },
  );

  // ── POST /sessions/:code/join — Join a session ──
  app.post<{ Params: { code: string }; Body: { displayName: string } }>(
    "/sessions/:code/join",
    async (request, reply) => {
      const { code } = request.params;
      const parseResult = joinSessionRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid display name.",
            statusCode: 400,
          },
        });
      }

      const { displayName } = parseResult.data;

      const { token, participant } = await joinSession(
        redis,
        code,
        displayName,
        env.SESSION_MAX_PARTICIPANTS,
      );

      // Get current session state for the joining participant
      const session = await getSession(redis, code);
      const participantCount = await getParticipantCount(redis, code);

      // Broadcast join event (Socket.IO clients will get it)
      emitToSession(code, "participant:joined", {
        displayName: participant.displayName,
        count: participantCount,
      });

      return reply.status(200).send({
        participantToken: token,
        session: {
          code,
          currentTrack: session?.currentTrackId
            ? {
                spotifyTrackId: session.currentTrackId,
                title: "", // Will be hydrated from tracks hash in Phase 4+
                artist: "",
                albumArt: "",
                startedAt: session.currentTrackStartedAt ?? "",
                durationMs: 0,
              }
            : null,
          participantCount,
        },
      });
    },
  );

  // ── GET /sessions/:code — Get session state ──
  app.get<{ Params: { code: string } }>(
    "/sessions/:code",
    { preHandler: [requireSessionAccess] },
    async (request, reply) => {
      const { code } = request.params;

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

      const participants = await getParticipants(redis, code);

      return reply.send({
        code: session.code,
        hostId: session.hostId,
        status: session.status,
        createdAt: session.createdAt,
        currentTrack: session.currentTrackId
          ? {
              spotifyTrackId: session.currentTrackId,
              title: "",
              artist: "",
              albumArt: "",
              startedAt: session.currentTrackStartedAt ?? "",
              durationMs: 0,
            }
          : null,
        participantCount: participants.length,
        participants: participants.map((p) => ({
          displayName: p.displayName,
          joinedAt: p.joinedAt,
        })),
      });
    },
  );

  // ── DELETE /sessions/:code — End session (host only) ──
  app.delete<{ Params: { code: string } }>(
    "/sessions/:code",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const { code } = request.params;
      const hostId = request.hostAuth!.hostId;

      await endSession(redis, code, hostId);

      // Broadcast session ended to all connected clients
      emitToSession(code, "session:ended");

      return reply.status(200).send({ message: "Session ended." });
    },
  );
}
