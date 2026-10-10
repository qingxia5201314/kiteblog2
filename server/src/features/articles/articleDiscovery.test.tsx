import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArticleSearch } from './components/ArticleSearch';
import { SearchHighlight } from './components/SearchHighlight';
import { useArticlePagination } from './hooks/useArticlePagination';
import { fetchArticlePage } from './api/articleQueryApi';
import type { BlogPostSummary, PublicPostPage, PublicPostQuery } from '../../lib/blog';

const roots: Array<ReturnType<typeof createRoot>> = [];

function summary(id: string, title = id): BlogPostSummary {
  return {
    id,
    slug: id,
    title,
    summary: `${title} summary`,
    category: 'notes',
    tags: ['test'],
    status: 'published',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    publishedAt: '2026-07-01T00:00:00.000Z',
    cover: 'notes',
    coverImage: '',
    readingMinutes: 1
  };
}

function PaginationHarness({
  fetchPage,
  initialQuery = { category: 'all', date: 'all', tags: [], q: '' }
}: {
  fetchPage: (query: PublicPostQuery, signal?: AbortSignal) => Promise<PublicPostPage>;
  initialQuery?: PublicPostQuery;
}) {
  const result = useArticlePagination({ query: initialQuery, fetchPage });
  return (
    <div>
      <output data-testid="items">{result.posts.map((post) => post.id).join(',')}</output>
      <output data-testid="error">{result.error || result.loadMoreError || ''}</output>
      <button disabled={!result.hasMore || result.loadingMore} onClick={result.loadMore} type="button">
        more
      </button>
      <button onClick={result.retry} type="button">retry</button>
    </div>
  );
}

async function waitFor(check: () => boolean, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error('Timed out');
}

afterEach(() => {
  roots.splice(0).forEach((root) => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('article discovery', () => {
  it('encodes server filters and forwards AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [], nextCursor: null, hasMore: false, total: 0 })
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchArticlePage(
      { category: 'study', date: '30d', q: 'React 安全', tags: ['前端', '学习'], cursor: 'next', limit: 8 },
      controller.signal
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts?limit=8&cursor=next&q=React+%E5%AE%89%E5%85%A8&category=study&date=30d&tags=%E5%89%8D%E7%AB%AF%2C%E5%AD%A6%E4%B9%A0',
      { signal: controller.signal }
    );
  });

  it('highlights literal text without rendering hostile HTML', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<SearchHighlight query="<img" text={'前缀 <img onerror="alert(1)"> 后缀'} />));

    expect(host.querySelectorAll('mark')).toHaveLength(1);
    expect(host.querySelector('img')).toBeFalsy();
    expect(host.textContent).toContain('<img onerror="alert(1)">');
  });

  it('debounces committed search changes by 300ms', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<ArticleSearch onChange={onChange} value="" />));
    const input = host.querySelector('input') as HTMLInputElement;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'react');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onChange).toHaveBeenCalledWith('react');
  });

  it('appends pages without duplicates and prevents concurrent load-more requests', async () => {
    let resolveMore: ((page: PublicPostPage) => void) | undefined;
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ posts: [summary('a'), summary('b')], nextCursor: 'c1', hasMore: true, total: 3 })
      .mockImplementationOnce(
        () => new Promise<PublicPostPage>((resolve) => {
          resolveMore = resolve;
        })
      );
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<PaginationHarness fetchPage={fetchPage} />));
    await waitFor(() => host.querySelector('[data-testid="items"]')?.textContent === 'a,b');
    const more = host.querySelector('button') as HTMLButtonElement;

    act(() => {
      more.click();
      more.click();
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveMore?.({ posts: [summary('b'), summary('c')], nextCursor: null, hasMore: false, total: 3 });
    });
    expect(host.querySelector('[data-testid="items"]')?.textContent).toBe('a,b,c');
  });

  it('keeps current rows after a load-more failure and retries from the same cursor', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ posts: [summary('a')], nextCursor: 'c1', hasMore: true, total: 2 })
      .mockRejectedValueOnce(new Error('加载下一页失败'))
      .mockResolvedValueOnce({ posts: [summary('b')], nextCursor: null, hasMore: false, total: 2 });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<PaginationHarness fetchPage={fetchPage} />));
    await waitFor(() => host.querySelector('[data-testid="items"]')?.textContent === 'a');

    act(() => (host.querySelector('button') as HTMLButtonElement).click());
    await waitFor(() => Boolean(host.querySelector('[data-testid="error"]')?.textContent));
    expect(host.querySelector('[data-testid="items"]')?.textContent).toBe('a');
    const buttons = host.querySelectorAll('button');
    act(() => (buttons[1] as HTMLButtonElement).click());
    await waitFor(() => host.querySelector('[data-testid="items"]')?.textContent === 'a,b');
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }), expect.any(AbortSignal));
  });
});
