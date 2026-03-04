import pg from "pg";
import type { Env } from "../config/env.js";

const { Pool } = pg;

export function createPgPool(env: Env): pg.Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("Postgres pool error:", err.message);
  });

  return pool;
}
