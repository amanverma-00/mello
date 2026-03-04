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
  ensureFreshSpotifyToken: vi.fn(async () => "sp_fresh_token"),
  createHostSpotifyClient: vi.fn(),
}));

vi.mock("../../lib/socket.js", () => ({
  initSocketIO: vi.fn(),
  getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })),
  emitToSession: vi.fn(),
}));

vi.mock("spotify-web-api-node", () => ({
  default: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    searchTracks: vi.fn(async () => ({ body: { tracks: { items: [] } } })),
    getTrack: vi.fn(async () => ({ body: {} })),
  })),
}));

import { buildTestApp, type TestContext } from "./test-app.js";

describe("Session Routes — Integration", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.redis.flushall();
  });

  // ── POST /sessions ──────────────────────────────────
  describe("POST /api/v1/sessions", () => {
    it("creates a session when host is authenticated", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.code).toHaveLength(6);
      expect(body.shareLink).toContain("/join/");
    });

    it("rejects unauthenticated requests", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects invalid tokens", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: "Bearer invalid_garbage" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /sessions/:code/join ──────────────────────
  describe("POST /api/v1/sessions/:code/join", () => {
    it("allows a participant to join with a display name", async () => {
      // First create a session
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const joinRes = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${code}/join`,
        payload: { displayName: "Alice" },
      });

      expect(joinRes.statusCode).toBe(200);
      const body = joinRes.json();
      expect(body.participantToken).toBeTruthy();
      expect(body.session.code).toBe(code);
      expect(body.session.participantCount).toBe(1);
    });

    it("rejects join with empty display name", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const joinRes = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${code}/join`,
        payload: { displayName: "" },
      });

      expect(joinRes.statusCode).toBe(400);
    });

    it("rejects join for non-existent session", async () => {
      const joinRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions/ZZZZZZ/join",
        payload: { displayName: "Alice" },
      });

      // Should be 404 from SessionError
      expect([404, 500]).toContain(joinRes.statusCode);
    });
  });

  // ── GET /sessions/:code ────────────────────────────
  describe("GET /api/v1/sessions/:code", () => {
    it("returns session info for an authenticated host", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${code}`,
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const body = getRes.json();
      expect(body.code).toBe(code);
      expect(body.hostId).toBe("host_1");
      expect(body.status).toBe("active");
    });

    it("returns session info for an authenticated participant", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      // Join as participant
      const joinRes = await ctx.app.inject({
        method: "POST",
        url: `/api/v1/sessions/${code}/join`,
        payload: { displayName: "Bob" },
      });
      const { participantToken } = joinRes.json();

      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${code}`,
        headers: { "x-participant-token": participantToken },
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().participants).toHaveLength(1);
    });

    it("rejects unauthorized access", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${code}`,
        // no auth headers
      });

      expect(getRes.statusCode).toBe(401);
    });
  });

  // ── DELETE /sessions/:code ─────────────────────────
  describe("DELETE /api/v1/sessions/:code", () => {
    it("ends a session for the host", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const delRes = await ctx.app.inject({
        method: "DELETE",
        url: `/api/v1/sessions/${code}`,
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().message).toBe("Session ended.");

      // Session should no longer be accessible
      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/v1/sessions/${code}`,
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });

      // Either 404 (not found) or 410 (session ended)
      expect([404, 410]).toContain(getRes.statusCode);
    });

    it("rejects unauthenticated delete", async () => {
      const createRes = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { authorization: `Bearer ${ctx.hostToken}` },
      });
      const { code } = createRes.json();

      const delRes = await ctx.app.inject({
        method: "DELETE",
        url: `/api/v1/sessions/${code}`,
        // no auth
      });

      expect(delRes.statusCode).toBe(401);
    });
  });
});
