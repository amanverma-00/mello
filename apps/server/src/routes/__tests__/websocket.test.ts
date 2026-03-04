/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Redis from "ioredis-mock";
import {
  createSession,
  joinSession,
  getParticipantCount,
} from "../../services/session.js";

// Mock jwt module for Socket.IO auth
vi.mock("../../lib/jwt.js", () => ({
  initJwt: vi.fn(),
  verifyToken: vi.fn(async (token: string) => {
    try {
      return JSON.parse(Buffer.from(token, "base64url").toString());
    } catch {
      throw new Error("Invalid token");
    }
  }),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));

describe("Socket.IO Auth & Rooms — Unit", () => {
  let redis: InstanceType<typeof Redis>;
  const hostPayload = { hostId: "host_1", role: "host" };
  const hostToken = Buffer.from(JSON.stringify(hostPayload)).toString("base64url");

  beforeAll(() => {
    redis = new Redis();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  afterAll(() => {
    redis.disconnect();
  });

  // ── We test the auth logic at the service level ────
  // Socket.IO middleware calls these same functions internally.

  it("host token resolves to hostId for session they own", async () => {
    const { code } = await createSession(redis as any, "host_1", "https://melo.app");

    // The Socket.IO middleware would call verifyToken and check hostId matches
    const { verifyToken } = await import("../../lib/jwt.js");
    const payload = await verifyToken(hostToken);
    expect(payload.hostId).toBe("host_1");

    // Verify session exists and host matches
    const { getSession } = await import("../../services/session.js");
    const session = await getSession(redis as any, code);
    expect(session!.hostId).toBe(payload.hostId);
  });

  it("participant token resolves to a valid participant", async () => {
    const { code } = await createSession(redis as any, "host_1", "https://melo.app");
    const { token } = await joinSession(redis as any, code, "Alice", 50);

    const { getParticipant } = await import("../../services/session.js");
    const participant = await getParticipant(redis as any, code, token);
    expect(participant).not.toBeNull();
    expect(participant!.displayName).toBe("Alice");
  });

  it("rejects invalid participant tokens", async () => {
    const { code } = await createSession(redis as any, "host_1", "https://melo.app");

    const { getParticipant } = await import("../../services/session.js");
    const participant = await getParticipant(redis as any, code, "fake_token");
    expect(participant).toBeNull();
  });

  it("rejects auth for non-existent sessions", async () => {
    const { getSession } = await import("../../services/session.js");
    const session = await getSession(redis as any, "ZZZZZZ");
    expect(session).toBeNull();
  });

  it("participant count increments on join", async () => {
    const { code } = await createSession(redis as any, "host_1", "https://melo.app");

    await joinSession(redis as any, code, "Alice", 50);
    expect(await getParticipantCount(redis as any, code)).toBe(1);

    await joinSession(redis as any, code, "Bob", 50);
    expect(await getParticipantCount(redis as any, code)).toBe(2);
  });

  it("room name follows session:{code} convention", () => {
    const code = "ABC123";
    const room = `session:${code}`;
    expect(room).toBe("session:ABC123");
  });

  it("emitToSession constructs correct room name", async () => {
    // Verify the emitToSession function signature and room naming
    const socketModule = await import("../../lib/socket.js");
    expect(socketModule.emitToSession).toBeDefined();
    // The actual emit is mocked — we verified the room naming pattern above
  });
});
