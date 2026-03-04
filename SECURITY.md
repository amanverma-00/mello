# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing **your.email@example.com**.

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information (as much as you can provide):

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine the affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all supported versions
4. Release new versions with security patches
5. Publicly announce the vulnerability after the fix is deployed

## Security Best Practices for Deployment

When deploying Melo in production, please ensure:

### Environment Variables
- ✅ Never commit `.env` files to version control
- ✅ Use secure secret management (platform-managed secrets, HashiCorp Vault, etc.)
- ✅ Rotate JWT keys periodically (at least every 6 months)
- ✅ Use strong, unique passwords for databases

### JWT Keys
- ✅ Generate strong RSA 2048-bit keys using `pnpm --filter @melo/server generate-keys`
- ✅ Store private keys securely (never in Git, use environment variables or mounted volumes)
- ✅ Keep `keys/` directory in `.gitignore`

### CORS & Network Security
- ✅ Set `NODE_ENV=production` to lock CORS to `APP_URL`
- ✅ Use HTTPS in production (automatic on Render/Fly.io)
- ✅ Keep `APP_URL` configured correctly to match your frontend domain

### Database Security
- ✅ Use SSL/TLS for database connections (`sslmode=require` for Postgres)
- ✅ Use strong, randomly generated passwords (20+ characters)
- ✅ Restrict database access to application servers only
- ✅ Enable database encryption at rest (if available)

### Redis Security
- ✅ Use password authentication (`requirepass` in redis.conf)
- ✅ Use TLS for Redis connections in production (Upstash provides this)
- ✅ Don't expose Redis port to public internet

### Docker Security
- ✅ Don't expose database/Redis ports to host in `docker-compose.prod.yml`
- ✅ Use `expose` instead of `ports` for internal services
- ✅ Keep base images updated (`postgres:16-alpine`, `redis:7-alpine`)
- ✅ Run containers as non-root users when possible

### Dependency Security
- ✅ Run `pnpm audit` regularly to check for vulnerabilities
- ✅ Keep dependencies updated
- ✅ Review security advisories for critical packages

### Monitoring & Logging
- ✅ Enable structured logging (already configured via Pino)
- ✅ Monitor for unusual patterns (failed auth attempts, rate limit hits)
- ✅ Set up alerts for errors and security events

### Rate Limiting
- ✅ Rate limiting is configured on auth and session endpoints
- ✅ Adjust limits based on your traffic patterns
- ✅ Monitor for rate limit violations

### Spotify API
- ✅ Validate OAuth state parameter (prevent CSRF)
- ✅ Use PKCE flow for enhanced security
- ✅ Handle token refresh errors gracefully
- ✅ Never log or expose access/refresh tokens

## Known Security Considerations

### Spotify Premium Requirement
Playback control requires Spotify Premium. This is a Spotify API limitation, not a security issue.

### Session Codes
- Session codes are 6-character alphanumeric strings
- Expire after `SESSION_TTL_HOURS` (default: 6 hours)
- Not cryptographically random, designed for shareable codes
- Consider them "security by obscurity" for casual use

### Participant Authentication
- Participants use display names (no formal auth)
- Participant tokens are session-specific, expire with session
- Suitable for casual gatherings; add formal auth for enterprise use

## Comments on This Policy

If you have suggestions on how this process could be improved, please submit a pull request or open an issue.

---

**Last Updated:** March 4, 2026
