import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from './routes/admin.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let authSession;
let service;
let app;

beforeEach(() => {
  authSession = null;
  service = {
    schedule: vi.fn(() => ({ id: 'post-1', status: 'scheduled', scheduledAt: '2026-07-12T12:00:00.000Z' })),
    cancel: vi.fn(() => ({ id: 'post-1', status: 'draft', scheduledAt: '' })),
    retry: vi.fn(() => ({ id: 'post-1', status: 'published', scheduledAt: '' }))
  };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('scheduledPublishService', service);
    await next();
  });
  app.route('/api/admin', adminRoutes);
});

describe('scheduled publishing admin routes', () => {
  it.each([
    ['anonymous', null, 'PUT', '/api/admin/posts/post-1/schedule', 401],
    ['reader', { user: reader }, 'PUT', '/api/admin/posts/post-1/schedule', 403],
    ['anonymous', null, 'DELETE', '/api/admin/posts/post-1/schedule', 401],
    ['reader', { user: reader }, 'POST', '/api/admin/posts/post-1/schedule/retry', 403]
  ])('rejects %s access to %s %s', async (_role, session, method, path, status) => {
    authSession = session;
    const response = await app.request(path, { method, body: method === 'PUT' ? JSON.stringify({ scheduledAt: '2026-07-12T12:00:00.000Z' }) : undefined, headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(status);
  });

  it('schedules and cancels with the current administrator id, then retries through the existing service API', async () => {
    authSession = { user: admin };
    const schedule = await app.request('/api/admin/posts/post-1/schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: '2026-07-12T12:00:00.000Z' })
    });
    const cancel = await app.request('/api/admin/posts/post-1/schedule', { method: 'DELETE' });
    const retry = await app.request('/api/admin/posts/post-1/schedule/retry', { method: 'POST' });

    expect((await schedule.json()).post.status).toBe('scheduled');
    expect((await cancel.json()).post.status).toBe('draft');
    expect((await retry.json()).post.status).toBe('published');
    expect(service.schedule).toHaveBeenCalledWith('post-1', '2026-07-12T12:00:00.000Z', { editorUserId: admin.id });
    expect(service.cancel).toHaveBeenCalledWith('post-1', { editorUserId: admin.id });
    expect(service.retry).toHaveBeenCalledWith('post-1');
  });
});
