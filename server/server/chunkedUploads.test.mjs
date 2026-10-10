import { Hono } from 'hono';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createFileStore } from './fileStore.mjs';
import { createFileService } from './services/fileService.mjs';
import { createChunkedUploadStore } from './chunkedUploadStore.mjs';
import { filesRoutes } from './routes/files.mjs';

const admin = { id: 'admin-1', permission: 'admin' };
const reader = { id: 'reader-1', permission: 'reader' };
const CHUNK_SIZE = 4;

let tempDir;
let uploadDir;
let database;
let store;
let chunkedUploads;
let authSession;
let clock;
let app;

function createUploads(options = {}) {
  return createChunkedUploadStore({
    uploadDir,
    fileStore: store,
    chunkSizeBytes: CHUNK_SIZE,
    freeDiskBytes: async () => 10 * 1024 * 1024 * 1024,
    now: () => clock,
    ...options
  });
}

function buildApp() {
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('fileStore', store);
    c.set('fileService', createFileService({ fileStore: store }));
    c.set('chunkedUploads', chunkedUploads);
    await next();
  });
  app.route('/api/files', filesRoutes);
}

function startUpload(body) {
  return app.request('/api/files/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function putChunk(id, index, bytes) {
  return app.request(`/api/files/uploads/${id}/chunks/${index}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
    body: bytes
  });
}

function complete(id) {
  return app.request(`/api/files/uploads/${id}/complete`, { method: 'POST' });
}

beforeEach(async () => {
  clock = Date.parse('2026-09-29T00:00:00.000Z');
  authSession = { user: admin };
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-chunked-'));
  uploadDir = join(tempDir, 'uploads');
  database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createFileStore({ database, uploadDir });
  chunkedUploads = createUploads();
  buildApp();
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('chunked file uploads', () => {
  it('assembles chunks uploaded out of order into a stored file', async () => {
    const folder = store.createFolder({ name: 'Videos' });
    const payload = Buffer.from('0123456789');
    const started = await startUpload({
      fileName: '课程 01.mp4',
      contentType: 'video/mp4',
      sizeBytes: payload.length,
      folderId: folder.id
    });
    expect(started.status).toBe(201);
    const { upload } = await started.json();
    expect(upload).toMatchObject({ chunkSize: CHUNK_SIZE, chunkCount: 3, receivedChunks: [] });

    expect((await putChunk(upload.id, 2, payload.subarray(8))).status).toBe(200);
    expect((await putChunk(upload.id, 0, payload.subarray(0, 4))).status).toBe(200);
    expect((await complete(upload.id)).status).toBe(409);
    const lastChunk = await putChunk(upload.id, 1, payload.subarray(4, 8));
    expect(await lastChunk.json()).toEqual({ ok: true, receivedCount: 3, chunkCount: 3 });

    const completed = await complete(upload.id);
    expect(completed.status).toBe(201);
    const { file } = await completed.json();
    expect(file).toMatchObject({
      originalName: '课程 01.mp4',
      contentType: 'video/mp4',
      sizeBytes: 10,
      folderId: folder.id
    });

    const [stored] = store.listFolder(folder.id).files;
    expect(stored.id).toBe(file.id);
    expect(await readFile(stored.filePath)).toEqual(payload);
    expect(await readdir(join(uploadDir, '.partial'))).toEqual([]);
    expect(chunkedUploads.activeUploadCount()).toBe(0);
  });

  it('accepts a retried chunk and returns the same file when completion is retried', async () => {
    const payload = Buffer.from('abcdefg');
    const { upload } = await (await startUpload({ fileName: 'a.txt', sizeBytes: payload.length })).json();

    await putChunk(upload.id, 0, payload.subarray(0, 4));
    await putChunk(upload.id, 0, payload.subarray(0, 4));
    await putChunk(upload.id, 1, payload.subarray(4));

    const first = await (await complete(upload.id)).json();
    const retried = await complete(upload.id);
    expect(retried.status).toBe(201);
    expect((await retried.json()).file.id).toBe(first.file.id);
    expect(store.listFiles()).toHaveLength(1);
    expect(await readFile(store.listFiles()[0].filePath, 'utf8')).toBe('abcdefg');
  });

  it('stores empty files without any chunks', async () => {
    const { upload } = await (await startUpload({ fileName: 'empty.txt', sizeBytes: 0 })).json();
    expect(upload.chunkCount).toBe(0);

    const response = await complete(upload.id);
    expect(response.status).toBe(201);
    expect((await response.json()).file.sizeBytes).toBe(0);
  });

  it('rejects chunks with the wrong length or index', async () => {
    const { upload } = await (await startUpload({ fileName: 'a.bin', sizeBytes: 6 })).json();

    expect((await putChunk(upload.id, 0, Buffer.from('abc'))).status).toBe(400);
    expect((await putChunk(upload.id, 1, Buffer.from('abcd'))).status).toBe(400);
    expect((await putChunk(upload.id, 2, Buffer.from('ab'))).status).toBe(400);
    expect((await putChunk(upload.id, -1, Buffer.from('abcd'))).status).toBe(400);
    const oversized = await app.request(`/api/files/uploads/${upload.id}/chunks/1`, {
      method: 'PUT',
      body: Buffer.from('abcdef')
    });
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).message).toMatch(/larger than expected/);
  });

  it('enforces the configured size limit, folder existence and free disk space', async () => {
    const previousLimit = process.env.FILE_UPLOAD_LIMIT;
    process.env.FILE_UPLOAD_LIMIT = '5';
    try {
      expect((await startUpload({ fileName: 'big.bin', sizeBytes: 6 })).status).toBe(413);
    } finally {
      if (previousLimit === undefined) delete process.env.FILE_UPLOAD_LIMIT;
      else process.env.FILE_UPLOAD_LIMIT = previousLimit;
    }

    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 1, folderId: 'folder-missing' })).status).toBe(404);
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: -1 })).status).toBe(400);
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 1.5 })).status).toBe(400);

    chunkedUploads = createUploads({ freeDiskBytes: async () => 1024, diskHeadroomBytes: 512 });
    buildApp();
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 600 })).status).toBe(507);
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 400 })).status).toBe(201);
  });

  it('keeps uploads admin-only and scoped to the uploading account', async () => {
    authSession = null;
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 1 })).status).toBe(401);
    authSession = { user: reader };
    expect((await startUpload({ fileName: 'a.bin', sizeBytes: 1 })).status).toBe(403);

    authSession = { user: admin };
    const { upload } = await (await startUpload({ fileName: 'a.bin', sizeBytes: 1 })).json();
    authSession = { user: { id: 'admin-2', permission: 'admin' } };
    expect((await putChunk(upload.id, 0, Buffer.from('a'))).status).toBe(404);
    expect((await complete(upload.id)).status).toBe(404);
  });

  it('removes partial data when an upload is cancelled or goes idle', async () => {
    const cancelled = (await (await startUpload({ fileName: 'a.bin', sizeBytes: 8 })).json()).upload;
    await putChunk(cancelled.id, 0, Buffer.from('abcd'));
    const idle = (await (await startUpload({ fileName: 'b.bin', sizeBytes: 8 })).json()).upload;
    expect(await readdir(join(uploadDir, '.partial'))).toHaveLength(2);

    const response = await app.request(`/api/files/uploads/${cancelled.id}`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect((await putChunk(cancelled.id, 1, Buffer.from('efgh'))).status).toBe(404);

    clock += 2 * 60 * 60 * 1000;
    await chunkedUploads.sweep();
    expect((await putChunk(idle.id, 0, Buffer.from('abcd'))).status).toBe(404);
    expect(await readdir(join(uploadDir, '.partial'))).toEqual([]);
  });

  it('clears partial files left behind by a previous process', async () => {
    await createUploads().prepare();
    await writeFile(join(uploadDir, '.partial', 'upload-stale.part'), 'stale');

    await createUploads().prepare();

    expect(await readdir(join(uploadDir, '.partial'))).toEqual([]);
  });
});
