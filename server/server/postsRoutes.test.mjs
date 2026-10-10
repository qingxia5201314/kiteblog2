import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postsRoutes } from './routes/posts.mjs';
import { createPostService } from './services/postService.mjs';

const publishedPost = {
  id: 'post-1',
  slug: 'published-post',
  title: 'Published post',
  summary: 'Summary',
  category: 'notes',
  tags: [],
  content: 'Full article body',
  status: 'published',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  cover: 'notes',
  coverImage: '',
  publishedAt: '2026-07-01T00:00:00.000Z'
};

const draftPost = {
  ...publishedPost,
  id: 'post-draft',
  slug: 'draft-post',
  title: 'Draft post',
  status: 'draft',
  publishedAt: ''
};

const reader = { id: 'reader-1', username: 'reader', nickname: 'Reader', permission: 'reader' };
const admin = { id: 'admin-1', username: 'admin', nickname: 'Admin', permission: 'admin' };

let authSession;
let postStore;
let postService;
let revisionService;
let app;

beforeEach(() => {
  authSession = null;
  postStore = {
    list: vi.fn(({ includeDrafts = false } = {}) => includeDrafts ? [publishedPost, draftPost] : [publishedPost]),
    get: vi.fn((id) => id === draftPost.id || id === draftPost.slug ? draftPost : publishedPost),
    queryPublic: vi.fn(() => ({
      posts: [{ ...publishedPost, content: undefined, readingMinutes: 2, _score: 0 }],
      total: 1
    })),
    create: vi.fn((draft) => ({ ...publishedPost, ...draft, id: 'post-created' })),
    update: vi.fn((id, patch) => ({ ...publishedPost, ...patch, id })),
    remove: vi.fn(() => true),
    listComments: vi.fn(() => []),
    createComment: vi.fn((_postId, body, user) => ({ id: 'comment-1', ...body, userId: user.id })),
    updateComment: vi.fn((_commentId, body, user) => ({ id: 'comment-1', ...body, userId: user.id })),
    removeComment: vi.fn(() => true)
  };
  revisionService = { snapshot: vi.fn() };
  postService = createPostService({ store: postStore, revisionService });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('postService', postService);
    await next();
  });
  app.route('/api/posts', postsRoutes);
});

describe('public post cache policy', () => {
  it('requires revalidation for compact lists and full article responses', async () => {
    const listResponse = await app.request('/api/posts?summary=1');
    const detailResponse = await app.request('/api/posts/published-post');

    expect(listResponse.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(detailResponse.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(listResponse.headers.get('cache-control')).not.toContain('stale-while-revalidate');
    expect(detailResponse.headers.get('cache-control')).not.toContain('stale-while-revalidate');
  });

  it('returns the cursor contract for public pagination without changing article detail', async () => {
    const listResponse = await app.request('/api/posts?limit=8');
    const detailResponse = await app.request('/api/posts/published-post');
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listBody).toMatchObject({ nextCursor: null, hasMore: false, total: 1 });
    expect(listBody.posts[0]).not.toHaveProperty('content');
    expect(detailBody.post.content).toBe('Full article body');
  });

  it('returns 400 for a malformed public cursor', async () => {
    const response = await app.request('/api/posts?cursor=broken');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('keeps legacy full-list calls compatible and makes summary rows honest', async () => {
    const fullResponse = await app.request('/api/posts');
    const summaryResponse = await app.request('/api/posts?summary=1');
    const fullBody = await fullResponse.json();
    const summaryBody = await summaryResponse.json();

    expect(fullBody).toEqual({ posts: [publishedPost] });
    expect(summaryBody.posts[0]).not.toHaveProperty('content');
    expect(summaryBody).not.toHaveProperty('nextCursor');
  });
});

describe('post role authorization', () => {
  it('keeps the published list public for anonymous requests', async () => {
    const response = await app.request('/api/posts');

    expect(response.status).toBe(200);
    expect((await response.json()).posts).toEqual([publishedPost]);
  });

  it.each([
    ['anonymous', null, 401],
    ['reader', { user: reader }, 403]
  ])('rejects %s includeDrafts requests', async (_role, session, status) => {
    authSession = session;

    const response = await app.request('/api/posts?includeDrafts=1');

    expect(response.status).toBe(status);
  });

  it('allows administrators to list drafts with private cache policy', async () => {
    authSession = { user: admin };

    const response = await app.request('/api/posts?includeDrafts=1');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).posts).toEqual([publishedPost, draftPost]);
  });

  it.each([
    ['anonymous', null, 'POST', '/api/posts', 401],
    ['reader', { user: reader }, 'POST', '/api/posts', 403],
    ['anonymous', null, 'PUT', '/api/posts/post-1', 401],
    ['reader', { user: reader }, 'DELETE', '/api/posts/post-1', 403]
  ])('rejects %s management request %s %s', async (_role, session, method, path, status) => {
    authSession = session;

    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify({ title: 'Managed' })
    });

    expect(response.status).toBe(status);
  });

  it('records the administrator as editor for create and update, and permits delete', async () => {
    authSession = { user: admin };

    const create = await app.request('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Created' })
    });
    const update = await app.request('/api/posts/post-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' })
    });
    const remove = await app.request('/api/posts/post-1', { method: 'DELETE' });

    expect(create.status).toBe(201);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(revisionService.snapshot).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      { source: 'create', editorUserId: admin.id }
    );
    expect(revisionService.snapshot).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ editorUserId: admin.id })
    );
  });
});

describe('comment session authorization', () => {
  it('ignores Bearer credentials when there is no hydrated user', async () => {
    const response = await app.request('/api/posts/post-1/comments', {
      method: 'POST',
      headers: { Authorization: 'Bearer legacy-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'No session' })
    });

    expect(response.status).toBe(401);
    expect(postStore.createComment).not.toHaveBeenCalled();
  });

  it('passes the hydrated owner or administrator to comment mutations', async () => {
    authSession = { user: reader };
    const create = await app.request('/api/posts/post-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Owner comment' })
    });
    const update = await app.request('/api/posts/post-1/comments/comment-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Owner edit' })
    });
    authSession = { user: admin };
    const remove = await app.request('/api/posts/post-1/comments/comment-1', { method: 'DELETE' });

    expect(create.status).toBe(201);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(postStore.createComment).toHaveBeenCalledWith('post-1', { content: 'Owner comment' }, reader);
    expect(postStore.updateComment).toHaveBeenCalledWith('comment-1', { content: 'Owner edit' }, reader);
    expect(postStore.removeComment).toHaveBeenCalledWith('comment-1', admin);
  });
});
