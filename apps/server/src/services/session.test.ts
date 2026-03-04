/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import Redis from "ioredis-mock";
import {
  createSession,
  getSession,
  joinSession,
  getParticipant,
  getParticipants,
  getParticipantCount,
  endSession,
  validateSessionAccess,
  SessionError,
  keys,
} from "../services/session.js";

describe("keys helpers", () => {
  it("generates correct Redis key patterns", () => {
    expect(keys.session("ABC123")).toBe("session:ABC123");
    expect(keys.participants("ABC123")).toBe("session:ABC123:participants");
    expect(keys.queue("ABC123")).toBe("session:ABC123:queue");
    expect(keys.tracks("ABC123")).toBe("session:ABC123:tracks");
    expect(keys.votes("ABC123", "track_1")).toBe(
      "session:ABC123:votes:track_1",
    );
  });
});

describe("createSession", () => {
  let redis: InstanceType<typeof Redis>;

  beforeEach(() => {
    redis = new Redis();
  });

  it("creates a session and returns code + shareLink", async () => {
    const result = await createSession(
      redis as any,
      "host_123",
      "https://melo.app",
    );
    expect(result.code).toHaveLength(6);
    expect(result.shareLink).toContain("/join/");
    expect(result.shareLink).toContain(result.code);
  });

  it("stores session data in Redis", async () => {
    const { code } = await createSession(
      redis as any,
      "host_123",
      "https://melo.app",
    );
    const session = await getSession(redis as any, code);
    expect(session).not.toBeNull();
    expect(session!.hostId).toBe("host_123");
    expect(session!.status).toBe("active");
    expect(session!.createdAt).toBeTruthy();
  });

  it("generates only allowed characters in codes", async () => {
    const codes = [];
    for (let i = 0; i < 20; i++) {
      const { code } = await createSession(
        redis as any,
        `host_${i}`,
        "https://melo.app",
      );
      codes.push(code);
    }
    const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
    for (const code of codes) {
      expect(code).toMatch(validChars);
    }
  });
});

describe("joinSession", () => {
  let redis: InstanceType<typeof Redis>;
  let sessionCode: string;

  beforeEach(async () => {
    redis = new Redis();
    const { code } = await createSession(
      redis as any,
      "host_1",
      "https://melo.app",
    );
    sessionCode = code;
  });

  it("joins a session and returns a participant token", async () => {
    const { token, participant } = await joinSession(
      redis as any,
      sessionCode,
      "Alice",
      50,
    );
    expect(token).toMatch(/^p_/);
    expect(participant.displayName).toBe("Alice");
    expect(participant.joinedAt).toBeTruthy();
  });

  it("throws SESSION_NOT_FOUND for invalid code", async () => {
    await expect(
      joinSession(redis as any, "ZZZZZZ", "Alice", 50),
    ).rejects.toThrow(SessionError);

    try {
      await joinSession(redis as any, "ZZZZZZ", "Alice", 50);
    } catch (e) {
      expect((e as SessionError).code).toBe("SESSION_NOT_FOUND");
    }
  });

  it("throws SESSION_FULL when at capacity", async () => {
    // Join 2 participants with maxParticipants=2
    await joinSession(redis as any, sessionCode, "Alice", 2);
    await joinSession(redis as any, sessionCode, "Bob", 2);

    await expect(
      joinSession(redis as any, sessionCode, "Charlie", 2),
    ).rejects.toThrow(SessionError);

    try {
      await joinSession(redis as any, sessionCode, "Charlie", 2);
    } catch (e) {
      expect((e as SessionError).code).toBe("SESSION_FULL");
    }
  });
});

describe("getParticipant / getParticipants / getParticipantCount", () => {
  let redis: InstanceType<typeof Redis>;
  let sessionCode: string;

  beforeEach(async () => {
    redis = new Redis();
    const { code } = await createSession(
      redis as any,
      "host_1",
      "https://melo.app",
    );
    sessionCode = code;
  });

  it("retrieves a participant by token", async () => {
    const { token } = await joinSession(
      redis as any,
      sessionCode,
      "Alice",
      50,
    );
    const participant = await getParticipant(redis as any, sessionCode, token);
    expect(participant).not.toBeNull();
    expect(participant!.displayName).toBe("Alice");
  });

  it("returns null for unknown token", async () => {
    const participant = await getParticipant(
      redis as any,
      sessionCode,
      "p_fake",
    );
    expect(participant).toBeNull();
  });

  it("lists all participants", async () => {
    await joinSession(redis as any, sessionCode, "Alice", 50);
    await joinSession(redis as any, sessionCode, "Bob", 50);
    const all = await getParticipants(redis as any, sessionCode);
    expect(all.length).toBe(2);
    const names = all.map((p) => p.displayName).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("counts participants correctly", async () => {
    expect(await getParticipantCount(redis as any, sessionCode)).toBe(0);
    await joinSession(redis as any, sessionCode, "Alice", 50);
    expect(await getParticipantCount(redis as any, sessionCode)).toBe(1);
    await joinSession(redis as any, sessionCode, "Bob", 50);
    expect(await getParticipantCount(redis as any, sessionCode)).toBe(2);
  });
});

describe("endSession", () => {
  let redis: InstanceType<typeof Redis>;
  let sessionCode: string;

  beforeEach(async () => {
    redis = new Redis();
    const { code } = await createSession(
      redis as any,
      "host_1",
      "https://melo.app",
    );
    sessionCode = code;
  });

  it("sets session status to ended", async () => {
    await endSession(redis as any, sessionCode, "host_1");
    const session = await getSession(redis as any, sessionCode);
    expect(session!.status).toBe("ended");
  });

  it("throws SESSION_NOT_FOUND for invalid code", async () => {
    await expect(
      endSession(redis as any, "ZZZZZZ", "host_1"),
    ).rejects.toThrow(SessionError);
  });

  it("throws FORBIDDEN when non-host tries to end", async () => {
    try {
      await endSession(redis as any, sessionCode, "wrong_host");
    } catch (e) {
      expect((e as SessionError).code).toBe("FORBIDDEN");
    }
  });

  it("prevents joining after session is ended", async () => {
    await endSession(redis as any, sessionCode, "host_1");

    await expect(
      joinSession(redis as any, sessionCode, "Alice", 50),
    ).rejects.toThrow(SessionError);

    try {
      await joinSession(redis as any, sessionCode, "Alice", 50);
    } catch (e) {
      expect((e as SessionError).code).toBe("SESSION_ENDED");
    }
  });
});

describe("validateSessionAccess", () => {
  let redis: InstanceType<typeof Redis>;
  let sessionCode: string;
  let participantToken: string;

  beforeEach(async () => {
    redis = new Redis();
    const { code } = await createSession(
      redis as any,
      "host_1",
      "https://melo.app",
    );
    sessionCode = code;
    const { token } = await joinSession(redis as any, sessionCode, "Alice", 50);
    participantToken = token;
  });

  it("authorizes host by hostId", async () => {
    const result = await validateSessionAccess(
      redis as any,
      sessionCode,
      undefined,
      "host_1",
    );
    expect(result.role).toBe("host");
  });

  it("authorizes participant by token", async () => {
    const result = await validateSessionAccess(
      redis as any,
      sessionCode,
      participantToken,
    );
    expect(result.role).toBe("participant");
    expect(result.displayName).toBe("Alice");
  });

  it("rejects unknown participant token", async () => {
    await expect(
      validateSessionAccess(redis as any, sessionCode, "p_fake"),
    ).rejects.toThrow(SessionError);
  });

  it("rejects non-existent session", async () => {
    await expect(
      validateSessionAccess(redis as any, "ZZZZZZ", participantToken),
    ).rejects.toThrow(SessionError);
  });
});
