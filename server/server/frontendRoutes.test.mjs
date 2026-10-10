import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerFrontendRoutes } from './frontendRoutes.mjs';

const knownRoutes = [
  '/accounting',
  '/about',
  '/files',
  '/files/preview',
  '/images',
  '/admin',
  '/admin/preview/42',
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

    const response = await app.request('/definitely-not-a-blog-route');

    expect(response.status).toBe(404);
  });
});
