# Kitepop Canonical Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale production origin with `https://kitepop.top`, redirect `www.kitepop.top` to the apex site, and keep authentication Origin validation aligned with the deployed hostname.

**Architecture:** Keep the existing single-origin CSRF boundary and secure Cookie model unchanged. Update the production environment example, Nginx canonical-host configuration, deployment runbook, and active documentation as one coherent deployment contract; lock the contract with source-level regression tests.

**Tech Stack:** Nginx, systemd environment files, Hono Origin middleware, Vitest, PowerShell, Bash syntax validation.

---

## File Structure

- `server/apiFallback.test.mjs`: deployment-contract regression assertions.
- `.env.example`: canonical production `SITE_URL`.
- `deploy/nginx-kitepop.conf`: HTTP and HTTPS host routing plus certificate paths.
- `docs/admin-auth-deployment.md`: service environment update, live redirect probe, and production authentication origin.
- `docs/user-auth.md`: current operator-facing authentication contract.
- `docs/seo-performance-notes.md`: current hostname and certificate deployment note.
- `REFACTORING_SUMMARY.md`: current environment-variable reference.
- `progress.md`: implementation evidence and deployment boundary.

### Task 1: Lock and implement the canonical production origin

**Files:**
- Modify: `server/apiFallback.test.mjs`
- Modify: `.env.example`
- Modify: `deploy/nginx-kitepop.conf`
- Modify: `docs/admin-auth-deployment.md`

- [ ] **Step 1: Change the deployment regression assertions first**

Update the production environment assertion to:

```js
expect(lines).toContain('SITE_URL=https://kitepop.top');
expect(source).not.toContain('dreamhunter2333.com');
```

Update the Nginx and runbook assertions to:

```js
const wwwBlock = httpsBlocks.find((block) => block.includes('server_name www.kitepop.top;'));
const apexBlock = httpsBlocks.find((block) => block.includes('server_name kitepop.top;'));

expect(wwwBlock).toContain('return 301 https://kitepop.top$request_uri;');
expect(wwwBlock).not.toContain('proxy_pass');
expect(apexBlock).toContain('proxy_pass http://127.0.0.1:3000;');
expect(runbook).toContain(
  'test "$WWW_REDIRECT" = "301 https://kitepop.top$WWW_PROBE_PATH"',
);
expect(source).not.toContain('dreamhunter2333.com');
expect(runbook).not.toContain('dreamhunter2333.com');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- --run server/apiFallback.test.mjs -t "production environment wiring"
```

Expected: FAIL because the active environment example, Nginx configuration, and deployment runbook still name the previous production origin.

- [ ] **Step 3: Update the active production configuration**

Set `.env.example` to:

```dotenv
NODE_ENV=production
SITE_URL=https://kitepop.top
TRUST_PROXY=1
```

In `deploy/nginx-kitepop.conf`, use these host and certificate values consistently:

```nginx
server_name kitepop.top www.kitepop.top;
return 301 https://kitepop.top$request_uri;

server_name www.kitepop.top;
ssl_certificate /etc/letsencrypt/live/kitepop.top/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/kitepop.top/privkey.pem;
return 301 https://kitepop.top$request_uri;

server_name kitepop.top;
ssl_certificate /etc/letsencrypt/live/kitepop.top/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/kitepop.top/privkey.pem;
```

In `docs/admin-auth-deployment.md`, replace the current production origin with `https://kitepop.top` in:

- the environment-file update and verification;
- the live `www` redirect probe;
- the Node authentication smoke-test `origin` constant.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- --run server/apiFallback.test.mjs -t "production environment wiring"
```

Expected: PASS.

- [ ] **Step 5: Commit the production-origin contract**

```powershell
git add .env.example deploy/nginx-kitepop.conf docs/admin-auth-deployment.md server/apiFallback.test.mjs
git commit -m "fix: use kitepop production origin"
```

### Task 2: Synchronize active documentation and final verification

**Files:**
- Modify: `server/apiFallback.test.mjs`
- Modify: `docs/user-auth.md`
- Modify: `docs/seo-performance-notes.md`
- Modify: `REFACTORING_SUMMARY.md`
- Modify: `progress.md`

- [ ] **Step 1: Add active-document consistency assertions first**

Extend the production environment test with:

```js
const userAuth = await readFile('docs/user-auth.md', 'utf8');
const refactoringSummary = await readFile('REFACTORING_SUMMARY.md', 'utf8');

expect(userAuth).toContain('SITE_URL=https://kitepop.top');
expect(userAuth).toContain('`www.kitepop.top`');
expect(refactoringSummary).toContain('`SITE_URL=https://kitepop.top`');
expect(userAuth).not.toContain('dreamhunter2333.com');
expect(refactoringSummary).not.toContain('dreamhunter2333.com');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- --run server/apiFallback.test.mjs -t "documents the production auth"
```

Expected: FAIL because the active authentication documentation still names the previous origin.

- [ ] **Step 3: Update the active documentation**

- In `docs/user-auth.md`, set the production origin to `https://kitepop.top` and describe `www.kitepop.top` redirecting to the apex host.
- In `docs/seo-performance-notes.md`, record `kitepop.top` as the current deployment hostname and use this certificate command:

```bash
certbot certonly --webroot -w /var/www/certbot -d kitepop.top -d www.kitepop.top
```

- In `REFACTORING_SUMMARY.md`, change the `SITE_URL` reference to `https://kitepop.top`.
- In `progress.md`, append a dated entry recording the confirmed stale-Origin failure, the canonical-origin correction, tests, and the fact that repository changes do not themselves modify the VPS.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm test -- --run server/apiFallback.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Validate the deployment runbook syntax**

Extract all fenced Bash blocks from `docs/admin-auth-deployment.md` and run each through Git Bash `bash -n`. Extract both `node --input-type=module <<'NODE'` heredocs and run each through:

```powershell
node --input-type=module --check -
```

Expected: all 7 Bash blocks and both Node heredocs pass.

- [ ] **Step 6: Run complete verification**

Run:

```powershell
npm test -- --run
npm run build
rg -n "dreamhunter2333\.com|SITE_URL=http://104\.244\.91\.222" .env.example deploy docs/user-auth.md docs/admin-auth-deployment.md docs/seo-performance-notes.md REFACTORING_SUMMARY.md
git diff --check
```

Expected: all tests and the build pass; the stale production origins have no matches in active deployment files; negative assertions in `server/apiFallback.test.mjs` intentionally retain the old hostname string; `git diff --check` is silent.

- [ ] **Step 7: Commit the documentation and verified state**

```powershell
git add docs/user-auth.md docs/seo-performance-notes.md REFACTORING_SUMMARY.md progress.md server/apiFallback.test.mjs
git commit -m "docs: align authentication with kitepop domain"
```
