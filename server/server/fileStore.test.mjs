import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createFileStore } from './fileStore.mjs';

let tempDir;
let store;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-files-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createFileStore({ database, uploadDir: join(tempDir, 'uploads') });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('file store', () => {
  it('creates folders and scopes files by the current folder', async () => {
    const cases = store.createFolder({ name: 'SRC cases' });
    const rfi = store.createFolder({ name: 'RFI', parentId: cases.id });
    const rootFile = await store.saveFile({
      originalName: 'root.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('root')
    });
    const nestedFile = await store.saveFile({
      originalName: 'payload.php',
      contentType: 'application/x-php',
      buffer: Buffer.from('<?php echo "rfi";'),
      folderId: rfi.id
    });

    expect(store.listFolder()).toMatchObject({
      folder: null,
      breadcrumbs: [],
      folders: [{ id: cases.id, name: 'SRC cases', parentId: '' }],
      files: [{ id: rootFile.id, originalName: 'root.txt', folderId: '' }]
    });
    expect(store.listFolder(cases.id).breadcrumbs).toMatchObject([{ id: cases.id, name: 'SRC cases' }]);
    expect(store.listFolder(cases.id).folders).toMatchObject([{ id: rfi.id, name: 'RFI', parentId: cases.id }]);
    expect(store.listFolder(rfi.id)).toMatchObject({
      folder: { id: rfi.id, name: 'RFI', parentId: cases.id },
      breadcrumbs: [
        { id: cases.id, name: 'SRC cases' },
        { id: rfi.id, name: 'RFI' }
      ],
      files: [{ id: nestedFile.id, originalName: 'payload.php', folderId: rfi.id }]
    });
  });

  it('renames folders and only removes empty folders', async () => {
    const folder = store.createFolder({ name: 'old name' });
    const child = store.createFolder({ name: 'child', parentId: folder.id });

    expect(store.renameFolder(folder.id, 'new name')).toMatchObject({ id: folder.id, name: 'new name' });
    expect(() => store.removeFolder(folder.id)).toThrow('Folder is not empty');
    expect(store.removeFolder(child.id)).toBe(true);
    expect(store.removeFolder(folder.id)).toBe(true);
    expect(() => store.createFolder({ name: '   ' })).toThrow('Folder name is required');
  });

  it('stores arbitrary file bytes with safe metadata', async () => {
    const file = await store.saveFile({
      originalName: '../../shell.php',
      contentType: 'application/x-php',
      buffer: Buffer.from('<?php echo "ok";')
    });

    expect(file.originalName).toBe('shell.php');
    expect(file.contentType).toBe('application/x-php');
    expect(file.sizeBytes).toBe(16);
    expect(file.storageName).not.toContain('..');
    expect(file.storageName).not.toContain('/');
    expect(existsSync(file.filePath)).toBe(true);
    await expect(readFile(file.filePath, 'utf8')).resolves.toBe('<?php echo "ok";');
    expect(store.listFiles()).toMatchObject([
      {
        id: file.id,
        originalName: 'shell.php',
        contentType: 'application/x-php',
        sizeBytes: 16
      }
    ]);
    expect(store.listFiles()[0]).not.toHaveProperty('accessTokenHash');
  });

  it('recovers UTF-8 filenames that were decoded as latin1', async () => {
    const mojibakeName = Buffer.from('复习资料.docx', 'utf8').toString('latin1');
    const file = await store.saveFile({
      originalName: mojibakeName,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx')
    });

    expect(file.originalName).toBe('复习资料.docx');
    expect(store.listFiles()[0].originalName).toBe('复习资料.docx');
  });

  it('serves files only with the active signed token and revokes on delete', async () => {
    const file = await store.saveFile({
      originalName: 'note.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('rfi fixture')
    });
    const link = store.createAccessLink(file.id);

    expect(link.token).toHaveLength(43);
    expect(link.path).toBe(`/api/files/raw/${encodeURIComponent(file.id)}?token=${encodeURIComponent(link.token)}`);
    expect(link.path).not.toContain('note.txt');
    expect(store.getFileForToken(file.id, 'wrong-token')).toBeNull();
    expect(store.getFileForToken(file.id, link.token)).toMatchObject({
      id: file.id,
      originalName: 'note.txt',
      contentType: 'text/plain'
    });

    expect(await store.removeFile(file.id)).toBe(true);
    expect(store.getFileForToken(file.id, link.token)).toBeNull();
    expect(existsSync(file.filePath)).toBe(false);
  });

  it('creates permanent public links for media using the original extension', async () => {
    const media = await store.saveFile({
      originalName: 'lesson.MP4',
      contentType: 'video/mp4',
      buffer: Buffer.from('video')
    });

    expect(store.createAccessLink(media.id)).toEqual({
      path: `/api/files/raw/${encodeURIComponent(media.id)}.mp4`
    });
    expect(store.getPublicMedia(media.id, 'mp4')).toMatchObject({
      id: media.id,
      originalName: 'lesson.MP4',
      contentType: 'video/mp4'
    });
    expect(store.getPublicMedia(media.id, 'MP4')).toMatchObject({ id: media.id });
    expect(store.getPublicMedia(media.id, 'webm')).toBeNull();
  });

  it('keeps non-media and extensionless media behind signed links', async () => {
    const document = await store.saveFile({
      originalName: 'notes.mp4',
      contentType: 'text/plain',
      buffer: Buffer.from('notes')
    });
    const extensionlessMedia = await store.saveFile({
      originalName: 'recording',
      contentType: 'audio/mpeg',
      buffer: Buffer.from('audio')
    });

    const documentLink = store.createAccessLink(document.id);
    const extensionlessLink = store.createAccessLink(extensionlessMedia.id);

    expect(documentLink.path).toContain('?token=');
    expect(documentLink.token).toHaveLength(43);
    expect(extensionlessLink.path).toContain('?token=');
    expect(extensionlessLink.token).toHaveLength(43);
    expect(store.getPublicMedia(document.id, 'mp4')).toBeNull();
    expect(store.getPublicMedia(extensionlessMedia.id, '')).toBeNull();
  });
});
