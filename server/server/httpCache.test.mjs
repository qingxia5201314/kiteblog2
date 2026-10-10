import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authenticatedResponseCache } from './httpCache.mjs';

describe('authenticated response cache middleware', () => {
  it('preserves explicit public caching while making unmarked authenticated responses private', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('authSession', { user: { id: 'admin-1' } });
      await next();
    });
    app.use('*', authenticatedResponseCache);
    app.get('/published', (c) => {
      c.header('Cache-Control', 'public, max-age=60, must-revalidate');
      return c.json({ ok: true });
    });
    app.get('/admin', (c) => c.json({ ok: true }));

    const published = await app.request('/published');
    const admin = await app.request('/admin');

    expect(published.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(admin.headers.get('cache-control')).toBe('private, no-store');
  });
});
