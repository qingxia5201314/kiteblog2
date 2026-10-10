import type { PublicPostPage, PublicPostQuery } from '../../../lib/blog';

export async function fetchArticlePage(query: PublicPostQuery, signal?: AbortSignal): Promise<PublicPostPage> {
  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? 8));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.category !== 'all') params.set('category', query.category);
  if (query.date !== 'all') params.set('date', query.date);
  if (query.tags.length > 0) params.set('tags', query.tags.join(','));

  const response = await fetch(`/api/posts?${params}`, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '文章加载失败');
  return payload as PublicPostPage;
}
