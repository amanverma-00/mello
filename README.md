# 🎵 Melo

**Collaborative Spotify queue with real-time voting** — Turn any gathering into a democratic music experience.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify)](https://fastify.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io)](https://socket.io/)
[![Tests](https://img.shields.io/badge/Tests-91%20passing-success)](#testing)

---

## ✨ Features

- 🔐 **Spotify OAuth** — Seamless authentication with your Spotify account
- 🎭 **Dual Roles** — Host controls playback, participants vote on songs
- 🔍 **Real-time Search** — Search Spotify's catalog instantly
- 👍 **Democratic Voting** — Upvote songs to move them up the queue
- ▶️ **Playback Control** — Play, pause, skip, and auto-advance to next track
- 🔄 **Live Updates** — Socket.IO powers instant queue and playback sync
- 📱 **Mobile-First UI** — Beautiful interface that works on any device
- 🔒 **Secure** — JWT auth, CORS protection, rate limiting built-in

---

## 🏗️ Architecture

```
┌─────────────────┐
│  React SPA      │  → Vite 6, React Router 7, Socket.IO client
│  (apps/web)     │
└────────┬────────┘
         │ WebSocket + REST
         ↓
┌─────────────────┐
│  Fastify Server │  → Socket.IO, Kysely ORM, spotify-web-api-node
│  (apps/server)  │
└────┬───────┬────┘
     │       │
     ↓       ↓
┌────────┐ ┌──────────┐
│ Redis  │ │ Postgres │  → Sessions, queue cache, playback state
└────────┘ └──────────┘
```

**Tech Stack:**
- **Frontend:** React 19, TypeScript, Vite, Socket.IO client, React Router
- **Backend:** Fastify 5, TypeScript, Socket.IO, JWT (RS256), Zod validation
- **Database:** PostgreSQL 16 (Kysely ORM), Redis 7 (ioredis)
- **APIs:** Spotify Web API, Spotify Web Playback SDK
- **Deployment:** Docker, Fly.io, Render

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22+ (LTS)
- **pnpm** 10+
- **PostgreSQL** 16+
- **Redis** 7+
- **Spotify Developer App** ([Create one](https://developer.spotify.com/dashboard))

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/melo.git
cd melo
pnpm install
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
# - Add Spotify Client ID/Secret
# - Configure database URLs
```

### 3. Generate JWT Keys

```bash
pnpm --filter @melo/server generate-keys
```

This creates RSA key pair in `apps/server/keys/` for signing JWTs.

### 4. Run Database Migrations

```bash
pnpm --filter @melo/server migrate
```

### 5. Start Development Servers

```bash
# Start all services (server + web)
pnpm dev

# Or individually:
pnpm --filter @melo/server dev  # API on :3001
pnpm --filter @melo/web dev     # Web on :5173
```

### 6. Open App

- **Web:** http://localhost:5173
- **API:** http://localhost:3001/api/v1/health

---

## 📖 Usage

### As a Host

1. Click **"Connect with Spotify"** on the landing page
2. Authorize Melo to control your Spotify playback
3. Click **"Create Session"** on your dashboard
4. Share the **session code** or **share link** with friends
5. Open Spotify on any device (phone, computer, speaker)
6. Use Melo to control playback — queue auto-advances

### As a Participant

1. Get the **session code** from the host
2. Enter code on the landing page or click the share link
3. Enter your display name
4. Search and vote on songs
5. Watch the queue update in real-time

---

## 🧪 Testing

```bash
# Run all tests (91 tests across server + web)
pnpm test

# Run tests for specific package
pnpm --filter @melo/server test
pnpm --filter @melo/web test

# Watch mode
pnpm --filter @melo/server test:watch
```

**Test Coverage:**
- ✅ 63 server tests (API routes, services, WebSocket)
- ✅ 28 web tests (React components)
- ✅ Unit + integration tests

---

## 🐳 Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for comprehensive deployment guides:

- **[Render](./DEPLOYMENT.md#option-a-render-recommended-for-beginners)** — Zero-config, managed services (recommended)
- **[Fly.io](./DEPLOYMENT.md#option-b-flyio-production-grade)** — Production-grade, excellent WebSocket support
- **[Docker Compose](./DEPLOYMENT.md#option-c-docker-compose-self-hosted-vps)** — Self-hosted on any VPS

### Quick Deploy to Render

```bash
# 1. Push to GitHub
git push origin main

# 2. Go to render.com → New → Blueprint
# 3. Connect your repo (auto-detects render.yaml)
# 4. Add environment variables (Spotify keys, JWT keys)
# 5. Deploy! 🚀
```

---

## 📁 Project Structure

```
melo/
├── apps/
│   ├── server/           # Fastify API + Socket.IO
│   │   ├── src/
│   │   │   ├── routes/   # REST endpoints
│   │   │   ├── services/ # Business logic (session, queue, playback)
│   │   │   ├── lib/      # Redis, JWT, Spotify, Socket.IO
│   │   │   ├── db/       # Kysely migrations & connection
│   │   │   └── middleware/
│   │   └── keys/         # JWT RSA keys (git-ignored)
│   ├── web/              # React SPA
│   │   ├── src/
│   │   │   ├── pages/    # Route components
│   │   │   ├── components/
│   │   │   ├── hooks/    # useSocket, useToast
│   │   │   └── lib/      # API client
│   │   └── public/
│   └── e2e/              # Playwright tests (future)
├── packages/
│   └── shared/           # Shared types between server/web
├── .env.example          # Environment variable template
├── docker-compose.prod.yml
├── fly.toml
├── render.yaml
├── turbo.json            # Turborepo config
└── pnpm-workspace.yaml
```

---

## 🔧 Development

### Available Scripts

```bash
pnpm dev          # Start all dev servers
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript type checking
```

### Environment Variables

See [`.env.example`](./.env.example) for full list. Key variables:

```bash
# Server
PORT=3001
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379

# Spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback

# JWT
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem

# App
APP_URL=http://localhost:5173
```

### Database Migrations

```bash
# Create new migration
pnpm --filter @melo/server migration:create my_migration_name

# Run migrations
pnpm --filter @melo/server migrate
```

---

## 🔒 Security

- ✅ **JWT RS256** — Asymmetric signing with 2048-bit RSA keys
- ✅ **HttpOnly Cookies** — Refresh tokens protected from XSS
- ✅ **CORS** — Locked to `APP_URL` in production
- ✅ **Rate Limiting** — Fastify rate-limit on auth/session routes
- ✅ **Helmet** — Security headers via @fastify/helmet
- ✅ **Input Validation** — Zod schemas on all endpoints
- ✅ **SQL Injection Protection** — Kysely parameterized queries
- ✅ **Environment Secrets** — Never committed to Git

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier configured
- Follow existing patterns in codebase

---

## 📄 API Documentation

### REST Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/health` | Health check | None |
| `GET` | `/api/v1/auth/spotify` | Start Spotify OAuth | None |
| `POST` | `/api/v1/auth/callback` | OAuth callback | None |
| `POST` | `/api/v1/auth/refresh` | Refresh access token | Cookie |
| `GET` | `/api/v1/auth/me` | Get current user | JWT |
| `POST` | `/api/v1/sessions` | Create session | Host JWT |
| `POST` | `/api/v1/sessions/:code/join` | Join session | None |
| `DELETE` | `/api/v1/sessions/:code` | End session | Host JWT |
| `GET` | `/api/v1/sessions/:code/queue` | Get queue | Session access |
| `GET` | `/api/v1/sessions/:code/search` | Search Spotify | Session access |
| `POST` | `/api/v1/sessions/:code/queue` | Add song | Session access |
| `POST` | `/api/v1/sessions/:code/queue/:trackId/vote` | Toggle vote | Session access |
| `GET` | `/api/v1/sessions/:code/playback` | Get now playing | Session access |
| `POST` | `/api/v1/sessions/:code/playback/play` | Start playback | Host JWT |
| `POST` | `/api/v1/sessions/:code/playback/pause` | Pause | Host JWT |
| `POST` | `/api/v1/sessions/:code/playback/resume` | Resume | Host JWT |
| `POST` | `/api/v1/sessions/:code/playback/skip` | Skip | Host JWT |

### WebSocket Events

**Client → Server:**
- `session:join` — Join session room
- `session:leave` — Leave session room

**Server → Client:**
- `participant_count` — Participant count changed
- `queue:updated` — Queue changed (add, vote, pop)
- `now_playing:started` — Playback started
- `now_playing:paused` — Playback paused
- `now_playing:resumed` — Playback resumed
- `session:ended` — Session ended by host

---

## 📝 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) — Music catalog and playback
- [Fastify](https://fastify.dev/) — High-performance web framework
- [Socket.IO](https://socket.io/) — Real-time bidirectional communication
- [React](https://react.dev/) — Frontend library
- [Kysely](https://kysely.dev/) — Type-safe SQL query builder

---

## 📞 Support

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/yourusername/melo/issues)
- 💡 **Feature Requests:** [GitHub Issues](https://github.com/yourusername/melo/issues)
- 📖 **Documentation:** [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Built with ❤️ using TypeScript, React, Fastify, Socket.IO, and Spotify Web API**
