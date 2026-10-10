import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoginRateLimiter } from '../loginRateLimit.mjs';
import { hydrateAuth } from '../middleware/auth.mjs';
import { createOriginGuard } from '../middleware/origin.mjs';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createUserStore } from '../userStore.mjs';
import { usersRoutes } from './users.mjs';

const CREDENTIALS_MESSAGE = '用户名或密码错误';
const RATE_LIMIT_MESSAGE = '登录尝试过于频繁，请稍后再试';
const REGISTRATION_RATE_LIMIT_MESSAGE = '注册尝试过于频繁，请稍后再试';
const REGISTRATION_VALIDATION_MESSAGE = '注册信息格式错误';
const PRIVATE_NO_STORE = 'private, no-store';
const JSON_BODY_LIMIT_BYTES = 16 * 1024;

let database;
let events;
let store;
let tempDir;

function createFixture({
  authConfig = { secureCookies: false, trustProxy: false },
  limiter = createLoginRateLimiter({ now: () => 1_000 }),
  securityLog = (event) => events.push(event),
  userStore = store,
} = {}) {
  const app = new Hono();
  app.use('/api/users/*', async (c, next) => {
    c.set('authConfig', authConfig);
    c.set('loginRateLimiter', limiter);
    c.set('securityLog', securityLog);
    c.set('userStore', userStore);
    await next();
  });
  app.use('/api/users/*', createOriginGuard({ production: false }));
  app.use('/api/users/*', hydrateAuth);
  app.route('/api/users', usersRoutes);
  return app;
}

function jsonRequest(path, body, { headers = {}, method = 'POST' } = {}) {
  return [
    `http://localhost${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
  ];
}

function nodeEnv(remoteAddress) {
  return remoteAddress === undefined
    ? {}
    : {
        incoming: {
          socket: {
            remoteAddress,
            remotePort: 43_210,
            remoteFamily: remoteAddress.includes(':') ? 'IPv6' : 'IPv4',
          },
        },
      };
}

function cookiePair(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0] || '';
}

function expectPrivateNoStore(response) {
  expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-user-routes-'));
  database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createUserStore({ database, now: () => new Date('2026-07-15T00:00:00.000Z') });
  events = [];
});

afterEach(async () => {
  database.db.close();
  await rm(tempDir, { force: true, recursive: true });
});

describe('users routes', () => {
  it('registers through the async store and returns only the public session shape in a hardened cookie', async () => {
    const app = createFixture();
    const response = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'Reader_01',
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );

    expect(response.status).toBe(201);
    expectPrivateNoStore(response);
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie');
    const rawToken = cookiePair(response).split('=')[1];
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({ username: 'Reader_01', nickname: 'Reader', permission: 'reader' }),
      expiresAt: '2026-08-14T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(setCookie).toMatch(/^kitepop_dev_session=[^;]+;/);
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
    expect(events).toEqual([
      {
        type: 'registration_success',
        result: 'success',
        userId: body.user.id,
        username: 'reader_01',
        ip: 'unknown',
      },
    ]);
  });

  it('keeps successful registration, login, and logout responses when security logging throws', async () => {
    const securityLog = vi.fn(() => {
      throw new Error('security logger unavailable');
    });
    const app = createFixture({ securityLog });

    const registration = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'reader01',
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );
    const login = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'registration-secret' }),
    );
    const logout = await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: cookiePair(login) },
    });

    expect(registration.status).toBe(201);
    expect(login.status).toBe(200);
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    expect(securityLog.mock.calls.map(([event]) => event.type)).toEqual([
      'registration_success',
      'login_success',
      'logout',
    ]);
  });

  it('preserves the original credential failure when security logging throws', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture({
      securityLog: () => {
        throw new Error('security logger unavailable');
      },
    });

    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
  });

  it('keeps auth responses and handles rejected asynchronous security logs', async () => {
    const unhandledRejections = [];
    const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
    const loggerPromises = [];
    const securityEvents = [];
    class ObservedRejectedPromise extends Promise {
      rejectionHandled = false;

      then(onFulfilled, onRejected) {
        if (typeof onRejected === 'function') this.rejectionHandled = true;
        return super.then(onFulfilled, onRejected);
      }
    }
    const securityLog = (event) => {
      securityEvents.push(event);
      const promise = new ObservedRejectedPromise((_, reject) => {
        reject(new Error('security logger unavailable'));
      });
      loggerPromises.push(promise);
      return promise;
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const app = createFixture({ securityLog });
      const registration = await app.request(
        ...jsonRequest('/api/users/register', {
          username: 'reader01',
          password: 'registration-secret',
          nickname: 'Reader',
        }),
      );
      const login = await app.request(
        ...jsonRequest('/api/users/login', { username: 'reader01', password: 'registration-secret' }),
      );
      const failure = await app.request(
        ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
      );
      const logout = await app.request('http://localhost/api/users/logout', {
        method: 'POST',
        headers: { Cookie: cookiePair(login) },
      });
      const rejectionHandling = loggerPromises.map((promise) => promise.rejectionHandled);
      await Promise.allSettled(loggerPromises);
      await new Promise((resolve) => setImmediate(resolve));

      expect(registration.status).toBe(201);
      expect(login.status).toBe(200);
      expect(failure.status).toBe(401);
      expect(await failure.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
      expect(logout.status).toBe(200);
      expect(await logout.json()).toEqual({ ok: true });
      expect(securityEvents.map((event) => event.type)).toEqual([
        'registration_success',
        'login_success',
        'login_failure',
        'logout',
      ]);
      expect(rejectionHandling).toEqual([true, true, true, true]);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('returns 400 for malformed registration JSON and invalid registration input', async () => {
    const app = createFixture();
    const malformed = await app.request(...jsonRequest('/api/users/register', '{'));
    const invalid = await app.request(
      ...jsonRequest('/api/users/register', { username: 'x', password: 'short' }),
    );

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(await malformed.json()).toEqual({ ok: false, message: '请求格式错误' });
    expect(await invalid.json()).toEqual({
      ok: false,
      message: '用户名需为 3-24 位字母、数字或下划线',
    });
    expectPrivateNoStore(malformed);
    expectPrivateNoStore(invalid);
    expect(malformed.headers.get('set-cookie')).toBeNull();
    expect(invalid.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    '用户名需为 3-24 位字母、数字或下划线',
    '密码至少 6 位',
    '用户名已存在',
  ])('returns only the allowlisted registration business error: %s', async (message) => {
    const app = createFixture({
      userStore: {
        ...store,
        register: vi.fn().mockRejectedValue(new Error(message)),
      },
    });

    const response = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'reader01',
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message });
    expectPrivateNoStore(response);
  });

  it('hides unexpected registration errors and logs only the generic registration error event', async () => {
    const register = vi.fn().mockRejectedValue(new Error('database exploded: internal-secret'));
    const app = createFixture({ userStore: { ...store, register } });
    const response = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'SecretInput',
        password: 'registration-password-marker',
        nickname: 'Nickname Marker',
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '注册失败' });
    expectPrivateNoStore(response);
    expect(events).toEqual([
      {
        type: 'registration_error',
        result: 'error',
        username: 'secretinput',
        ip: 'unknown',
      },
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('internal-secret');
    expect(serialized).not.toContain('registration-password-marker');
    expect(serialized).not.toContain('Nickname Marker');
  });

  it('keeps successful registration reservations and blocks the sixth before entering the store', async () => {
    const baseLimiter = createLoginRateLimiter({ now: () => 1_000 });
    const limiter = {
      reserve: vi.fn((ip, username) => baseLimiter.reserve(ip, username)),
      clear: vi.fn((ip, username) => baseLimiter.clear(ip, username)),
    };
    const register = vi.fn((draft) => store.register(draft));
    const app = createFixture({ limiter, userStore: { ...store, register } });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.request(
        ...jsonRequest('/api/users/register', {
          username: `reader0${attempt}`,
          password: 'registration-secret',
          nickname: `Reader ${attempt}`,
        }),
        nodeEnv('198.51.100.30'),
      );
      expect(response.status).toBe(201);
    }

    const blocked = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'reader06',
        password: 'registration-secret',
        nickname: 'Reader 6',
      }),
      nodeEnv('198.51.100.30'),
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('900');
    expect(await blocked.json()).toEqual({ ok: false, message: REGISTRATION_RATE_LIMIT_MESSAGE });
    expectPrivateNoStore(blocked);
    expect(register).toHaveBeenCalledTimes(5);
    expect(limiter.reserve).toHaveBeenCalledTimes(6);
    expect(limiter.reserve.mock.calls.every(([, username]) => username === '<registration>')).toBe(true);
    expect(limiter.clear).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: 'registration_rate_limited',
      result: 'blocked',
      username: '<registration>',
      ip: '198.51.100.30',
    });
  }, 30_000);

  it('allows only one concurrent registration to enter the store after one reservation', async () => {
    const register = vi.fn(async () => ({
      token: 'registration-session-token',
      user: { id: 'user-1', username: 'reader01', nickname: 'Reader', permission: 'reader' },
      expiresAt: '2026-08-14T00:00:00.000Z',
    }));
    const app = createFixture({
      limiter: createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 }),
      userStore: { ...store, register },
    });

    const responses = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        app.request(
          ...jsonRequest('/api/users/register', {
            username: `reader0${index + 1}`,
            password: 'registration-secret',
            nickname: 'Reader',
          }),
          nodeEnv('198.51.100.31'),
        ),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 429, 429]);
    expect(register).toHaveBeenCalledOnce();
  });

  it('rejects declared login and registration bodies larger than 16 KiB before parsing or reserving', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const register = vi.fn();
    const login = vi.fn();
    const app = createFixture({
      limiter: { reserve, clear: vi.fn() },
      userStore: { ...store, register, login },
    });
    const oversizedHeaders = { 'Content-Length': String(JSON_BODY_LIMIT_BYTES + 1) };

    const registration = await app.request(
      ...jsonRequest('/api/users/register', {}, { headers: oversizedHeaders }),
    );
    const loginResponse = await app.request(
      ...jsonRequest('/api/users/login', {}, { headers: oversizedHeaders }),
    );

    for (const response of [registration, loginResponse]) {
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ ok: false, message: '请求体过大' });
      expectPrivateNoStore(response);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects actual bodies larger than 16 KiB when Content-Length is absent', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const register = vi.fn((draft) => store.register(draft));
    const login = vi.fn((draft) => store.login(draft));
    const app = createFixture({
      limiter: { reserve, clear: vi.fn() },
      userStore: { ...store, register, login },
    });
    const padding = 'x'.repeat(JSON_BODY_LIMIT_BYTES + 1);
    const registrationRequest = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'oversize01',
        password: 'registration-secret',
        nickname: 'Reader',
        padding,
      }),
    });
    const loginRequest = new Request('http://localhost/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reader01', password: 'secret123', padding }),
    });

    expect(registrationRequest.headers.get('content-length')).toBeNull();
    expect(loginRequest.headers.get('content-length')).toBeNull();
    const registration = await app.request(registrationRequest);
    const loginResponse = await app.request(loginRequest);

    for (const response of [registration, loginResponse]) {
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ ok: false, message: '请求体过大' });
      expectPrivateNoStore(response);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects non-string credential objects without coercion or entering the store', async () => {
    const baseLimiter = createLoginRateLimiter({ now: () => 1_000 });
    const reserve = vi.fn((ip, username) => baseLimiter.reserve(ip, username));
    const register = vi.fn();
    const login = vi.fn();
    const app = createFixture({
      limiter: { reserve, clear: vi.fn() },
      userStore: { ...store, register, login },
    });
    const maliciousValue = { toString: null, valueOf: null };

    const registration = await app.request(
      ...jsonRequest('/api/users/register', {
        username: maliciousValue,
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );
    const loginResponse = await app.request(
      ...jsonRequest('/api/users/login', {
        username: maliciousValue,
        password: 'secret123',
      }),
    );

    expect(registration.status).toBe(400);
    expect(await registration.json()).toEqual({ ok: false, message: REGISTRATION_VALIDATION_MESSAGE });
    expect(loginResponse.status).toBe(401);
    expect(await loginResponse.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
    expectPrivateNoStore(registration);
    expectPrivateNoStore(loginResponse);
    expect(reserve.mock.calls).toEqual([
      ['unknown', '<registration>'],
      ['unknown', ''],
    ]);
    expect(register).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects overlong registration fields after reserving but before entering the store', async () => {
    const baseLimiter = createLoginRateLimiter({ now: () => 1_000 });
    const reserve = vi.fn((ip, username) => baseLimiter.reserve(ip, username));
    const register = vi.fn();
    const app = createFixture({
      limiter: { reserve, clear: vi.fn() },
      userStore: { ...store, register },
    });
    const drafts = [
      { username: 'u'.repeat(25), password: 'valid-password', nickname: 'Reader' },
      { username: `reader01${' '.repeat(17)}`, password: 'valid-password', nickname: 'Reader' },
      { username: 'reader01', password: 'p'.repeat(257), nickname: 'Reader' },
      { username: 'reader02', password: 'valid-password', nickname: 'n'.repeat(81) },
      { username: 'reader03', password: 'valid-password', nickname: ' '.repeat(81) },
    ];

    for (const draft of drafts) {
      const response = await app.request(...jsonRequest('/api/users/register', draft));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body).toEqual({ ok: false, message: REGISTRATION_VALIDATION_MESSAGE });
      expectPrivateNoStore(response);
      expect(JSON.stringify(body)).not.toContain(draft.password);
    }

    expect(reserve).toHaveBeenCalledTimes(5);
    expect(register).not.toHaveBeenCalled();
  });

  it('revokes a registration session when writing its cookie fails', async () => {
    const authConfig = { secureCookies: false, trustProxy: false };
    let issuedSession;
    const revokeSession = vi.fn((rawToken) => store.revokeSession(rawToken));
    const register = vi.fn(async (draft) => {
      issuedSession = await store.register(draft);
      authConfig.secureCookies = undefined;
      return issuedSession;
    });
    const app = createFixture({
      authConfig,
      userStore: { ...store, register, revokeSession },
    });

    const response = await app.request(
      ...jsonRequest('/api/users/register', {
        username: 'reader01',
        password: 'registration-secret',
        nickname: 'Reader',
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '注册失败' });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(revokeSession).toHaveBeenCalledWith(issuedSession.token);
    expect(store.verifySession(issuedSession.token)).toBeNull();
  });

  it('logs in with a cookie without returning the raw token', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: ' READER01 ', password: 'secret123' }),
    );

    expect(response.status).toBe(200);
    expectPrivateNoStore(response);
    const body = await response.json();
    const rawToken = cookiePair(response).split('=')[1];
    expect(body).toEqual({
      ok: true,
      user: expect.objectContaining({ username: 'reader01', nickname: 'Reader' }),
      expiresAt: '2026-08-14T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(events).toContainEqual({
      type: 'login_success',
      result: 'success',
      userId: body.user.id,
      username: 'reader01',
      ip: 'unknown',
    });
  });

  it('restores /me from the session cookie and ignores Authorization-only sessions', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const fromCookie = await app.request('http://localhost/api/users/me', {
      headers: { Cookie: `kitepop_dev_session=${session.token}` },
    });
    const fromAuthorization = await app.request('http://localhost/api/users/me', {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    expect(fromCookie.status).toBe(200);
    expect(await fromCookie.json()).toEqual({ ok: true, user: session.user, expiresAt: session.expiresAt });
    expect(fromAuthorization.status).toBe(401);
    expect(await fromAuthorization.json()).toEqual({ ok: false, message: 'Unauthorized' });
    expectPrivateNoStore(fromCookie);
    expectPrivateNoStore(fromAuthorization);
  });

  it('revokes logout sessions, rejects replay, and keeps anonymous logout idempotent', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const cookie = `kitepop_dev_session=${session.token}`;
    const logout = await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const replay = await app.request('http://localhost/api/users/me', { headers: { Cookie: cookie } });
    const anonymous = await app.request('http://localhost/api/users/logout', { method: 'POST' });

    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    expect(logout.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expect(replay.status).toBe(401);
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ ok: true });
    expect(anonymous.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expectPrivateNoStore(logout);
    expectPrivateNoStore(replay);
    expectPrivateNoStore(anonymous);
    expect(events.filter((event) => event.type === 'logout')).toEqual([
      {
        type: 'logout',
        result: 'success',
        userId: session.user.id,
        username: 'reader01',
        ip: 'unknown',
      },
      {
        type: 'logout',
        result: 'anonymous',
        username: '',
        ip: 'unknown',
      },
    ]);
  });

  it('audits invalid-session logout without exposing or retaining the cookie token', async () => {
    const invalidToken = 'invalid-session-token-marker';
    const revokeSession = vi.fn((rawToken) => store.revokeSession(rawToken));
    const app = createFixture({
      userStore: { ...store, revokeSession },
    });

    const response = await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: `kitepop_dev_session=${invalidToken}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expectPrivateNoStore(response);
    expect(revokeSession).toHaveBeenCalledOnce();
    expect(revokeSession).toHaveBeenCalledWith(invalidToken);
    expect(events).toEqual([
      {
        type: 'logout',
        result: 'invalid_session',
        username: '',
        ip: 'unknown',
      },
    ]);
    expect(Object.keys(events[0]).sort()).toEqual(['ip', 'result', 'type', 'username']);
    expect(JSON.stringify(events)).not.toContain(invalidToken);
  });

  it('clears the cookie and audits a generic logout error when session revocation fails', async () => {
    const session = await store.register({
      username: 'reader01',
      password: 'secret123',
      nickname: 'Reader',
    });
    const revokeSession = vi.fn(() => {
      throw new Error(`revoke failed for ${session.token}`);
    });
    const app = createFixture({ userStore: { ...store, revokeSession } });
    const response = await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: `kitepop_dev_session=${session.token}` },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '退出登录失败' });
    expect(response.headers.get('set-cookie')).toMatch(/^kitepop_dev_session=;/);
    expectPrivateNoStore(response);
    expect(revokeSession).toHaveBeenCalledWith(session.token);
    expect(events).toEqual([
      {
        type: 'logout',
        result: 'logout_error',
        userId: session.user.id,
        username: 'reader01',
        ip: 'unknown',
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(session.token);
  });

  it('uses the same 401 response and failure log for unknown users and wrong passwords', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();
    const unknown = await app.request(
      ...jsonRequest('/api/users/login', { username: 'missing', password: 'secret123' }),
    );
    const wrong = await app.request(
      ...jsonRequest('/api/users/login', { username: ' READER01 ', password: 'wrong-password' }),
    );

    for (const response of [unknown, wrong]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
      expectPrivateNoStore(response);
    }
    expect(events).toEqual([
      { type: 'login_failure', result: 'failure', username: 'missing', ip: 'unknown' },
      { type: 'login_failure', result: 'failure', username: 'reader01', ip: 'unknown' },
    ]);
  });

  it('returns 400 for malformed login JSON and generic 401 for missing fields', async () => {
    const app = createFixture();
    const malformed = await app.request(...jsonRequest('/api/users/login', '{'));
    const missing = await app.request(...jsonRequest('/api/users/login', { nickname: 'not-credentials' }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ ok: false, message: '请求格式错误' });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
    expectPrivateNoStore(malformed);
    expectPrivateNoStore(missing);
  });

  it('rejects overlong login credentials generically after reserving and before password verification', async () => {
    const baseLimiter = createLoginRateLimiter({ now: () => 1_000 });
    const reserve = vi.fn((ip, username) => baseLimiter.reserve(ip, username));
    const login = vi.fn();
    const app = createFixture({
      limiter: { reserve, clear: vi.fn() },
      userStore: { ...store, login },
    });
    const drafts = [
      { username: 'u'.repeat(25), password: 'valid-password' },
      { username: 'reader01', password: 'p'.repeat(257) },
    ];

    for (const draft of drafts) {
      const response = await app.request(...jsonRequest('/api/users/login', draft));
      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body).toEqual({ ok: false, message: CREDENTIALS_MESSAGE });
      expectPrivateNoStore(response);
      expect(JSON.stringify(body)).not.toContain(draft.password);
    }

    expect(reserve).toHaveBeenCalledTimes(2);
    expect(login).not.toHaveBeenCalled();
  });

  it('reserves five failed attempts and blocks the sixth with Retry-After', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const app = createFixture();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.request(
        ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
      );
      expect(failed.status).toBe(401);
    }
    const blocked = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('900');
    expect(await blocked.json()).toEqual({ ok: false, message: RATE_LIMIT_MESSAGE });
    expectPrivateNoStore(blocked);
    expect(events.at(-1)).toEqual({
      type: 'login_rate_limited',
      result: 'blocked',
      username: 'reader01',
      ip: 'unknown',
    });
  }, 15_000);

  it('clears the successful login reservation immediately', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const limiter = createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 });
    const app = createFixture({ limiter });
    const success = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );
    const firstFailure = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );
    const blocked = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' }),
    );

    expect(success.status).toBe(200);
    expect(firstFailure.status).toBe(401);
    expect(blocked.status).toBe(429);
  });

  it('allows only one of three concurrent requests to enter password verification', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    let loginCalls = 0;
    const countedStore = {
      ...store,
      async login(draft) {
        loginCalls += 1;
        return store.login(draft);
      },
    };
    const app = createFixture({
      limiter: createLoginRateLimiter({ now: () => 1_000, maxFailures: 1 }),
      userStore: countedStore,
    });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        app.request(...jsonRequest('/api/users/login', { username: 'reader01', password: 'wrong-password' })),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([401, 429, 429]);
    expect(loginCalls).toBe(1);
  });

  it('uses the actual peer address and keeps direct peers in separate limiter buckets', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy: false },
      limiter: { reserve, clear: vi.fn() },
    });
    const first = await app.request(
      ...jsonRequest(
        '/api/users/login',
        { username: ' Mixed_User ', password: 'not-a-secret' },
      ),
      nodeEnv('198.51.100.10'),
    );
    const second = await app.request(
      ...jsonRequest('/api/users/login', { username: ' Mixed_User ', password: 'not-a-secret' }),
      nodeEnv('198.51.100.11'),
    );

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(reserve.mock.calls).toEqual([
      ['198.51.100.10', 'mixed_user'],
      ['198.51.100.11', 'mixed_user'],
    ]);
    expect(events.map((event) => event.ip)).toEqual(['198.51.100.10', '198.51.100.11']);
  });

  it('ignores spoofed proxy headers for direct clients', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy: false },
      limiter: { reserve, clear: vi.fn() },
    });

    await app.request(
      ...jsonRequest(
        '/api/users/login',
        { username: 'reader01', password: 'wrong-password' },
        { headers: { 'X-Real-IP': '203.0.113.44' } },
      ),
      nodeEnv('198.51.100.20'),
    );

    expect(reserve).toHaveBeenCalledWith('198.51.100.20', 'reader01');
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'trusts x-real-ip only from loopback proxy peer %s',
    async (peerAddress) => {
      const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
      const app = createFixture({
        authConfig: { secureCookies: false, trustProxy: true },
        limiter: { reserve, clear: vi.fn() },
      });

      await app.request(
        ...jsonRequest(
          '/api/users/login',
          { username: 'reader01', password: 'wrong-password' },
          { headers: { 'X-Real-IP': '203.0.113.44' } },
        ),
        nodeEnv(peerAddress),
      );

      expect(reserve).toHaveBeenCalledWith('203.0.113.44', 'reader01');
    },
  );

  it('ignores x-real-ip from a non-loopback peer even when trustProxy is enabled', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy: true },
      limiter: { reserve, clear: vi.fn() },
    });

    await app.request(
      ...jsonRequest(
        '/api/users/login',
        { username: 'reader01', password: 'wrong-password' },
        { headers: { 'X-Real-IP': '203.0.113.44' } },
      ),
      nodeEnv('198.51.100.21'),
    );

    expect(reserve).toHaveBeenCalledWith('198.51.100.21', 'reader01');
  });

  it('uses unknown when the Node peer address is unavailable', async () => {
    const reserve = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
    const app = createFixture({
      authConfig: { secureCookies: false, trustProxy: true },
      limiter: { reserve, clear: vi.fn() },
    });

    await app.request(
      ...jsonRequest(
        '/api/users/login',
        { username: 'reader01', password: 'wrong-password' },
        { headers: { 'X-Real-IP': '203.0.113.44' } },
      ),
      nodeEnv(undefined),
    );

    expect(reserve).toHaveBeenCalledWith('unknown', 'reader01');
  });

  it('keeps failed reservations and hides unexpected login errors behind a generic 500', async () => {
    const clear = vi.fn();
    const failingStore = {
      ...store,
      async login() {
        throw new Error('database exploded: internal-secret');
      },
    };
    const app = createFixture({
      limiter: { reserve: () => ({ allowed: true, retryAfterSeconds: 0 }), clear },
      userStore: failingStore,
    });
    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'password-secret' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '登录失败' });
    expectPrivateNoStore(response);
    expect(clear).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'login_error', result: 'error', username: 'reader01', ip: 'unknown' },
    ]);
    expect(JSON.stringify(events)).not.toContain('internal-secret');
    expect(JSON.stringify(events)).not.toContain('password-secret');
  });

  it('revokes a login session and keeps its reservation when writing the cookie fails', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const authConfig = { secureCookies: false, trustProxy: false };
    const clear = vi.fn();
    let issuedSession;
    const revokeSession = vi.fn((rawToken) => store.revokeSession(rawToken));
    const login = vi.fn(async (draft) => {
      issuedSession = await store.login(draft);
      authConfig.secureCookies = undefined;
      return issuedSession;
    });
    const app = createFixture({
      authConfig,
      limiter: { reserve: () => ({ allowed: true, retryAfterSeconds: 0 }), clear },
      userStore: { ...store, login, revokeSession },
    });

    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '登录失败' });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(revokeSession).toHaveBeenCalledWith(issuedSession.token);
    expect(store.verifySession(issuedSession.token)).toBeNull();
    expect(events).toEqual([
      { type: 'login_error', result: 'error', username: 'reader01', ip: 'unknown' },
    ]);
  });

  it('keeps the login reservation when serializing the signed session response fails', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const clear = vi.fn();
    let issuedSession;
    const revokeSession = vi.fn((rawToken) => store.revokeSession(rawToken));
    const login = vi.fn(async (draft) => {
      issuedSession = await store.login(draft);
      return {
        ...issuedSession,
        user: {
          ...issuedSession.user,
          toJSON() {
            throw new Error('response serialization failed: internal-secret');
          },
        },
      };
    });
    const app = createFixture({
      limiter: { reserve: () => ({ allowed: true, retryAfterSeconds: 0 }), clear },
      userStore: { ...store, login, revokeSession },
    });

    const response = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: '登录失败' });
    expect(clear).not.toHaveBeenCalled();
    expect(revokeSession).toHaveBeenCalledWith(issuedSession.token);
    expect(store.verifySession(issuedSession.token)).toBeNull();
    expect(events).toEqual([
      { type: 'login_error', result: 'error', username: 'reader01', ip: 'unknown' },
    ]);
    expect(JSON.stringify(events)).not.toContain('internal-secret');
    expect(JSON.stringify(events)).not.toContain(issuedSession.token);
  });

  it('passes only allowlisted, non-sensitive fields to the security logger', async () => {
    const registered = await store.register({
      username: 'reader01',
      password: 'secret123',
      nickname: 'Reader',
    });
    const app = createFixture();
    await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'log-password-marker' }),
    );
    const login = await app.request(
      ...jsonRequest('/api/users/login', { username: 'reader01', password: 'secret123' }),
    );
    await app.request('http://localhost/api/users/logout', {
      method: 'POST',
      headers: { Cookie: cookiePair(login) },
    });

    const allowedFields = new Set(['type', 'result', 'userId', 'username', 'ip']);
    expect(events.map((event) => event.type)).toEqual(['login_failure', 'login_success', 'logout']);
    for (const event of events) {
      expect(Object.keys(event).every((key) => allowedFields.has(key))).toBe(true);
    }
    const serialized = JSON.stringify(events);
    const loginToken = cookiePair(login).split('=', 2)[1];
    expect(serialized).not.toContain('log-password-marker');
    expect(serialized).not.toContain('secret123');
    expect(serialized).not.toContain(registered.token);
    expect(serialized).not.toContain(loginToken);
    expect(serialized).not.toContain(cookiePair(login));
  });
});
