# Kitepop Canonical Origin Migration Design

## Goal

Make `https://kitepop.top` the only production application origin so browser Origin validation, secure session Cookies, Nginx routing, and deployment checks agree. Redirect `www.kitepop.top` permanently to the apex origin.

## Confirmed Failure

Production currently accepts `Origin: http://104.244.91.222` and rejects `Origin: https://kitepop.top` before credential verification. The supplied administrator credentials were independently validated through the currently accepted legacy Origin; login, `/api/users/me`, administrator access, logout, and post-logout rejection all behaved correctly.

The account and password are therefore not the cause. The deployed `SITE_URL` and checked-in production examples still point to the previous origin.

## Canonical-Origin Contract

- Production application origin: `https://kitepop.top`.
- `SITE_URL` must equal `https://kitepop.top` exactly.
- `NODE_ENV=production` and `TRUST_PROXY=1` remain required.
- HTTP requests for `kitepop.top` and `www.kitepop.top` redirect to `https://kitepop.top$request_uri`.
- HTTPS requests for `www.kitepop.top` redirect to `https://kitepop.top$request_uri`.
- Only the HTTPS `kitepop.top` server block proxies to `127.0.0.1:3000`.
- TLS certificate paths use the `kitepop.top` Let's Encrypt certificate containing both apex and `www` names.
- The backend continues accepting one exact production Origin. No multi-origin exception is added.

## Repository Changes

Update the active deployment contract in:

- `.env.example`
- `deploy/nginx-kitepop.conf`
- `docs/admin-auth-deployment.md`
- `docs/user-auth.md`
- `docs/seo-performance-notes.md`
- `REFACTORING_SUMMARY.md`
- `progress.md`
- `server/apiFallback.test.mjs`

Historical implementation specifications and plans remain unchanged because they record the earlier migration decision rather than the current deployment target.

No password, Cookie value, raw session token, or VPS secret is written to the repository.

## Verification

The focused regression tests must prove:

- `.env.example` names `SITE_URL=https://kitepop.top` and no longer names the previous production origin.
- Nginx has two HTTPS blocks: `www.kitepop.top` redirects and `kitepop.top` proxies.
- The deployment runbook checks the live `www` redirect against `https://kitepop.top`.
- Current deployment documentation consistently names the new canonical origin.

Then run:

```powershell
npm test -- --run server/apiFallback.test.mjs
npm test -- --run
npm run build
git diff --check
```

Validate all Bash blocks and inline Node heredocs in `docs/admin-auth-deployment.md` after editing.

## Deployment Boundary

This repository change prepares and documents the repair but does not mutate the VPS by itself. Applying the fix online still requires updating the service environment, installing the matching Nginx site, running `nginx -t`, reloading Nginx, restarting `kitepop-blog.service`, and executing the documented authentication smoke test.
