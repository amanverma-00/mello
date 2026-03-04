import type { FastifyRequest, FastifyReply } from "fastify";
import { getSession, getParticipant } from "../services/session.js";
import { verifyToken } from "../lib/jwt.js";

// Extend Fastify request with session-scoped auth info
declare module "fastify" {
  interface FastifyRequest {
    sessionRole?: "host" | "participant";
    participantDisplayName?: string;
  }
}

/**
 * Middleware that validates access to a session.
 * Accepts EITHER:
 *   - A valid host JWT (Bearer token) where the host owns the session
 *   - A participant token in the `x-participant-token` header
 *
 * Sets `request.sessionRole` and `request.participantToken` / `request.hostAuth`.
 */
export async function requireSessionAccess(
  request: FastifyRequest<{ Params: { code: string } }>,
  reply: FastifyReply,
) {
  const { code } = request.params;
  const redis = request.server.redis;

  // Check session exists
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

  if (session.status !== "active") {
    return reply.status(410).send({
      error: {
        code: "SESSION_ENDED",
        message: "This session has ended.",
        statusCode: 410,
      },
    });
  }

  request.sessionCode = code;

  // Try host JWT first
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = await verifyToken(auth.slice(7));
      if (payload.hostId === session.hostId) {
        request.hostAuth = payload;
        request.sessionRole = "host";
        request.participantDisplayName = "Host";
        return; // authorized
      }
    } catch {
      // JWT invalid — fall through to check participant token
    }
  }

  // Try participant token
  const participantToken = request.headers["x-participant-token"] as
    | string
    | undefined;
  if (participantToken) {
    const participant = await getParticipant(redis, code, participantToken);
    if (participant) {
      request.participantToken = participantToken;
      request.sessionRole = "participant";
      request.participantDisplayName = participant.displayName;
      return; // authorized
    }
  }

  return reply.status(401).send({
    error: {
      code: "UNAUTHORIZED",
      message: "Not a member of this session.",
      statusCode: 401,
    },
  });
}
