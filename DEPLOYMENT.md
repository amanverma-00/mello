# Deployment Guide — Melo

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│  Web (CDN)  │────▶│  API Server  │────▶│  Redis  │
│  Static SPA │     │  Fastify     │     │  7.x    │
└─────────────┘     │  + Socket.IO │     └─────────┘
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    │  16.x        │
                    └──────────────┘
```

## Which Platform to Choose?

| Platform | Best For | Pros | Cons |
|----------|----------|------|------|
| **Render** | Beginners | Zero-config, managed services | Free tier has cold starts |
| **Fly.io** | Production | No cold starts, great WebSocket support | Requires CLI setup |
| **Docker Compose** | Full control | Predictable costs, no vendor lock-in | Manual server management |

**Recommendation:** Start with **Render** (easiest), upgrade to **Fly.io** or **paid Render** for production traffic.

---

## Prerequisites

1. **Spotify Developer App**: https://developer.spotify.com/dashboard
   - Note your Client ID and Client Secret
   - Add redirect URI for production (update after deployment)

2. **JWT Key Pair**: Generate RSA 2048-bit keys
   ```bash
   pnpm --filter @melo/server generate-keys
   ```

3. **Environment Variables**: See `.env.example` for all required vars

---

## Option A: Render (Recommended for Beginners)

## Option A: Render (Recommended for Beginners)

### 1. Push to GitHub

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### 2. Deploy Blueprint

1. Go to [render.com](https://render.com) → Sign in with GitHub
2. Click **"New" → "Blueprint"**
3. Connect your `melo` repository
4. Render auto-detects `render.yaml` and creates:
   - **melo-server** (API + Socket.IO)
   - **melo-web** (static React app)
   - **melo-db** (PostgreSQL)
   - Auto-provisioned **Redis**

### 3. Configure Secrets

In Render dashboard → **melo-server** → **Environment**:

```bash
# Spotify (from https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=https://melo-web.onrender.com/callback

# App URL (your frontend URL)
APP_URL=https://melo-web.onrender.com

# JWT Keys (inline PEM format - keep the line breaks!)
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
(paste entire private.pem content)
-----END RSA PRIVATE KEY-----

JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
(paste entire public.pem content)
-----END PUBLIC KEY-----
```

**Important:** For containerized deployments, use inline `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` env vars instead of file paths.

### 4. Update Spotify Redirect URI

In [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
- Add: `https://melo-web.onrender.com/callback`
- Keep: `http://127.0.0.1:5173/callback` (local dev)

### 5. First Deploy

Render will automatically:
- Build your app
- Run database migrations (via `render.yaml` release command)
- Start the server

Wait ~5 minutes for initial deployment.

### 6. Verify

- Health check: `https://melo-server.onrender.com/api/v1/health`
- Frontend: `https://melo-web.onrender.com`
- Test full flow: Login → Create session → Join from another device

**Note:** Free tier services sleep after 15 min of inactivity. First request takes ~30s to wake up. Upgrade to Starter ($7/mo) to remove cold starts.

---

## Option B: Fly.io (Production-grade)

### 1. Install Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 2. Setup JWT Keys for Inline Secrets

```bash
# Generate keys if not already done
pnpm --filter @melo/server generate-keys

# Convert to single-line format (for Fly secrets)
PRIV_KEY=$(cat apps/server/keys/private.pem | awk '{printf "%s\\n", $0}')
PUB_KEY=$(cat apps/server/keys/public.pem | awk '{printf "%s\\n", $0}')
```

### 3. Create Fly App

```bash
# Login
fly auth login

# Launch from project root (don't deploy yet)
fly launch --config fly.toml --no-deploy --name melo-server
```

### 4. Add Managed Services

**PostgreSQL:**
```bash
fly postgres create --name melo-db --region iad
fly postgres attach melo-db --app melo-server
```

**Redis (Upstash):**
```bash
fly redis create --name melo-redis --region global
# Copy the REDIS_URL from output
```

### 5. Set Secrets

```bash
fly secrets set \
  REDIS_URL="rediss://default:xxx@xxx.upstash.io:6379" \
  SPOTIFY_CLIENT_ID="xxx" \
  SPOTIFY_CLIENT_SECRET="xxx" \
  SPOTIFY_REDIRECT_URI="https://melo-server.fly.dev/callback" \
  APP_URL="https://melo-server.fly.dev" \
  JWT_PRIVATE_KEY="$PRIV_KEY" \
  JWT_PUBLIC_KEY="$PUB_KEY"
```

### 6. Deploy

```bash
fly deploy --config fly.toml
```

**Note:** The `release_command` in `fly.toml` automatically runs database migrations before each deployment.

### 7. Deploy Web Frontend

For the frontend, use **Vercel** / **Netlify** / **Cloudflare Pages**:

```bash
# Build locally
pnpm --filter @melo/web build

# Deploy to Vercel
npx vercel deploy apps/web/dist --prod

# Or Cloudflare Pages
npx wrangler pages deploy apps/web/dist --project-name melo
```

Update Vite config to point to your Fly.io backend, or use environment variables.

### 8. Scale (Optional)

```bash
# View current scaling
fly scale show

# Scale up for production
fly scale memory 1024  # 1GB RAM
fly scale count 2      # 2 instances for redundancy
```

---

## Option C: Docker Compose (Self-hosted VPS)

## Option C: Docker Compose (Self-hosted VPS)

### 1. Provision VPS

Use any cloud provider:
- **DigitalOcean** Droplet ($6/mo - 1GB RAM)
- **Hetzner** Cloud ($4/mo - 2GB RAM)
- **AWS Lightsail** ($5/mo - 1GB RAM)

Minimum: Ubuntu 22.04, 1GB RAM, 25GB storage

### 2. Install Docker

```bash
# On your VPS via SSH
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
```

### 3. Clone and Setup

```bash
# Clone repo
git clone https://github.com/yourusername/melo.git
cd melo

# Generate JWT keys
pnpm --filter @melo/server generate-keys

# Create production env file
cp .env.example .env.prod
nano .env.prod
```

**Edit `.env.prod`:**
```bash
# Strong passwords for Docker services
POSTGRES_PASSWORD=your_strong_postgres_password
REDIS_PASSWORD=your_strong_redis_password

# Spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://your-domain.com/callback

# App
APP_URL=http://your-domain.com
NODE_ENV=production

# JWT (file paths - keys are mounted via volume)
JWT_PRIVATE_KEY_PATH=/app/keys/private.pem
JWT_PUBLIC_KEY_PATH=/app/keys/public.pem
```

### 4. Deploy

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f server
```

### 5. Run Migrations

```bash
docker compose -f docker-compose.prod.yml exec server \
  node dist/db/migrate.js
```

### 6. Setup Nginx Reverse Proxy

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create config
sudo nano /etc/nginx/sites-available/melo
```

**Nginx config:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Web frontend
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO (critical for real-time features)
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable and get SSL:**
```bash
sudo ln -s /etc/nginx/sites-available/melo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

### 7. Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## Troubleshooting

### "Connection is closed" (Redis)

**Render:**
- Verify Redis add-on is attached in dashboard
- Check `REDIS_URL` format in server logs

**Fly.io:**
```bash
fly redis list
fly secrets list  # Verify REDIS_URL is set
```

**Docker:**
- Verify `REDIS_PASSWORD` in `.env.prod` matches `docker-compose.prod.yml`
- Check: `docker compose logs redis`

### "No active Spotify device"

This is **not a bug** — Spotify requires an active player:
1. Open Spotify app on any device
2. Start playing anything (can pause immediately)
3. Refresh Melo session page
4. Now playback controls work

### "Spotify refresh token revoked"

User needs to re-authenticate:
1. Go to landing page
2. Click "Connect with Spotify" again
3. The old token row is automatically cleaned up

Server logs show: `Spotify refresh token revoked. Please re-authenticate.`

### WebSocket connection fails

**Symptoms:** Vote changes don't appear in real-time, participant count wrong

**Fixes:**
1. Verify `APP_URL` matches your frontend domain exactly
2. Check `NODE_ENV=production` is set (locks CORS to `APP_URL`)
3. Browser DevTools → Network → WS tab → check connection status
4. For nginx: Ensure `Upgrade` and `Connection` headers are set (see config above)

### Database migration not running

**Render:**
- Check dashboard → Events → "Release Command"
- Manually run: Connect to shell → `node dist/db/migrate.js`

**Fly.io:**
- Check logs: `fly logs --app melo-server`
- Verify `release_command` in `fly.toml`
- Run manually: `fly ssh console --app melo-server --command "node dist/db/migrate.js"`

**Docker:**
```bash
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js
```

### Build fails with TypeScript errors

Ensure you pulled the latest code with all fixes:
```bash
git pull origin main
pnpm install
pnpm build
```

All 91 tests should pass:
```bash
pnpm test
```

---

---

## Post-Deployment Checklist

- [ ] Health check returns `{"status":"ok"}` at `/api/v1/health`
- [ ] Spotify OAuth flow completes successfully
- [ ] Can create a new session as host
- [ ] Can join session from another device/browser
- [ ] WebSocket connects (check browser DevTools → Network → WS)
- [ ] Search returns Spotify results
- [ ] Vote toggle works in real-time (both devices see update instantly)
- [ ] Playback starts when host has active Spotify device
- [ ] Pause/resume/skip controls work
- [ ] Auto-advance plays next song when current finishes

---

## Monitoring & Logging

### Health Endpoints

```bash
# API health
curl https://your-domain.com/api/v1/health
# Expected: {"status":"ok"}

# Database connectivity (implicit in API)
# Redis connectivity (implicit in API)
```

### Platform Logs

**Render:**
```bash
# Web dashboard → Logs (real-time)
# Or CLI: render logs --tail
```

**Fly.io:**
```bash
fly logs --app melo-server
fly logs --app melo-server -f  # follow
```

**Docker:**
```bash
docker compose -f docker-compose.prod.yml logs -f server
docker compose -f docker-compose.prod.yml logs -f --tail=100 server
```

### Structured Logging

Melo uses Fastify's Pino logger (JSON format). Key fields:

| Field | Description |
|-------|-------------|
| `level` | 10=trace, 20=debug, 30=info, 40=warn, 50=error |
| `reqId` | Unique request ID (auto-generated) |
| `req.url` | Request path |
| `res.statusCode` | HTTP status code |
| `responseTime` | Request duration (ms) |
| `sessionCode` | Session code (for session-related requests) |
| `err` | Full error object (stack trace) |

**Filter for errors:**
```bash
# Render/Fly: Filter logs by "level":50
# Docker:
docker compose logs server | grep '"level":50'
```

**Common error patterns:**
- `"code":"SPOTIFY_ERROR"` → Spotify API failure (token refresh, network)
- `"code":"NO_ACTIVE_DEVICE"` → User needs to open Spotify app
- `"code":"SESSION_NOT_FOUND"` → Invalid/expired session code

### Uptime Monitoring (Free)

Use **UptimeRobot** or **Betterstack** (free tier):

1. Create HTTP(S) monitor
2. URL: `https://your-domain.com/api/v1/health`
3. Expected keyword: `"ok"`
4. Check interval: 5 minutes
5. Alerts: Email/SMS when down

---

## Cost Comparison

| Provider | Free Tier | Starter | Production | Notes |
|----------|-----------|---------|------------|-------|
| **Render** | ✅ (cold starts) | $7/mo | $21/mo (no cold starts) | Easiest setup, auto-scaling |
| **Fly.io** | ✅ 3 shared VMs | ~$0-5/mo | $10-20/mo | Best for WebSocket, no cold starts |
| **DigitalOcean** | ❌ | $6/mo (1GB) | $12-24/mo (2-4GB) | Full control, manual management |
| **AWS Lightsail** | ❌ | $5/mo (1GB) | $10-20/mo | Similar to DigitalOcean |
| **Hetzner** | ❌ | €4/mo (2GB) | €8-16/mo | Cheapest VPS, EU region |

**External services (if not using platform-managed):**
- **Upstash Redis**: Free tier (10K commands/day), then $0.20/100K
- **Neon Postgres**: Free tier (512MB), then $19/mo (unlimited)

**Recommendation:**
- **Testing/MVP:** Render free tier or Fly.io free tier
- **Production (<1000 users):** Render Starter ($7) or Fly.io scaled ($10-15)
- **Production (>1000 users):** Fly.io scaled ($20-50) or VPS ($12-24)

---

## Security Hardening (Production)

### 1. Environment Variables

- ✅ All secrets in env vars (never commit to Git)
- ✅ `.gitignore` includes `keys/`, `.env`, `*.pem`
- ✅ Use platform-managed secrets (Render/Fly.io encrypted storage)

### 2. CORS

- ✅ Locked to `APP_URL` in production (`NODE_ENV=production`)
- ✅ Credentials enabled for cookies

### 3. Rate Limiting

Fastify rate-limit is configured:
- **Auth endpoints**: 5 req/min per IP
- **Session join**: 10 req/min per IP
- **Global**: 100 req/min per IP

### 4. HTTPS

- ✅ Render/Fly.io: Automatic Let's Encrypt SSL
- ✅ Docker/VPS: Use Certbot (see nginx config above)

### 5. Database

- ✅ SSL/TLS enforced (`sslmode=require` for Postgres)
- ✅ Strong passwords (20+ chars, random)
- ✅ No exposed ports in Docker Compose (uses `expose` instead of `ports`)

### 6. JWT

- ✅ RS256 (asymmetric) with 2048-bit keys
- ✅ Access token: 15 min expiry
- ✅ Refresh token: 7 day expiry, HttpOnly cookie
- ✅ `Secure` flag in production

### 7. Dependencies

Keep deps updated:
```bash
pnpm update --latest
pnpm audit
pnpm build && pnpm test  # Verify nothing broke
```

---

## Updating Production

### Render (Zero-downtime)

```bash
git push origin main
# Render auto-deploys on push (if auto-deploy enabled)
```

### Fly.io (Zero-downtime)

```bash
fly deploy --config fly.toml
# Fly performs rolling deployment (no downtime)
```

### Docker Compose (Brief downtime)

```bash
# On VPS
cd melo
git pull origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec server node dist/db/migrate.js
```

For zero-downtime Docker updates, use **Kubernetes** or **Docker Swarm**.

---

## Performance Tuning

### Redis Memory

Monitor Redis usage:
```bash
# Render: Check dashboard metrics
# Fly.io: fly redis status
# Docker: docker exec -it melo-redis redis-cli info memory
```

**Optimization:** Sessions auto-expire after `SESSION_TTL_HOURS` (default: 6h). Increase if users have longer sessions.

### Database Connection Pool

Kysely (via `pg`) uses default pool size of 10. For high traffic:

```typescript
// In apps/server/src/db/index.ts
pool: { max: 20, min: 2, idleTimeoutMillis: 30000 }
```

### Fastify Concurrency

Fly.io `fly.toml` sets:
```toml
soft_limit = 200  # Queue requests at 200 concurrent
hard_limit = 250  # Reject at 250
```

Adjust based on your VM size and memory.

---

## Support

- **Docs**: This file + inline code comments
- **Issues**: GitHub Issues
- **Logs**: Check platform logs first (most issues are Spotify auth or "no active device")

**Common fixes:**
1. "No active device" → Open Spotify app on any device
2. WebSocket fails → Verify `APP_URL` and `NODE_ENV=production`
3. Auth fails → Check Spotify redirect URI matches exactly

Built with ❤️ using Fastify, React, Socket.IO, and Spotify Web API.
