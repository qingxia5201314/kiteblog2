import { Hono } from 'hono';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createImageStore } from './imageStore.mjs';
import { imagesRoutes } from './routes/images.mjs';
import { createImageService } from './services/imageService.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let tempDir;
let store;
let imageService;
let authSession;
let app;

beforeEach(async () => {
  authSession = null;
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-image-routes-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createImageStore({ database, imageDir: join(tempDir, 'images') });
  imageService = createImageService({ imageStore: store });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('imageStore', store);
    c.set('imageService', imageService);
    await next();
  });
  app.route('/api/images', imagesRoutes);
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('image raw route', () => {
  it('serves stored image bytes through GET and headers only through HEAD', async () => {
    const image = await store.saveImage({
      originalName: 'cover.jpg',
      contentType: 'image/jpeg',
      buffer: Buffer.from('jpeg-bytes')
    });

    const getResponse = await app.request(`/api/images/raw/${image.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('content-type')).toBe('image/jpeg');
    expect(getResponse.headers.get('content-length')).toBe('10');
    expect(getResponse.headers.get('cache-control')).toContain('max-age=86400');
    expect(getResponse.headers.get('etag')).toBe(`"${image.id}-10"`);
    expect(await getResponse.text()).toBe('jpeg-bytes');

    const cachedResponse = await app.request(`/api/images/raw/${image.id}`, {
      headers: { 'if-none-match': `"${image.id}-10"` }
    });
    expect(cachedResponse.status).toBe(304);

    const headResponse = await app.request(`/api/images/raw/${image.id}`, { method: 'HEAD' });
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get('content-type')).toBe('image/jpeg');
    expect(headResponse.headers.get('content-length')).toBe('10');
    expect(await headResponse.text()).toBe('');
  });
});

describe('image management authorization', () => {
  it('rejects anonymous and reader lists, then allows an administrator', async () => {
    expect((await app.request('/api/images')).status).toBe(401);

    authSession = { user: reader };
    expect((await app.request('/api/images')).status).toBe(403);

    authSession = { user: admin };
    const response = await app.request('/api/images');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ images: [] });
  });
});
