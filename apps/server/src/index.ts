import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Kysely } from "kysely";
import { loadEnv } from "./config/env.js";
import { createRedisClient } from "./lib/redis.js";
import { createDb, type Database } from "./db/index.js";
import { initJwt } from "./lib/jwt.js";
import { initSpotify } from "./lib/spotify.js";
import { initSocketIO } from "./lib/socket.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/sessions.js";
import { queueRoutes } from "./routes/queue.js";
import { playbackRoutes } from "./routes/playback.js";
import { startAutoAdvance, stopAutoAdvance } from "./services/playback.js";

// Extend Fastify types with our decorations
declare module "fastify" {
  interface FastifyInstance {
    env: ReturnType<typeof loadEnv>;
    redis: ReturnType<typeof createRedisClient>;
    db: Kysely<Database>;
  }
}

async function main() {
  // ── Load & validate env ──────────────────────────────
  const env = loadEnv();

  // ── Initialise auth libraries ────────────────────────
  await initJwt(env);
  initSpotify(env);

  // ── Create Fastify instance ──────────────────────────
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  });

  // ── Security headers ──────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
  });

  // ── CORS ─────────────────────────────────────────────
  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? env.APP_URL : true,
    credentials: true,
  });

  // ── Connect datastores ───────────────────────────────
  const redis = createRedisClient(env);
  const db = createDb(env);

  // Decorate Fastify with shared resources
  app.decorate("env", env);
  app.decorate("redis", redis);
  app.decorate("db", db);

  // ── Rate limiting (for vote endpoint) ────────────────
  await app.register(rateLimit, {
    global: false, // only apply to routes that opt in
  });

  // ── Register routes ──────────────────────────────────
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(sessionRoutes, { prefix: "/api/v1" });
  await app.register(queueRoutes, { prefix: "/api/v1" });
  await app.register(playbackRoutes, { prefix: "/api/v1" });

  // ── Health check ─────────────────────────────────────
  app.get("/api/v1/health", async (_request, _reply) => {
    // Quick connectivity checks
    const redisOk = await redis
      .ping()
      .then(() => true)
      .catch(() => false);
    const pgOk = await db
      .selectFrom("hosts")
      .select(db.fn.count("id").as("count"))
      .execute()
      .then(() => true)
      .catch(() => false);

    const healthy = redisOk && pgOk;

    return {
      status: healthy ? "ok" : "degraded",
      uptime: process.uptime(),
      redis: redisOk ? "connected" : "disconnected",
      postgres: pgOk ? "connected" : "disconnected",
    };
  });

  // ── Graceful shutdown ────────────────────────────────
  const shutdown = async () => {
    app.log.info("Shutting down...");
    stopAutoAdvance();
    await app.close();
    redis.disconnect();
    await db.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ── Start server ─────────────────────────────────────
  try {
    await redis.connect();
    app.log.info("Redis connected");

    // Kysely connects lazily — run a quick check
    await db.selectFrom("hosts").select("id").limit(1).execute();
    app.log.info("Postgres connected (Kysely)");

    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Server listening on http://localhost:${env.PORT}`);

    // ── Socket.IO ────────────────────────────────────
    initSocketIO(app.server, redis, env.APP_URL);
    app.log.info("Socket.IO initialised");

    // ── Auto-advance playback engine ─────────────────
    startAutoAdvance(redis, db, env);
    app.log.info("Auto-advance engine started");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
