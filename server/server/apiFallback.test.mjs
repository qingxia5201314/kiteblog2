import { access, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { apiNotFound } from './middleware/apiNotFound.mjs';
import { hydrateAuth } from './middleware/auth.mjs';
import { createOriginGuard } from './middleware/origin.mjs';

describe('API fallback', () => {
  it('returns a JSON 404 before the SPA fallback handles page routes', async () => {
    const app = new Hono();
    app.all('/api/*', apiNotFound);
    app.get('*', (c) => c.html('<div id="root"></div>'));

    const apiResponse = await app.request('/api/unknown');
    const pageResponse = await app.request('/unknown-page');

    expect(apiResponse.status).toBe(404);
    expect(apiResponse.headers.get('content-type')).toContain('application/json');
    expect(await apiResponse.json()).toEqual({ ok: false, message: 'API route not found' });
    expect(pageResponse.status).toBe(200);
  });
});

describe('server auth wiring', () => {
  it('initializes users before the migration and all remaining stores', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const database = source.indexOf('database = await createSqliteDatabase');
    const preflight = source.indexOf('const adminCount = productionAdminCount(database)');
    const userStore = source.indexOf('const userStore = createUserStore({ database })');
    const migration = source.indexOf('runAdminAuthMigration({');
    const postStore = source.indexOf('const store = await createPostStore({ database })');

    expect(source).toContain(
      "import { ADMIN_AUTH_MIGRATION_NAME, runAdminAuthMigration } from './migrations/adminAuthMigration.mjs'",
    );
    expect(database).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(database);
    expect(userStore).toBeGreaterThan(preflight);
    expect(migration).toBeGreaterThan(userStore);
    expect(postStore).toBeGreaterThan(migration);
    expect(source).toContain('requireSingleAdmin: production');
  });

  it('injects unified auth dependencies before origin, hydration, and API routes', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const databaseInjection = source.indexOf("c.set('database', database)");
    const dependencyInjection = source.indexOf("c.set('authConfig', authConfig)");
    const origin = source.indexOf("app.use('/api/*', originGuard)");
    const hydration = source.indexOf("app.use('/api/*', hydrateAuth)");
    const routes = source.indexOf("app.route('/api/admin', adminRoutes)");

    expect(source).toContain("import { createLoginRateLimiter } from './loginRateLimit.mjs'");
    expect(source).toContain("import { createOriginGuard, parseOriginList } from './middleware/origin.mjs'");
    expect(source).toContain("import { hydrateAuth } from './middleware/auth.mjs'");
    expect(source).toContain("import { writeSecurityEvent } from './securityLog.mjs'");
    expect(source).toMatch(/const authConfig = \{[\s\S]*secureCookies: production,[\s\S]*siteUrl: String\(process\.env\.SITE_URL \|\| ''\),[\s\S]*trustProxy: process\.env\.TRUST_PROXY === '1'[\s\S]*\}/);
    expect(source).toContain('const loginRateLimiter = createLoginRateLimiter()');
    expect(source).toMatch(/const originGuard = createOriginGuard\(\{\s*production,\s*siteUrl,\s*extraOrigins: parseOriginList\(process\.env\.EXTRA_TRUSTED_ORIGINS\)\s*\}\)/);
    expect(databaseInjection).toBeGreaterThanOrEqual(0);
    expect(source).toContain("c.set('loginRateLimiter', loginRateLimiter)");
    expect(source).toContain("c.set('securityLog', writeSecurityEvent)");
    expect(dependencyInjection).toBeGreaterThan(databaseInjection);
    expect(origin).toBeGreaterThan(dependencyInjection);
    expect(hydration).toBeGreaterThan(origin);
    expect(routes).toBeGreaterThan(hydration);
  });

  it('marks authenticated API responses private without changing public route cache directives', async () => {
    const source = await readFile('server/index.mjs', 'utf8');
    const hydration = source.indexOf("app.use('/api/*', hydrateAuth)");
    const privateCache = source.indexOf("app.use('/api/*', authenticatedResponseCache)", hydration);
    const routes = source.indexOf("app.route('/api/admin', adminRoutes)");

    expect(privateCache).toBeGreaterThan(hydration);
    expect(privateCache).toBeLessThan(routes);
    expect(source).toContain("c.header('Cache-Control', PUBLIC_FEED_CACHE)");
    expect(source).toContain("c.header('Cache-Control', PUBLIC_DYNAMIC_CACHE)");
  });

  it('has no legacy auth construction, secrets, or context keys', async () => {
    const source = await readFile('server/index.mjs', 'utf8');

    expect(source).not.toMatch(/createAdminSession|createAdminSessions|createAccountingSessions/);
    expect(source).not.toMatch(/adminPassword|ADMIN_PASSWORD|accountingSessions/);
    await expect(access('server/adminSession.mjs')).rejects.toThrow();
    await expect(access('server/adminSession.test.mjs')).rejects.toThrow();
    await expect(access('server/accountingSession.mjs')).rejects.toThrow();
    await expect(access('server/auth.mjs')).rejects.toThrow();
    await expect(access('server/auth.test.mjs')).rejects.toThrow();
  });

  it('rejects a production cross-origin write before querying the session database', async () => {
    const verifySession = vi.fn(() => null);
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      c.set('authConfig', { secureCookies: true, trustProxy: true });
      c.set('userStore', { verifySession });
      await next();
    });
    app.use('/api/*', createOriginGuard({ production: true, siteUrl: 'https://blog.example' }));
    app.use('/api/*', hydrateAuth);
    app.post('/api/write', (c) => c.json({ ok: true }));

    const response = await app.request('/api/write', {
      method: 'POST',
      headers: {
        Cookie: '__Host-kitepop_session=secret-token',
        Origin: 'https://evil.example'
      }
    });

    expect(response.status).toBe(403);
    expect(verifySession).not.toHaveBeenCalled();
  });
});

describe('production environment wiring', () => {
  it('documents the production auth and loopback server settings', async () => {
    const source = await readFile('.env.example', 'utf8');
    const userAuth = await readFile('docs/user-auth.md', 'utf8');
    const refactoringSummary = await readFile('REFACTORING_SUMMARY.md', 'utf8');
    const lines = source.split(/\r?\n/);

    expect(lines).toContain('NODE_ENV=production');
    expect(lines).toContain('SITE_URL=https://kitepop.top');
    expect(lines).toContain('TRUST_PROXY=1');
    expect(lines).toContain('HOST=127.0.0.1');
    expect(lines.filter((line) => line.startsWith('HOST='))).toHaveLength(1);
    expect(source).not.toContain('ADMIN_PASSWORD');
    expect(source).not.toContain('dreamhunter2333.com');
    expect(userAuth).toContain('SITE_URL=https://kitepop.top');
    expect(userAuth).toContain('`www.kitepop.top`');
    expect(refactoringSummary).toContain('`SITE_URL=https://kitepop.top`');
    expect(userAuth).not.toContain('dreamhunter2333.com');
    expect(refactoringSummary).not.toContain('dreamhunter2333.com');
  });

  it('pins proxy identity headers and the backend to loopback', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');

    expect(source).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(source).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(source).toContain('proxy_set_header X-Forwarded-Proto https;');
    expect(source).toContain('proxy_set_header X-Forwarded-Host $host;');
  });

  it('registers only known SPA routes instead of a catch-all index fallback', async () => {
    const source = await readFile('server/index.mjs', 'utf8');

    expect(source).toContain('registerFrontendRoutes(app, serveSpaShell);');
    expect(source).not.toContain("app.get('*', serveStatic");
  });

  it('returns 404 from the default HTTP and HTTPS hosts', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');
    const blocks = source.split(/(?=^server \{)/m);
    const defaults = [
      blocks.find((block) => block.includes('listen 80 default_server;')),
      blocks.find((block) => block.includes('listen 443 ssl http2 default_server;')),
    ];

    expect(defaults[0]).toBeDefined();
    expect(defaults[1]).toBeDefined();
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

    expect(format).toBeDefined();
    expect(format).toContain('$host');
    expect(format).toContain('$request_time');
    expect(format).toContain('$upstream_response_time');
    expect(
      source.match(/access_log \/var\/log\/nginx\/kitepop\.access\.log kitepop_timing;/g),
    ).toHaveLength(5);
  });

  it('redirects the HTTPS www host to the canonical origin before proxying writes', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');
    const runbook = await readFile('docs/admin-auth-deployment.md', 'utf8');
    const httpsBlocks = source
      .split(/(?=^server \{)/m)
      .filter((block) => block.includes('listen 443 ssl http2;'));
    const namedHttpsBlocks = httpsBlocks.filter((block) => !block.includes('default_server'));

    expect(namedHttpsBlocks).toHaveLength(2);
    const wwwBlock = namedHttpsBlocks.find((block) => block.includes('server_name www.kitepop.top;'));
    const apexBlock = namedHttpsBlocks.find((block) => block.includes('server_name kitepop.top;'));

    expect(wwwBlock).toContain('return 301 https://kitepop.top$request_uri;');
    expect(wwwBlock).not.toContain('proxy_pass');
    expect(apexBlock).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(runbook).toContain(
      'test "$WWW_REDIRECT" = "301 https://kitepop.top$WWW_PROBE_PATH"',
    );
    expect(source).not.toContain('dreamhunter2333.com');
    expect(runbook).not.toContain('dreamhunter2333.com');
  });

  it('checks inline authentication environment conflicts before stopping production', async () => {
    const source = await readFile('docs/admin-auth-deployment.md', 'utf8');
    const inlineEnvironmentGuard = source.indexOf(
      "if sudo systemctl cat \"$SERVICE\" | grep -Eq '^[[:space:]]*Environment=.*(ADMIN_PASSWORD|NODE_ENV|SITE_URL|TRUST_PROXY)='; then",
    );
    const stopService = source.indexOf('sudo systemctl stop "$SERVICE"');

    expect(inlineEnvironmentGuard).toBeGreaterThanOrEqual(0);
    expect(stopService).toBeGreaterThan(inlineEnvironmentGuard);
  });

  it('keeps the security headers inside the assets location that overrides add_header inheritance', async () => {
    const source = await readFile('deploy/nginx-kitepop.conf', 'utf8');
    const marker = 'location ^~ /assets/ {';
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    let depth = 0;
    let end = -1;
    for (let index = source.indexOf('{', start); index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
    const assetsLocation = source.slice(start, end + 1);

    expect(assetsLocation).toContain('expires 1y;');
    expect(assetsLocation).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(assetsLocation).toContain('add_header X-Content-Type-Options nosniff always;');
    expect(assetsLocation).toContain('add_header Referrer-Policy strict-origin-when-cross-origin always;');
    expect(assetsLocation).toContain('add_header X-Frame-Options DENY always;');
    expect(assetsLocation).toContain(
      'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;',
    );
  });
});
