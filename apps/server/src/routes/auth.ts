import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import {
  getAuthUrl,
  exchangeCode,
  getSpotifyProfile,
} from "../lib/spotify.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../lib/jwt.js";
import { requireHost } from "../middleware/auth.js";

export async function authRoutes(app: FastifyInstance) {
  const db = app.db;

  // ── GET /auth/spotify/url — Returns the Spotify OAuth URL ──
  app.get("/auth/spotify/url", async (_request, reply) => {
    const state = randomBytes(16).toString("hex");
    const url = getAuthUrl(state);
    return reply.send({ url, state });
  });

  // ── POST /auth/spotify/callback — Exchange code for tokens ──
  app.post<{ Body: { code: string } }>(
    "/auth/spotify/callback",
    async (request, reply) => {
      const { code } = request.body;

      if (!code) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Missing authorization code.",
            statusCode: 400,
          },
        });
      }

      // Exchange code with Spotify
      let tokens;
      try {
        tokens = await exchangeCode(code);
      } catch (err) {
        app.log.error({ err }, "Spotify code exchange failed");
        return reply.status(502).send({
          error: {
            code: "SPOTIFY_ERROR",
            message: "Failed to exchange authorization code with Spotify.",
            statusCode: 502,
          },
        });
      }

      // Get Spotify user profile
      let profile;
      try {
        profile = await getSpotifyProfile(tokens.accessToken);
      } catch (err) {
        app.log.error({ err }, "Spotify profile fetch failed");
        return reply.status(502).send({
          error: {
            code: "SPOTIFY_ERROR",
            message: "Failed to fetch Spotify profile.",
            statusCode: 502,
          },
        });
      }

      // Upsert host in database
      const existingHost = await db
        .selectFrom("hosts")
        .selectAll()
        .where("email", "=", profile.email)
        .executeTakeFirst();

      let hostId: string;

      if (existingHost) {
        hostId = existingHost.id;
        await db
          .updateTable("hosts")
          .set({
            display_name: profile.displayName,
            updated_at: new Date(),
          })
          .where("id", "=", hostId)
          .execute();
      } else {
        const inserted = await db
          .insertInto("hosts")
          .values({
            email: profile.email,
            display_name: profile.displayName,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        hostId = inserted.id;
      }

      // Upsert Spotify tokens
      const tokenExpiresAt = new Date(
        Date.now() + tokens.expiresIn * 1000,
      );

      const existingToken = await db
        .selectFrom("spotify_tokens")
        .selectAll()
        .where("host_id", "=", hostId)
        .executeTakeFirst();

      if (existingToken) {
        await db
          .updateTable("spotify_tokens")
          .set({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokenExpiresAt,
            spotify_user_id: profile.spotifyUserId,
            updated_at: new Date(),
          })
          .where("host_id", "=", hostId)
          .execute();
      } else {
        await db
          .insertInto("spotify_tokens")
          .values({
            host_id: hostId,
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokenExpiresAt,
            spotify_user_id: profile.spotifyUserId,
          })
          .execute();
      }

      // Issue Melo JWTs
      const payload = { hostId, role: "host" as const };
      const accessToken = await signAccessToken(payload);
      const refreshToken = await signRefreshToken(payload);

      // Set refresh token as HttpOnly cookie
      const isProduction = app.env.NODE_ENV === "production";
      const securePart = isProduction ? "; Secure" : "";
      reply.header("Set-Cookie", [
        `melo_refresh=${refreshToken}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax${securePart}`,
      ]);

      return reply.send({
        accessToken,
        host: {
          id: hostId,
          email: profile.email,
          displayName: profile.displayName,
        },
      });
    },
  );

  // ── POST /auth/refresh — Rotate access token ──
  app.post("/auth/refresh", async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie ?? "");
    const refreshToken = cookies["melo_refresh"];

    if (!refreshToken) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "No refresh token provided.",
          statusCode: 401,
        },
      });
    }

    try {
      const payload = await verifyToken(refreshToken);
      const accessToken = await signAccessToken(payload);
      return reply.send({ accessToken });
    } catch {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired refresh token.",
          statusCode: 401,
        },
      });
    }
  });

  // ── GET /auth/me — Return host profile ──
  app.get(
    "/auth/me",
    { preHandler: [requireHost] },
    async (request, reply) => {
      const hostId = request.hostAuth!.hostId;

      const host = await db
        .selectFrom("hosts")
        .selectAll()
        .where("id", "=", hostId)
        .executeTakeFirst();

      if (!host) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Host not found.",
            statusCode: 404,
          },
        });
      }

      return reply.send({
        id: host.id,
        email: host.email,
        displayName: host.display_name,
      });
    },
  );
}

// Simple cookie parser
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.split("=");
    if (key) {
      cookies[key.trim()] = rest.join("=").trim();
    }
  }
  return cookies;
}
