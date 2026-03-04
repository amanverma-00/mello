import SpotifyWebApi from "spotify-web-api-node";
import type { Env } from "../config/env.js";
import type { Kysely } from "kysely";
import type { Database } from "../db/index.js";

let spotifyTemplate: SpotifyWebApi;

export function initSpotify(env: Env) {
  spotifyTemplate = new SpotifyWebApi({
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
  });
}

/** Get scopes required for Melo */
export function getScopes(): string[] {
  return [
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ];
}

/** Generate the Spotify authorization URL */
export function getAuthUrl(state: string): string {
  return spotifyTemplate.createAuthorizeURL(getScopes(), state);
}

/** Exchange authorization code for tokens */
export async function exchangeCode(code: string) {
  const resp = await spotifyTemplate.authorizationCodeGrant(code);
  return {
    accessToken: resp.body.access_token,
    refreshToken: resp.body.refresh_token,
    expiresIn: resp.body.expires_in,
  };
}

/** Get Spotify user profile using an access token */
export async function getSpotifyProfile(accessToken: string) {
  const api = new SpotifyWebApi();
  api.setAccessToken(accessToken);
  const me = await api.getMe();
  return {
    spotifyUserId: me.body.id,
    displayName: me.body.display_name ?? me.body.id,
    email: me.body.email,
  };
}

/** Create a SpotifyWebApi instance with a host's tokens */
export function createHostSpotifyClient(
  accessToken: string,
  refreshToken: string,
  env: Env,
): SpotifyWebApi {
  return new SpotifyWebApi({
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
    accessToken,
    refreshToken,
  });
}

/** Refresh a host's Spotify token if expired, persisting to DB */
export async function ensureFreshSpotifyToken(
  hostId: string,
  db: Kysely<Database>,
  env: Env,
): Promise<string> {
  const row = await db
    .selectFrom("spotify_tokens")
    .selectAll()
    .where("host_id", "=", hostId)
    .executeTakeFirstOrThrow();

  // Return current token if still valid (with 60s buffer)
  const expiresAt = new Date(row.token_expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return row.access_token;
  }

  // Refresh the token
  const client = createHostSpotifyClient(
    row.access_token,
    row.refresh_token,
    env,
  );
  let resp;
  try {
    resp = await client.refreshAccessToken();
  } catch (err: unknown) {
    // If refresh token is revoked/invalid, clean up and throw a clear error
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 400 || status === 401) {
      await db
        .deleteFrom("spotify_tokens")
        .where("host_id", "=", hostId)
        .execute();
      throw new Error("Spotify refresh token revoked. Please re-authenticate.");
    }
    throw err;
  }
  const newAccessToken = resp.body.access_token;
  const newExpiresAt = new Date(Date.now() + resp.body.expires_in * 1000);

  await db
    .updateTable("spotify_tokens")
    .set({
      access_token: newAccessToken,
      token_expires_at: newExpiresAt,
      updated_at: new Date(),
    })
    .where("host_id", "=", hostId)
    .execute();

  return newAccessToken;
}
