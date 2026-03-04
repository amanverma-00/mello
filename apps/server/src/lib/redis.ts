import Redis from "ioredis";
import type { Env } from "../config/env.js";

export function createRedisClient(env: Env): Redis {
  const useTls = env.REDIS_URL.startsWith("rediss://");

  // ioredis doesn't natively handle rediss:// — convert to redis:// and pass tls option
  const url = useTls
    ? env.REDIS_URL.replace(/^rediss:\/\//, "redis://")
    : env.REDIS_URL;

  // Extract hostname for TLS SNI (required by Upstash and similar providers)
  const hostname = useTls ? new URL(env.REDIS_URL.replace(/^rediss/, "https")).hostname : undefined;

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    ...(useTls && { tls: { servername: hostname } }),
  });

  client.on("error", (err) => {
    console.error("Redis error:", err.message);
  });

  return client;
}
