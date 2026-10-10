import {
  ArticleAutosaveDraft,
  BlogPost,
  BlogPostDraft,
  BlogUser,
  PostComment,
  PostCommentDraft,
  PostStatus,
  UserSession
} from './blog';
import { apiFetch, getCurrentUserRequest, loginUserRequest, registerUserRequest } from './apiClient';

export { logoutUserRequest } from './apiClient';

interface ListPostOptions {
  includeDrafts?: boolean;
  summary?: boolean;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function listPosts(options: ListPostOptions = {}): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  if (options.includeDrafts) params.set('includeDrafts', '1');
  if (options.summary && !options.includeDrafts) params.set('summary', '1');
  const query = params.toString() ? `?${params}` : '';
  const payload = await parseResponse<{ posts: BlogPost[] }>(
    await apiFetch(`/api/posts${query}`)
  );

  return payload.posts;
}

export async function getPost(idOrSlug: string): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await apiFetch(`/api/posts/${encodeURIComponent(idOrSlug)}`)
  );

  return payload.post;
}

export async function createPost(draft: BlogPostDraft): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await apiFetch('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );

  return payload.post;
}

export async function updatePost(
  id: string,
  patch: Partial<BlogPostDraft> | { status: PostStatus }
): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await apiFetch(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  );

  return payload.post;
}

export async function deletePost(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}

export async function getArticleAutosaveDraft(): Promise<ArticleAutosaveDraft | null> {
  const payload = await parseResponse<{ draft: ArticleAutosaveDraft | null }>(
    await apiFetch('/api/admin/article-draft')
  );

  return payload.draft;
}

export async function saveArticleAutosaveDraft(
  draft: Omit<ArticleAutosaveDraft, 'updatedAt'>
): Promise<ArticleAutosaveDraft> {
  const payload = await parseResponse<{ draft: ArticleAutosaveDraft }>(
    await apiFetch('/api/admin/article-draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );

  return payload.draft;
}

export async function clearArticleAutosaveDraft(): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch('/api/admin/article-draft', { method: 'DELETE' })
  );
}

export async function getArticlePreview(id: string): Promise<BlogPost> {
  const payload = await parseResponse<{ post: BlogPost }>(
    await apiFetch(`/api/admin/article-preview/${encodeURIComponent(id)}`)
  );
  return payload.post;
}

export async function listPostComments(postIdOrSlug: string): Promise<PostComment[]> {
  const payload = await parseResponse<{ comments: PostComment[] }>(
    await apiFetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments`)
  );

  return payload.comments;
}

export async function createPostComment(postIdOrSlug: string, draft: PostCommentDraft): Promise<PostComment> {
  const payload = await parseResponse<{ comment: PostComment }>(
    await apiFetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );

  return payload.comment;
}

export async function updatePostComment(
  postIdOrSlug: string,
  commentId: string,
  patch: PostCommentDraft
): Promise<PostComment> {
  const payload = await parseResponse<{ comment: PostComment }>(
    await apiFetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  );

  return payload.comment;
}

export async function deletePostComment(postIdOrSlug: string, commentId: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/posts/${encodeURIComponent(postIdOrSlug)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE'
    })
  );
}

export async function registerUser(draft: {
  username: string;
  password: string;
  nickname: string;
}): Promise<UserSession> {
  return registerUserRequest(draft);
}

export async function loginUser(username: string, password: string): Promise<UserSession> {
  return loginUserRequest(username, password);
}

export async function getCurrentUser(): Promise<UserSession> {
  return getCurrentUserRequest();
}

export async function listUsers(): Promise<BlogUser[]> {
  const payload = await parseResponse<{ users: BlogUser[] }>(
    await apiFetch('/api/admin/users')
  );
  return payload.users;
}

export async function createUser(
  draft: { username: string; password: string; nickname: string; permission: BlogUser['permission'] }
): Promise<BlogUser> {
  const payload = await parseResponse<{ user: BlogUser }>(
    await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );
  return payload.user;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<BlogUser, 'nickname' | 'permission'>>
): Promise<BlogUser> {
  const payload = await parseResponse<{ user: BlogUser }>(
    await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  );
  return payload.user;
}

export async function deleteUser(id: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}
