import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { recoverUtf8Filename } from './filenameEncoding.mjs';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const IMAGE_TYPES_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp']
]);

function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally {
    statement.free();
  }
}

function safeOriginalName(name) {
  const cleaned = recoverUtf8Filename(name || 'image').replace(/\0/g, '').replace(/\\/g, '/');
  return basename(cleaned).trim().slice(0, 180) || 'image';
}

function normalizeImageContentType(contentType, originalName) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_IMAGE_TYPES.has(normalized)) return normalized;
  if (!normalized || normalized === 'application/octet-stream') {
    return IMAGE_TYPES_BY_EXTENSION.get(String(originalName || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '') || normalized;
  }
  return normalized;
}

function rowToImage(row, imageDir, publicPath) {
  return {
    id: row.id,
    originalName: safeOriginalName(row.original_name),
    storageName: row.storage_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0),
    uploadedAt: row.uploaded_at,
    path: `${publicPath}/${encodeURIComponent(row.id)}`,
    filePath: join(imageDir, row.storage_name)
  };
}

export function createImageStore({ database, imageDir, publicPath = '/api/images/raw' }) {
  const { db } = database;
  db.run(`
    CREATE TABLE IF NOT EXISTS hosted_images (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      storage_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL
    );
  `);
  database.persist();

  function validateImageUpload(upload) {
    const originalName = safeOriginalName(upload.originalName);
    const contentType = normalizeImageContentType(upload.contentType, originalName);
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error('Only PNG, JPEG, GIF, and WebP images are allowed');
    }
    const bytes = Buffer.from(upload.buffer || '');
    if (bytes.length === 0) throw new Error('Image is empty');
    return {
      originalName,
      contentType,
      buffer: bytes
    };
  }

  return {
    validateImageUpload,

    async saveImage(upload) {
      const valid = validateImageUpload(upload);
      const id = `img-${randomUUID()}`;
      const image = {
        id,
        originalName: valid.originalName,
        storageName: `${id}-${randomBytes(8).toString('hex')}.bin`,
        contentType: valid.contentType,
        sizeBytes: valid.buffer.length,
        uploadedAt: new Date().toISOString()
      };

      await mkdir(imageDir, { recursive: true });
      const filePath = join(imageDir, image.storageName);
      await writeFile(filePath, valid.buffer);
      db.run(
        `INSERT INTO hosted_images (id, original_name, storage_name, content_type, size_bytes, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [image.id, image.originalName, image.storageName, image.contentType, image.sizeBytes, image.uploadedAt]
      );
      database.persist();
      return { ...image, path: `${publicPath}/${encodeURIComponent(id)}`, filePath };
    },

    listImages() {
      return rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at
         FROM hosted_images ORDER BY uploaded_at DESC`
      ).map((row) => rowToImage(row, imageDir, publicPath));
    },

    getImage(id) {
      const row = rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at
         FROM hosted_images WHERE id = ?`,
        [String(id || '')]
      )[0];
      if (!row) return null;
      const image = rowToImage(row, imageDir, publicPath);
      return existsSync(image.filePath) ? image : null;
    },

    async removeImage(id) {
      const image = this.getImage(id);
      if (!image) return false;
      await rm(image.filePath, { force: true });
      db.run('DELETE FROM hosted_images WHERE id = ?', [image.id]);
      database.persist();
      return true;
    }
  };
}
