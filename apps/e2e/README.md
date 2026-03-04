# E2E Tests

End-to-end smoke tests using [Playwright](https://playwright.dev).

## Prerequisites

- Docker Compose running (Redis + Postgres)
- Spotify OAuth credentials configured in `.env`

## Setup

```bash
# Install Playwright browsers (one-time)
pnpm --filter @melo/e2e exec playwright install --with-deps chromium
```

## Running

```bash
# Run all E2E tests (starts dev servers automatically)
pnpm --filter @melo/e2e test

# Run with browser visible
pnpm --filter @melo/e2e test:headed

# Interactive UI mode
pnpm --filter @melo/e2e test:ui
```

## Full OAuth E2E (Manual)

Automated Spotify OAuth testing requires a real Spotify account and can't be
fully automated without test credentials. For the full happy-path:

1. Start the app: `pnpm dev`
2. Open `http://localhost:5173`
3. Click "Continue with Spotify" → authenticate
4. Create a session → note the code
5. Open an incognito window → go to `http://localhost:5173/join/<code>`
6. Enter display name → join session
7. Search for a song → add to queue → vote
8. As host, start playback → verify song advances

This manual flow should be executed as a smoke test before each production deploy.
