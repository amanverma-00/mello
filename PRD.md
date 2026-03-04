# Product Requirement Document — Melo

**Version:** 1.0 (MVP)
**Date:** March 4, 2026
**Author:** Product Team

---

## 1. Problem Statement

When people gather — at parties, road trips, co-working spaces, or hangouts — choosing what music to play next creates friction. One person monopolises the queue, tastes clash, and most people never get a say. There is no lightweight way for a group to **democratically decide the next song in real time**.

Melo lets anyone in a group upvote the song they want to hear next. The top-voted song plays next. Simple.

---

## 2. Target User

| Attribute | Detail |
|---|---|
| **Primary** | Friend groups (18-35) at social gatherings, house parties, road trips |
| **Secondary** | Small venues, cafés, co-working spaces that want crowd-sourced playlists |
| **Behavior** | Already use Spotify/Apple Music/YouTube Music; comfortable sharing a short code or link to join a session |
| **Pain point** | "Who controls the music?" arguments; passive listeners who want a voice |

---

## 3. Core Concepts

| Term | Definition |
|---|---|
| **Session** | A temporary, real-time music room created by a host |
| **Host** | The user who creates the session and whose playback device outputs the audio |
| **Participant** | Any user who joins a session via invite code/link |
| **Queue** | The ordered list of upcoming songs, sorted by vote count (descending) |
| **Upvote** | A single vote a participant casts on a song in the queue (one vote per user per song) |

---

## 4. Core User Flows

### 4.1 Host Creates a Session

1. Host opens Melo and taps **"Start Session"**.
2. Host connects their music streaming account (Spotify — MVP).
3. A unique 6-character **session code** and shareable link are generated.
4. Host shares the code/link with the group.
5. Playback begins when the host manually plays or when the first song is added and the host taps play.

### 4.2 Participant Joins a Session

1. Participant opens Melo (or the shared link).
2. Enters the 6-character session code **or** is deep-linked in.
3. Sets a display name (no account required for participants — MVP).
4. Sees the live queue and the currently playing song.

### 4.3 Adding a Song

1. Any participant (or host) taps **"Add Song"**.
2. Searches by title, artist, or pastes a Spotify link.
3. Selects a result → song is added to the queue with 1 upvote (from the adder).
4. Queue re-sorts in real time.

### 4.4 Voting

1. Participant sees the queue list.
2. Taps the **upvote button** on any song they want to hear sooner.
3. Vote count updates in real time for all participants.
4. A user can upvote many different songs but only **once per song**.
5. Tapping the upvote again **removes** their vote (toggle).

### 4.5 Song Plays Next

1. When the current song ends (or host skips), the song with the **highest votes** auto-advances to play.
2. Tie-breaker: the song that was added **earliest** plays first.
3. Played songs are removed from the queue.

### 4.6 Host Ends Session

1. Host taps **"End Session"**.
2. All participants see a "Session ended" screen.
3. Session data is discarded (no persistence — MVP).

---

## 5. Feature List

### 5.1 MVP (V1)

| # | Feature | Notes |
|---|---|---|
| 1 | Create / end a session | Host only; generates code + link |
| 2 | Join a session | Via code or deep link; display name only, no sign-up for participants |
| 3 | Host account (lightweight) | Email or social login for the host only (needed for Spotify OAuth) |
| 4 | Spotify integration | Search, playback control via Spotify Premium on host device |
| 5 | Add song to queue | Search by title/artist or paste Spotify link |
| 6 | Upvote / remove upvote | One vote per user per song; toggle |
| 7 | Real-time queue | Sorted by votes (desc), then by time added (asc); live updates via WebSocket |
| 8 | Now Playing view | Shows album art, title, artist, progress bar |
| 9 | Host playback controls | Play / pause / skip |
| 10 | Duplicate prevention | If a song already exists in the queue, surface it instead of adding again |
| 11 | Session code sharing | Native share sheet + copy-to-clipboard |

### 5.2 Future (Post-MVP)

| Feature | Rationale |
|---|---|
| Apple Music / YouTube Music support | Expand streaming coverage |
| Participant accounts & listening history | Personalisation; "your past sessions" |
| Co-host permissions | Let host delegate skip/remove powers |
| Song removal / moderation tools | Host can remove inappropriate songs |
| Downvotes or limited vote budget | Prevent queue flooding |
| Persistent / recurring rooms | For venues or repeated events |
| Playlist export | Save the session's played songs to a Spotify playlist |
| "Vibe tags" or genre filters | Host restricts to certain genres |

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| **Two songs tied in votes** | Song added earlier plays first |
| **Queue is empty when current song ends** | Playback pauses; participants see "Queue empty — add a song!" prompt |
| **Host loses connection** | Playback continues on host's Spotify; queue state is preserved server-side for 5 min, host can reconnect |
| **Participant loses connection** | Their votes are retained; they rejoin via same code and reclaim display name |
| **Same song added twice** | App detects duplicate by Spotify track ID and surfaces the existing entry ("Already in queue — upvote it!") |
| **Host's Spotify Premium expires mid-session** | Graceful error: "Playback unavailable — check Spotify subscription" |
| **Participant tries to join a non-existent or ended session** | Show "Session not found" with option to start their own |
| **Very large group (50+ participants)** | MVP caps at **50 participants** per session to keep real-time sync performant |
| **Rapid vote toggling (spam)** | Rate-limit vote actions to 1 per second per user |
| **Explicit/inappropriate song in queue** | Out of scope for MVP; future moderation tools will address |

---

## 7. Non-Goals (V1)

- **Not a full music player.** Melo controls the queue and voting; actual audio streams through the host's Spotify app.
- **Not a social network.** No profiles, followers, feeds, or messaging.
- **Not a playlist curator.** No algorithmic recommendations, auto-generated playlists, or discovery features.
- **No offline mode.** Requires active internet for all participants.
- **No multi-platform streaming in a single session.** V1 is Spotify-only.
- **No monetisation features.** No ads, tipping, or premium tiers in V1.
- **No audio output to participant devices.** Only the host device plays audio.

---

## 8. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| **Sessions created** | 5,000+ |
| **Avg. participants per session** | ≥ 4 |
| **Avg. songs added per session** | ≥ 10 |
| **Vote participation rate** | ≥ 60% of participants cast at least 1 vote |
| **Session duration** | Avg. ≥ 30 minutes |
| **Host retention** | 30% of hosts create a 2nd session within 14 days |
| **Join completion rate** | ≥ 85% of users who open an invite link successfully join the session |

---

## 9. Technical Assumptions (for engineering handoff)

- **Real-time layer:** WebSocket (e.g., Socket.IO) for live queue & vote sync.
- **Spotify API:** Web Playback SDK (web) or Spotify iOS/Android SDK + OAuth 2.0 PKCE.
- **Session storage:** Ephemeral (Redis or in-memory); no long-term persistence needed for MVP.
- **Auth:** Host → OAuth via Spotify. Participants → anonymous with display name (session-scoped token).
- **Platforms:** Mobile-first Progressive Web App (single codebase, no app store dependency for V1).

---

*End of document.*
