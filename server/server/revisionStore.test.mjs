import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createRevisionStore } from './revisionStore.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-revisions-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

const post = {
  id: 'post-1',
  title: 'Revision title',
  summary: 'Revision summary',
  content: '# Revision body',
  category: 'notes',
  tags: ['revision', 'history'],
  cover: 'notes',
  coverImage: '/api/images/cover',
  status: 'published'
};

describe('revision store', () => {
  it('runs a repeatable migration and persists the revision indexes', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const database = await createSqliteDatabase({ dbPath });

    createRevisionStore({ database });
    createRevisionStore({ database });

    const persistedDb = new (await initSqlJs()).Database(await readFile(dbPath));
    const columns = persistedDb.exec('PRAGMA table_info(post_revisions)')[0].values.map((row) => row[1]);
    const indexes = persistedDb.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'post_revisions'")[0].values.flat();
    persistedDb.close();

    expect(columns).toEqual(expect.arrayContaining(['id', 'post_id', 'title', 'summary', 'content', 'category', 'tags_json', 'cover', 'cover_image', 'status', 'editor_user_id', 'source', 'is_protected', 'created_at']));
    expect(indexes).toEqual(expect.arrayContaining(['idx_post_revisions_post_created', 'idx_post_revisions_created']));
  });

  it('stores complete snapshots newest first and protects key revisions from deletion', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const store = createRevisionStore({ database });
    const first = store.create({ post, source: 'manual-save', editorUserId: 'admin', createdAt: '2026-07-10T10:00:00.000Z' });
    const second = store.create({ post: { ...post, title: 'Published title' }, source: 'publish', editorUserId: 'admin', isProtected: true, createdAt: '2026-07-10T11:00:00.000Z' });

    expect(store.list(post.id).map((revision) => revision.id)).toEqual([second.id, first.id]);
    expect(store.get(first.id)).toMatchObject({
      postId: post.id,
      title: post.title,
      tags: post.tags,
      coverImage: post.coverImage,
      source: 'manual-save',
      editorUserId: 'admin',
      isProtected: false
    });
    expect(store.remove(second.id)).toBe(false);
    expect(store.remove(first.id)).toBe(true);
  });
});
