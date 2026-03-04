# Implementation Roadmap — Melo

**Version:** 1.0 (MVP)
**Date:** March 4, 2026
**Reference:** [PRD.md](PRD.md) | [TRD.md](TRD.md)
**Estimated total effort:** 6 weeks (1 developer) / 3.5 weeks (2 developers)

---

## Overview

The roadmap is split into **7 sequential phases**. Each phase produces a working, testable increment. No phase depends on future work — if you stop after any phase, what's built so far still functions.

```
Week 1          Week 2          Week 3          Week 4          Week 5          Week 6
┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│ Phase 1   │   │ Phase 2   │   │ Phase 3   │   │ Phase 4   │   │ Phase 5   │   │ Phase 6   │
│ Project   │──▶│ Auth &    │──▶│ Sessions  │──▶│ Queue &   │──▶│ Spotify   │──▶│ Frontend  │
│ Bootstrap │   │ Host      │   │ & Real-   │   │ Voting    │   │ Playback  │   │ Polish &  │
│           │   │ Identity  │   │ time Core │   │ Engine    │   │ Engine    │   │ PWA       │
└───────────┘   └───────────┘   └───────────┘   └───────────┘   └───────────┘   └───────────┘
                                                                                      │
                                                                                      ▼
                                                                                ┌───────────┐
                                                                                │ Phase 7   │
                                                                                │ Testing & │
                                                                                │ Deploy    │
                                                                                └───────────┘
```

---

## Phase 1 — Project Bootstrap & Dev Environment

**Duration:** 3 days
**Goal:** Every developer can clone the repo, run one command, and have the full stack running locally.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 1.1 | Initialize monorepo | `pnpm init`, create `apps/server`, `apps/web`, `packages/shared` workspaces. Add `turbo.json`. | Working `pnpm install` + `pnpm dev` from root |
| 1.2 | Server scaffold | Fastify + TypeScript. Health-check route `GET /api/v1/health` returns `{ status: "ok" }`. | Server starts on port 3001 |
| 1.3 | Web scaffold | Vite + React + TypeScript. Single page rendering "Melo" placeholder text. | Dev server on port 5173 |
| 1.4 | Shared package | Export placeholder Zod schemas and TS types. Confirm both `apps/server` and `apps/web` can import from `@melo/shared`. | Cross-workspace import works |
| 1.5 | Docker Compose | `docker-compose.yml` with Redis 7 and Postgres 16. Server connects to both on startup. | `docker compose up` provisions both datastores |
| 1.6 | Environment config | `.env.example` with all variables from TRD §10. Server validates env on boot with Zod (fail-fast). | Server refuses to start with missing vars |
| 1.7 | CI foundation | GitHub Actions: lint (`eslint`) + type-check (`tsc --noEmit`) on every push. | Green pipeline on initial commit |

### Exit Criteria
- `pnpm dev` starts server + web + Redis + Postgres with zero manual steps.
- Health-check returns 200.
- CI passes.

---

## Phase 2 — Host Authentication & Identity

**Duration:** 4 days
**Goal:** A host can sign in via Spotify and receive a Melo JWT. Spotify tokens are persisted.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 2.1 | Postgres migrations | Create `hosts` and `spotify_tokens` tables (TRD §4.1). Use Kysely's migration system. | Tables exist after `pnpm migrate` |
| 2.2 | Spotify OAuth route | `POST /api/v1/auth/spotify` — receives auth code + PKCE verifier, exchanges with Spotify, upserts host + tokens in Postgres. | Returns Melo JWT + sets HttpOnly refresh cookie |
| 2.3 | JWT issuance | RS256 key pair generation script. `jose` signs access token (15 min) and refresh token (7 days). | Tokens decode correctly in jwt.io |
| 2.4 | Token refresh route | `POST /api/v1/auth/refresh` — validates refresh cookie, rotates access token. | New access token returned |
| 2.5 | Auth middleware | Fastify plugin that extracts `Authorization: Bearer` header, verifies JWT, attaches `hostId` to request. | Protected routes return 401 without valid JWT |
| 2.6 | `GET /auth/me` | Returns host profile (display name, email from Spotify). | Host identity confirmed |
| 2.7 | Spotify token refresh helper | Service that refreshes Spotify access token using stored refresh token when expired, updates Postgres. | Spotify calls never fail due to expired token |
| 2.8 | Frontend: login page | "Continue with Spotify" button → opens OAuth consent → callback → stores JWT in memory, refresh in cookie. | Host lands on authenticated home screen |

### Exit Criteria
- End-to-end: click "Continue with Spotify" → redirected → JWT stored → `GET /auth/me` returns profile.
- Expired Spotify token auto-refreshes.

---

## Phase 3 — Session Lifecycle & Real-time Foundation

**Duration:** 5 days
**Goal:** A host can create a session, participants can join via code, and all members receive real-time events.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 3.1 | Session service | `createSession(hostId)`: generates 6-char code via `nanoid`, writes session hash to Redis with 6h TTL, returns code + share link. | `POST /sessions` returns `{code, shareLink}` |
| 3.2 | Session code collision handling | Check Redis for existing key before committing. Retry with new code (max 3 attempts). | No duplicate codes |
| 3.3 | Join session route | `POST /sessions/:code/join` — validates session exists + not full (50 cap), generates participant token, stores in Redis `participants` hash. Returns token + current session state. | Participant receives token + session snapshot |
| 3.4 | Participant auth middleware | Fastify plugin that validates participant token against Redis for the given session code. Works alongside host JWT middleware (either passes). | Non-session members get 401 |
| 3.5 | Socket.IO setup | Integrate Socket.IO with Fastify server. Auth handshake validates `{sessionCode, token}`. On connect, join socket to room `session:{code}`. | Client connects, server logs room join |
| 3.6 | Participant join/leave broadcast | On WebSocket connect → emit `participant:joined` to room. On disconnect → emit `participant:left`. Include live participant count. | All connected clients see join/leave |
| 3.7 | End session | `DELETE /sessions/:code` (host only) — sets status to "ended", emits `session:ended` to room, deletes all Redis keys for session. | All participants see "Session ended" |
| 3.8 | `GET /sessions/:code` | Returns full session state (metadata, participants, current track, queue). Used for initial load and reconnect recovery. | Complete snapshot returned |
| 3.9 | Frontend: create session screen | Host taps "Start Session" → calls API → displays session code + share link + copy button + Web Share API. | Code visible, share works |
| 3.10 | Frontend: join screen | Landing page with code input field. Deep link (`/join/:code`) pre-fills. Display name input → calls join API → connects WebSocket → navigates to session view. | Participant enters session room |
| 3.11 | Frontend: session ended screen | Listens for `session:ended` event → renders "Session ended" overlay with "Start your own" CTA. | Clean exit experience |

### Exit Criteria
- Host creates session → participant joins via code → both see real-time participant count → host ends session → participant sees ended screen.
- Reconnect after brief disconnect works (same token, re-join room).

---

## Phase 4 — Queue & Voting Engine

**Duration:** 5 days
**Goal:** Participants add songs, upvote them, and the queue re-ranks in real time. This is the core product loop.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 4.1 | Spotify search proxy | `GET /sessions/:code/search?q=` — uses host's Spotify token to search. Returns top 10 results `{spotifyTrackId, title, artist, albumArt, durationMs}`. Cache results in Redis for 60s. | Search returns Spotify tracks |
| 4.2 | Add song to queue | `POST /sessions/:code/queue` — receives `{spotifyTrackId}`. Checks for duplicate via `ZSCORE`. If exists, return 409 with existing entry. Otherwise: store track metadata in `session:{code}:tracks`, add to sorted set with initial score (1 vote × 1M + time component), create vote set with adder's token. Emit `queue:updated` to room. | Song appears in queue for all participants |
| 4.3 | Queue score calculation | Implement score formula: `(voteCount * 1_000_000) + (MAX_TIMESTAMP - addedAtEpochMs)`. Extract into a pure utility function with unit tests. | Score function tested for edge cases |
| 4.4 | Vote toggle | `POST /sessions/:code/vote` — receives `{spotifyTrackId}`. Check `SISMEMBER` on vote set. If already voted → `SREM` + decrement score. If not voted → `SADD` + increment score. Recalculate sorted set score. Emit `queue:updated`. | Vote count changes in real time |
| 4.5 | Vote rate limiting | `@fastify/rate-limit` scoped to vote route: max 1 request/second per participant token. Return `VOTE_RATE_LIMITED` (429) on breach. | Spam blocked, normal usage unaffected |
| 4.6 | Get queue | `GET /sessions/:code/queue` — `ZREVRANGE` the sorted set, hydrate each entry with track metadata + vote count + `userVoted` boolean for the requesting participant. | Ordered queue returned |
| 4.7 | Queue broadcast helper | After every mutation (add/vote), build the full hydrated queue and emit `queue:updated` with per-user `userVoted` flags. Use Socket.IO's `to(room).except(socket)` + direct emit to handle per-user payloads, or broadcast without `userVoted` and let each client derive it from a separate user-votes list. **Decision: broadcast queue with vote counts only; send a separate `user_votes` array on connect and on change.** | Efficient broadcast without N per-user payloads |
| 4.8 | Frontend: search modal | "Add Song" button → opens modal with search input (300ms debounce) → displays results → tap to add → modal closes → queue updates. Shows "Already in queue — upvote it!" toast on 409. | Full add-song flow works |
| 4.9 | Frontend: queue list | Renders ordered queue. Each row: album art thumbnail, title, artist, vote count, upvote button (filled if user voted). Upvote is optimistic toggle — updates UI immediately, reconciles on server ack. | Queue visible, interactive, real-time |
| 4.10 | Frontend: empty queue state | When queue is empty, show illustrated prompt: "No songs yet — be the first to add one!" with "Add Song" CTA. | No blank screen |

### Exit Criteria
- Two participants add different songs → both see both songs → they vote → queue re-orders in real time → duplicate add shows toast → rate limit blocks spam.

---

## Phase 5 — Spotify Playback Engine

**Duration:** 5 days
**Goal:** The host's device plays music. Songs auto-advance based on queue rank. Host can play, pause, skip.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 5.1 | Playback service | Server-side service wrapping Spotify Web API playback endpoints: `play(trackUri, deviceId)`, `pause()`, `resume()`, `getPlaybackState()`. Uses host's Spotify token (auto-refreshed). | Service can control host's Spotify |
| 5.2 | Play top song | Internal function: pop the highest-scored song from the sorted set, call Spotify `play`, update `session:{code}` hash with `currentTrack` data, emit `now_playing:updated` to room. Clean up the song's vote set and track metadata. | Top song starts playing on host device |
| 5.3 | Host playback routes | `POST /playback/play` (resume), `POST /playback/pause`, `POST /playback/skip`. Skip triggers "play top song" logic. Play/pause emit `now_playing:resumed` / `now_playing:paused`. | Host controls work via API |
| 5.4 | Auto-advance on track end | **Polling approach (MVP):** Server polls Spotify's `GET /me/player` every 3 seconds while a session is active. When `is_playing` is false and `progress_ms` ≈ `duration_ms` (within 3s tolerance), trigger "play top song". Only poll for sessions with active playback. | Next song plays automatically when current ends |
| 5.5 | Empty queue handling | When skip or auto-advance fires but queue is empty: set `currentTrack` to null, emit `now_playing:updated` with empty payload. Frontend shows "Queue empty — add a song!" | No crash on empty queue |
| 5.6 | Spotify error handling | Catch Spotify 403 (Premium required), 404 (no active device), 502 (Spotify down). Map to `SPOTIFY_PLAYBACK_ERROR`. Emit error to host socket. | Host sees actionable error message |
| 5.7 | Device selection | On session create, call Spotify `GET /me/player/devices`. If multiple devices, use the currently active one. Store `deviceId` in session hash. If no active device, prompt host to open Spotify. | Playback targets correct device |
| 5.8 | Frontend: now playing bar | Bottom bar showing: album art, track title, artist, progress bar (client-side interpolation from `startedAt` + `durationMs`). Updates on `now_playing:updated`. Shows "Nothing playing" when idle. | All participants see current track |
| 5.9 | Frontend: host controls | Play/pause toggle button + skip button in the now-playing bar. Only visible when `role === "host"`. Pause shows play icon and vice versa. | Host can control playback from Melo UI |
| 5.10 | Playback state sync on join | When a participant joins mid-session, `GET /sessions/:code` returns `currentTrack` with `startedAt` so the client can render the progress bar at the correct position. | Late joiners see accurate now-playing |

### Exit Criteria
- Host starts session → participant adds 3 songs → participants vote → host taps play → top-voted song plays on host's Spotify → song ends → next auto-advances → host can pause and skip → empty queue shows prompt.

---

## Phase 6 — Frontend Polish & PWA

**Duration:** 4 days
**Goal:** The app feels complete. Mobile-optimized, installable, handles all edge cases gracefully.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 6.1 | Responsive layout | Design for 375px (mobile) as primary. Queue, now-playing, search all work in a single scrollable view. No horizontal scroll. | Usable on any phone browser |
| 6.2 | PWA manifest & service worker | `manifest.json` (app name, icons, theme color). Service worker for asset caching only (no offline functionality). "Add to Home Screen" prompt. | App installable on iOS/Android |
| 6.3 | Connection state UI | WebSocket disconnect → show reconnecting banner at top. Reconnected → banner dismisses. If reconnect fails after 30s → "Connection lost" with retry button. | Users know when they're disconnected |
| 6.4 | Session code sharing polish | Share button: try `navigator.share()` first → fallback to copy-to-clipboard with "Copied!" toast. Share text: "Join my Melo session! 🎵 [link]" | One-tap sharing on mobile |
| 6.5 | Loading & transition states | Skeleton screens for queue while loading. Spinner on search. Disabled state on buttons during pending requests. | No blank screens or unresponsive buttons |
| 6.6 | Error toasts | Global toast system for: rate-limit hit, Spotify errors, session full, session not found. Auto-dismiss after 4 seconds. | Errors are visible but not blocking |
| 6.7 | Host reconnection | If host refreshes or reconnects, restore full session state from `GET /sessions/:code`. Re-attach as host (verified via JWT). Playback polling resumes. | Host can refresh without killing session |
| 6.8 | Participant reconnection | On reconnect, call `GET /sessions/:code` with participant token to restore state. If token expired (session ended), show ended screen. | Participant recovers from network blip |
| 6.9 | Favicon, OG tags, meta | App icon, Open Graph image + title/description for link previews when session link is shared on iMessage/WhatsApp. | Shared links look good in chat |
| 6.10 | Accessibility pass | Keyboard navigation for queue and voting. ARIA labels on interactive elements. Sufficient color contrast (WCAG AA). | Usable without touch |

### Exit Criteria
- Full flow works on iPhone Safari + Android Chrome.
- App installable as PWA.
- Disconnect/reconnect recovers cleanly.
- Shared link shows rich preview in messaging apps.

---

## Phase 7 — Testing, Hardening & Deployment

**Duration:** 4 days
**Goal:** Ship with confidence. Everything is tested, monitored, and deployed.

### Steps

| # | Task | Detail | Deliverable |
|---|---|---|---|
| 7.1 | Unit tests — server | Test queue score calculation, vote toggle logic, session lifecycle, auth middleware, duplicate detection. Target: services + middleware at 90% coverage. | `pnpm test` passes, coverage report generated |
| 7.2 | Integration tests — API | Supertest against Fastify: full flows for auth, session CRUD, queue, voting, playback routes. Redis + Postgres in Docker for test env. | All API contracts verified |
| 7.3 | WebSocket tests | Test room join/leave, event broadcast correctness, auth handshake rejection. | Real-time layer verified |
| 7.4 | Frontend component tests | Vitest + React Testing Library for: queue rendering, vote toggle, search modal, now-playing bar, connection state. | Key UI interactions tested |
| 7.5 | End-to-end smoke test | Playwright: host creates session → participant joins → adds song → votes → host plays → song advances. Single happy path. | Full flow automated |
| 7.6 | Load test | Artillery or k6: simulate 50 concurrent sessions × 20 participants, each adding 5 songs + 10 votes. Verify <100ms p95 API latency, no dropped WebSocket events. | Performance baseline established |
| 7.7 | Security review | Validate: no Spotify tokens exposed to client, JWT verification on all protected routes, rate limits on vote/search, session code brute-force resistance (6 chars = 2B combinations), CORS locked to app domain. | No critical vulnerabilities |
| 7.8 | Logging & monitoring | Structured JSON logs (pino via Fastify). Health-check endpoint for uptime monitor (UptimeRobot / Betterstack free tier). Log Spotify API errors distinctly. | Errors are observable in production |
| 7.9 | Production deployment | Provision: VPS (Fly.io or Render), managed Redis (Upstash or Render), managed Postgres (Neon or Render). Deploy server as Docker container. Deploy web to CDN (Cloudflare Pages). Configure DNS + TLS. | App live at `melo.app` |
| 7.10 | Spotify app review | Submit Spotify app for quota extension (development mode supports 25 users). Provide required screenshots, description, privacy policy. | Spotify app approved for public use |
| 7.11 | Smoke test in production | Run the full E2E flow on production: create session, join from second device, add songs, vote, play. Verify Spotify playback triggers correctly. | Production verified by team |

### Exit Criteria
- All tests pass in CI.
- Production deployment serves traffic.
- Spotify app approved or in review.
- Monitored and alerting on downtime.

---

## Dependency Chain

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5 ──▶ Phase 6 ──▶ Phase 7
  repo        auth       sessions     queue       playback    polish      ship
  setup       + host     + join       + voting    + Spotify   + PWA       + test
              identity   + sockets    engine      control                 + deploy
```

No phase can start before the previous phase's **backend** work is complete. However, frontend tasks within a phase can overlap with early backend tasks of the next phase if two developers are working in parallel.

### Parallel Track (2 developers)

| Week | Developer A (Backend) | Developer B (Frontend) |
|---|---|---|
| 1 | Phase 1 (bootstrap) + Phase 2 (auth backend) | Phase 1 (bootstrap) + Phase 2 (login UI) |
| 2 | Phase 3 (sessions + WebSocket) | Phase 3 (create/join/session screens) |
| 3 | Phase 4 (queue + voting engine) | Phase 4 (search modal + queue list + voting UI) |
| 3.5 | Phase 5 (playback service) | Phase 5 (now-playing bar + host controls) |
| 4 | Phase 7 (server tests + load test + deploy) | Phase 6 (polish + PWA + reconnection) |
| 4+ | Phase 7 (security + monitoring + Spotify review) | Phase 7 (E2E test + production smoke) |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Spotify app review delay | Medium | **Blocks public launch** | Submit in Phase 5 (not Phase 7). Use 25-user dev mode for beta testing. |
| Spotify rate-limit hit | Low | Degraded search | Search cache (60s) + client debounce (300ms) implemented in Phase 4. |
| WebSocket scaling issues | Low (MVP traffic) | Dropped events | Single-server MVP handles 25K connections. Redis adapter ready if needed (Phase 8). |
| Playback polling drift | Medium | Song doesn't auto-advance | 3s poll interval with tolerance window. Log missed advances. Manual skip as fallback. |
| Session code collision | Very low | Join fails | Retry logic (3 attempts) in Phase 3. 6-char alphanumeric = 2.1B combinations. |

---

## Out of Scope for This Roadmap

Everything listed under **PRD §5.2 (Future)** and **PRD §7 (Non-Goals)** is explicitly excluded. This roadmap builds exactly the 11 MVP features, nothing more.

---

*End of document.*
