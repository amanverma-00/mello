/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Builds a Fastify app instance suitable for integration testing.
 * - Uses ioredis-mock for Redis
 * - Provides a fake Kysely DB
 *
 * IMPORTANT: Each test file that imports this MUST place the vi.mock()
 * calls in its own top-level scope so vitest can hoist them properly.
 * Call `setupMocks()` from vi.mock factories for convenience.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Redis from "ioredis-mock";
import { vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../db/index.js";

// ── Build test app ───────────────────────────────────
export interface TestContext {
  app: ReturnType<typeof Fastify>;
  redis: InstanceType<typeof Redis>;
  hostToken: string; // pre-made token for host_1
}

/** Encode a payload as a base64url token (used by the JWT mock). */
export function encodeToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** Decode a base64url token back to an object (used by the JWT mock). */
export function decodeToken(token: string): Record<string, unknown> {
  const raw = token.startsWith("refresh_") ? token.slice(8) : token;
  return JSON.parse(Buffer.from(raw, "base64url").toString());
}

/** Mock factory for ../../lib/jwt.js — use inside vi.mock() */
export function createJwtMock(): Record<string, unknown> {
  return {
    initJwt: vi.fn(),
    signAccessToken: vi.fn(async (payload: any) => encodeToken(payload)),
    signRefreshToken: vi.fn(async (payload: any) => `refresh_${encodeToken(payload)}`),
    verifyToken: vi.fn(async (token: string) => {
      try {
        return decodeToken(token);
      } catch {
        throw new Error("Invalid token");
      }
    }),
  };
}

/** Mock factory for ../../lib/spotify.js */
export function createSpotifyMock(): Record<string, unknown> {
  return {
    initSpotify: vi.fn(),
    getAuthUrl: vi.fn(() => "https://accounts.spotify.com/authorize?mock=1"),
    exchangeCode: vi.fn(async () => ({
      accessToken: "sp_access_123",
      refreshToken: "sp_refresh_123",
      expiresIn: 3600,
    })),
    getSpotifyProfile: vi.fn(async () => ({
      email: "test@example.com",
      displayName: "Test User",
      spotifyUserId: "spotify_user_1",
    })),
    ensureFreshSpotifyToken: vi.fn(async () => "sp_fresh_token"),
    createHostSpotifyClient: vi.fn(),
  };
}

/** Mock factory for ../../lib/socket.js */
export function createSocketMock(): Record<string, unknown> {
  return {
    initSocketIO: vi.fn(),
    getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })),
    emitToSession: vi.fn(),
  };
}

/** Mock factory for spotify-web-api-node */
export function createSpotifyApiMock(): Record<string, unknown> {
  return {
    default: vi.fn().mockImplementation(() => ({
      setAccessToken: vi.fn(),
      searchTracks: vi.fn(async () => ({
        body: {
          tracks: {
            items: [
              {
                id: "track_abc",
                name: "Test Song",
                artists: [{ name: "Test Artist" }],
                album: { images: [{ url: "https://img.test/cover.jpg" }] },
                duration_ms: 210000,
              },
            ],
          },
        },
      })),
      getTrack: vi.fn(async () => ({
        body: {
          id: "track_abc",
          name: "Test Song",
          artists: [{ name: "Test Artist" }],
          album: { images: [{ url: "https://img.test/cover.jpg" }] },
          duration_ms: 210000,
        },
      })),
    })),
  };
}

export async function buildTestApp(): Promise<TestContext> {
  const redis = new Redis();
  const hostPayload = { hostId: "host_1", role: "host" };
  const hostToken = encodeToken(hostPayload);

  // Build a minimal fake DB (only used by auth and playback; sessions use Redis)
  const fakeDb = {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(async () => ({
      id: "host_1",
      email: "test@example.com",
      display_name: "Test User",
    })),
    execute: vi.fn(async () => []),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    executeTakeFirstOrThrow: vi.fn(async () => ({ id: "host_1" })),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    fn: {
      count: vi.fn(() => ({ as: vi.fn(() => "count") })),
    },
    destroy: vi.fn(),
  } as unknown as Kysely<Database>;

  const fakeEnv = {
    PORT: 0,
    NODE_ENV: "test" as const,
    DATABASE_URL: "postgresql://test:test@localhost/test",
    REDIS_URL: "redis://localhost:6379",
    SPOTIFY_CLIENT_ID: "test_client_id",
    SPOTIFY_CLIENT_SECRET: "test_client_secret",
    SPOTIFY_REDIRECT_URI: "http://localhost:5173/callback",
    JWT_PRIVATE_KEY_PATH: "./keys/private.pem",
    JWT_PUBLIC_KEY_PATH: "./keys/public.pem",
    APP_URL: "http://localhost:5173",
    SESSION_MAX_PARTICIPANTS: 50,
    SESSION_TTL_HOURS: 6,
  };

  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { global: false });

  app.decorate("env", fakeEnv);
  app.decorate("redis", redis as any);
  app.decorate("db", fakeDb);

  // Lazy-import routes after mocks are active
  const { authRoutes } = await import("../auth.js");
  const { sessionRoutes } = await import("../sessions.js");
  const { queueRoutes } = await import("../queue.js");
  const { playbackRoutes } = await import("../playback.js");

  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(sessionRoutes, { prefix: "/api/v1" });
  await app.register(queueRoutes, { prefix: "/api/v1" });
  await app.register(playbackRoutes, { prefix: "/api/v1" });

  await app.ready();

  return { app, redis, hostToken };
}
