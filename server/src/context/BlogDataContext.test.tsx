import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlogPost, UserSession } from '../lib/blog';
import { BlogDataProvider, useBlogData } from './BlogDataContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { listPosts } = vi.hoisted(() => ({ listPosts: vi.fn() }));
type Notify = ReturnType<typeof vi.fn>;
let appState: { isAdmin: boolean; notify: Notify; userSession: UserSession | null };
let blogData: ReturnType<typeof useBlogData>;

vi.mock('./AppContext', () => ({ useApp: () => appState }));
vi.mock('../lib/blogApi', () => ({ listPosts }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

const session = (id: string, permission: 'reader' | 'admin' = 'admin'): UserSession => ({
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id,
    username: id,
    nickname: id,
    permission,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  }
});

const post = (id: string, status: BlogPost['status']): BlogPost => ({
  id,
  slug: id,
  title: id,
  summary: id,
  category: 'life',
  tags: [],
  content: id,
  status,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  cover: 'life',
  coverImage: ''
});

describe('BlogDataProvider auth transitions', () => {
  let root: Root;
  let host: HTMLDivElement;

  function Probe() {
    blogData = useBlogData();
    return <output>{blogData.posts.map((item) => item.id).join(',')}</output>;
  }

  async function renderFor(userSession: UserSession | null, notify: Notify) {
    appState = {
      isAdmin: userSession?.user.permission === 'admin',
      notify,
      userSession
    };
    await act(async () => root.render(<BlogDataProvider><Probe /></BlogDataProvider>));
  }

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    listPosts.mockReset();
  });

  it('clears A data, reloads for admin B, and ignores A late results', async () => {
    const notify = vi.fn();
    const lateARequest = deferred<BlogPost[]>();
    const bRequest = deferred<BlogPost[]>();
    listPosts
      .mockResolvedValueOnce([post('admin-a-post', 'draft')])
      .mockReturnValueOnce(lateARequest.promise)
      .mockReturnValueOnce(bRequest.promise);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await renderFor(session('admin-a'), notify);
    expect(host.textContent).toBe('admin-a-post');
    let lateALoad!: Promise<void>;
    act(() => { lateALoad = blogData.loadPosts(true); });

    await renderFor(session('admin-b'), notify);

    expect(host.textContent).toBe('');
    expect(listPosts).toHaveBeenCalledTimes(3);
    expect(listPosts).toHaveBeenNthCalledWith(3, { includeDrafts: true, summary: false });
    await act(async () => bRequest.resolve([post('admin-b-post', 'draft')]));
    expect(host.textContent).toBe('admin-b-post');

    await act(async () => lateARequest.resolve([post('late-admin-a-post', 'draft')]));
    await lateALoad;
    expect(host.textContent).toBe('admin-b-post');
    expect(notify).not.toHaveBeenCalled();
  });

  it('hides admin drafts immediately and keeps them hidden when the public reload fails', async () => {
    const notify = vi.fn();
    const publicRequest = deferred<BlogPost[]>();
    listPosts
      .mockResolvedValueOnce([post('admin-draft', 'draft')])
      .mockReturnValueOnce(publicRequest.promise);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await renderFor(session('admin-a'), notify);
    expect(host.textContent).toBe('admin-draft');

    await renderFor(session('reader-a', 'reader'), notify);

    expect(host.textContent).toBe('');
    await act(async () => publicRequest.reject(new Error('public load failed')));
    expect(host.textContent).toBe('');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('error', '文章加载失败，请稍后重试');
  });

  it('does not notify admin B about a pending request failure owned by admin A', async () => {
    const notify = vi.fn();
    const aRequest = deferred<BlogPost[]>();
    const bRequest = deferred<BlogPost[]>();
    listPosts
      .mockReturnValueOnce(aRequest.promise)
      .mockReturnValueOnce(bRequest.promise);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await renderFor(session('admin-a'), notify);
    await renderFor(session('admin-b'), notify);
    await act(async () => aRequest.reject(new Error('stale A error')));

    expect(notify).not.toHaveBeenCalled();
    await act(async () => bRequest.resolve([post('admin-b-post', 'draft')]));
    expect(host.textContent).toBe('admin-b-post');
  });
});
