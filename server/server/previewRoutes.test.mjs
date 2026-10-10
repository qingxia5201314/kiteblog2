import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from './routes/admin.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let authSession;
let draftService;
let postService;
let app;

beforeEach(() => {
  authSession = null;
  draftService = { get: vi.fn(() => ({ editingId: 'post-1', updatedAt: '2026-07-12T00:00:00.000Z', draft: { title: 'Autosave preview', content: '$x^2$' } })) };
  postService = { getPost: vi.fn(() => ({ id: 'post-1', title: 'Stored post', status: 'draft', content: 'stored' })) };
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('draftService', draftService);
    c.set('postService', postService);
    await next();
  });
  app.route('/api/admin', adminRoutes);
});

describe('article preview route', () => {
  it.each([
    ['anonymous', null, 401],
    ['reader', { user: reader }, 403]
  ])('rejects %s preview reads', async (_role, session, status) => {
    authSession = session;
    const response = await app.request('/api/admin/article-preview/post-1');
    expect(response.status).toBe(status);
  });

  it('returns the matching database autosave without mutating the post', async () => {
    authSession = { user: admin };
    const response = await app.request('/api/admin/article-preview/post-1');
    const body = await response.json();

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body.post).toMatchObject({ id: 'post-1', title: 'Autosave preview', content: '$x^2$', status: 'draft' });
    expect(postService.getPost).toHaveBeenCalledTimes(1);
    expect(draftService.get).toHaveBeenCalledTimes(1);
  });
});
