# Admin Auth Cookie Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every shared backend/accounting password and browser Bearer token with the existing site accounts, an HttpOnly opaque session Cookie, and server-side `admin` authorization.

**Architecture:** `users` and `user_sessions` become the only identity/session stores. The server hydrates one auth context from a host-only Cookie, applies `requireUser` or `requireAdmin` at route boundaries, and validates Origin on unsafe API methods. The React app stores only the returned user profile, gates all management routes through one component, and never reads or writes an auth token.

**Tech Stack:** Node.js crypto (`scrypt`, `randomBytes`, `timingSafeEqual`), Hono and `hono/cookie`, sql.js/SQLite, React 19, TypeScript, Vitest.

---

## File Structure

New focused server units:

- `server/passwords.mjs`: versioned `scrypt` hashing plus legacy salted SHA-256 verification.
- `server/passwords.test.mjs`: password format and upgrade tests.
- `server/sessionCookie.mjs`: production/development Cookie names and Hono Cookie helpers.
- `server/sessionCookie.test.mjs`: Cookie attribute and deletion tests.
- `server/loginRateLimit.mjs`: in-memory failed-login window.
- `server/loginRateLimit.test.mjs`: keying, expiry, reset, and retry tests.
- `server/securityLog.mjs`: redacted structured security events.
- `server/securityLog.test.mjs`: redaction contract.
- `server/middleware/origin.mjs`: unsafe-method same-origin enforcement.
- `server/middleware/origin.test.mjs`: production and development Origin matrix.
- `server/migrations/adminAuthMigration.mjs`: idempotent legacy-session migration.
- `server/migrations/adminAuthMigration.test.mjs`: admin precondition, cleanup, and idempotence.
- `server/routes/users.test.mjs`: Cookie login/register/me/logout integration tests.

New focused frontend units:

- `src/lib/apiClient.ts`: same-origin fetch wrapper and `401` notification event.
- `src/lib/apiClient.test.ts`: credentials and auth-expiry event tests.
- `src/components/auth/AdminAccessGate.tsx`: loading, login, forbidden, and authorized management-route states.
- `src/components/auth/AdminAccessGate.test.tsx`: role and login-flow tests.

Removed legacy units:

- `server/auth.mjs`
- `server/auth.test.mjs`
- `server/adminSession.mjs`
- `server/adminSession.test.mjs`
- `server/accountingSession.mjs`
- `src/lib/adminSession.ts`
- `src/hooks/useAdminAccess.ts`

Existing files are modified in the task that owns their behavior. Do not mix unrelated refactors into this migration.

### Task 1: Add versioned password hashing

**Files:**
- Create: `server/passwords.mjs`
- Create: `server/passwords.test.mjs`

- [ ] **Step 1: Write failing password-format tests**

```js
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.mjs';

function legacyHash(password, salt = '00112233445566778899aabbccddeeff') {
  const digest = createHash('sha256').update(`${salt}:${password}`, 'utf8').digest('hex');
  return `${salt}:${digest}`;
}

describe('password hashing', () => {
  it('writes and verifies a versioned scrypt hash', async () => {
    const stored = await hashPassword('secret123');
    expect(stored).toMatch(/^scrypt\$v1\$32768\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword('secret123', stored)).resolves.toEqual({ valid: true, needsRehash: false });
    await expect(verifyPassword('wrong', stored)).resolves.toEqual({ valid: false, needsRehash: false });
  });

  it('accepts legacy salted SHA-256 only for migration', async () => {
    const stored = legacyHash('secret123');
    await expect(verifyPassword('secret123', stored)).resolves.toEqual({ valid: true, needsRehash: true });
    await expect(verifyPassword('wrong', stored)).resolves.toEqual({ valid: false, needsRehash: false });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npm test -- --run server/passwords.test.mjs`

Expected: FAIL because `server/passwords.mjs` does not exist.

- [ ] **Step 3: Implement asynchronous scrypt and legacy verification**

```js
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function safeHexEqual(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(String(password), salt, KEY_LENGTH, PARAMS);
  return `scrypt$v1$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const value = String(stored || '');
  if (value.startsWith('scrypt$')) {
    const [algorithm, version, n, r, p, salt, expected] = value.split('$');
    if (algorithm !== 'scrypt' || version !== 'v1' || !salt || !expected) return { valid: false, needsRehash: false };
    if (Number(n) !== PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p) return { valid: false, needsRehash: false };
    const derived = await scrypt(String(password), salt, expected.length / 2, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
    return { valid: safeHexEqual(Buffer.from(derived).toString('hex'), expected), needsRehash: false };
  }

  const [salt, expected] = value.split(':');
  if (!salt || !expected) return { valid: false, needsRehash: false };
  const actual = createHash('sha256').update(`${salt}:${password}`, 'utf8').digest('hex');
  const valid = safeHexEqual(actual, expected);
  return { valid, needsRehash: valid };
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run server/passwords.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the password primitive**

```bash
git add server/passwords.mjs server/passwords.test.mjs
git commit -m "feat: add versioned password hashing"
```

### Task 2: Make `userStore` the complete session and authorization store

**Files:**
- Modify: `server/userStore.mjs`
- Modify: `server/userStore.test.mjs`

- [ ] **Step 1: Replace the store tests with async password, session, revocation, and last-admin cases**

Add tests that use these exact public methods:

```js
const registration = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
expect(store.verifySession(registration.token)?.user.id).toBe(registration.user.id);
expect(store.verifySession(registration.token)?.expiresAt).toBe('2026-07-14T00:00:00.000Z');

store.revokeSession(registration.token);
expect(store.verifySession(registration.token)).toBeNull();

const admin = await store.createUser({ username: 'admin01', password: 'secret123', nickname: 'Admin', permission: 'admin' });
expect(() => store.updateUser(admin.id, { permission: 'reader' })).toThrowError(expect.objectContaining({ code: 'LAST_ADMIN' }));
expect(() => store.removeUser(admin.id)).toThrowError(expect.objectContaining({ code: 'LAST_ADMIN' }));

const secondAdmin = await store.createUser({ username: 'admin02', password: 'secret123', nickname: 'Admin 2', permission: 'admin' });
const secondSession = await store.login({ username: secondAdmin.username, password: 'secret123' });
store.updateUser(secondAdmin.id, { permission: 'reader' });
expect(store.verifySession(secondSession.token)).toBeNull();
```

For legacy migration, insert `00112233445566778899aabbccddeeff:6f6beac610fbdc3b8c523f493dcc3f7235c8c908663b46e17b49bfbbbf175ca9` for a fixture whose password is `secret123`, call `await store.login({ username: 'legacy01', password: 'secret123' })`, then select `password_hash` with `SELECT password_hash FROM users WHERE username = 'legacy01'` and assert it starts with `scrypt$v1$`.

- [ ] **Step 2: Run the store tests and verify the API mismatch**

Run: `npm test -- --run server/userStore.test.mjs`

Expected: FAIL because `verifySession`, `revokeSession`, and last-admin protection are not implemented.

- [ ] **Step 3: Replace password/session internals and expose the new store contract**

Import `hashPassword` and `verifyPassword` from `./passwords.mjs`. Make `insertUser`, `register`, `createUser`, and `login` async. The returned store contract must be:

```js
return {
  listUsers,
  register: async ({ username, password, nickname }) => issueSession(await insertUser({ username, password, nickname, permission: 'reader' })),
  createUser: async (draft) => insertUser(draft),
  login,
  verifySession,
  revokeSession,
  revokeUserSessions,
  updateUser,
  removeUser
};
```

Implement session lookup and revocation using raw tokens only at the store boundary:

```js
function verifySession(token = '') {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = rows(db, 'SELECT * FROM user_sessions WHERE token_hash = ?', [tokenHash])[0];
  if (!session) return null;
  if (Date.parse(session.expires_at) <= now().getTime()) {
    db.run('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]);
    database.persist();
    return null;
  }
  const user = getById(session.user_id);
  return user ? { user, expiresAt: session.expires_at } : null;
}

function revokeSession(token = '') {
  if (!token) return;
  db.run('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(token)]);
  database.persist();
}

function revokeUserSessions(userId) {
  db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
  database.persist();
}
```

Use one transaction for role changes and deletion. Before changing an admin to reader or deleting an admin, run `SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'`; throw an error with `code = 'LAST_ADMIN'` and `status = 409` when the count is one. Revoke all target-user sessions only when permission changes or the user is removed.

- [ ] **Step 4: Run password and store tests together**

Run: `npm test -- --run server/passwords.test.mjs server/userStore.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the unified user store**

```bash
git add server/userStore.mjs server/userStore.test.mjs
git commit -m "feat: unify user and session storage"
```

### Task 3: Add the idempotent production migration

**Files:**
- Create: `server/migrations/adminAuthMigration.mjs`
- Create: `server/migrations/adminAuthMigration.test.mjs`

- [ ] **Step 1: Write migration tests**

Create fixtures with `users`, `user_sessions`, `admin_sessions`, and `accounting_sessions`. Assert this matrix:

```js
const result = runAdminAuthMigration({ database, now: () => new Date('2026-07-15T00:00:00.000Z'), requireSingleAdmin: true });
expect(result).toEqual({ applied: true, adminCount: 1 });
expect(tableExists(database.db, 'admin_sessions')).toBe(false);
expect(tableExists(database.db, 'accounting_sessions')).toBe(false);
expect(countRows(database.db, 'user_sessions')).toBe(0);

expect(runAdminAuthMigration({ database, requireSingleAdmin: true })).toEqual({ applied: false, adminCount: 1 });
expect(() => runAdminAuthMigration({ database: zeroAdminDatabase, requireSingleAdmin: true })).toThrow(/exactly one admin/i);
expect(() => runAdminAuthMigration({ database: twoAdminDatabase, requireSingleAdmin: true })).toThrow(/exactly one admin/i);
```

- [ ] **Step 2: Run migration tests**

Run: `npm test -- --run server/migrations/adminAuthMigration.test.mjs`

Expected: FAIL because the migration module is missing.

- [ ] **Step 3: Implement the migration transaction**

```js
const MIGRATION = '2026-07-15-admin-auth-cookie';

function scalar(db, sql) {
  const statement = db.prepare(sql);
  try {
    if (!statement.step()) return 0;
    return Number(Object.values(statement.getAsObject())[0] || 0);
  } finally {
    statement.free();
  }
}

export function runAdminAuthMigration({ database, now = () => new Date(), requireSingleAdmin = false }) {
  const { db } = database;
  db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = scalar(db, `SELECT COUNT(*) FROM schema_migrations WHERE name = '${MIGRATION}'`) > 0;
  const adminCount = scalar(db, "SELECT COUNT(*) FROM users WHERE permission = 'admin'");
  if (applied) return { applied: false, adminCount };
  if (requireSingleAdmin && adminCount !== 1) throw new Error(`Admin auth migration requires exactly one admin; found ${adminCount}`);

  database.transaction(() => {
    db.run('DELETE FROM user_sessions');
    db.run('DROP TABLE IF EXISTS admin_sessions');
    db.run('DROP TABLE IF EXISTS accounting_sessions');
    db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [MIGRATION, now().toISOString()]);
    database.persist();
  });
  return { applied: true, adminCount };
}
```

- [ ] **Step 4: Run migration and user-store tests**

Run: `npm test -- --run server/migrations/adminAuthMigration.test.mjs server/userStore.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the migration and cleanup**

```bash
git add server/migrations
git commit -m "feat: migrate legacy authentication storage"
```

### Task 4: Add Cookie session hydration

**Files:**
- Create: `server/sessionCookie.mjs`
- Create: `server/sessionCookie.test.mjs`
- Modify: `server/middleware/auth.mjs`
- Create: `server/middleware/auth.test.mjs`

- [ ] **Step 1: Write Cookie and role-matrix tests**

Use a Hono test app and assert Cookie hydration separately from the final admin role matrix, which Task 7 installs atomically with the route fixtures:

```js
expect(productionSessionCookieName(true)).toBe('__Host-kitepop_session');
expect(productionSessionCookieName(false)).toBe('kitepop_dev_session');

const anonymous = await app.request('/user');
expect(anonymous.status).toBe(401);

const reader = await app.request('/user', { headers: { Cookie: 'kitepop_dev_session=reader-token' } });
expect(reader.status).toBe(200);

const admin = await app.request('/user', { headers: { Cookie: 'kitepop_dev_session=admin-token' } });
expect(admin.status).toBe(200);
expect(await admin.json()).toMatchObject({ userId: 'admin-id' });
```

For a production login response, assert `set-cookie` contains `__Host-kitepop_session=`, `Path=/`, `Max-Age=2592000`, `HttpOnly`, `Secure`, and `SameSite=Lax`, and does not contain `Domain=`.

- [ ] **Step 2: Run the middleware tests**

Run: `npm test -- --run server/sessionCookie.test.mjs server/middleware/auth.test.mjs`

Expected: FAIL because Cookie helpers and hydrated auth do not exist.

- [ ] **Step 3: Implement Cookie helpers and hydrated auth**

Use `getCookie`, `setCookie`, and `deleteCookie` from `hono/cookie`. Export this contract:

```js
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const productionSessionCookieName = (secure) => secure ? '__Host-kitepop_session' : 'kitepop_dev_session';

function cookieOptions(c) {
  return {
    path: '/',
    httpOnly: true,
    secure: c.get('authConfig').secureCookies,
    sameSite: 'Lax',
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

export function readSessionCookie(c) {
  const name = productionSessionCookieName(c.get('authConfig').secureCookies);
  return getCookie(c, name) || '';
}

export function writeSessionCookie(c, token) {
  const name = productionSessionCookieName(c.get('authConfig').secureCookies);
  setCookie(c, name, token, cookieOptions(c));
}

export function clearSessionCookie(c) {
  const name = productionSessionCookieName(c.get('authConfig').secureCookies);
  deleteCookie(c, name, { path: '/', secure: c.get('authConfig').secureCookies });
}
```

Add these exports to `server/middleware/auth.mjs` while retaining the legacy `requireAdmin`, `isAdmin`, `requireAccounting`, and `getAccountingAuth` exports until Task 7 changes all route fixtures in the same commit:

```js
import { readSessionCookie } from '../sessionCookie.mjs';

export async function hydrateAuth(c, next) {
  const token = readSessionCookie(c);
  c.set('authToken', token);
  c.set('authSession', c.get('userStore').verifySession(token));
  await next();
}

export function currentUser(c) {
  return c.get('authSession')?.user || null;
}

export function requireUser(c, next) {
  if (!currentUser(c)) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  return next();
}
```

- [ ] **Step 4: Run middleware tests**

Run: `npm test -- --run server/sessionCookie.test.mjs server/middleware/auth.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Cookie authentication**

```bash
git add server/sessionCookie.mjs server/sessionCookie.test.mjs server/middleware/auth.mjs server/middleware/auth.test.mjs
git commit -m "feat: authenticate requests with secure cookies"
```

### Task 5: Add Origin defense, login limiting, and security logs

**Files:**
- Create: `server/middleware/origin.mjs`
- Create: `server/middleware/origin.test.mjs`
- Create: `server/loginRateLimit.mjs`
- Create: `server/loginRateLimit.test.mjs`
- Create: `server/securityLog.mjs`
- Create: `server/securityLog.test.mjs`

- [ ] **Step 1: Write the security-control tests**

Origin matrix:

```js
expect((await productionApp.request('/api/test', { method: 'POST', headers: { Origin: 'https://blog.example' } })).status).toBe(204);
expect((await productionApp.request('/api/test', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status).toBe(403);
expect((await productionApp.request('/api/test', { method: 'POST' })).status).toBe(403);
expect((await productionApp.request('/api/test')).status).toBe(204);
```

Limiter matrix with `maxFailures: 5`:

```js
for (let index = 0; index < 5; index += 1) limiter.recordFailure('203.0.113.8', 'admin');
expect(limiter.check('203.0.113.8', 'ADMIN')).toEqual({ allowed: false, retryAfterSeconds: 900 });
limiter.clear('203.0.113.8', 'admin');
expect(limiter.check('203.0.113.8', 'admin')).toEqual({ allowed: true, retryAfterSeconds: 0 });
```

Logger assertion:

```js
writeSecurityEvent({ type: 'login_failure', username: 'admin', ip: '203.0.113.8', password: 'secret', token: 'raw' }, sink);
expect(sink.mock.calls[0][0]).not.toContain('secret');
expect(sink.mock.calls[0][0]).not.toContain('raw');
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- --run server/middleware/origin.test.mjs server/loginRateLimit.test.mjs server/securityLog.test.mjs`

Expected: FAIL because all three modules are missing.

- [ ] **Step 3: Implement the three controls**

Implement the Origin guard as:

```js
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createOriginGuard({ production, siteUrl }) {
  const expectedOrigin = siteUrl ? new URL(siteUrl).origin : '';
  if (production && !expectedOrigin) throw new Error('SITE_URL is required in production');

  return async function originGuard(c, next) {
    if (SAFE_METHODS.has(c.req.method.toUpperCase())) return next();
    const supplied = c.req.header('origin') || '';
    if (!supplied && !production) return next();
    let origin = '';
    try {
      origin = new URL(supplied).origin;
    } catch {
      return c.json({ ok: false, message: 'Forbidden' }, 403);
    }
    const allowed = production ? expectedOrigin : new URL(c.req.url).origin;
    if (origin !== allowed) return c.json({ ok: false, message: 'Forbidden' }, 403);
    return next();
  };
}
```

Implement the limiter as:

```js
export function createLoginRateLimiter({ now = Date.now, windowMs = 15 * 60 * 1000, maxFailures = 5 } = {}) {
  const attempts = new Map();
  const keyOf = (ip, username) => `${String(ip || 'direct')}\n${String(username || '').trim().toLowerCase()}`;

  function check(ip, username) {
    const key = keyOf(ip, username);
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now()) {
      attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.failures < maxFailures) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)) };
  }

  function recordFailure(ip, username) {
    const key = keyOf(ip, username);
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now()) attempts.set(key, { failures: 1, resetAt: now() + windowMs });
    else entry.failures += 1;
  }

  function clear(ip, username) {
    attempts.delete(keyOf(ip, username));
  }

  return { check, recordFailure, clear };
}
```

`writeSecurityEvent(event, sink = console.info)` must allow only these output fields:

```js
const safe = {
  timestamp: event.timestamp || new Date().toISOString(),
  type: String(event.type || 'unknown'),
  result: String(event.result || ''),
  userId: String(event.userId || ''),
  username: String(event.username || '').toLowerCase(),
  ip: String(event.ip || '')
};
sink(JSON.stringify(safe));
```

- [ ] **Step 4: Run the focused security tests**

Run: `npm test -- --run server/middleware/origin.test.mjs server/loginRateLimit.test.mjs server/securityLog.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit security controls**

```bash
git add server/middleware/origin.mjs server/middleware/origin.test.mjs server/loginRateLimit.mjs server/loginRateLimit.test.mjs server/securityLog.mjs server/securityLog.test.mjs
git commit -m "feat: harden authentication requests"
```

### Task 6: Convert user routes to Cookie sessions

**Files:**
- Modify: `server/routes/users.mjs`
- Create: `server/routes/users.test.mjs`

- [ ] **Step 1: Write integration tests for register, login, me, logout, and rate limiting**

Build a Hono fixture that injects `userStore`, `authConfig`, `loginRateLimiter`, and a mocked security-log sink, then runs `hydrateAuth` before `usersRoutes`. Assert:

```js
const login = await app.request('/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
  body: JSON.stringify({ username: 'admin01', password: 'secret123' })
});
expect(login.status).toBe(200);
const payload = await login.json();
expect(payload).toMatchObject({ ok: true, user: { username: 'admin01', permission: 'admin' } });
expect(JSON.stringify(payload)).not.toContain('token');

const cookie = login.headers.get('set-cookie');
const me = await app.request('/api/users/me', { headers: { Cookie: cookie } });
expect(me.status).toBe(200);

const logout = await app.request('/api/users/logout', {
  method: 'POST', headers: { Cookie: cookie, Origin: 'http://localhost' }
});
expect(logout.status).toBe(200);
expect((await app.request('/api/users/me', { headers: { Cookie: cookie } })).status).toBe(401);
```

Also assert a sixth failed login returns `429` with `Retry-After`, successful login clears the limiter, and login failures never reveal whether a username exists.

- [ ] **Step 2: Run the route test**

Run: `npm test -- --run server/routes/users.test.mjs`

Expected: FAIL because routes still return Bearer tokens and have no logout.

- [ ] **Step 3: Implement the new route contract**

Use `writeSessionCookie` after awaited `register` and `login`; return `{ ok: true, user, expiresAt }` only. `/me` reads `c.get('authSession')`. `/logout` revokes `c.get('authToken')`, clears the Cookie, logs the event, and returns `{ ok: true }` even when the session is already absent.

Before password verification, call:

```js
const username = String(body.username || '').trim().toLowerCase();
const ip = c.get('authConfig').trustProxy ? String(c.req.header('x-real-ip') || '') : 'direct';
const limit = c.get('loginRateLimiter').check(ip, username);
if (!limit.allowed) {
  c.header('Retry-After', String(limit.retryAfterSeconds));
  return c.json({ ok: false, message: '登录尝试过于频繁，请稍后再试' }, 429);
}
```

On a credential error, record a failure and always return `401 { ok: false, message: '用户名或密码错误' }`. On success, clear the key and write a `login_success` security event.

- [ ] **Step 4: Run user route and store tests**

Run: `npm test -- --run server/routes/users.test.mjs server/userStore.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Cookie user routes**

```bash
git add server/routes/users.mjs server/routes/users.test.mjs
git commit -m "feat: issue cookie user sessions"
```

### Task 7: Replace every backend shared-password authorization boundary

**Files:**
- Modify: `server/middleware/auth.mjs`
- Modify: `server/routes/admin.mjs`
- Modify: `server/routes/accounting.mjs`
- Modify: `server/routes/posts.mjs`
- Modify: `server/routes/revisions.mjs`
- Modify: `server/routes/files.mjs`
- Modify: `server/routes/images.mjs`
- Modify: `server/routes/folders.mjs`
- Modify: `server/previewRoutes.test.mjs`
- Modify: `server/scheduledRoutes.test.mjs`
- Modify: `server/revisionsRoutes.test.mjs`
- Modify: `server/postsRoutes.test.mjs`
- Modify: `server/imagesRoutes.test.mjs`
- Modify: `server/fileRangeResponses.test.mjs`
- Modify: `server/routes/aboutRoutes.test.mjs`
- Create: `server/routes/accountingRoutes.test.mjs`

- [ ] **Step 1: Change route fixtures to the three-role auth matrix**

Each protected route fixture injects `authSession` instead of a mocked admin/accounting session store:

```js
app.use('*', async (c, next) => {
  c.set('authSession', role === 'anonymous' ? null : {
    user: { id: `${role}-id`, username: role, nickname: role, permission: role },
    expiresAt: '2026-08-14T00:00:00.000Z'
  });
  await next();
});
```

For at least one route in every management group, assert anonymous `401`, reader `403`, and admin success. Assert `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/accounting/login`, and `GET /api/accounting/session` are absent.

- [ ] **Step 2: Run the affected backend route tests**

Run: `npm test -- --run server/previewRoutes.test.mjs server/scheduledRoutes.test.mjs server/revisionsRoutes.test.mjs server/postsRoutes.test.mjs server/imagesRoutes.test.mjs server/fileRangeResponses.test.mjs server/routes/aboutRoutes.test.mjs server/routes/accountingRoutes.test.mjs`

Expected: FAIL because routes still depend on Bearer token stores.

- [ ] **Step 3: Replace route authorization and audit identities**

Delete `/login` and `/session` handlers from `admin.mjs` and `accounting.mjs`. Add `app.use('*', requireAdmin)` at the top of accounting routes. Keep `requireAdmin` on admin routes.

Delete the legacy session-store implementations of `requireAdmin`, `isAdmin`, `requireAccounting`, and `getAccountingAuth`. Keep `hydrateAuth`, `currentUser`, and `requireUser` from Task 4, then add the final role checks:

```js
function auditDenied(c, user, result) {
  const write = c.get('securityLog');
  write?.({
    type: 'admin_access_denied',
    result,
    userId: user?.id || '',
    ip: c.get('authConfig')?.trustProxy ? String(c.req.header('x-real-ip') || '') : 'direct'
  });
}

export function requireAdmin(c, next) {
  const user = currentUser(c);
  if (!user) {
    auditDenied(c, null, 'unauthorized');
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }
  if (user.permission !== 'admin') {
    auditDenied(c, user, 'forbidden');
    return c.json({ ok: false, message: 'Forbidden' }, 403);
  }
  return next();
}

export function isAdmin(c) {
  return currentUser(c)?.permission === 'admin';
}
```

In write operations, replace fixed editor IDs with the hydrated user:

```js
const editorUserId = currentUser(c).id;
const post = postService.createPost(body, { editorUserId });
const updated = postService.updatePost(id, body, { editorUserId });
```

In comment routes, replace `userStore.verify(c.req.header('Authorization') || '')` with `currentUser(c)`. Keep the existing ownership rule: an admin or the comment owner may update/delete.

The file, folder, and image modules may retain `isAdmin(c)` calls because `isAdmin` now reads the hydrated Cookie identity.

Because `createUser` now performs asynchronous `scrypt`, change the admin user-creation handler to `const user = await userStore.createUser(body)` before calling `c.json`. Registration and login handlers must likewise await their store calls.

Map `LAST_ADMIN` errors from user updates/deletes to `409`; keep validation errors at `400` and missing users at `404`.

After a successful permission change or user deletion, call `c.get('securityLog')` with `type` set to `permission_change` or `user_delete`, the acting administrator ID in `userId`, and a result string containing only the target user ID and resulting permission. Do not log request bodies.

- [ ] **Step 4: Run all backend route tests**

Run: `npm test -- --run server/previewRoutes.test.mjs server/scheduledRoutes.test.mjs server/revisionsRoutes.test.mjs server/postsRoutes.test.mjs server/imagesRoutes.test.mjs server/fileRangeResponses.test.mjs server/routes/aboutRoutes.test.mjs server/routes/accountingRoutes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit backend authorization replacement**

```bash
git add server/middleware/auth.mjs server/routes/admin.mjs server/routes/accounting.mjs server/routes/posts.mjs server/routes/revisions.mjs server/routes/files.mjs server/routes/images.mjs server/routes/folders.mjs server/previewRoutes.test.mjs server/scheduledRoutes.test.mjs server/revisionsRoutes.test.mjs server/postsRoutes.test.mjs server/imagesRoutes.test.mjs server/fileRangeResponses.test.mjs server/routes/aboutRoutes.test.mjs server/routes/accountingRoutes.test.mjs
git commit -m "feat: authorize management routes by user role"
```

### Task 8: Wire migration and security middleware into the server

**Files:**
- Modify: `server/index.mjs`
- Modify: `server/accountingStore.mjs`
- Modify: `server/accountingStore.test.mjs`
- Modify: `.env.example`
- Modify: `deploy/nginx-kitepop.conf`
- Modify: `server/apiFallback.test.mjs`
- Delete: `server/adminSession.mjs`
- Delete: `server/adminSession.test.mjs`
- Delete: `server/accountingSession.mjs`
- Delete: `server/auth.mjs`
- Delete: `server/auth.test.mjs`

- [ ] **Step 1: Add a source-level wiring regression test**

Extend `server/apiFallback.test.mjs` with assertions that `server/index.mjs`:

```js
expect(source).toContain('runAdminAuthMigration');
expect(source).toContain("app.use('/api/*', originGuard)");
expect(source).toContain("app.use('/api/*', hydrateAuth)");
expect(source).not.toContain('createAdminSessions');
expect(source).not.toContain('createAccountingSessions');
expect(source).not.toContain('ADMIN_PASSWORD');
```

- [ ] **Step 2: Run the wiring test**

Run: `npm test -- --run server/apiFallback.test.mjs`

Expected: FAIL on the new assertions.

- [ ] **Step 3: Update server initialization order and configuration**

Initialize in this order:

```js
const database = await createSqliteDatabase({ dbPath: postDbPath });
const userStore = createUserStore({ database });
runAdminAuthMigration({ database, requireSingleAdmin: process.env.NODE_ENV === 'production' });
const authConfig = {
  secureCookies: process.env.NODE_ENV === 'production',
  siteUrl: String(process.env.SITE_URL || ''),
  trustProxy: process.env.TRUST_PROXY === '1'
};
const loginRateLimiter = createLoginRateLimiter();
const originGuard = createOriginGuard({ production: process.env.NODE_ENV === 'production', siteUrl: authConfig.siteUrl });
```

Inject `database`, `userStore`, `authConfig`, and `loginRateLimiter`. Register `originGuard` before `hydrateAuth`, and both before all API routes. Remove `adminPassword`, admin sessions, and accounting sessions from imports and context.

Inject `securityLog: writeSecurityEvent` into context. Remove `accounting_sessions` from `accountingStore.mjs` schema initialization and remove its `createSession`, `getSession`, `removeExpiredSessions`, and `debugListSessions` methods. Update `accountingStore.test.mjs` to cover only entries, categories, and settings. Delete the five legacy auth/session modules listed in this task.

Set `Cache-Control: private, no-store` on `/api/users/*` and authenticated management responses. Keep public content cache behavior unchanged.

Replace `.env.example` auth values with:

```dotenv
NODE_ENV=production
SITE_URL=https://dreamhunter2333.com
TRUST_PROXY=1
```

Keep the existing port, database, upload, and image settings. In Nginx, continue overwriting `X-Real-IP` from `$remote_addr`; do not forward a client-provided value.

- [ ] **Step 4: Run backend tests and a production-config startup smoke test against a temporary copied database**

Run: `npm test -- --run server/apiFallback.test.mjs server/migrations/adminAuthMigration.test.mjs server/routes/users.test.mjs server/accountingStore.test.mjs`

Expected: PASS.

Run the application smoke test only with a temporary database containing exactly one admin; do not point this command at `data/blog.sqlite`:

```powershell
$smokeDb = Join-Path $env:TEMP 'kitepop-auth-smoke.sqlite'
$env:SMOKE_DB = $smokeDb
@'
import fs from 'node:fs';
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL, role TEXT NOT NULL, permission TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE user_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  );
`);
db.run(
  'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ['smoke-admin', 'smoke_admin', 'legacy:not-used', 'Smoke Admin', 'admin', 'admin', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z']
);
fs.writeFileSync(process.env.SMOKE_DB, Buffer.from(db.export()));
db.close();
'@ | node --input-type=module -

$env:NODE_ENV = 'production'
$env:SITE_URL = 'https://dreamhunter2333.com'
$env:TRUST_PROXY = '1'
$env:POST_DB_PATH = $smokeDb
$env:PORT = '3099'
$server = Start-Process node -ArgumentList 'server/index.mjs' -PassThru -WindowStyle Hidden
try {
  $status = ''
  for ($attempt = 0; $attempt -lt 20 -and $status -ne '401'; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    $status = curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3099/api/users/me
  }
  if ($status -ne '401') { throw "Auth smoke check returned HTTP $status" }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $smokeDb -Force -ErrorAction SilentlyContinue
}
```

Expected: server starts on `127.0.0.1:3099`, applies the migration once, and `/api/users/me` returns `401` without a Cookie. The `finally` block stops the process and removes the temporary database.

- [ ] **Step 5: Commit server wiring**

```bash
git add server/index.mjs server/apiFallback.test.mjs server/accountingStore.mjs server/accountingStore.test.mjs .env.example deploy/nginx-kitepop.conf
git rm server/adminSession.mjs server/adminSession.test.mjs server/accountingSession.mjs server/auth.mjs server/auth.test.mjs
git commit -m "feat: enable unified auth at server startup"
```

### Task 9: Introduce frontend session state and the admin route gate

**Files:**
- Create: `src/lib/apiClient.ts`
- Create: `src/lib/apiClient.test.ts`
- Modify: `src/lib/blog.ts`
- Modify: `src/context/AppContext.tsx`
- Create: `src/components/auth/AdminAccessGate.tsx`
- Create: `src/components/auth/AdminAccessGate.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/ToolMenu.tsx`
- Delete: `src/lib/adminSession.ts`
- Delete: `src/hooks/useAdminAccess.ts`

- [ ] **Step 1: Write API-client, context, and gate tests**

`apiFetch` test:

```ts
await apiFetch('/api/test', { method: 'POST' });
expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({ credentials: 'same-origin', method: 'POST' }));

fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
const listener = vi.fn();
window.addEventListener(AUTH_EXPIRED_EVENT, listener);
await apiFetch('/api/private');
expect(listener).toHaveBeenCalledOnce();
```

Gate matrix:

```tsx
expect(renderGate({ authReady: false }).getByRole('status')).toHaveTextContent('正在确认登录状态');
expect(renderGate({ authReady: true, userSession: null }).getByRole('button', { name: '登录' })).toBeInTheDocument();
expect(renderGate({ authReady: true, userSession: readerSession }).getByText('当前账号没有管理员权限')).toBeInTheDocument();
expect(renderGate({ authReady: true, userSession: adminSession }).getByText('protected child')).toBeInTheDocument();
```

- [ ] **Step 2: Run the frontend auth tests**

Run: `npm test -- --run src/lib/apiClient.test.ts src/components/auth/AdminAccessGate.test.tsx`

Expected: FAIL because both units are missing.

- [ ] **Step 3: Implement token-free app state and route gating**

Change `UserSession` to:

```ts
export interface UserSession {
  expiresAt: string;
  user: BlogUser;
}
```

`AppContext` must expose:

```ts
interface AppContextType {
  authReady: boolean;
  userSession: UserSession | null;
  isAdmin: boolean;
  loginUser: (session: UserSession) => void;
  logoutUser: () => Promise<void>;
}
```

Implement the shared request wrapper as:

```ts
export const AUTH_EXPIRED_EVENT = 'kitepop:auth-expired';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: 'same-origin' });
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  return response;
}
```

The gate login branch must submit the existing account credentials and reject readers without rendering children:

```tsx
const { authReady, userSession, loginUser, logoutUser } = useApp();
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');

const submit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setError('');
  try {
    const session = await loginUserRequest(username, password);
    loginUser(session);
    if (session.user.permission !== 'admin') setError('当前账号没有管理员权限');
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : '登录失败');
  }
};

if (!authReady) return <div role="status">正在确认登录状态</div>;
if (userSession?.user.permission === 'admin') return <>{children}</>;
if (userSession) return (
  <section className="unlock-panel">
    <h1>无权访问</h1>
    <p>当前账号没有管理员权限</p>
    <button onClick={() => void logoutUser()} type="button">退出当前账号</button>
  </section>
);
return (
  <form className="unlock-panel" onSubmit={submit}>
    <h1>管理员登录</h1>
    <label>
      用户名
      <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} />
    </label>
    <label>
      密码
      <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
    </label>
    {error ? <p className="auth-feedback error">{error}</p> : null}
    <button type="submit">登录</button>
  </form>
);
```

On mount, remove `kitepop-admin-session`, `kitepop-user-session`, and `kitepop-accounting-session`, then call `/api/users/me`. Listen for `AUTH_EXPIRED_EVENT` and clear `userSession`. `logoutUser` calls `POST /api/users/logout` before clearing state.

Wrap these routes in `AdminAccessGate`: `/admin`, `/admin/preview/:id`, `/accounting`, `/images`, `/files`, and `/files/preview`. The gate submits username/password to `loginUserRequest`; after login it renders children only when `session.user.permission === 'admin'`.

Set `toolsUnlocked` from `isAdmin`, not from any logged-in reader.

- [ ] **Step 4: Run frontend auth tests and type checking**

Run: `npm test -- --run src/lib/apiClient.test.ts src/components/auth/AdminAccessGate.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: FAIL only in remaining token-based callers, which Tasks 10 and 11 remove. Record the error list in the task log; do not weaken types.

- [ ] **Step 5: Commit the frontend auth boundary**

```bash
git add src/lib/apiClient.ts src/lib/apiClient.test.ts src/lib/blog.ts src/context/AppContext.tsx src/components/auth src/App.tsx src/components/Layout.tsx src/components/ToolMenu.tsx
git rm src/lib/adminSession.ts src/hooks/useAdminAccess.ts
git commit -m "feat: gate management routes by admin account"
```

### Task 10: Remove Bearer parameters from every frontend API client

**Files:**
- Modify: `src/lib/blogApi.ts`
- Modify: `src/lib/blogApi.test.ts`
- Modify: `src/lib/accountingApi.ts`
- Modify: `src/lib/accountingApi.test.ts`
- Modify: `src/lib/fileApi.ts`
- Modify: `src/lib/fileApi.test.ts`
- Modify: `src/lib/imageApi.ts`
- Modify: `src/lib/imageApi.test.ts`
- Modify: `src/lib/aboutApi.ts`
- Modify: `src/lib/aboutApi.test.ts`
- Modify: `src/lib/uploadProgress.ts`
- Modify: `src/lib/uploadProgress.test.ts`
- Modify: `src/features/editor/api/editorWorkflowApi.ts`
- Modify: `src/features/editor/editorWorkflow.test.tsx`

- [ ] **Step 1: Change API tests to require Cookie credentials and forbid Authorization**

For JSON/fetch requests use this assertion pattern:

```ts
expect(fetchMock).toHaveBeenCalledWith('/api/admin/about', {
  method: 'PUT',
  credentials: 'same-origin',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(profile)
});
expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
```

For XHR upload tests assert `xhr.withCredentials === true` and no Authorization request header.

- [ ] **Step 2: Run all API-client tests and verify failures**

Run: `npm test -- --run src/lib/blogApi.test.ts src/lib/accountingApi.test.ts src/lib/fileApi.test.ts src/lib/imageApi.test.ts src/lib/aboutApi.test.ts src/lib/uploadProgress.test.ts src/features/editor/editorWorkflow.test.tsx`

Expected: FAIL on token arguments and Authorization headers.

- [ ] **Step 3: Convert every exported API signature**

Use `apiFetch` for fetch requests. Remove token parameters from these contracts:

```ts
createPost(draft)
listPosts({ includeDrafts, summary })
getPost(idOrSlug)
updatePost(id, patch)
deletePost(id)
getArticleAutosaveDraft()
saveArticleAutosaveDraft(draft)
clearArticleAutosaveDraft()
getArticlePreview(id)
createPostComment(postIdOrSlug, draft)
updatePostComment(postIdOrSlug, commentId, content)
deletePostComment(postIdOrSlug, commentId)
registerUser({ username, password, nickname })
loginUser(username, password)
getCurrentUser(): Promise<UserSession>
logoutUserRequest()
listUsers()
createUser(draft)
updateUser(id, patch)
deleteUser(id)

getAccountingMonth({ month, type, category })
createAccountingEntry(draft)
updateAccountingEntry(id, draft)
deleteAccountingEntry(id)
createAccountingCategory(draft)
updateAccountingCategory(id, draft)
deleteAccountingCategory(id)
updateAccountingSettings(draft)

getFileFolderView(folderId)
listUploadedFiles()
uploadFile(file, folderId, onProgress)
createFileFolder(input)
renameFileFolder(id, name)
deleteFileFolder(id)
createFileLink(id)
getFilePreviewLink(id)
deleteUploadedFile(id)

listHostedImages()
uploadHostedImage(file, onProgress)
deleteHostedImage(id)

getAdminAboutProfile()
updateAboutProfile(profile)
listRevisions(postId)
compareRevision(postId, revisionId)
restoreRevision(postId, revisionId)
deleteRevision(postId, revisionId)
schedulePost(postId, scheduledAt)
cancelSchedule(postId)
retrySchedule(postId)
```

Delete `loginAccounting`. Set `xhr.withCredentials = true` in `uploadFormDataWithProgress` and pass no auth headers.

- [ ] **Step 4: Run all API-client tests**

Run: `npm test -- --run src/lib/blogApi.test.ts src/lib/accountingApi.test.ts src/lib/fileApi.test.ts src/lib/imageApi.test.ts src/lib/aboutApi.test.ts src/lib/uploadProgress.test.ts src/features/editor/editorWorkflow.test.tsx`

Expected: PASS and no request contains Authorization.

- [ ] **Step 5: Commit token-free clients**

```bash
git add src/lib/blogApi.ts src/lib/blogApi.test.ts src/lib/accountingApi.ts src/lib/accountingApi.test.ts src/lib/fileApi.ts src/lib/fileApi.test.ts src/lib/imageApi.ts src/lib/imageApi.test.ts src/lib/aboutApi.ts src/lib/aboutApi.test.ts src/lib/uploadProgress.ts src/lib/uploadProgress.test.ts src/features/editor/api/editorWorkflowApi.ts src/features/editor/editorWorkflow.test.tsx
git commit -m "refactor: remove bearer tokens from api clients"
```

### Task 11: Remove token state from hooks and management pages

**Files:**
- Modify: `src/context/BlogDataContext.tsx`
- Modify: `src/hooks/useAccounting.ts`
- Modify: `src/hooks/useFiles.ts`
- Modify: `src/hooks/useImages.ts`
- Modify: `src/features/editor/hooks/useDraftAutosave.ts`
- Modify: `src/features/editor/hooks/useRevisionHistory.ts`
- Modify: `src/features/editor/hooks/useMarkdownEditor.ts`
- Modify: `src/features/editor/draftRecovery.test.tsx`
- Modify: `src/features/editor/hooks/useMarkdownEditor.test.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/pages/AccountingPage.tsx`
- Modify: `src/pages/ImagesPage.tsx`
- Modify: `src/pages/FilesPage.tsx`
- Modify: `src/pages/ArticlePreviewPage.tsx`
- Modify: `src/components/admin/AboutManager.tsx`
- Modify: `src/components/admin/AboutManager.test.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/pages/ArticlePreviewPage.test.tsx`

- [ ] **Step 1: Add application regressions for all three removed localStorage sessions**

In `src/App.test.tsx`, preload all legacy keys, render the app, and assert cleanup:

```ts
window.localStorage.setItem('kitepop-admin-session', '{"token":"old-admin"}');
window.localStorage.setItem('kitepop-user-session', '{"token":"old-user"}');
window.localStorage.setItem('kitepop-accounting-session', '{"token":"old-accounting"}');
render(<App />);
await waitFor(() => expect(window.localStorage.getItem('kitepop-admin-session')).toBeNull());
expect(window.localStorage.getItem('kitepop-user-session')).toBeNull();
expect(window.localStorage.getItem('kitepop-accounting-session')).toBeNull();
```

Add route tests proving an anonymous user sees the account form, a reader sees the forbidden state, and an admin loads data on `/admin`, `/accounting`, `/images`, and `/files` without a second login.

- [ ] **Step 2: Run page and hook tests**

Run: `npm test -- --run src/App.test.tsx src/pages/ArticlePreviewPage.test.tsx src/components/admin/AboutManager.test.tsx src/features/editor/draftRecovery.test.tsx src/features/editor/hooks/useMarkdownEditor.test.tsx`

Expected: FAIL because pages and hooks still require tokens.

- [ ] **Step 3: Remove token arguments and local unlock forms**

Apply these exact hook contracts:

```ts
useAccounting(notify)
useFiles(notify)
useImages(notify)
useDraftAutosave({ enabled, editingId, draft, changeVersion, onBoundEditingId, onSaved })
useRevisionHistory(postId)
useMarkdownEditor({ content, updateForm, notify })
```

`BlogDataContext.loadPosts(includeDrafts = isAdmin)` calls `listPosts({ includeDrafts, summary: !includeDrafts })` without a token.

Delete page-local password fields, unlock handlers, token state, and `localStorage` accounting helpers. Management pages can assume `AdminAccessGate` has authorized rendering. Keep page-specific empty, loading, upload-progress, and error states.

`AdminPage` passes no token to post, revision, draft, user, About, image, or scheduling APIs. `ArticlePreviewPage` directly calls `getArticlePreview(id)` after route gating. `HomePage` uses `isAdmin` for edit controls and passes no token to comment APIs.

- [ ] **Step 4: Run focused tests, type checking, and token search**

Run: `npm test -- --run src/App.test.tsx src/pages/ArticlePreviewPage.test.tsx src/components/admin/AboutManager.test.tsx src/features/editor/draftRecovery.test.tsx src/features/editor/hooks/useMarkdownEditor.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `rg -n "Authorization|Bearer|adminToken|accountingToken|kitepop-(admin|user|accounting)-session" src`

Expected: only deliberate legacy-key cleanup assertions and explanatory test names; no request header or token state remains.

- [ ] **Step 5: Commit page and hook migration**

```bash
git add src/context/BlogDataContext.tsx src/hooks/useAccounting.ts src/hooks/useFiles.ts src/hooks/useImages.ts src/features/editor/hooks/useDraftAutosave.ts src/features/editor/hooks/useRevisionHistory.ts src/features/editor/hooks/useMarkdownEditor.ts src/features/editor/draftRecovery.test.tsx src/features/editor/hooks/useMarkdownEditor.test.tsx src/pages/AdminPage.tsx src/pages/AccountingPage.tsx src/pages/ImagesPage.tsx src/pages/FilesPage.tsx src/pages/ArticlePreviewPage.tsx src/components/admin/AboutManager.tsx src/components/admin/AboutManager.test.tsx src/pages/HomePage.tsx src/App.test.tsx src/pages/ArticlePreviewPage.test.tsx
git commit -m "refactor: use cookie auth across management ui"
```

### Task 12: Update documentation and run complete verification

**Files:**
- Modify: `docs/user-auth.md`
- Modify: `REFACTORING_SUMMARY.md`
- Create: `docs/admin-auth-deployment.md`
- Modify: `progress.md`

- [ ] **Step 1: Update auth and deployment documentation**

Document these exact operational points:

```markdown
- `POST /api/users/login` and `POST /api/users/register` set an HttpOnly session Cookie and never return a token.
- `POST /api/users/logout` revokes the current session.
- `GET /api/users/me` restores the current identity.
- `permission = 'admin'` is required for backend, accounting, image, file, About, draft, revision, scheduling, and user-management APIs.
- Production requires `NODE_ENV=production`, `SITE_URL=https://dreamhunter2333.com`, and `TRUST_PROXY=1` behind the checked-in Nginx proxy.
- `ADMIN_PASSWORD` is removed.
```

`docs/admin-auth-deployment.md` must include the read-only admin query, database backup/hash commands, build/restart steps, Cookie/role/old-token checks, and rollback from the paired code/database backup.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test -- --run`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Run security residue and formatting checks**

Run:

```powershell
rg -n "ADMIN_PASSWORD|verifyAdminPassword|createAdminSessions|createAccountingSessions|Authorization:\s*`?Bearer|kitepop-accounting-session" server src .env.example REFACTORING_SUMMARY.md docs\user-auth.md
git diff --check
```

Expected: no runtime use of removed shared-password/Bearer authentication; the only old localStorage-key references are the intentional one-time cleanup and its tests; `git diff --check` is silent.

- [ ] **Step 4: Perform the local three-role smoke test**

Using a temporary database and local server, verify:

```text
anonymous  -> /api/admin/about = 401
reader     -> /api/admin/about = 403
admin      -> /api/admin/about = 200
cross-site admin PUT            = 403
same-site admin PUT             = 200
logout then replay Cookie       = 401
old Bearer token only           = 401
```

Capture status codes without recording Cookie contents.

- [ ] **Step 5: Commit documentation and final verified state**

```bash
git add docs/user-auth.md docs/admin-auth-deployment.md REFACTORING_SUMMARY.md progress.md
git commit -m "docs: document unified admin authentication"
```

## VPS Deployment Gate

Do not deploy until all Task 12 checks pass. On the VPS:

1. Stop the service.
2. Resolve the actual `POST_DB_PATH` from the service environment.
3. Run `SELECT id, username, nickname FROM users WHERE permission = 'admin';` and require exactly one row.
4. Copy the database and current application release to timestamped backups and record SHA-256 hashes.
5. Deploy the matching frontend/backend release, set `NODE_ENV=production`, `SITE_URL`, and `TRUST_PROXY=1`, then restart.
6. Log in with the existing administrator account and verify backend, accounting, images, files, article editing, and logout.
7. Verify a reader receives `403`, old passwords/tokens cannot authorize, Cookie flags are correct, and logs contain no credentials.
8. If any gate fails, stop the new service and restore both the prior application release and the paired database snapshot.
