import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type Redis from "ioredis";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketAuth,
} from "@melo/shared";
import {
  getSession,
  getParticipant,
  getParticipantCount,
} from "../services/session.js";
import { verifyToken } from "../lib/jwt.js";

export type MeloSocket = Parameters<
  Parameters<MeloIO["on"]>[1]
>[0];

export type MeloIO = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

let io: MeloIO;

export function getIO(): MeloIO {
  if (!io) throw new Error("Socket.IO not initialised");
  return io;
}

/**
 * Initialise Socket.IO on the given HTTP server.
 * Auth handshake validates session membership before allowing connection.
 */
export function initSocketIO(httpServer: HttpServer, redis: Redis, appUrl?: string): MeloIO {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: appUrl && process.env.NODE_ENV === "production" ? appUrl : true,
        credentials: true,
      },
      path: "/socket.io",
    },
  );

  // ── Auth middleware ────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const { sessionCode, token } = socket.handshake.auth as Partial<SocketAuth>;

      if (!sessionCode || !token) {
        return next(new Error("Missing sessionCode or token in handshake auth."));
      }

      // Verify session exists and is active
      const session = await getSession(redis, sessionCode);
      if (!session || session.status !== "active") {
        return next(new Error("Session not found or ended."));
      }

      // Try as host JWT
      if (token.startsWith("ey")) {
        try {
          const payload = await verifyToken(token);
          if (payload.hostId === session.hostId) {
            socket.data = {
              sessionCode,
              role: "host" as const,
              hostId: payload.hostId,
              displayName: "Host",
            };
            return next();
          }
        } catch {
          // Not a valid JWT — try as participant token
        }
      }

      // Try as participant token
      const participant = await getParticipant(redis, sessionCode, token);
      if (participant) {
        socket.data = {
          sessionCode,
          role: "participant" as const,
          participantToken: token,
          displayName: participant.displayName,
        };
        return next();
      }

      return next(new Error("Invalid token for this session."));
    } catch {
      return next(new Error("Authentication failed."));
    }
  });

  // ── Connection handler ────────────────────────────
  io.on("connection", async (socket) => {
    const { sessionCode, displayName, role } = socket.data as {
      sessionCode: string;
      displayName: string;
      role: "host" | "participant";
    };

    // Join the session room
    const room = `session:${sessionCode}`;
    await socket.join(room);

    // Broadcast participant joined
    const count = await getParticipantCount(redis, sessionCode);
    // +1 because host might not be in the participants hash
    socket.to(room).emit("participant:joined", {
      displayName,
      count,
    });

    console.log(
      `[Socket.IO] ${role} "${displayName}" joined room ${room} (${count} participants)`,
    );

    // Handle disconnect
    socket.on("disconnect", async () => {
      const currentCount = await getParticipantCount(redis, sessionCode);
      socket.to(room).emit("participant:left", {
        displayName,
        count: currentCount,
      });

      console.log(
        `[Socket.IO] ${role} "${displayName}" left room ${room} (${currentCount} participants)`,
      );
    });
  });

  return io;
}

/**
 * Emit an event to all sockets in a session room.
 */
export function emitToSession<E extends keyof ServerToClientEvents>(
  code: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  getIO().to(`session:${code}`).emit(event, ...args);
}
