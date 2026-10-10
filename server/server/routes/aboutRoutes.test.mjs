import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiNotFound } from '../middleware/apiNotFound.mjs';
import { adminRoutes } from './admin.mjs';
import { aboutRoutes } from './about.mjs';

const reader = { id: 'reader-1', username: 'reader', permission: 'reader' };
const admin = { id: 'admin-1', username: 'admin', permission: 'admin' };

const profile = {
  avatarUrl: '/avatar.png',
  displayName: 'Kite',
  identityTags: ['Developer'],
  intro: 'Hello',
  githubUrl: 'https://github.com/kite',
  content: '# About',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

let app;
let aboutStore;
let authSession;
let securityLog;
let userStore;

function rejectingSecurityLogger(events, promises) {
  return (event) => {
    events.push(event);
    const promise = new (class extends Promise {
      rejectionHandled = false;

      then(onFulfilled, onRejected) {
        if (typeof onRejected === 'function') this.rejectionHandled = true;
        return super.then(onFulfilled, onRejected);
      }
    })((_, reject) => reject(new Error('security logger unavailable')));
    promises.push(promise);
    return promise;
  };
}

beforeEach(() => {
  aboutStore = {
    get: vi.fn(() => profile),
    save: vi.fn((input) => ({ ...input, updatedAt: profile.updatedAt })),
  };
  authSession = null;
  securityLog = vi.fn();
  userStore = {
    listUsers: vi.fn(() => [reader, admin]),
    createUser: vi.fn(async (draft) => ({
      id: 'reader-2',
      username: draft.username,
      nickname: draft.username,
      permission: draft.permission,
    })),
    updateUser: vi.fn((id, patch) => ({ ...reader, id, ...patch })),
    removeUser: vi.fn(() => true),
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('aboutStore', aboutStore);
    c.set('authSession', authSession);
    c.set('securityLog', securityLog);
    c.set('userStore', userStore);
    await next();
  });
  app.route('/api/about', aboutRoutes);
  app.route('/api/admin', adminRoutes);
  app.all('/api/*', apiNotFound);
});

describe('about routes', () => {
  it('serves the public profile with shared-cache headers', async () => {
    const response = await app.request('/api/about');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.json()).toEqual({ profile });
  });

  it.each([
    ['anonymous', null, 401],
    ['reader', { user: reader }, 403]
  ])('rejects %s admin reads and writes', async (_role, session, status) => {
    authSession = session;
    const getResponse = await app.request('/api/admin/about');
    const putResponse = await app.request('/api/admin/about', { method: 'PUT', body: JSON.stringify(profile) });

    expect(getResponse.status).toBe(status);
    expect(putResponse.status).toBe(status);
  });

  it('returns the profile to an authenticated admin', async () => {
    authSession = { user: admin };
    const response = await app.request('/api/admin/about');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile });
  });

  it('saves and returns an authenticated admin update', async () => {
    authSession = { user: admin };
    const input = { ...profile, displayName: 'Updated', updatedAt: '' };
    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(200);
    expect(aboutStore.save).toHaveBeenCalledWith(input);
    expect(await response.json()).toEqual({ profile: { ...input, updatedAt: profile.updatedAt } });
  });

  it('returns a stable 400 response for malformed JSON without leaking a native TypeError', async () => {
    authSession = { user: admin };
    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, message: 'Invalid request body' });
    expect(body.message).not.toMatch(/TypeError/i);
  });

  it('returns the profile validation message as a 400 response', async () => {
    authSession = { user: admin };
    aboutStore.save.mockImplementation(() => {
      throw new Error('请填写名称');
    });

    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message: '请填写名称' });
  });

  it('returns a stable 500 response when profile persistence fails', async () => {
    authSession = { user: admin };
    aboutStore.save.mockImplementation(() => {
      throw new Error('SQLITE_IOERR: disk I/O error at C:\\secret\\blog.sqlite');
    });

    const response = await app.request('/api/admin/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: 'About save failed' });
  });

  it.each([
    ['POST', '/api/admin/login'],
    ['GET', '/api/admin/session']
  ])('returns 404 for removed legacy endpoint %s %s', async (method, path) => {
    const response = await app.request(path, { method });

    expect(response.status).toBe(404);
  });
});

describe('admin user routes', () => {
  beforeEach(() => {
    authSession = { user: admin };
  });

  it.each([
    ['anonymous', null, 401],
    ['reader', { user: reader }, 403]
  ])('rejects %s user management', async (_role, session, status) => {
    authSession = session;

    const response = await app.request('/api/admin/users');

    expect(response.status).toBe(status);
  });

  it('awaits asynchronous user creation', async () => {
    const response = await app.request('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'new_reader', password: 'secret1', permission: 'reader' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      user: { id: 'reader-2', username: 'new_reader', nickname: 'new_reader', permission: 'reader' },
    });
  });

  it('logs only an actual permission change with safe target fields', async () => {
    userStore.updateUser.mockReturnValue({ ...reader, permission: 'admin' });

    const response = await app.request(`/api/admin/users/${reader.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Changed', permission: 'admin', password: 'must-not-log' }),
    });

    expect(response.status).toBe(200);
    expect(securityLog).toHaveBeenCalledOnce();
    expect(securityLog).toHaveBeenCalledWith({
      type: 'permission_change',
      userId: admin.id,
      result: `target=${reader.id};permission=admin`,
    });
  });

  it('does not log when permission is unchanged', async () => {
    userStore.updateUser.mockReturnValue({ ...reader, nickname: 'Changed' });

    const response = await app.request(`/api/admin/users/${reader.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Changed', permission: 'reader' }),
    });

    expect(response.status).toBe(200);
    expect(securityLog).not.toHaveBeenCalled();
  });

  it('logs a successful deletion without request body or credentials', async () => {
    const response = await app.request(`/api/admin/users/${reader.id}`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(securityLog).toHaveBeenCalledWith({
      type: 'user_delete',
      userId: admin.id,
      result: `target=${reader.id}`,
    });
  });

  it('handles rejected async logs after permission changes and user deletion', async () => {
    const events = [];
    const promises = [];
    securityLog = rejectingSecurityLogger(events, promises);
    userStore.updateUser.mockReturnValue({ ...reader, permission: 'admin' });

    const permissionChange = await app.request(`/api/admin/users/${reader.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'admin' }),
    });
    const userDelete = await app.request(`/api/admin/users/${reader.id}`, { method: 'DELETE' });
    const rejectionHandling = promises.map((promise) => promise.rejectionHandled);
    await Promise.allSettled(promises);

    expect(permissionChange.status).toBe(200);
    expect(userDelete.status).toBe(200);
    expect(events).toEqual([
      {
        type: 'permission_change',
        userId: admin.id,
        result: `target=${reader.id};permission=admin`,
      },
      {
        type: 'user_delete',
        userId: admin.id,
        result: `target=${reader.id}`,
      },
    ]);
    expect(rejectionHandling).toEqual([true, true]);
  });

  it.each([
    ['PUT', { permission: 'admin' }, 200],
    ['DELETE', undefined, 200]
  ])('keeps a successful %s result when optional audit logging fails', async (method, body, status) => {
    userStore.updateUser.mockReturnValue({ ...reader, permission: 'admin' });
    securityLog.mockImplementation(() => {
      throw new Error('audit sink unavailable');
    });

    const response = await app.request(`/api/admin/users/${reader.id}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    expect(response.status).toBe(status);
    expect(securityLog).toHaveBeenCalledOnce();
  });

  it.each([
    ['PUT', { permission: 'reader' }],
    ['DELETE', undefined]
  ])('returns 409 for LAST_ADMIN during %s', async (method, body) => {
    const failure = Object.assign(new Error('last admin'), { code: 'LAST_ADMIN' });
    if (method === 'PUT') userStore.updateUser.mockImplementation(() => { throw failure; });
    else userStore.removeUser.mockImplementation(() => { throw failure; });

    const response = await app.request(`/api/admin/users/${admin.id}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    expect(response.status).toBe(409);
  });

  it.each([
    ['PUT', undefined],
    ['DELETE', false]
  ])('returns 404 when %s targets a missing user', async (method, result) => {
    if (method === 'PUT') userStore.updateUser.mockReturnValue(result);
    else userStore.removeUser.mockReturnValue(result);

    const response = await app.request('/api/admin/users/missing', {
      method,
      headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'PUT' ? JSON.stringify({ nickname: 'Missing' }) : undefined,
    });

    expect(response.status).toBe(404);
    expect(securityLog).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT'])('returns 400 for %s validation failures', async (method) => {
    const failure = new Error('Invalid permission');
    if (method === 'POST') userStore.createUser.mockRejectedValue(failure);
    else userStore.updateUser.mockImplementation(() => { throw failure; });

    const response = await app.request(method === 'POST' ? '/api/admin/users' : `/api/admin/users/${reader.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'owner' }),
    });

    expect(response.status).toBe(400);
  });
});

describe('server wiring', () => {
  it('creates, injects, and mounts the about store before the API fallback', async () => {
    const source = await readFile('server/index.mjs', 'utf8');

    expect(source).toContain("import { createAboutStore } from './aboutStore.mjs'");
    expect(source).toContain("import { aboutRoutes } from './routes/about.mjs'");
    expect(source).toMatch(/const aboutStore = createAboutStore\(\{ database \}\)/);
    expect(source).toContain("c.set('aboutStore', aboutStore)");
    expect(source).toContain("app.route('/api/about', aboutRoutes)");
    expect(source.indexOf("app.route('/api/about', aboutRoutes)")).toBeLessThan(source.indexOf("app.all('/api/*', apiNotFound)"));
  });
});
