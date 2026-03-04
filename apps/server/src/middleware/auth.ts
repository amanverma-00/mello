import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";

// Extend Fastify request to carry auth info
declare module "fastify" {
  interface FastifyRequest {
    hostAuth?: JwtPayload;
    participantToken?: string;
    sessionCode?: string;
  }
}

/** Middleware: require a valid host JWT */
export async function requireHost(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header.",
        statusCode: 401,
      },
    });
  }

  try {
    const token = auth.slice(7);
    request.hostAuth = await verifyToken(token);
  } catch {
    return reply.status(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token.",
        statusCode: 401,
      },
    });
  }
}

/** Register auth middleware as a Fastify plugin */
export async function authPlugin(app: FastifyInstance) {
  app.decorate("requireHost", requireHost);
}
