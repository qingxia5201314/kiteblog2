import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearArticleAutosaveDraft,
  createPost,
  createPostComment,
  createUser,
  deletePost,
  deletePostComment,
  deleteUser,
  getArticleAutosaveDraft,
  getArticlePreview,
  getCurrentUser,
  getPost,
  listPostComments,
  listPosts,
  listUsers,
  loginUser,
  logoutUserRequest,
  registerUser,
  saveArticleAutosaveDraft,
  updatePost,
  updatePostComment,
  updateUser
} from './blogApi';

const user = {
  id: 'u1',
  username: 'kite',
  nickname: 'Kite',
  permission: 'admin' as const,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z'
};

const session = {
  expiresAt: '2026-07-14T01:00:00.000Z',
  user
};

const post = {
  id: 'p1',
  slug: 'hello-post',
  title: 'Hello',
  summary: 'Summary',
  category: 'notes' as const,
  tags: ['test'],
  content: 'full content',
  status: 'draft' as const,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
  cover: 'notes' as const,
  coverImage: ''
};

function expectNoBearerCalls(fetchMock: ReturnType<typeof vi.fn>) {
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
}

describe('blog api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads public and admin post views with same-origin cookies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ posts: [post], post })));
    vi.stubGlobal('fetch', fetchMock);

    await listPosts({ includeDrafts: true });
    await listPosts({ summary: true });
    await getPost('hello-post');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts?includeDrafts=1', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts?summary=1', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/posts/hello-post', { credentials: 'same-origin' });
    expectNoBearerCalls(fetchMock);
  });

  it('creates, updates, and deletes posts with same-origin cookies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ post, ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    const draft = {
      title: post.title,
      summary: post.summary,
      category: post.category,
      tags: post.tags,
      content: post.content,
      status: post.status,
      cover: post.cover,
      coverImage: post.coverImage
    };

    await createPost(draft);
    await updatePost('p1', { status: 'published' });
    await deletePost('p1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts/p1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/posts/p1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expectNoBearerCalls(fetchMock);
  });

  it('reads, creates, updates, and deletes comments with same-origin cookies', async () => {
    const comment = { id: 'c1', content: 'edited' };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ comments: [], comment, ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    await listPostComments('hello-post');
    await createPostComment('hello-post', { content: '不错' });
    await updatePostComment('hello-post', 'c1', { content: 'edited' });
    await deletePostComment('hello-post', 'c1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts/hello-post/comments', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/posts/hello-post/comments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '不错' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/posts/hello-post/comments/c1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'edited' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/posts/hello-post/comments/c1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expectNoBearerCalls(fetchMock);
  });

  it('registers, logs in, restores, and logs out users with same-origin cookies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      ...session,
      ok: true,
      token: 'legacy-secret',
      traceId: 'must-not-escape'
    })));
    vi.stubGlobal('fetch', fetchMock);

    const registered = await registerUser({ username: 'kite', password: 'secret123', nickname: 'Kite' });
    expect(registered).toEqual(session);
    expect(registered).not.toHaveProperty('token');
    await expect(loginUser('kite', 'secret123')).resolves.toEqual(session);
    await expect(getCurrentUser()).resolves.toEqual(session);
    await logoutUserRequest();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/users/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123', nickname: 'Kite' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/users/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/users/me', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/users/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expectNoBearerCalls(fetchMock);
  });

  it('rejects malformed registration session responses with a safe generic error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...session, expiresAt: 123 }))
      .mockResolvedValueOnce(Response.json({ ...session, user: { ...user, id: 123 } }));
    vi.stubGlobal('fetch', fetchMock);
    const draft = { username: 'kite', password: 'secret123', nickname: 'Kite' };

    await expect(registerUser(draft)).rejects.toThrow('Authentication response was invalid');
    await expect(registerUser(draft)).rejects.toThrow('Authentication response was invalid');
  });

  it('rejects invalid current-user responses instead of returning a nullable restore result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user }, { status: 200 })));

    await expect(getCurrentUser()).rejects.toThrow('Authentication response was invalid');
  });

  it('lists, creates, updates, and deletes admin-managed users with same-origin cookies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ users: [user], user, ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    const draft = { username: 'made_user', password: 'secret123', nickname: 'Made', permission: 'reader' as const };

    await listUsers();
    await createUser(draft);
    await updateUser('u1', { nickname: 'Updated' });
    await deleteUser('u1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/users', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/admin/users/u1', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'Updated' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/admin/users/u1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expectNoBearerCalls(fetchMock);
  });

  it('manages article autosave and preview with same-origin cookies', async () => {
    const draft = {
      editingId: 'post-1',
      draft: {
        title: 'autosave',
        summary: 'summary',
        category: 'notes' as const,
        tags: ['draft'],
        content: 'content',
        status: 'draft' as const,
        cover: 'notes' as const,
        coverImage: ''
      }
    };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      draft: { ...draft, updatedAt: '2026-07-10T00:00:00.000Z' },
      post,
      ok: true
    })));
    vi.stubGlobal('fetch', fetchMock);

    await getArticleAutosaveDraft();
    await saveArticleAutosaveDraft(draft);
    await clearArticleAutosaveDraft();
    await getArticlePreview('post-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/article-draft', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/article-draft', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/admin/article-draft', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/admin/article-preview/post-1', { credentials: 'same-origin' });
    expectNoBearerCalls(fetchMock);
  });
});
