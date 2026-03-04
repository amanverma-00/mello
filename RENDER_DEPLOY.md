# 🚀 Render Deployment Guide

Complete step-by-step instructions to deploy Melo to Render.com.

---

## Prerequisites

- ✅ GitHub account
- ✅ Render account ([sign up here](https://dashboard.render.com/register))
- ✅ Spotify Developer App ([create here](https://developer.spotify.com/dashboard))
- ✅ Generated JWT keys (already done via `pnpm --filter @melo/server generate-keys`)

---

## Step 1: Prepare JWT Keys for Deployment

Your JWT keys are in `apps/server/keys/` but need to be as **inline environment variables** for Render.

### Copy Keys to Clipboard

Run these commands to display your keys:

```powershell
# Display Private Key
Write-Host "`n=== COPY THIS FOR JWT_PRIVATE_KEY ===" -ForegroundColor Cyan
Get-Content apps\server\keys\private.pem

# Display Public Key
Write-Host "`n=== COPY THIS FOR JWT_PUBLIC_KEY ===" -ForegroundColor Green
Get-Content apps\server\keys\public.pem
```

**Keep these keys handy** — you'll paste them into Render in Step 5.

---

## Step 2: Push Code to GitHub

```powershell
# Add all changes (ROADMAP.md is now excluded via .gitignore)
git add .

# Commit
git commit -m "chore: prepare for Render deployment"

# Push to main branch
git push origin main
```

Verify your code is on GitHub before proceeding.

---

## Step 3: Connect GitHub to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Click **"Connect GitHub"** (if not already connected)
4. Authorize Render to access your repositories
5. Select your **melo** repository from the list

---

## Step 4: Deploy from Blueprint

Render will automatically detect `render.yaml` and create:

- ✅ **melo-server** (web service on Node.js)
- ✅ **melo-web** (static site)
- ✅ **melo-db** (PostgreSQL database)
- ✅ **Redis** (auto-provisioned add-on)

Click **"Apply"** to start provisioning.

**⏱️ Wait 2-3 minutes** while Render creates the infrastructure.

---

## Step 5: Configure Environment Variables

### 5.1 Configure Spotify Credentials

1. In Render dashboard, click on **melo-server** service
2. Go to **"Environment"** tab
3. Add the following variables:

#### Spotify Variables

| Variable Name | Value | Where to Get It |
|---------------|-------|-----------------|
| `SPOTIFY_CLIENT_ID` | Your client ID | [Spotify Dashboard](https://developer.spotify.com/dashboard) → Your App → Settings |
| `SPOTIFY_CLIENT_SECRET` | Your client secret | Same location ⬆️ (click "Show Client Secret") |
| `SPOTIFY_REDIRECT_URI` | `https://melo-web.onrender.com/callback` | ⚠️ Update after web deploy completes |
| `APP_URL` | `https://melo-web.onrender.com` | ⚠️ Update after web deploy completes |

### 5.2 Configure JWT Keys

Add these two variables with the **full PEM content** (including `-----BEGIN/END-----` lines):

**JWT_PRIVATE_KEY:**
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w...
(paste your entire private.pem content here - keep the line breaks!)
-----END PRIVATE KEY-----
```

**JWT_PUBLIC_KEY:**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQ...
(paste your entire public.pem content here - keep the line breaks!)
-----END PUBLIC KEY-----
```

⚠️ **Critical:** Keep the line breaks in the PEM format. Don't remove newlines.

### 5.3 Save & Deploy

Click **"Save Changes"** — Render will automatically redeploy the server with the new environment variables.

---

## Step 6: Get Your App URLs

After deployment completes (~5 minutes):

1. Click on **melo-web** service → copy the URL (e.g., `https://melo-web.onrender.com`)
2. Click on **melo-server** service → copy the URL (e.g., `https://melo-server.onrender.com`)

### Update Environment Variables

Go back to **melo-server** → **Environment** and update:

- `SPOTIFY_REDIRECT_URI` = `https://melo-web.onrender.com/callback`
- `APP_URL` = `https://melo-web.onrender.com`

Click **"Save Changes"** again (server will redeploy).

---

## Step 7: Update Spotify App Settings

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click on your **Melo app**
3. Click **"Settings"**
4. Scroll to **"Redirect URIs"**
5. Click **"Add Redirect URI"**
6. Add: `https://melo-web.onrender.com/callback`
7. **Keep** `http://127.0.0.1:5173/callback` (for local development)
8. Click **"Save"**

---

## Step 8: Verify Deployment

### 8.1 Health Check

Open in browser: `https://melo-server.onrender.com/api/v1/health`

Should return:
```json
{"status":"ok"}
```

### 8.2 Full Test

1. Open `https://melo-web.onrender.com`
2. Click **"Connect with Spotify"**
3. Authorize the app
4. You should land on your dashboard
5. Create a session
6. Copy the session code
7. Open the same URL in **incognito/private mode**
8. Enter the session code
9. Add a song
10. Verify it appears in the queue

---

## Step 9: Monitor Deployment

### View Logs

**Server logs:**
1. Render Dashboard → **melo-server** → **"Logs"** tab
2. Watch for errors (should see "Server listening on..." message)

**Common issues:**
- ❌ "Connection refused" → Database not ready (wait 30s)
- ❌ "Spotify error 400" → Check `SPOTIFY_REDIRECT_URI` matches exactly
- ❌ "JWT verification failed" → Check keys are pasted correctly with line breaks

### Database Migrations

Render automatically runs migrations via the `release_command` in `render.yaml`. Check logs for:

```
Running release command: node dist/db/migrate.js
Migration completed successfully
```

---

## Troubleshooting

### ❌ "Application error" on web

**Cause:** Server not responding or CORS issue

**Fix:**
1. Check server logs for errors
2. Verify `APP_URL` in server env matches web URL exactly
3. Verify `NODE_ENV=production` is set (auto-set by Render)

### ❌ Spotify OAuth fails with "redirect_uri_mismatch"

**Cause:** Redirect URI mismatch

**Fix:**
1. Check Spotify Dashboard → App Settings → Redirect URIs includes your exact callback URL
2. Check `SPOTIFY_REDIRECT_URI` env var matches exactly (no trailing slash)

### ❌ "No active Spotify device"

**Cause:** Not an error — Spotify requires an active player

**Fix:**
1. Open Spotify app on any device (phone, desktop, web player)
2. Play any song (can pause immediately)
3. Go back to Melo and try playback again

### ❌ WebSocket connection fails

**Cause:** CORS or Socket.IO proxy issue

**Fix:**
1. Verify `APP_URL` env var is set correctly
2. Check browser console for specific error
3. Verify server logs show "Socket.IO initialised"

### ❌ Database connection error

**Cause:** Database not attached or wrong connection string

**Fix:**
1. Render Dashboard → **melo-db** → **"Info"** → verify status is "Available"
2. Check server env has `DATABASE_URL` (auto-set by Render when database is attached)

---

## Performance Notes

### Free Tier Limitations

**Render Free Tier:**
- ⚠️ **Cold starts:** Services sleep after 15 minutes of inactivity
- ⏱️ **First request takes ~30 seconds** to wake up
- ✅ **Perfect for demos and testing**

**For production:**
- Upgrade **melo-server** to **Starter ($7/mo)** to remove cold starts
- Keep web on free tier (static sites don't sleep)

### Scaling

Current setup handles:
- ✅ 50 concurrent sessions
- ✅ ~1000 participants total
- ✅ Real-time updates via Socket.IO

For higher traffic, consider:
- Upgrade to Standard plan ($25/mo)
- Add Redis persistence (upgrade to production Redis)
- Enable horizontal scaling (multiple server instances)

---

## Security Checklist

Before sharing your app publicly:

- ✅ JWT keys are in environment variables (not committed to Git)
- ✅ `.env` files are in `.gitignore`
- ✅ `keys/` directory is in `.gitignore`
- ✅ `NODE_ENV=production` on server (auto-set by Render)
- ✅ HTTPS enabled (automatic on Render)
- ✅ CORS locked to `APP_URL` in production
- ✅ Spotify redirect URI uses HTTPS
- ✅ Database uses SSL (automatic on Render)

---

## Updating Your Deployment

### Deploy New Changes

```powershell
# Make changes to your code
git add .
git commit -m "feat: add new feature"
git push origin main
```

**Render auto-deploys** when you push to `main`. Watch the deploy logs in the dashboard.

### Manual Deploy

If auto-deploy is disabled:
1. Render Dashboard → **melo-server** → **"Manual Deploy"** → **"Deploy latest commit"**
2. Repeat for **melo-web** if needed

### Rollback

If something breaks:
1. Render Dashboard → Service → **"Events"** tab
2. Click **"Rollback"** on a previous successful deploy

---

## Cost Breakdown

| Service | Free Tier | Recommended Production |
|---------|-----------|------------------------|
| **melo-server** | Free (with cold starts) | Starter $7/mo (no cold starts) |
| **melo-web** | Free (static site) | Free (no upgrade needed) |
| **melo-db** (Postgres) | Free 256MB | Starter $7/mo (1GB) |
| **Redis** | Free 25MB | Standard $10/mo (250MB) |
| **Total** | **$0/mo** | **$24/mo** |

---

## Next Steps After Deployment

1. ✅ **Share your app:** Send `https://melo-web.onrender.com` to friends
2. ✅ **Monitor usage:** Check Render Dashboard → Analytics
3. ✅ **Set up alerts:** Render dashboard → Service → Notifications
4. ✅ **Add custom domain** (optional): Render Dashboard → Settings → Custom Domain
5. ✅ **Request Spotify quota extension:** Once you have real users, apply for extended quota in Spotify Dashboard

---

## Support

**Having issues?**
- 📖 Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting
- 🐛 [Open a GitHub Issue](https://github.com/yourusername/melo/issues)
- 📧 Contact Render support via dashboard

---

**Congratulations! Your Melo app is now live! 🎉**

Share your session codes and enjoy collaborative music! 🎵
