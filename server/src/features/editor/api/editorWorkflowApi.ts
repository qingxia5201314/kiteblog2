import { apiFetch } from '../../../lib/apiClient';
import { BlogPost, PostRevision, PostRevisionComparison } from '../../../lib/blog';

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '后台操作失败');
  return body as T;
}

const revisionBase = (postId: string) => `/api/admin/posts/${encodeURIComponent(postId)}/revisions`;

export async function listRevisions(postId: string) {
  const payload = await parse<{ revisions?: PostRevision[] }>(await apiFetch(revisionBase(postId)));
  return Array.isArray(payload.revisions) ? payload.revisions : [];
}

export async function compareRevision(postId: string, revisionId: string) {
  return parse<PostRevisionComparison>(
    await apiFetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}/compare`)
  );
}

export async function restoreRevision(postId: string, revisionId: string) {
  return (await parse<{ post: BlogPost }>(
    await apiFetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}/restore`, { method: 'POST' })
  )).post;
}

export async function deleteRevision(postId: string, revisionId: string) {
  await parse(
    await apiFetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}`, { method: 'DELETE' })
  );
}

export async function schedulePost(postId: string, scheduledAt: string) {
  return (await parse<{ post: BlogPost }>(
    await apiFetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt })
    })
  )).post;
}

export async function cancelSchedule(postId: string) {
  return (await parse<{ post: BlogPost }>(
    await apiFetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule`, { method: 'DELETE' })
  )).post;
}

export async function retrySchedule(postId: string) {
  return (await parse<{ post: BlogPost }>(
    await apiFetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule/retry`, { method: 'POST' })
  )).post;
}
