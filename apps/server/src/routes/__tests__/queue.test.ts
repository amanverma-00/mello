/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// vi.mock() is hoisted above imports — must use inline factories
vi.mock("../../lib/jwt.js", () => ({
  initJwt: vi.fn(),
  signAccessToken: vi.fn(async (payload: any) =>
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
  ),
  signRefreshToken: vi.fn(async (payload: any) =>
    `refresh_${Buffer.from(JSON.stringify(payload)).toString("base64url")}`,
  ),
  verifyToken: vi.fn(async (token: string) => {
    const raw = token.startsWith("refresh_") ? token.slice(8) : token;
    try {
      return JSON.parse(Buffer.from(raw, "base64url").toString());
    } catch {
      throw new Error("Invalid token");
    }
  }),
}));

vi.mock("../../lib/spotify.js", () => ({
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
}));

vi.mock("../../lib/socket.js", () => ({
  initSocketIO: vi.fn(),
  getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })),
  emitToSession: vi.fn(),
}));

vi.mock("spotify-web-api-node", () => ({
  default: class MockSpotifyWebApi {
    setAccessToken = vi.fn();
    searchTracks = vi.fn(async () => ({
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
    }));
    getTrack = vi.fn(async () => ({
      body: {
        id: "track_abc",
        name: "Test Song",
        artists: [{ name: "Test Artist" }],
        album: { images: [{ url: "https://img.test/cover.jpg" }] },
        duration_ms: 210000,
      },
    }));
  },
}));

import { buildTestApp, type TestContext } from "./test-app.js";

describe("Queue Routes — Integration", () => {
  let ctx: TestContext;
  let sessionCode: string;
  let participantToken: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.redis.flushall();

    // Create a session and a participant for each test
    const createRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { authorization: `Bearer ${ctx.hostToken}` },
    });
    sessionCode = createRes.json().code;

    const joinRes = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionCode}/join`,
      payload: { displayName: "TestParticipant" },
    });
    participantToken = joinRes.json().participantToken;
  });

  // ── GET /sessions/:code/search ────────────────────
  describe("GET /api/v1/sessions/:code/search", () => {
    it("returns search results from Spotify (mocked)", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/search?q=test`,
        headers: { "x-participant-token": participantToken },
      });

      expect(res.statusCode).toBe(200);
      const results = res.json();
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toMatchObject({
        spotifyTrackId: "track_abc",
        title: "Test Song",
        artist: "Test Artist",
      });
    });

    it("returns cached results on second request", async () => {
      // First request (populates cache)
      await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/search?q=cached_test`,
        headers: { "x-participant-token": participantToken },
      });

      // Second request (should hit cache)
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/search?q=cached_test`,
        headers: { "x-participant-token": participantToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()[0].spotifyTrackId).toBe("track_abc");
    });

    it("rejects missing query param", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/search`,
        headers: { "x-participant-token": participantToken },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects unauthenticated access", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/search?q=test`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /sessions/:code/queue ─────────────────────
  describe("POST /api/v1/sessions/:code/queue", () => {
    it("adds a song to the queue", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().message).toBe("Song added to queue.");
    });

    it("rejects duplicate tracks", async () => {
      // Add first
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      // Try adding again
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("rejects invalid body", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /sessions/:code/vote ──────────────────────
  describe("POST /api/v1/sessions/:code/vote", () => {
    it("toggles a vote on a queued track", async () => {
      // First add a song
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      // Vote for it
      const res = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/vote`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.voted).toBe("boolean");
      expect(typeof body.voteCount).toBe("number");
    });
  });

  // ── GET /sessions/:code/queue ──────────────────────
  describe("GET /api/v1/sessions/:code/queue", () => {
    it("returns an empty queue initially", async () => {
      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().queue).toEqual([]);
    });

    it("returns queued tracks with user votes", async () => {
      // Add a song
      await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
        payload: { spotifyTrackId: "track_abc" },
      });

      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${sessionCode}/queue`,
        headers: { "x-participant-token": participantToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.queue).toHaveLength(1);
      expect(body.queue[0].spotifyTrackId).toBe("track_abc");
      expect(Array.isArray(body.userVotes)).toBe(true);
    });
  });
});
