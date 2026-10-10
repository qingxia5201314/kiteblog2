import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revisionsRoutes } from './routes/revisions.mjs';

const revision = { id: 'revision-1', postId: 'post-1', title: 'Snapshot', isProtected: false };
const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let authSession;
let service;
let app;

beforeEach(() => {
  authSession = null;
  service = {
    list: vi.fn(() => [revision]),
    get: vi.fn(() => revision),
    compare: vi.fn(() => ({ revision, current: { id: 'post-1' }, changes: [] })),
    restore: vi.fn(() => ({ id: 'post-1', status: 'draft' })),
    remove: vi.fn(() => true)
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('postRevisionService', service);
    await next();
  });
  app.route('/api/admin/posts', revisionsRoutes);
});

describe('revision admin routes', () => {
  it.each([
    ['anonymous', null, 'GET', '/api/admin/posts/post-1/revisions', 401],
    ['reader', { user: reader }, 'GET', '/api/admin/posts/post-1/revisions/revision-1', 403],
    ['anonymous', null, 'GET', '/api/admin/posts/post-1/revisions/revision-1/compare', 401],
    ['reader', { user: reader }, 'POST', '/api/admin/posts/post-1/revisions/revision-1/restore', 403],
    ['anonymous', null, 'DELETE', '/api/admin/posts/post-1/revisions/revision-1', 401]
  ])('rejects %s access to %s %s', async (_role, session, method, path, status) => {
    authSession = session;
    const response = await app.request(path, { method });
    expect(response.status).toBe(status);
  });

  it('lists, compares, restores, and deletes revisions for an administrator', async () => {
    authSession = { user: admin };
    const list = await app.request('/api/admin/posts/post-1/revisions');
    const compare = await app.request('/api/admin/posts/post-1/revisions/revision-1/compare');
    const restore = await app.request('/api/admin/posts/post-1/revisions/revision-1/restore', { method: 'POST' });
    const remove = await app.request('/api/admin/posts/post-1/revisions/revision-1', { method: 'DELETE' });

    expect(await list.json()).toEqual({ revisions: [revision] });
    expect((await compare.json()).changes).toEqual([]);
    expect(await restore.json()).toEqual({ post: { id: 'post-1', status: 'draft' } });
    expect(await remove.json()).toEqual({ ok: true });
    expect(service.restore).toHaveBeenCalledWith('post-1', 'revision-1', { editorUserId: admin.id });
  });

  it('returns 409 when a protected revision cannot be deleted', async () => {
    authSession = { user: admin };
    service.remove.mockReturnValue(false);

    const response = await app.request('/api/admin/posts/post-1/revisions/revision-1', { method: 'DELETE' });

    expect(response.status).toBe(409);
  });
});
