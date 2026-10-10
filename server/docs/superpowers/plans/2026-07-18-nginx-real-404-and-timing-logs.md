# Real 404 Responses and Timing Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return genuine 404 responses for unknown blog paths and unknown hosts, and record host plus request/upstream timing without changing API upstream behavior.

**Architecture:** Register only the finite set of client-side SPA paths and remove the Node catch-all index fallback, allowing Hono to return 404 for unknown paths. Add Nginx default HTTP/HTTPS virtual hosts that return 404 and a named timing log format used by all non-asset site servers; retain the canonical catch-all proxy so API requests still reach Node unchanged.

**Tech Stack:** Node.js ESM, Hono, Vitest, Nginx

---

### Task 1: Make frontend fallback routes explicit

**Files:**
- Create: `server/frontendRoutes.mjs`
- Create: `server/frontendRoutes.test.mjs`
- Modify: `server/index.mjs`
- Modify: `server/apiFallback.test.mjs`

- [ ] **Step 1: Write the failing route tests**

Create `server/frontendRoutes.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerFrontendRoutes } from './frontendRoutes.mjs';

const knownRoutes = [
  '/accounting', '/about', '/files', '/files/preview',
  '/images', '/admin', '/admin/preview/42',
];

describe('frontend route fallback', () => {
  it.each(knownRoutes)('serves the SPA shell for %s', async (path) => {
    const app = new Hono();
    registerFrontendRoutes(app, (c) => c.html('<div id="root"></div>'));
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
  });

  it('returns a genuine 404 for an unknown blog path', async () => {
    const app = new Hono();
    registerFrontendRoutes(app, (c) => c.html('<div id="root"></div>'));
    expect((await app.request('/definitely-not-a-blog-route')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run `npx vitest run server/frontendRoutes.test.mjs`.

Expected: FAIL because `server/frontendRoutes.mjs` does not exist.

- [ ] **Step 3: Add the minimal route registrar**

Create `server/frontendRoutes.mjs`:

```js
export const frontendRoutePaths = [
  '/accounting',
  '/about',
  '/files',
  '/files/preview',
  '/images',
  '/admin',
  '/admin/preview/:id',
];

export function registerFrontendRoutes(app, serveSpaShell) {
  for (const path of frontendRoutePaths) app.get(path, serveSpaShell);
}
```

- [ ] **Step 4: Run the test and confirm GREEN**

Run `npx vitest run server/frontendRoutes.test.mjs`.

Expected: all eight cases PASS.

- [ ] **Step 5: Write a failing production-wiring assertion**

Append inside the existing `production environment wiring` block in `server/apiFallback.test.mjs`:

```js
  it('registers only known SPA routes instead of a catch-all index fallback', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    expect(source).toContain('registerFrontendRoutes(app, serveSpaShell);');
    expect(source).not.toContain("app.get('*', serveStatic");
  });
```

- [ ] **Step 6: Run the wiring assertion and confirm RED**

Run `npx vitest run server/apiFallback.test.mjs -t "registers only known SPA routes"`.

Expected: FAIL because `server/index.mjs` still contains the catch-all index fallback.

- [ ] **Step 7: Wire the registrar into production**

Import the module in `server/index.mjs`:

```js
import { registerFrontendRoutes } from './frontendRoutes.mjs';
```

Replace the final catch-all GET with:

```js
const serveSpaShell = serveStatic({ root: './dist', rewriteRequestPath: () => '/index.html' });
registerFrontendRoutes(app, serveSpaShell);
```

Do not move or modify `app.all('/api/*', apiNotFound)` or any API middleware/router.

- [ ] **Step 8: Run focused regression tests**

Run `npx vitest run server/frontendRoutes.test.mjs server/apiFallback.test.mjs`.

Expected: both files PASS, including the existing unknown-API JSON 404 test.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- server/frontendRoutes.mjs server/frontendRoutes.test.mjs server/index.mjs server/apiFallback.test.mjs
git commit -m "fix: return 404 for unknown blog routes"
```

### Task 2: Reject unknown hosts and add timing logs

**Files:**
- Modify: `server/apiFallback.test.mjs`
- Modify: `deploy/nginx-kitepop.conf`

- [ ] **Step 1: Write failing Nginx contract tests**

Append inside `production environment wiring` in `server/apiFallback.test.mjs`:

```js
  it('returns 404 from the default HTTP and HTTPS hosts', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');
    const blocks = source.split(/(?=^server \{)/m);
    const defaults = [
      blocks.find((block) => block.includes('listen 80 default_server;')),
      blocks.find((block) => block.includes('listen 443 ssl http2 default_server;')),
    ];
    for (const block of defaults) {
      expect(block).toContain('server_name _;');
      expect(block).toContain('return 404;');
      expect(block).not.toContain('proxy_pass');
      expect(block).not.toContain('return 301');
    }
  });

  it('logs host and request timing for site traffic', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');
    const format = source.match(/log_format kitepop_timing([\s\S]*?);/)?.[0];
    expect(format).toContain('$host');
    expect(format).toContain('$request_time');
    expect(format).toContain('$upstream_response_time');
    expect(source.match(/access_log \/var\/log\/nginx\/kitepop\.access\.log kitepop_timing;/g)).toHaveLength(5);
  });
```

In the existing HTTPS canonical-origin test, filter out the new default block before asserting the count and finding the named hosts:

```js
const namedHttpsBlocks = httpsBlocks.filter((block) => !block.includes('default_server'));
expect(namedHttpsBlocks).toHaveLength(2);
const wwwBlock = namedHttpsBlocks.find((block) => block.includes('server_name www.kitepop.top;'));
const apexBlock = namedHttpsBlocks.find((block) => block.includes('server_name kitepop.top;'));
```

- [ ] **Step 2: Run the new tests and confirm RED**

Run `npx vitest run server/apiFallback.test.mjs -t "default HTTP and HTTPS hosts|logs host and request timing"`.

Expected: both tests FAIL because the defaults and log format are absent.

- [ ] **Step 3: Implement the Nginx configuration**

Add at the top of `deploy/nginx-kitepop.conf`:

```nginx
log_format kitepop_timing '$remote_addr - $host [$time_local] "$request" '
                           '$status $body_bytes_sent "$http_referer" "$http_user_agent" '
                           'rt=$request_time urt=$upstream_response_time';

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    access_log /var/log/nginx/kitepop.access.log kitepop_timing;
    return 404;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;
    ssl_certificate /etc/letsencrypt/live/kitepop.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kitepop.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    access_log /var/log/nginx/kitepop.access.log kitepop_timing;
    return 404;
}
```

Add this after `server_name` in each of the three existing named servers:

```nginx
access_log /var/log/nginx/kitepop.access.log kitepop_timing;
```

Keep `access_log off;` in the immutable assets location.

- [ ] **Step 4: Run the Nginx contract suite and confirm GREEN**

Run `npx vitest run server/apiFallback.test.mjs`.

Expected: all API fallback and Nginx tests PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- deploy/nginx-kitepop.conf server/apiFallback.test.mjs
git commit -m "fix: reject unknown hosts and log request timing"
```

### Task 3: Complete verification

**Files:**
- Verify only

- [ ] **Step 1: Run all tests**

Run `npm test -- --run`.

Expected: every test file PASS with zero failures.

- [ ] **Step 2: Build production assets**

Run `npm run build`.

Expected: TypeScript checking and Vite build complete successfully.

- [ ] **Step 3: Verify patch integrity**

Run `git diff --check` and `git status --short`.

Expected: no whitespace errors and a clean worktree after the two implementation commits.

- [ ] **Step 4: Inspect commit scope**

Run `git log -3 --oneline`.

Expected: the design commit followed by the frontend-routing and Nginx commits, with no unrelated files.
