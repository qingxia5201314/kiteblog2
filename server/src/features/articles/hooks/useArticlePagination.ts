import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlogPostSummary, PublicPostPage, PublicPostQuery } from '../../../lib/blog';
import { fetchArticlePage as defaultFetchArticlePage } from '../api/articleQueryApi';

interface UseArticlePaginationOptions {
  query: PublicPostQuery;
  enabled?: boolean;
  fetchPage?: (query: PublicPostQuery, signal?: AbortSignal) => Promise<PublicPostPage>;
}

function mergeUnique(current: BlogPostSummary[], incoming: BlogPostSummary[]) {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !seen.has(post.id))];
}

export function useArticlePagination({
  query,
  enabled = true,
  fetchPage = defaultFetchArticlePage
}: UseArticlePaginationOptions) {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestVersionRef = useRef(0);
  const initialAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const loadMoreInFlightRef = useRef(false);

  const queryKey = useMemo(
    () => JSON.stringify({
      category: query.category,
      date: query.date,
      q: query.q.trim(),
      tags: query.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      limit: query.limit ?? 8
    }),
    [query.category, query.date, query.limit, query.q, query.tags]
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    initialAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    initialAbortRef.current = controller;
    loadMoreInFlightRef.current = false;
    const version = ++requestVersionRef.current;
    setPosts([]);
    setNextCursor(null);
    setHasMore(false);
    setTotal(0);
    setError('');
    setLoadMoreError('');
    setLoading(true);

    void fetchPage({ ...query, cursor: null }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || version !== requestVersionRef.current) return;
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
      })
      .catch((requestError) => {
        if (controller.signal.aborted || version !== requestVersionRef.current) return;
        setError(requestError instanceof Error ? requestError.message : '文章加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersionRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, fetchPage, queryKey, reloadToken]);

  const loadMore = useCallback(() => {
    if (!enabled || !hasMore || !nextCursor || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;
    const version = requestVersionRef.current;
    setLoadingMore(true);
    setLoadMoreError('');

    void fetchPage({ ...query, cursor: nextCursor }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || version !== requestVersionRef.current) return;
        setPosts((current) => mergeUnique(current, page.posts));
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
      })
      .catch((requestError) => {
        if (controller.signal.aborted || version !== requestVersionRef.current) return;
        setLoadMoreError(requestError instanceof Error ? requestError.message : '加载下一页失败');
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersionRef.current) setLoadingMore(false);
        loadMoreInFlightRef.current = false;
      });
  }, [enabled, fetchPage, hasMore, nextCursor, query, queryKey]);

  const retry = useCallback(() => {
    if (loadMoreError) {
      loadMore();
      return;
    }
    setReloadToken((value) => value + 1);
  }, [loadMore, loadMoreError]);

  return { posts, nextCursor, hasMore, total, loading, loadingMore, error, loadMoreError, loadMore, retry };
}
