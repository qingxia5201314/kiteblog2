import { Hono } from 'hono';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createFileStore } from './fileStore.mjs';
import { createFileService } from './services/fileService.mjs';
import { filesRoutes } from './routes/files.mjs';
import { folderRoutes } from './routes/folders.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let tempDir;
let database;
let store;
let fileService;
let authSession;
let app;

beforeEach(async () => {
  authSession = null;
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-file-range-'));
  database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createFileStore({ database, uploadDir: join(tempDir, 'uploads') });
  fileService = createFileService({ fileStore: store });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('fileStore', store);
    c.set('fileService', fileService);
    await next();
  });
  app.route('/api/files', filesRoutes);
  app.route('/api/file-folders', folderRoutes);
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('file raw route range responses', () => {
  it('keeps previously signed media links working', async () => {
    const file = await store.saveFile({
      originalName: 'lesson.mp4',
      contentType: 'application/octet-stream',
      buffer: Buffer.from('0123456789')
    });
    await writeFile(file.filePath, Buffer.from('0123456789'));
    const link = store.createAccessLink(file.id);
    database.db.run('UPDATE uploaded_files SET content_type = ? WHERE id = ?', ['video/mp4', file.id]);
    database.persist();

    const response = await app.request(`/api/files/raw/${file.id}?token=${link.token}`, {
      headers: { Range: 'bytes=2-5' }
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });

  it('serves permanent public media paths with range support', async () => {
    const file = await store.saveFile({
      originalName: 'lesson.MP4',
      contentType: 'video/mp4',
      buffer: Buffer.from('0123456789')
    });

    const response = await app.request(`/api/files/raw/${file.id}.mp4`, {
      headers: { Range: 'bytes=2-5' }
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });

  it('rejects mismatched extensions and non-media files on public paths', async () => {
    const media = await store.saveFile({
      originalName: 'lesson.mp4',
      contentType: 'video/mp4',
      buffer: Buffer.from('video')
    });
    const document = await store.saveFile({
      originalName: 'notes.mp4',
      contentType: 'text/plain',
      buffer: Buffer.from('notes')
    });

    expect((await app.request(`/api/files/raw/${media.id}.webm`)).status).toBe(404);
    expect((await app.request(`/api/files/raw/${document.id}.mp4`)).status).toBe(404);
  });

  it('returns 404 for a permanent media path after deletion', async () => {
    const file = await store.saveFile({
      originalName: 'lesson.mp4',
      contentType: 'video/mp4',
      buffer: Buffer.from('video')
    });
    const path = `/api/files/raw/${file.id}.mp4`;

    expect((await app.request(path)).status).toBe(200);
    await store.removeFile(file.id);
    expect((await app.request(path)).status).toBe(404);
  });
});

describe('file management authorization', () => {
  it('rejects anonymous and reader folder listings, then allows an administrator', async () => {
    expect((await app.request('/api/files')).status).toBe(401);

    authSession = { user: reader };
    expect((await app.request('/api/files')).status).toBe(403);

    authSession = { user: admin };
    const response = await app.request('/api/files');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ folders: [], files: [] });
  });

  it.each(['link', 'preview-link'])('keeps %s generation admin-only', async (linkType) => {
    const file = await store.saveFile({
      originalName: 'notes.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('notes')
    });
    const path = `/api/files/${file.id}/${linkType}`;

    expect((await app.request(path, { method: 'POST' })).status).toBe(401);
    authSession = { user: reader };
    expect((await app.request(path, { method: 'POST' })).status).toBe(403);
    authSession = { user: admin };
    const response = await app.request(path, { method: 'POST' });
    expect(response.status).toBe(200);
    expect((await response.json()).link).toHaveProperty('token');
  });

  it.each(['link', 'preview-link'])('returns a tokenless permanent media %s', async (linkType) => {
    const file = await store.saveFile({
      originalName: 'lesson.mp4',
      contentType: 'video/mp4',
      buffer: Buffer.from('video')
    });
    authSession = { user: admin };

    const response = await app.request(`/api/files/${file.id}/${linkType}`, { method: 'POST' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.link).toEqual({ path: `/api/files/raw/${file.id}.mp4` });
    expect(payload.link).not.toHaveProperty('token');
  });
});

describe('folder management authorization', () => {
  it('rejects anonymous and reader creates, then allows an administrator', async () => {
    const request = () => app.request('/api/file-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Projects' })
    });

    expect((await request()).status).toBe(401);
    authSession = { user: reader };
    expect((await request()).status).toBe(403);
    authSession = { user: admin };
    const response = await request();
    expect(response.status).toBe(201);
    expect((await response.json()).folder).toMatchObject({ name: 'Projects' });
  });
});
