import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from server root, then from monorepo root as fallback
config({ path: resolve(import.meta.dirname ?? ".", "../../.env") });
config({ path: resolve(import.meta.dirname ?? ".", "../../../../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Postgres
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().startsWith("redis"),

  // Spotify
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z.string().url(),

  // JWT
  JWT_PRIVATE_KEY_PATH: z.string().min(1).default("./keys/private.pem"),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).default("./keys/public.pem"),

  // App
  APP_URL: z.string().url(),
  SESSION_MAX_PARTICIPANTS: z.coerce.number().default(50),
  SESSION_TTL_HOURS: z.coerce.number().default(6),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "❌ Invalid environment variables:",
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  return result.data;
}
