import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostStore } from './postStore.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-posts-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('post store', () => {
  it('persists an old non-empty schema migration and only backfills published posts', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const SQL = await initSqlJs();
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cover TEXT NOT NULL,
        cover_image TEXT NOT NULL DEFAULT ''
      )
    `);
    const insert = `INSERT INTO posts (
      id, slug, title, summary, category, tags_json, content, status,
      created_at, updated_at, cover, cover_image
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    legacyDb.run(insert, [
      'published', 'published', 'Published', 'summary', 'notes', '[]', 'content', 'published',
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'notes', ''
    ]);
    legacyDb.run(insert, [
      'draft', 'draft', 'Draft', 'summary', 'notes', '[]', 'content', 'draft',
      '2026-02-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z', 'notes', ''
    ]);
    await writeFile(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    await createPostStore({ dbPath });

    const persistedDb = new SQL.Database(await readFile(dbPath));
    const columns = persistedDb.exec('PRAGMA table_info(posts)')[0].values.map((row) => row[1]);
    const indexes = persistedDb.exec("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'posts'")[0].values.flat();
    const persistedValues = persistedDb.exec('SELECT id, published_at FROM posts ORDER BY id')[0].values;
    persistedDb.close();
    const restartedStore = await createPostStore({ dbPath });

    expect(columns).toContain('published_at');
    expect(columns).toEqual(expect.arrayContaining(['scheduled_at', 'schedule_error']));
    expect(indexes).toContain('idx_posts_scheduled_due');
    expect(persistedValues).toEqual([
      ['draft', ''],
      ['published', '2026-01-01T00:00:00.000Z']
    ]);
    expect(restartedStore.get('draft')?.publishedAt).toBe('');
    expect(restartedStore.get('published')?.publishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('seeds published posts into a new sqlite database', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });

    const posts = store.list({ includeDrafts: false });

    expect(posts.length).toBeGreaterThanOrEqual(4);
    expect(posts.every((post) => post.status === 'published')).toBe(true);
  });

  it('creates, updates, and removes a post', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });

    const created = store.create({
      title: '服务端发布测试',
      summary: '电脑和手机应该看到同一篇文章',
      category: 'notes',
      tags: ['同步'],
      content: '正文内容',
      status: 'draft',
      cover: 'notes',
      coverImage: ''
    });

    expect(store.get(created.id)?.slug).toBe('fu-wu-duan-fa-bu-ce-shi');

    const updated = store.update(created.id, { status: 'published', title: '服务端发布测试更新' });

    expect(updated?.status).toBe('published');
    expect(updated?.slug).toBe('fu-wu-duan-fa-bu-ce-shi-geng-xin');

    const renamed = store.update(created.id, { title: '发布后再次改标题' });
    expect(renamed?.slug).toBe('fu-wu-duan-fa-bu-ce-shi-geng-xin');

    store.update(created.id, { status: 'draft' });
    store.update(created.id, { title: '撤稿后修改标题' });
    const republished = store.update(created.id, { status: 'published' });
    expect(republished?.slug).toBe('fu-wu-duan-fa-bu-ce-shi-geng-xin');
    expect(store.remove(created.id)).toBe(true);
    expect(store.get(created.id)).toBeUndefined();
  });

  it('keeps an unpublished draft eligible for a new slug after restart', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const store = await createPostStore({ dbPath });
    const created = store.create({
      title: '未命名草稿',
      summary: 'summary',
      category: 'notes',
      tags: [],
      content: 'content',
      status: 'draft',
      cover: 'notes',
      coverImage: ''
    });

    const reloadedStore = await createPostStore({ dbPath });
    const renamed = reloadedStore.update(created.id, { title: 'final article title' });

    expect(renamed?.slug).toBe('final-article-title');
  });

  it('stores precise timestamps for posts and comments', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const created = store.create({
      title: 'timestamp post',
      summary: 'summary',
      category: 'notes',
      tags: [],
      content: 'content',
      status: 'published',
      cover: 'notes',
      coverImage: ''
    });
    const comment = store.createComment(created.id, { content: 'hello' }, { nickname: 'Kite', permission: 'reader' });

    expect(created.createdAt).toContain('T');
    expect(created.updatedAt).toContain('T');
    expect(store.get(created.id)?.publishedAt).toContain('T');
    expect(comment.createdAt).toContain('T');
  });

  it('stores public comments for each post', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const post = store.list({ includeDrafts: false })[0];

    const comment = store.createComment(post.id, {
      nickname: 'Kite',
      role: '站长',
      content: '这篇文章有用。'
    }, { nickname: '登录昵称', permission: 'reader' });

    expect(comment.postId).toBe(post.id);
    expect(comment.nickname).toBe('登录昵称');
    expect(comment.role).toBe('阅读用户');
    expect(store.listComments(post.slug).map((item) => item.content)).toEqual(['这篇文章有用。']);
    expect(() => store.createComment(post.id, { nickname: '', role: '', content: '' })).toThrow('Comment content is required');
  });

  it('updates and deletes comments with owner or admin permissions', async () => {
    const store = await createPostStore({ dbPath: join(tempDir, 'blog.sqlite') });
    const post = store.list({ includeDrafts: false })[0];
    const owner = { id: 'user-owner', nickname: 'Owner', permission: 'reader' };
    const other = { id: 'user-other', nickname: 'Other', permission: 'reader' };
    const admin = { id: 'user-admin', nickname: 'Admin', permission: 'admin' };
    const comment = store.createComment(post.id, { content: 'first' }, owner);

    expect(comment.userId).toBe(owner.id);
    expect(store.updateComment(comment.id, { content: 'blocked' }, other)).toBeUndefined();
    expect(store.updateComment(comment.id, { content: 'owner edit' }, owner)?.content).toBe('owner edit');
    expect(store.updateComment(comment.id, { content: 'admin edit' }, admin)?.content).toBe('admin edit');
    expect(store.removeComment(comment.id, other)).toBe(false);
    expect(store.removeComment(comment.id, admin)).toBe(true);
  });

  it('persists the admin article editor autosave draft in sqlite', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const store = await createPostStore({ dbPath });

    const saved = store.saveArticleDraft({
      editingId: 'post-1',
      draft: {
        title: '自动保存草稿',
        summary: '每十秒保存一次',
        category: 'notes',
        tags: ['autosave'],
        content: '还没有正式发布的正文',
        status: 'draft',
        cover: 'notes',
        coverImage: ''
      }
    });

    expect(saved.editingId).toBe('post-1');
    expect(saved.draft.title).toBe('自动保存草稿');
    expect(saved.updatedAt).toContain('T');

    const reloadedStore = await createPostStore({ dbPath });
    expect(reloadedStore.getArticleDraft()?.draft.content).toBe('还没有正式发布的正文');
    expect(reloadedStore.clearArticleDraft()).toBe(true);
    expect(reloadedStore.getArticleDraft()).toBeUndefined();
  });
});
