import { createId, nowIso } from './blogModel.mjs';

function rowsFromResult(result) {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((value) => Object.fromEntries(columns.map((column, index) => [column, value[index]])));
}

function rowToRevision(row) {
  return {
    id: row.id,
    postId: row.post_id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    category: row.category,
    tags: JSON.parse(row.tags_json),
    cover: row.cover,
    coverImage: row.cover_image || '',
    status: row.status,
    editorUserId: row.editor_user_id || '',
    source: row.source,
    isProtected: Boolean(row.is_protected),
    createdAt: row.created_at
  };
}

function initializeSchema(database) {
  const { db } = database;
  const tableExists = db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'post_revisions'").length > 0;
  const existingIndexes = new Set(
    rowsFromResult(db.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'post_revisions'"))
      .map((row) => row.name)
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS post_revisions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      cover TEXT NOT NULL,
      cover_image TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      editor_user_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      is_protected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_post_revisions_post_created
      ON post_revisions(post_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_post_revisions_created
      ON post_revisions(created_at DESC);
  `);

  if (!tableExists || !existingIndexes.has('idx_post_revisions_post_created') || !existingIndexes.has('idx_post_revisions_created')) {
    database.persist();
  }
}

export function createRevisionStore({ database }) {
  if (!database?.db || typeof database.persist !== 'function') {
    throw new Error('Revision store requires a shared database');
  }
  const { db } = database;
  initializeSchema(database);

  return {
    create({ post, source, editorUserId = '', isProtected = false, createdAt = nowIso() }) {
      const revision = {
        id: createId(),
        postId: post.id,
        title: String(post.title ?? ''),
        summary: String(post.summary ?? ''),
        content: String(post.content ?? ''),
        category: String(post.category ?? 'life'),
        tags: Array.isArray(post.tags) ? post.tags.map(String) : [],
        cover: String(post.cover ?? post.category ?? 'life'),
        coverImage: String(post.coverImage ?? ''),
        status: String(post.status ?? 'draft'),
        editorUserId: String(editorUserId || ''),
        source: String(source),
        isProtected: Boolean(isProtected),
        createdAt
      };
      db.run(
        `INSERT INTO post_revisions (
          id, post_id, title, summary, content, category, tags_json, cover, cover_image,
          status, editor_user_id, source, is_protected, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [revision.id, revision.postId, revision.title, revision.summary, revision.content, revision.category,
          JSON.stringify(revision.tags), revision.cover, revision.coverImage, revision.status,
          revision.editorUserId, revision.source, revision.isProtected ? 1 : 0, revision.createdAt]
      );
      database.persist();
      return revision;
    },

    list(postId) {
      return rowsFromResult(db.exec(
        'SELECT * FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC',
        [postId]
      )).map(rowToRevision);
    },

    get(revisionId) {
      const row = rowsFromResult(db.exec('SELECT * FROM post_revisions WHERE id = ?', [revisionId]))[0];
      return row ? rowToRevision(row) : undefined;
    },

    remove(revisionId) {
      const revision = this.get(revisionId);
      if (!revision || revision.isProtected) return false;
      db.run('DELETE FROM post_revisions WHERE id = ?', [revisionId]);
      database.persist();
      return true;
    }
  };
}
