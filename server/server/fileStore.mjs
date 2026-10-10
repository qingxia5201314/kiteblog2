import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { recoverUtf8Filename } from './filenameEncoding.mjs';

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

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeOriginalName(name) {
  const cleaned = recoverUtf8Filename(name || 'file').replace(/\0/g, '').replace(/\\/g, '/');
  return basename(cleaned).trim().slice(0, 180) || 'file';
}

function safeFolderName(name) {
  const cleaned = String(name || '')
    .replace(/\0/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 80);
  if (!cleaned) throw new Error('Folder name is required');
  return cleaned;
}

function normalizeFolderId(folderId) {
  return String(folderId || '').trim();
}

function mediaExtension(file) {
  if (!/^(audio|video)\//i.test(file?.contentType || '')) return '';
  const extension = extname(file.originalName || '').slice(1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : '';
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = rows(db, `PRAGMA table_info(${tableName})`).map((row) => row.name);
  if (!columns.includes(columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

function rowToFile(row, uploadDir) {
  return {
    id: row.id,
    originalName: safeOriginalName(row.original_name),
    storageName: row.storage_name,
    contentType: row.content_type || 'application/octet-stream',
    sizeBytes: Number(row.size_bytes || 0),
    uploadedAt: row.uploaded_at,
    folderId: row.folder_id || '',
    filePath: join(uploadDir, row.storage_name)
  };
}

function rowToFolder(row) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createFileStore({ database, uploadDir, publicPath = '/api/files/raw' }) {
  const { db } = database;
  db.run(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      storage_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL,
      access_token_hash TEXT NOT NULL DEFAULT ''
    );
  `);
  ensureColumn(db, 'uploaded_files', 'folder_id', "folder_id TEXT NOT NULL DEFAULT ''");
  db.run(`
    CREATE TABLE IF NOT EXISTS file_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  database.persist();

  function getFolderRow(folderId) {
    const id = normalizeFolderId(folderId);
    if (!id) return null;
    return rows(db, 'SELECT id, name, parent_id, created_at, updated_at FROM file_folders WHERE id = ?', [id])[0] || null;
  }

  function assertFolderExists(folderId) {
    const id = normalizeFolderId(folderId);
    if (id && !getFolderRow(id)) throw new Error('Folder not found');
    return id;
  }

  function breadcrumbsFor(folderId) {
    const trail = [];
    let current = getFolderRow(folderId);
    let guard = 0;
    while (current && guard < 50) {
      trail.unshift(rowToFolder(current));
      current = current.parent_id ? getFolderRow(current.parent_id) : null;
      guard += 1;
    }
    return trail;
  }

  function newFileRecord({ originalName, contentType, sizeBytes, folderId }) {
    const id = `file-${randomUUID()}`;
    const storageName = `${id}-${randomBytes(8).toString('hex')}.bin`;
    return {
      id,
      originalName: safeOriginalName(originalName),
      storageName,
      contentType: String(contentType || 'application/octet-stream'),
      sizeBytes,
      uploadedAt: new Date().toISOString(),
      folderId,
      filePath: join(uploadDir, storageName)
    };
  }

  function insertFileRecord(file) {
    db.run(
      `INSERT INTO uploaded_files (
        id, original_name, storage_name, content_type, size_bytes, uploaded_at, access_token_hash, folder_id
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
      [file.id, file.originalName, file.storageName, file.contentType, file.sizeBytes, file.uploadedAt, file.folderId]
    );
    database.persist();
  }

  function folderNameExists(parentId, name, exceptId = '') {
    return Boolean(rows(
      db,
      `SELECT id FROM file_folders WHERE parent_id = ? AND lower(name) = lower(?) AND id != ?`,
      [parentId, name, exceptId]
    )[0]);
  }

  return {
    createFolder({ name, parentId = '' }) {
      const normalizedParentId = assertFolderExists(parentId);
      const safeName = safeFolderName(name);
      if (folderNameExists(normalizedParentId, safeName)) throw new Error('Folder already exists');
      const now = new Date().toISOString();
      const folder = {
        id: `folder-${randomUUID()}`,
        name: safeName,
        parentId: normalizedParentId,
        createdAt: now,
        updatedAt: now
      };
      db.run(
        `INSERT INTO file_folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [folder.id, folder.name, folder.parentId, folder.createdAt, folder.updatedAt]
      );
      database.persist();
      return folder;
    },

    renameFolder(id, name) {
      const folderId = normalizeFolderId(id);
      const row = getFolderRow(folderId);
      if (!row) return null;
      const safeName = safeFolderName(name);
      if (folderNameExists(row.parent_id || '', safeName, folderId)) throw new Error('Folder already exists');
      const updatedAt = new Date().toISOString();
      db.run('UPDATE file_folders SET name = ?, updated_at = ? WHERE id = ?', [safeName, updatedAt, folderId]);
      database.persist();
      return rowToFolder({ ...row, name: safeName, updated_at: updatedAt });
    },

    removeFolder(id) {
      const folderId = normalizeFolderId(id);
      if (!getFolderRow(folderId)) return false;
      const hasChildren = rows(db, 'SELECT id FROM file_folders WHERE parent_id = ? LIMIT 1', [folderId])[0];
      const hasFiles = rows(db, 'SELECT id FROM uploaded_files WHERE folder_id = ? LIMIT 1', [folderId])[0];
      if (hasChildren || hasFiles) throw new Error('Folder is not empty');
      db.run('DELETE FROM file_folders WHERE id = ?', [folderId]);
      database.persist();
      return true;
    },

    listFolder(folderId = '') {
      const currentFolderId = assertFolderExists(folderId);
      const folder = currentFolderId ? rowToFolder(getFolderRow(currentFolderId)) : null;
      return {
        folder,
        breadcrumbs: breadcrumbsFor(currentFolderId),
        folders: rows(
          db,
          `SELECT id, name, parent_id, created_at, updated_at
           FROM file_folders WHERE parent_id = ? ORDER BY lower(name) ASC, created_at ASC`,
          [currentFolderId]
        ).map(rowToFolder),
        files: rows(
          db,
          `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at, folder_id
           FROM uploaded_files WHERE folder_id = ? ORDER BY uploaded_at DESC`,
          [currentFolderId]
        ).map((row) => rowToFile(row, uploadDir))
      };
    },

    hasFolder(folderId) {
      const id = normalizeFolderId(folderId);
      return !id || Boolean(getFolderRow(id));
    },

    async saveFile({ originalName, contentType, buffer, folderId = '' }) {
      const normalizedFolderId = assertFolderExists(folderId);
      const bytes = Buffer.from(buffer || '');
      const file = newFileRecord({ originalName, contentType, sizeBytes: bytes.length, folderId: normalizedFolderId });

      await mkdir(uploadDir, { recursive: true });
      await writeFile(file.filePath, bytes);
      insertFileRecord(file);
      return file;
    },

    async saveStoredFile({ originalName, contentType, sourcePath, folderId = '' }) {
      const normalizedFolderId = assertFolderExists(folderId);
      const { size } = await stat(sourcePath);
      const file = newFileRecord({ originalName, contentType, sizeBytes: size, folderId: normalizedFolderId });

      await mkdir(uploadDir, { recursive: true });
      await rename(sourcePath, file.filePath);
      try {
        insertFileRecord(file);
      } catch (error) {
        await rm(file.filePath, { force: true });
        throw error;
      }
      return file;
    },

    listFiles() {
      return rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at, folder_id
         FROM uploaded_files ORDER BY uploaded_at DESC`
      ).map((row) => rowToFile(row, uploadDir));
    },

    createAccessLink(id) {
      const row = rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at, folder_id
         FROM uploaded_files WHERE id = ?`,
        [id]
      )[0];
      if (!row) return null;
      const file = rowToFile(row, uploadDir);
      const extension = mediaExtension(file);
      if (extension) {
        return { path: `${publicPath}/${encodeURIComponent(id)}.${encodeURIComponent(extension)}` };
      }
      const token = randomBytes(32).toString('base64url');
      db.run('UPDATE uploaded_files SET access_token_hash = ? WHERE id = ?', [hashToken(token), id]);
      database.persist();
      return {
        token,
        path: `${publicPath}/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
      };
    },

    getPublicMedia(id, extension) {
      const row = rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at, folder_id
         FROM uploaded_files WHERE id = ?`,
        [id]
      )[0];
      if (!row) return null;
      const file = rowToFile(row, uploadDir);
      const expectedExtension = mediaExtension(file);
      if (!expectedExtension || expectedExtension !== String(extension || '').toLowerCase()) return null;
      return existsSync(file.filePath) ? file : null;
    },

    getFileForToken(id, token) {
      const tokenHash = hashToken(String(token || ''));
      const row = rows(
        db,
        `SELECT id, original_name, storage_name, content_type, size_bytes, uploaded_at, access_token_hash
         FROM uploaded_files WHERE id = ?`,
        [id]
      )[0];
      if (!row?.access_token_hash || !safeEqual(row.access_token_hash, tokenHash)) return null;
      const file = rowToFile(row, uploadDir);
      return existsSync(file.filePath) ? file : null;
    },

    async removeFile(id) {
      const row = rows(db, 'SELECT storage_name FROM uploaded_files WHERE id = ?', [id])[0];
      if (!row) return false;
      await rm(join(uploadDir, row.storage_name), { force: true });
      db.run('DELETE FROM uploaded_files WHERE id = ?', [id]);
      database.persist();
      return true;
    }
  };
}
