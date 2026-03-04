/**
 * Melo Load Test — k6 script
 *
 * Simulates 50 concurrent sessions × 20 participants.
 * Each participant: joins session, searches 3 songs, adds 2, votes 5 times.
 *
 * Prerequisites:
 *   1. Running Melo server with Docker Compose
 *   2. k6 installed: https://k6.io/docs/get-started/installation/
 *   3. A pre-created session code set via env:  SESSION_CODE
 *      Or use the setup() function to create one via host token.
 *
 * Run:
 *   k6 run --env BASE_URL=http://localhost:3001 --env SESSION_CODE=ABC123 load-test.js
 *
 * Targets (from ROADMAP):
 *   - p95 API latency < 100ms
 *   - Zero dropped WebSocket events
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Trend } from "k6/metrics";
import ws from "k6/ws";

// ── Custom metrics ─────────────────────────────────────
const searchLatency = new Trend("search_latency", true);
const addToQueueLatency = new Trend("add_queue_latency", true);
const voteLatency = new Trend("vote_latency", true);
const wsMessages = new Counter("ws_messages_received");

// ── Options ────────────────────────────────────────────
export const options = {
  scenarios: {
    participants: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 }, // ramp up
        { duration: "2m", target: 200 }, // sustained (50 sessions × ~4 participants/session)
        { duration: "30s", target: 1000 }, // spike to 50×20
        { duration: "1m", target: 1000 }, // hold at peak
        { duration: "30s", target: 0 }, // ramp down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<100"], // 95th percentile < 100ms
    search_latency: ["p(95)<200"], // search can be slower (Spotify proxy)
    add_queue_latency: ["p(95)<100"],
    vote_latency: ["p(95)<50"],
    http_req_failed: ["rate<0.01"], // < 1% error rate
  },
};

// ── Helpers ────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const SESSION_CODE = __ENV.SESSION_CODE || "LOADTX";
const API = `${BASE_URL}/api/v1`;

function joinSession(code, vuId) {
  const res = http.post(
    `${API}/sessions/${code}/join`,
    JSON.stringify({ displayName: `LoadUser_${vuId}_${Date.now()}` }),
    { headers: { "Content-Type": "application/json" } },
  );

  check(res, {
    "join: status 200": (r) => r.status === 200,
    "join: has token": (r) => {
      try {
        return JSON.parse(r.body).token !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (res.status !== 200) return null;

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

function searchTracks(code, token, query) {
  const start = Date.now();
  const res = http.get(`${API}/sessions/${code}/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  searchLatency.add(Date.now() - start);

  check(res, {
    "search: status 200": (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return [];
  }
}

function addSong(code, token, spotifyTrackId) {
  const start = Date.now();
  const res = http.post(
    `${API}/sessions/${code}/queue`,
    JSON.stringify({ spotifyTrackId }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  addToQueueLatency.add(Date.now() - start);

  check(res, {
    "add: status 201 or 409": (r) => r.status === 201 || r.status === 409,
  });

  return res.status;
}

function vote(code, token, spotifyTrackId) {
  const start = Date.now();
  const res = http.post(
    `${API}/sessions/${code}/queue/${spotifyTrackId}/vote`,
    null,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  voteLatency.add(Date.now() - start);

  check(res, {
    "vote: status 200": (r) => r.status === 200,
  });
}

function getQueue(code, token) {
  const res = http.get(`${API}/sessions/${code}/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(res, {
    "queue: status 200": (r) => r.status === 200,
  });
}

// ── Main VU scenario ───────────────────────────────────
export default function () {
  const vuId = __VU;

  group("Join Session", () => {
    const joinData = joinSession(SESSION_CODE, vuId);
    if (!joinData) {
      console.warn(`VU ${vuId}: Failed to join session`);
      sleep(1);
      return;
    }

    const token = joinData.token;

    group("Search Songs", () => {
      const queries = ["party", "dance", "summer"];
      for (const q of queries) {
        searchTracks(SESSION_CODE, token, q);
        sleep(0.3); // Simulate 300ms debounce
      }
    });

    group("Add Songs", () => {
      // Use VU-unique track IDs to avoid all duplicating
      const tracks = [
        `loadtest_track_${vuId}_1`,
        `loadtest_track_${vuId}_2`,
      ];
      for (const trackId of tracks) {
        addSong(SESSION_CODE, token, trackId);
        sleep(0.5);
      }
    });

    group("Vote", () => {
      // Vote on some tracks (may or may not exist)
      for (let i = 0; i < 5; i++) {
        const targetVu = Math.floor(Math.random() * Math.max(vuId, 10)) + 1;
        vote(SESSION_CODE, token, `loadtest_track_${targetVu}_1`);
        sleep(0.2);
      }
    });

    group("Get Queue", () => {
      getQueue(SESSION_CODE, token);
    });

    // WebSocket connection test
    group("WebSocket", () => {
      const wsUrl = BASE_URL.replace("http", "ws");
      const url = `${wsUrl}/socket.io/?EIO=4&transport=websocket&sessionCode=${SESSION_CODE}&token=${token}`;

      const res = ws.connect(url, {}, function (socket) {
        socket.on("message", () => {
          wsMessages.add(1);
        });

        socket.on("open", () => {
          // Stay connected for a few seconds to receive broadcasts
          sleep(2);
          socket.close();
        });

        socket.on("error", (e) => {
          console.warn(`VU ${vuId}: WS error: ${e}`);
        });

        socket.setTimeout(() => {
          socket.close();
        }, 5000);
      });

      check(res, {
        "ws: connected": (r) => r && r.status === 101,
      });
    });
  });

  sleep(1); // Think time between iterations
}
