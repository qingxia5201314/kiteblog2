import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AppProvider, useApp } from './context/AppContext';
import { BlogDataProvider } from './context/BlogDataContext';
import { AdminPage } from './pages/AdminPage';

vi.mock('./assets/accounting-hero.webp', () => ({ default: '/accounting-hero.webp' }));
vi.mock('./assets/haruhi-favicon.png', () => ({ default: '/haruhi-favicon.png' }));
vi.mock('./assets/haruhi-avatar.png', () => ({ default: '/haruhi-avatar.png' }));
vi.mock('./assets/haruhi-cutout.png', () => ({ default: '/haruhi-cutout.png' }));
vi.mock('./assets/haruhi-cutout.webp', () => ({ default: '/haruhi-cutout.webp' }));

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const post = {
    id: 'post-1',
    slug: 'post-1',
    title: 'Test post',
    summary: 'summary',
    category: 'life',
    tags: ['one'],
    content: 'content',
    status: 'published',
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    publishedAt: '2026-06-18T10:00:00.000Z',
    cover: 'life',
    coverImage: ''
  };
  if (/^\/api\/posts\/[^/]+$/.test(url)) {
    return Response.json({ post });
  }
  if (url.includes('/comments')) {
    return Response.json({ comments: [] });
  }
  if (url.startsWith('/api/posts')) {
    const paged = url.includes('limit=');
    return {
      ok: true,
      json: async () => ({
        posts: paged ? [{ ...post, content: undefined, readingMinutes: 1 }] : [post],
        ...(paged ? { nextCursor: null, hasMore: false, total: 1 } : {})
      })
    } as Response;
  }

  if (url.startsWith('/api/users/me')) {
    return {
      ok: false,
      json: async () => ({ message: 'Unauthorized' })
    } as Response;
  }

  return {
    ok: true,
    json: async () => ({ ok: true })
  } as Response;
});

class FakeUploadTarget {
  onprogress: ((event: ProgressEvent) => void) | null = null;
}

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | null = null;

  responseText = '';
  status = 0;
  upload = new FakeUploadTarget();
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open() {}

  setRequestHeader() {}

  send() {}
}

function AdminAutosaveTestShell() {
  const { notification, clearNotification } = useApp();

  return (
    <>
      {notification ? (
        <div className={`toast toast-${notification.type}`}>
          <span>{notification.message}</span>
          <button aria-label="关闭提示" onClick={clearNotification} type="button">
            ×
          </button>
        </div>
      ) : null}
      <AdminPage />
    </>
  );
}

describe('App layout shells', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  const sessionFor = (permission: 'reader' | 'admin') => ({
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      id: `${permission}-1`,
      username: permission,
      nickname: permission === 'admin' ? 'Admin' : 'Reader',
      permission,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    }
  });

  async function waitFor(check: () => Element | null, attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  async function waitForWithTimers(check: () => Element | null, attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const result = check();
      if (result) return result;
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();
    }
    return null;
  }

  function fillInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    FakeXMLHttpRequest.latest = null;
  });

  it('removes every legacy token session when the app starts', async () => {
    window.localStorage.setItem('kitepop-admin-session', '{"token":"old-admin"}');
    window.localStorage.setItem('kitepop-user-session', '{"token":"old-user"}');
    window.localStorage.setItem('kitepop-accounting-session', '{"token":"old-accounting"}');
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    root.render(<App />);

    expect(await waitFor(() => (
      window.localStorage.getItem('kitepop-admin-session') === null &&
      window.localStorage.getItem('kitepop-user-session') === null &&
      window.localStorage.getItem('kitepop-accounting-session') === null
    ) ? host : null)).toBeTruthy();
  });

  it('shows the account login form to an anonymous management-route visitor', async () => {
    window.history.pushState({}, '', '/accounting');
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    root.render(<App />);

    expect(await waitFor(() => host.querySelector('form.unlock-panel input[name="username"]'))).toBeTruthy();
    expect(host.querySelector('form.unlock-panel')?.textContent).toContain('管理员登录');
    expect(host.querySelector('input[aria-label="记账口令"]')).toBeFalsy();
  });

  it('shows the forbidden state to a signed-in reader on management routes', async () => {
    window.history.pushState({}, '', '/images');
    const readerFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/users/me') return Response.json(sessionFor('reader'));
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', readerFetch);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.unlock-panel h1'))).toHaveProperty(
      'textContent',
      '当前账号没有管理员权限'
    );
    expect(readerFetch.mock.calls.some(([input]) => String(input).startsWith('/api/images'))).toBe(false);
  });

  it.each([
    ['/admin', '/api/admin/users', 'input[aria-label="文章标题"]'],
    ['/accounting', '/api/accounting/month', '.accounting-metrics'],
    ['/images', '/api/images', '.image-list-panel'],
    ['/files', '/api/files', '.file-list-panel']
  ])('loads %s directly for an admin without a second password form', async (route, dataEndpoint, pageSelector) => {
    window.history.pushState({}, '', route);
    const adminFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url === '/api/admin/article-draft') return Response.json({ draft: null });
      if (url.startsWith('/api/accounting/month')) {
        return Response.json({
          entries: [],
          categories: [],
          settings: { monthlyBudgetCents: 0 },
          savingGoal: null,
          summary: {
            incomeCents: 0,
            expenseCents: 0,
            balanceCents: 0,
            budgetLimitCents: 0,
            budgetRemainingCents: 0,
            budgetUsedPercent: 0,
            targetSavingCents: 0
          }
        });
      }
      if (url.startsWith('/api/images')) return Response.json({ images: [] });
      if (url.startsWith('/api/files')) {
        return Response.json({ folder: null, breadcrumbs: [], folders: [], files: [] });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', adminFetch);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    root.render(<App />);

    expect(await waitFor(() => (
      adminFetch.mock.calls.some(([input]) => String(input).startsWith(dataEndpoint))
        ? host.querySelector(pageSelector)
        : null
    ))).toBeTruthy();
    expect(host.querySelector('.unlock-panel')).toBeFalsy();
    expect(host.querySelector('input[type="password"]')).toBeFalsy();
  });

  it('renders the redesigned home shell with hero and article index areas', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.hero-band'));
    await waitFor(() => host.querySelector('.post-item'));

    expect(host.querySelector('.hero-band')).toBeTruthy();
    expect(host.querySelector('.home-post-section')).toBeTruthy();
    expect(host.querySelector('.post-list')).toBeTruthy();
    expect(host.querySelector('.hero-visual.tilt-card')).toBeTruthy();
    expect(host.querySelector('.post-item.tilt-card')).toBeTruthy();
  });

  it('keeps a single main landmark when rendering the About route inside Layout', async () => {
    window.history.pushState({}, '', '/about');
    const aboutFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/about') {
        return Response.json({
          profile: {
            avatarUrl: '',
            displayName: 'Kite',
            identityTags: ['写作者'],
            intro: '个人介绍',
            githubUrl: '',
            content: '# 关于我',
            updatedAt: '2026-07-12T00:00:00.000Z'
          }
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', aboutFetch);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const aboutRoot = await waitFor(() => host.querySelector('.about-page'));
    expect(aboutRoot).toBeTruthy();
    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(aboutRoot?.tagName).not.toBe('MAIN');
  });

  it('loads the public article index page by page and appends with load more', async () => {
    const pageRequests: string[] = [];
    const pagedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/posts?limit=8') {
        pageRequests.push(url);
        return Response.json({
          posts: [{
            id: 'post-1', slug: 'post-1', title: 'First result', summary: 'first summary', category: 'life',
            tags: ['one'], status: 'published', createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z', publishedAt: '2026-07-01T00:00:00.000Z',
            cover: 'life', coverImage: '', readingMinutes: 1
          }],
          nextCursor: 'next-page', hasMore: true, total: 2
        });
      }
      if (url === '/api/posts?limit=8&cursor=next-page') {
        pageRequests.push(url);
        return Response.json({
          posts: [{
            id: 'post-2', slug: 'post-2', title: 'Second result', summary: 'second summary', category: 'notes',
            tags: ['two'], status: 'published', createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z', publishedAt: '2026-06-01T00:00:00.000Z',
            cover: 'notes', coverImage: '', readingMinutes: 2
          }],
          nextCursor: null, hasMore: false, total: 2
        });
      }
      if (url === '/api/posts?summary=1') return Response.json({ posts: [] });
      if (url.startsWith('/api/users/me')) {
        return Response.json({ message: 'Unauthorized' }, { status: 401 });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pagedFetch);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    await waitFor(() => host.querySelector('.post-item'));
    expect(host.querySelector('.filter-total')?.textContent).toContain('2');
    const loadMore = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('加载更多'));
    expect(loadMore).toBeTruthy();
    loadMore?.click();
    await waitFor(() => host.querySelectorAll('.post-item').length === 2 ? host.querySelector('.post-list') : null);

    expect(Array.from(host.querySelectorAll('.post-item strong')).map((node) => node.textContent)).toEqual([
      'First result',
      'Second result'
    ]);
    expect(pageRequests).toEqual(['/api/posts?limit=8', '/api/posts?limit=8&cursor=next-page']);
  });

  it('keeps useful public navigation and places about immediately after home', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/users/me') return Response.json(sessionFor('admin'));
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const nav = await waitFor(() => {
      const current = host.querySelector('.topbar nav');
      return current?.textContent?.includes('工具') ? current : null;
    });
    const publicLinks = Array.from(nav?.querySelectorAll(':scope > a') ?? []);
    expect(publicLinks.slice(0, 2).map((link) => link.textContent)).toEqual(['首页', '关于我']);
    expect(publicLinks[1]?.getAttribute('href')).toBe('/about');
    expect(nav?.textContent).toContain('工具');
    expect(nav?.textContent).not.toContain('文章');
    expect(nav?.textContent).not.toContain('分类');
    expect(nav?.textContent).not.toContain('专题');
    expect(host.querySelector('.home-about')).toBeFalsy();
  });

  it('keeps about public while logged out, marks it active, and mounts back-to-top after main content', async () => {
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/about');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const nav = await waitFor(() => host.querySelector('.topbar nav'));
    const aboutLink = nav?.querySelector<HTMLAnchorElement>('a[href="/about"]');
    expect(aboutLink?.textContent).toBe('关于我');
    expect(aboutLink?.classList.contains('active')).toBe(true);
    expect(aboutLink?.getAttribute('aria-current')).toBe('page');
    expect(nav?.textContent).toContain('登录');

    const mainContent = host.querySelector('#main-content');
    const backToTop = host.querySelector('button[aria-label="回到页面顶部"]');
    expect(mainContent).toBeTruthy();
    expect(backToTop).toBeTruthy();
    expect(mainContent?.nextElementSibling).toBe(backToTop);
  });

  it('uses the clean complete hero character asset', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const heroImage = (await waitFor(() => host.querySelector('.hero-art img'))) as HTMLImageElement | null;
    const compactImage = host.querySelector('.hero-character-compact') as HTMLImageElement | null;
    expect(heroImage?.getAttribute('src')).toBe('/haruhi-cutout.png');
    expect(compactImage?.getAttribute('src')).toBe('/haruhi-cutout.png');
  });

  it('requests a missing article once without reloading the public post list', async () => {
    window.history.pushState({}, '', '/posts/missing-post');
    const requestCounts = { detail: 0, list: 0 };
    const missingPostFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts?limit=')) {
        requestCounts.list += 1;
        return Response.json({ posts: [], nextCursor: null, hasMore: false, total: 0 });
      }
      if (url === '/api/posts/missing-post') {
        requestCounts.detail += 1;
        return Response.json({ message: 'Post not found' }, { status: 404 });
      }
      if (url === '/api/posts?summary=1') return Response.json({ posts: [] });
      if (url.startsWith('/api/users/me')) {
        return Response.json({ message: 'Unauthorized' }, { status: 401 });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', missingPostFetch);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    await waitFor(() => (requestCounts.detail === 1 ? host : null));

    expect(requestCounts.detail).toBe(1);
    expect(requestCounts.list).toBe(0);
  });

  it('marks the current top navigation item as active', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/users/me') return Response.json(sessionFor('admin'));
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    window.history.pushState({}, '', '/images');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.topbar nav a.active[aria-current="page"]'));

    const activeNav = host.querySelector('.topbar nav a.active');
    expect(activeNav?.getAttribute('aria-current')).toBe('page');
    expect(activeNav?.textContent).toContain('图床');
  });

  it('shows inline and display formula controls in the admin editor', async () => {
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(
      await waitFor(() => host.querySelector('button[aria-label="一级标题"], button[aria-label="行内公式"]'))
    ).toBeTruthy();
    expect(host.querySelector('button[aria-label="块级公式"]')).toBeTruthy();
  });

  it('autosaves the admin article editor through the atomic draft endpoint every ten seconds without a toast', async () => {
    vi.useFakeTimers();
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/posts' && init?.method === 'POST') {
        const draft = JSON.parse(String(init.body));
        return Response.json(
          {
            post: {
              ...draft,
              id: 'auto-draft-1',
              slug: 'auto-draft-1',
              createdAt: '2026-07-10T00:00:00.000Z',
              updatedAt: '2026-07-10T00:00:00.000Z'
            }
          },
          { status: 201 }
        );
      }
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url === '/api/admin/article-draft' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        return Response.json({ draft: { ...body, editingId: 'auto-draft-1', updatedAt: '2026-07-10T00:00:00.000Z' } });
      }
      if (url === '/api/admin/article-draft') return Response.json({ draft: null });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(
      <BrowserRouter>
        <AppProvider>
          <BlogDataProvider>
            <AdminAutosaveTestShell />
          </BlogDataProvider>
        </AppProvider>
      </BrowserRouter>
    );

    const titleInput = (await waitForWithTimers(() => host.querySelector('input[aria-label="文章标题"]'))) as HTMLInputElement | null;
    expect(titleInput).toBeTruthy();
    fillInput(titleInput!, '数据库自动保存测试');

    expect(await waitForWithTimers(() => (host.textContent?.includes('10s后自动保存文章') ? host : null))).toBeTruthy();
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();

    const saveCall = adminFetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/admin/article-draft' && init?.method === 'PUT'
    );
    expect(saveCall).toBeTruthy();
    expect(saveCall?.[1]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      editingId: null,
      draft: { title: '数据库自动保存测试' }
    });
    expect(adminFetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/posts' && init?.method === 'POST')).toHaveLength(0);
    expect(host.querySelector('.toast')).toBeFalsy();
  });

  it('publishes an autosaved draft by updating its existing post', async () => {
    vi.useFakeTimers();
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url.startsWith('/api/admin/posts/')) return Response.json({ revisions: [] });
      if (url === '/api/admin/article-draft' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        return Response.json({ draft: { ...body, editingId: 'auto-draft-1', updatedAt: '2026-07-10T00:00:00.000Z' } });
      }
      if (url === '/api/admin/article-draft') return Response.json({ draft: null, ok: true });
      if (url === '/api/posts/auto-draft-1' && init?.method === 'PUT') {
        const post = JSON.parse(String(init.body));
        return Response.json({ post: { ...post, id: 'auto-draft-1', slug: 'auto-draft-1', createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:01.000Z' } });
      }
      if (url === '/api/posts' && init?.method === 'POST') {
        return Response.json({ ok: false, message: 'A second post must not be created' }, { status: 500 });
      }
      if (url.startsWith('/api/posts')) return Response.json({ posts: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<BrowserRouter><AppProvider><BlogDataProvider><AdminAutosaveTestShell /></BlogDataProvider></AppProvider></BrowserRouter>);

    const titleInput = await waitForWithTimers(() => host.querySelector('input[aria-label="文章标题"]')) as HTMLInputElement | null;
    const summaryInput = host.querySelector('textarea:not(.content-editor)') as HTMLTextAreaElement | null;
    const contentInput = host.querySelector('textarea.content-editor') as HTMLTextAreaElement | null;
    const statusSelect = Array.from(host.querySelectorAll('select')).find((select) =>
      Array.from(select.options).some((option) => option.value === 'published')
    );
    expect(titleInput && summaryInput && contentInput && statusSelect).toBeTruthy();
    fillInput(titleInput!, '自动保存后发布');
    fillInput(summaryInput!, '不会新建第二篇文章');
    fillInput(contentInput!, '正文');
    statusSelect!.value = 'published';
    statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(await waitForWithTimers(() =>
      adminFetchMock.mock.calls.some(([input, init]) => String(input) === '/api/admin/article-draft' && init?.method === 'PUT') ? host : null
    )).toBeTruthy();

    const form = host.querySelector('form.editor-panel') as HTMLFormElement | null;
    expect(form).toBeTruthy();
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(await waitForWithTimers(() =>
      adminFetchMock.mock.calls.some(([input, init]) => String(input) === '/api/posts/auto-draft-1' && init?.method === 'PUT') ? host : null
    )).toBeTruthy();
    expect(adminFetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/posts' && init?.method === 'POST')).toHaveLength(0);
  });

  it('switches articles after draft recovery and always opens new articles with an empty form', async () => {
    window.history.pushState({}, '', '/admin');
    const posts = [
      {
        id: 'post-a', slug: 'post-a', title: '文章 A', summary: '摘要 A', category: 'notes', tags: ['A'],
        content: '正文 A', status: 'published', createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T01:00:00.000Z', cover: 'notes', coverImage: ''
      },
      {
        id: 'post-b', slug: 'post-b', title: '文章 B', summary: '摘要 B', category: 'life', tags: ['B'],
        content: '正文 B', status: 'draft', createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T02:00:00.000Z', cover: 'life', coverImage: ''
      }
    ];
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url === '/api/admin/article-draft') return Response.json({ draft: {
        editingId: 'post-a', updatedAt: '2026-07-10T03:00:00.000Z',
        draft: { ...posts[0], title: '文章 A 的恢复内容', id: undefined, slug: undefined, createdAt: undefined, updatedAt: undefined }
      } });
      if (url.startsWith('/api/admin/posts/')) return Response.json({ revisions: [] });
      if (url.startsWith('/api/posts')) return Response.json({ posts });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(
      <BrowserRouter><AppProvider><BlogDataProvider><AdminAutosaveTestShell /></BlogDataProvider></AppProvider></BrowserRouter>
    );

    const expand = await waitFor(() => host.querySelector('.admin-content-group .panel-heading button')) as HTMLButtonElement;
    expand.click();
    expect(await waitFor(() => (host.textContent?.includes('文章 A') ? host : null))).toBeTruthy();

    const openPost = async (title: string) => {
      const card = Array.from(host.querySelectorAll('.admin-post')).find((item) => item.textContent?.includes(title));
      (card?.querySelector('.admin-post-main') as HTMLButtonElement).click();
      await waitFor(() => card?.querySelector('.admin-post-actions') ?? null);
      (Array.from(card?.querySelectorAll('.admin-post-actions button') || []).find((button) => button.textContent === '编辑') as HTMLButtonElement).click();
    };

    await openPost('文章 A');
    expect(await waitFor(() => host.querySelector('.draft-recovery-dialog'))).toBeTruthy();
    (Array.from(host.querySelectorAll('.draft-recovery-dialog button')).find((button) => button.textContent === '恢复草稿') as HTMLButtonElement).click();
    expect(await waitFor(() => (host.querySelector('input[aria-label="文章标题"]') as HTMLInputElement)?.value === '文章 A 的恢复内容' ? host : null)).toBeTruthy();

    await openPost('文章 B');
    expect(host.querySelector('.draft-recovery-dialog')).toBeFalsy();
    expect(await waitFor(() => (host.querySelector('input[aria-label="文章标题"]') as HTMLInputElement)?.value === '文章 B' ? host : null)).toBeTruthy();

    (host.querySelector('.admin-create') as HTMLButtonElement).click();
    expect(await waitFor(() => (host.querySelector('input[aria-label="文章标题"]') as HTMLInputElement)?.value === '' ? host : null)).toBeTruthy();
    expect((host.querySelector('input[placeholder="用逗号分隔标签"]') as HTMLInputElement).value).toBe('');
    expect((host.querySelector('.content-editor') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders readable Chinese labels in the admin content managers', async () => {
    window.history.pushState({}, '', '/admin');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url === '/api/admin/about') return Response.json({ profile: {
        avatarUrl: '/avatar.png', displayName: 'Kite', identityTags: ['写作者'], intro: '简介',
        githubUrl: 'https://github.com/kite', content: '# 关于我', updatedAt: '2026-07-12T00:00:00.000Z'
      } });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', adminFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.admin-content-group'))).toBeTruthy();
    expect(host.querySelector('.admin-content-group .panel-heading h2')?.textContent).toBe('内容管理');
    const expandContentButton = host.querySelector('.admin-content-group .panel-heading button') as HTMLButtonElement | null;
    expect(expandContentButton?.textContent).toBe('展开');
    expandContentButton?.click();
    expect(await waitFor(() => host.querySelector('.admin-create'))).toBeTruthy();
    expect(host.querySelector('.admin-create')?.textContent?.trim()).toBe('新建文章');
    expect(host.querySelector('.admin-user-group .panel-heading h2')?.textContent).toBe('用户管理');
    expect(host.querySelector('.admin-about-group .panel-heading h2')?.textContent).toBe('关于我');
    expect(adminFetchMock).not.toHaveBeenCalledWith('/api/admin/about', expect.anything());
    (host.querySelector('.admin-about-group .panel-heading button') as HTMLButtonElement).click();
    expect(await waitFor(() => (host.querySelector('[aria-label="名称"]') as HTMLInputElement)?.value === 'Kite' ? host : null)).toBeTruthy();

    const contentEditor = host.querySelector('.content-editor') as HTMLTextAreaElement;
    contentEditor.focus();
    contentEditor.setSelectionRange(0, 0);
    contentEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(await waitFor(() => contentEditor.value === '  ' ? contentEditor : null)).toBeTruthy();
    expect(document.activeElement).toBe(contentEditor);
  });

  it('loads draft posts automatically when an admin session already exists', async () => {
    window.history.pushState({}, '', '/admin');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      if (url.startsWith('/api/posts')) {
        const isDraftRequest = url.includes('includeDrafts=1');
        return Response.json({
          posts: isDraftRequest
            ? [
                {
                  id: 'post-draft',
                  slug: 'post-draft',
                  title: 'Draft post',
                  summary: 'draft summary',
                  category: 'life',
                  tags: ['draft'],
                  content: 'draft content',
                  status: 'draft',
                  createdAt: '2026-06-24T10:00:00.000Z',
                  updatedAt: '2026-06-24T10:00:00.000Z',
                  cover: 'life',
                  coverImage: ''
                }
              ]
            : [],
          comments: []
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const expandContentButton = await waitFor(() => host.querySelector('.admin-content-group .panel-heading button'));
    expect(expandContentButton).toBeTruthy();
    (expandContentButton as HTMLButtonElement).click();

    expect(await waitFor(() => (host.textContent?.includes('Draft post') ? host : null))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/posts?includeDrafts=1', { credentials: 'same-origin' });
  });

  it('renders article detail shell when the clean URL points to a post', async () => {
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/posts/post-1');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);
    await waitFor(() => host.querySelector('.article-page'));

    expect(host.querySelector('.article-page')).toBeTruthy();
    expect(host.querySelector('.article-page-shell')).toBeTruthy();
    expect(host.querySelector('.article-header-card')).toBeTruthy();
    expect(host.querySelector('.article-body-card')).toBeTruthy();
    expect(host.querySelector('.comment-panel')).toBeTruthy();
    expect(await waitFor(() => (document.title.includes('Test post') ? host : null))).toBeTruthy();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/posts/post-1');
  });

  it('preserves the server canonical origin during client metadata updates', async () => {
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/posts/post-1');
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = 'https://canonical.example/posts/server-route';

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(
      await waitFor(() => (canonical.href === 'https://canonical.example/posts/post-1' ? canonical : null))
    ).toBeTruthy();
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://canonical.example/posts/post-1'
    );
  });

  it('scrolls to the top when opening an article detail page', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const scrollToSpy = vi.fn();
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollToSpy });
    window.history.pushState({}, '', '/posts/post-1');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    await waitFor(() => host.querySelector('.article-page'));
    await waitFor(() => (scrollToSpy.mock.calls.length ? host : null));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('shows an edit article action for admin users on article detail pages', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/users/me')) {
        return Response.json(sessionFor('admin'));
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    window.history.pushState({}, '', '/posts/post-1');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const editButton = (await waitFor(() => host.querySelector('.article-admin-edit'))) as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();
    expect(editButton?.textContent).toContain('修改文章');
    editButton?.click();

    expect(await waitFor(() => (window.location.pathname === '/admin' ? host : null))).toBeTruthy();
    expect(window.location.search).toBe('?edit=post-1');
  });

  it('opens the requested article in the admin editor from the edit query', async () => {
    window.history.pushState({}, '', '/admin?edit=post-1');
    const adminFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/admin/users')) return Response.json({ users: [] });
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', adminFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const titleInput = (await waitFor(() => {
      const input = host.querySelector('.editor-panel input[aria-label="文章标题"]') as HTMLInputElement | null;
      return input?.value === 'Test post' ? input : null;
    })) as HTMLInputElement | null;

    expect(titleInput?.value).toBe('Test post');
    expect(host.querySelector('.admin-content-group.open')).toBeTruthy();
    expect(host.querySelector('.admin-post.is-expanded')).toBeTruthy();
  });

  it('loads persisted comments when opening an article detail page', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts/post-1/comments')) {
        return Response.json({
          comments: [
            {
              id: 'comment-1',
              postId: 'post-1',
              userId: 'user-reader',
              nickname: 'Reader',
              role: '阅读用户',
              content: 'Persisted comment',
              createdAt: '2026-07-06T10:00:00.000Z',
              updatedAt: '2026-07-06T10:00:00.000Z'
            }
          ]
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    window.history.pushState({}, '', '/posts/post-1');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => (host.textContent?.includes('Persisted comment') ? host : null))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/posts/post-1/comments', { credentials: 'same-origin' });
    expect(host.querySelector('.comment-panel h3')?.textContent).toContain('1');
  });

  it('reports a failed Home logout without leaking the rejected request', async () => {
    const session = {
      expiresAt: '2099-01-01T00:00:00.000Z',
      user: {
        id: 'reader-1',
        username: 'reader',
        nickname: 'Reader',
        permission: 'reader',
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z'
      }
    };
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json({ ok: true, ...session });
      if (url === '/api/users/logout') throw new Error('network unavailable');
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const logoutButton = (await waitFor(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('.user-auth-card button'))
        .find((button) => button.textContent === '退出登录') ?? null
    )) as HTMLButtonElement | null;
    logoutButton?.click();

    const alert = await waitFor(() => host.querySelector('[role="alert"]'));
    expect(alert?.textContent).toContain('退出登录失败');
    expect(pageFetchMock.mock.calls.filter(([input]) => String(input) === '/api/users/logout')).toHaveLength(1);
  });

  it('logs in public users from the home auth form and keeps the session', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/users/login')) {
        return Response.json({
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: {
            id: 'user-1',
            username: 'kite',
            nickname: 'Kite',
            permission: 'reader',
            createdAt: '2026-07-06T00:00:00.000Z',
            updatedAt: '2026-07-06T00:00:00.000Z'
          }
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const [usernameInput, passwordInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, 'kite');
    fillInput(passwordInput, 'secret123');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/login')) ? host : null
      )
    ).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kite', password: 'secret123' }),
      credentials: 'same-origin'
    });
    expect((await waitFor(() => host.querySelector('.user-auth-card strong')))?.textContent).toBe('Kite');
    expect(window.localStorage.getItem('kitepop-user-session')).toBeNull();
  });

  it('registers public users from the home auth form and keeps the session', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/users/register')) {
        return Response.json(
          {
            expiresAt: '2099-01-01T00:00:00.000Z',
            user: {
              id: 'user-2',
              username: 'newkite',
              nickname: 'New Kite',
              permission: 'reader',
              createdAt: '2026-07-06T00:00:00.000Z',
              updatedAt: '2026-07-06T00:00:00.000Z'
            }
          },
          { status: 201 }
        );
      }
      return fetchMock(input);
    });
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const registerTab = Array.from(authForm!.querySelectorAll('.segmented-control button')).find((button) =>
      button.textContent?.includes('注册')
    ) as HTMLButtonElement | undefined;
    registerTab?.click();

    expect(await waitFor(() => (authForm!.querySelectorAll('input').length === 3 ? authForm : null))).toBeTruthy();
    const [usernameInput, passwordInput, nicknameInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, 'newkite');
    fillInput(passwordInput, 'secret123');
    fillInput(nicknameInput, 'New Kite');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/register')) ? host : null
      )
    ).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'newkite', password: 'secret123', nickname: 'New Kite' }),
      credentials: 'same-origin'
    });
    expect((await waitFor(() => host.querySelector('.user-auth-card strong')))?.textContent).toBe('New Kite');
    expect(window.localStorage.getItem('kitepop-user-session')).toBeNull();
  });

  it('shows a clear public auth error when registration input is invalid', async () => {
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => fetchMock(input));
    vi.stubGlobal('fetch', pageFetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const authForm = (await waitFor(() => host.querySelector('.user-auth-card form'))) as HTMLFormElement | null;
    expect(authForm).toBeTruthy();
    const registerTab = Array.from(authForm!.querySelectorAll('.segmented-control button')).find((button) =>
      button.textContent?.includes('注册')
    ) as HTMLButtonElement | undefined;
    registerTab?.click();

    expect(await waitFor(() => (authForm!.querySelectorAll('input').length === 3 ? authForm : null))).toBeTruthy();
    const [usernameInput, passwordInput] = Array.from(authForm!.querySelectorAll('input')) as HTMLInputElement[];
    fillInput(usernameInput, '中');
    fillInput(passwordInput, '123');
    (authForm!.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(await waitFor(() => host.querySelector('.auth-feedback'))).toBeTruthy();
    expect(host.querySelector('.auth-feedback')?.textContent).toContain('用户名只能使用');
    expect(pageFetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/users/register'))).toBe(false);
  });

  it('returns from article detail to the article list when the browser goes back', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const postLink = (await waitFor(() => host.querySelector('.post-item'))) as HTMLAnchorElement | null;
    expect(postLink).toBeTruthy();
    postLink!.click();

    expect(await waitFor(() => host.querySelector('.article-page'))).toBeTruthy();
    expect(window.location.pathname).toBe('/posts/post-1');

    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await waitFor(() => (host.querySelector('.article-page') ? null : host))).toBeTruthy();
    expect(host.querySelector('.post-list')).toBeTruthy();
  });

  it('loads hosted images automatically when an admin session already exists', async () => {
    window.history.pushState({}, '', '/images');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/images')) {
        return Response.json({
          images: [
            {
              id: 'img-1',
              originalName: 'cover.png',
              contentType: 'image/png',
              sizeBytes: 3,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              path: '/api/images/raw/img-1'
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.image-item'))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/images', { credentials: 'same-origin' });
  });

  it('shows upload progress tips for image uploads', async () => {
    window.history.pushState({}, '', '/images');
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/images')) return Response.json({ images: [] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const fileInput = (await waitFor(() => host.querySelector('.image-dropzone input[type="file"]'))) as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [new File(['png'], 'cover.png', { type: 'image/png' })]
    });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    const xhr = await waitFor(() => FakeXMLHttpRequest.latest as unknown as Element | null);
    expect(xhr).toBeTruthy();
    FakeXMLHttpRequest.latest!.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 6 } as ProgressEvent);
    FakeXMLHttpRequest.latest!.status = 200;
    FakeXMLHttpRequest.latest!.responseText = JSON.stringify({ image: { id: 'img-1', path: '/api/images/raw/img-1' } });

    expect(await waitFor(() => host.querySelector('.upload-progress-tip'))).toBeTruthy();
    expect(host.querySelector('.upload-progress-tip')?.textContent).toContain('cover.png');
    expect(
      await waitFor(() => (host.querySelector('.upload-progress-tip')?.textContent?.includes('50%') ? host : null))
    ).toBeTruthy();
  });

  it('loads file storage automatically when an admin session already exists', async () => {
    window.history.pushState({}, '', '/files');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'rfi.txt',
              contentType: 'text/plain',
              sizeBytes: 7,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    expect(await waitFor(() => host.querySelector('.file-item'))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/files', { credentials: 'same-origin' });
  });

  it('copies and labels permanent media links without navigator clipboard', async () => {
    window.history.pushState({}, '', '/files');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/files/file-1/link')) {
        return Response.json({ link: { path: '/api/files/raw/file-1.mp4' } });
      }
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'lesson.mp4',
              contentType: 'video/mp4',
              sizeBytes: 7,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const copyButton = (await waitFor(() => host.querySelector('.file-item button'))) as HTMLButtonElement | null;
    expect(copyButton).toBeTruthy();
    copyButton!.click();

    expect(await waitFor(() => (execCommand.mock.calls.length ? host : null))).toBeTruthy();
    expect(host.textContent).toContain('/api/files/raw/file-1.mp4');
    expect(host.textContent).toContain('最近生成的永久媒体链接');
  });

  it('shows upload progress tips for file uploads', async () => {
    window.history.pushState({}, '', '/files');
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url === '/api/files/uploads') {
        return Response.json({ upload: { id: 'upload-1', chunkSize: 8 * 1024 * 1024, chunkCount: 1 } }, { status: 201 });
      }
      if (url === '/api/files/uploads/upload-1/complete') {
        return Response.json({ file: { id: 'file-1' } }, { status: 201 });
      }
      if (url.startsWith('/api/files')) {
        return Response.json({ folder: null, breadcrumbs: [], folders: [], files: [] });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const fileInput = (await waitFor(() => host.querySelector('.file-dropzone input[type="file"]'))) as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(1024)], 'report.pdf', { type: 'application/pdf' })]
    });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));

    const xhr = await waitFor(() => FakeXMLHttpRequest.latest as unknown as Element | null);
    expect(xhr).toBeTruthy();
    FakeXMLHttpRequest.latest!.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent);

    expect(await waitFor(() => host.querySelector('.upload-progress-tip'))).toBeTruthy();
    expect(host.querySelector('.upload-progress-tip')?.textContent).toContain('report.pdf');
    expect(
      await waitFor(() => (host.querySelector('.upload-progress-tip')?.textContent?.includes('50%') ? host : null))
    ).toBeTruthy();

    FakeXMLHttpRequest.latest!.status = 200;
    FakeXMLHttpRequest.latest!.responseText = JSON.stringify({ ok: true });
    FakeXMLHttpRequest.latest!.onload?.();
    expect(await waitFor(() => (host.textContent?.includes('文件已上传') ? host : null))).toBeTruthy();
    expect(pageFetchMock).toHaveBeenCalledWith('/api/files/uploads/upload-1/complete', {
      method: 'POST',
      credentials: 'same-origin'
    });
  });

  it('shares admin login across files and images routes without a refresh', async () => {
    window.history.pushState({}, '', '/files');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/users/me')) return fetchMock(input);
      if (url.startsWith('/api/users/login')) return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'rfi.txt',
              contentType: 'text/plain',
              sizeBytes: 7,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      if (url.startsWith('/api/images')) {
        return Response.json({
          images: [
            {
              id: 'img-1',
              originalName: 'cover.png',
              contentType: 'image/png',
              sizeBytes: 3,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              path: '/api/images/raw/img-1'
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const passwordInput = (await waitFor(() => host.querySelector('.unlock-panel input[type="password"]'))) as HTMLInputElement | null;
    expect(passwordInput).toBeTruthy();
    fillInput(host.querySelector('.unlock-panel input[name="username"]') as HTMLInputElement, 'admin');
    fillInput(passwordInput!, 'secret');
    await Promise.resolve();

    const unlockForm = host.querySelector('.unlock-panel') as HTMLFormElement | null;
    expect(unlockForm).toBeTruthy();
    unlockForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(await waitFor(() => host.querySelector('.file-item'))).toBeTruthy();

    window.history.pushState({}, '', '/images');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(await waitFor(() => host.querySelector('.image-item'))).toBeTruthy();
  });

  it('switches mobile accounting panels, opens edits, and removes mobile semantics on desktop', async () => {
    window.history.pushState({}, '', '/accounting');

    const savingGoal = {
      name: '本月存钱计划',
      targetCents: 120000,
      savedCents: 30000,
      currentBalanceCents: 30000,
      targetBalanceCents: 150000,
      targetSavingCents: 120000,
      plannedAvailableCents: 180000,
      availableBudgetCents: 180000,
      budgetLimitCents: 180000,
      spentCents: 2500,
      remainingAvailableCents: 177500,
      overBudgetCents: 0,
      savingGapCents: 0,
      savingSurplusCents: 57500,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      progressPercent: 25,
      remainingCents: 90000,
      balanceDeltaCents: 0,
      safeToSpendCents: 177500,
      daysLeft: 18,
      dailyAvailableCents: 9861,
      dailyRequiredCents: 5000,
      projectedSavingCents: 177500
    };
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url.startsWith('/api/accounting/month')) {
        return Response.json({
          entries: [
            {
              id: 'entry-1',
              type: 'expense',
              amountCents: 2500,
              category: 'food',
              account: '微信',
              spentAt: '2026-07-13',
              note: '午饭',
              includeInSaving: true,
              createdAt: '2026-07-13T04:30:00.000Z',
              updatedAt: '2026-07-13T04:30:00.000Z'
            }
          ],
          categories: [
            { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
            { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' }
          ],
          settings: { monthlyBudgetCents: 300000, savingGoal },
          summary: {
            incomeCents: 0,
            expenseCents: 2500,
            savingIncomeCents: 0,
            savingExpenseCents: 2500,
            savingNetExpenseCents: 2500,
            balanceCents: -2500,
            dailyExpenseCents: 2500,
            budgetLimitCents: 180000,
            plannedAvailableCents: 180000,
            targetSavingCents: 120000,
            budgetUsedPercent: 1.39,
            budgetRemainingCents: 177500,
            topExpenseCategory: { category: 'food', amountCents: 2500 }
          },
          savingGoal
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);
    let mobileMatches = true;
    const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
    const mobileQuery = {
      get matches() {
        return mobileMatches;
      },
      media: '(max-width: 720px)',
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => mobileQuery));
    const errorSpy = vi.spyOn(console, 'error');
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    try {
      await act(async () => {
        root.render(<App />);
      });
      for (let attempt = 0; attempt < 80 && !host.querySelector('[data-accounting-tab="entry"]'); attempt += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }
      for (let attempt = 0; attempt < 80 && !host.querySelector('.entry-edit'); attempt += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }

      expect(pageFetchMock.mock.calls.some(([input]) =>
        String(input).startsWith('/api/accounting/month')
      )).toBe(true);

      const entryTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="entry"]');
      const ledgerTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="ledger"]');
      const entryPanel = host.querySelector<HTMLElement>('#accounting-panel-entry');
      const ledgerPanel = host.querySelector<HTMLElement>('#accounting-panel-ledger');
      const planPanel = host.querySelector<HTMLElement>('#accounting-panel-plan');
      const overviewPanel = host.querySelector<HTMLElement>('#accounting-panel-overview');
      const controls = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-accounting-tab]'));

      expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('记账工作区');
      expect(host.querySelector('[role="tablist"]')).toBeNull();
      expect(controls).toHaveLength(4);
      for (const control of controls) {
        expect(host.querySelector(`#${control.getAttribute('aria-controls')}`)).toBeTruthy();
      }
      expect(entryTab?.textContent).toBe('记一笔');
      expect(entryTab?.getAttribute('aria-pressed')).toBe('true');
      expect(entryPanel?.classList.contains('is-mobile-active')).toBe(true);
      expect(ledgerPanel?.classList.contains('is-mobile-active')).toBe(false);
      expect(entryPanel?.tagName).toBe('FORM');
      expect(entryPanel?.getAttribute('role')).toBeNull();
      expect(planPanel?.tagName).toBe('FORM');
      expect(planPanel?.getAttribute('role')).toBeNull();
      expect(host.querySelector('[role="tabpanel"]')).toBeNull();

      const monthRequestsBeforeSwitch = pageFetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith('/api/accounting/month')
      ).length;
      await act(async () => {
        ledgerTab?.click();
      });

      expect(ledgerTab?.getAttribute('aria-pressed')).toBe('true');
      expect(ledgerPanel?.classList.contains('is-mobile-active')).toBe(true);
      expect(entryPanel?.classList.contains('is-mobile-active')).toBe(false);

      const editButton = host.querySelector<HTMLButtonElement>('.entry-edit');
      expect(editButton).toBeTruthy();
      await act(async () => {
        editButton?.click();
      });

      const amountInput = entryPanel?.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
      const noteInput = entryPanel?.querySelector<HTMLInputElement>('input[placeholder="例如：午饭、课程、工资"]');
      expect(entryTab?.getAttribute('aria-pressed')).toBe('true');
      expect(entryPanel?.classList.contains('is-mobile-active')).toBe(true);
      expect(ledgerPanel?.classList.contains('is-mobile-active')).toBe(false);
      expect(host.querySelector('#accounting-panel-entry')).toBe(entryPanel);
      expect(amountInput?.value).toBe('25');
      expect(noteInput?.value).toBe('午饭');

      await act(async () => {
        ledgerTab?.click();
      });
      expect(entryPanel?.classList.contains('is-mobile-active')).toBe(false);
      expect(amountInput?.value).toBe('25');
      expect(noteInput?.value).toBe('午饭');
      await act(async () => {
        entryTab?.click();
      });
      expect(entryPanel?.classList.contains('is-mobile-active')).toBe(true);
      expect(amountInput?.value).toBe('25');
      expect(noteInput?.value).toBe('午饭');

      expect(pageFetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith('/api/accounting/month')
      )).toHaveLength(monthRequestsBeforeSwitch);

      mobileMatches = false;
      await act(async () => {
        const event = { matches: false, media: mobileQuery.media } as MediaQueryListEvent;
        mediaListeners.forEach((listener) => listener(event));
      });

      expect(host.querySelector('.accounting-mobile-tabs')).toBeNull();
      for (const panel of [overviewPanel, entryPanel, ledgerPanel, planPanel]) {
        expect(panel?.getAttribute('role')).toBeNull();
        expect(panel?.getAttribute('aria-labelledby')).toBeNull();
      }
    } finally {
      await act(async () => root.unmount());
      roots.splice(roots.indexOf(root), 1);
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reloads accounting entries when ledger filters or month change', async () => {
    window.history.pushState({}, '', '/accounting');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/accounting/month')) {
        const isMay = url.includes('month=2026-05');
        return Response.json({
          entries: [
            {
              id: 'entry-1',
              type: 'expense',
              amountCents: isMay ? 5100 : 2500,
              category: 'food',
              account: '微信',
              spentAt: isMay ? '2026-05-26' : '2026-06-26',
              note: isMay ? '五月账单' : '',
              includeInSaving: true,
              createdAt: '2026-06-26T00:00:00.000Z',
              updatedAt: '2026-06-26T00:00:00.000Z'
            }
          ],
          categories: [
            { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
            { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' }
          ],
          settings: { monthlyBudgetCents: 0, savingGoal: null },
          summary: {
            incomeCents: 0,
            expenseCents: isMay ? 5100 : 2500,
            savingIncomeCents: 0,
            savingExpenseCents: 2500,
            savingNetExpenseCents: 2500,
            balanceCents: -2500,
            dailyExpenseCents: 2500,
            budgetLimitCents: 0,
            plannedAvailableCents: 0,
            targetSavingCents: 0,
            budgetUsedPercent: 0,
            budgetRemainingCents: 0,
            topExpenseCategory: { category: 'food', amountCents: 2500 }
          },
          savingGoal: null
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const ledgerCard = (await waitFor(() => host.querySelectorAll('.accounting-layout > .accounting-card')[1])) as HTMLElement | null;
    expect(ledgerCard).toBeTruthy();
    const [typeFilter, categoryFilter] = Array.from(ledgerCard!.querySelectorAll('select')) as HTMLSelectElement[];

    typeFilter.value = 'expense';
    typeFilter.dispatchEvent(new Event('change', { bubbles: true }));
    categoryFilter.value = 'food';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));

    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).includes('/api/accounting/month?month=') && String(input).includes('type=expense'))
          ? host
          : null
      )
    ).toBeTruthy();
    expect(
      pageFetchMock.mock.calls.some(
        ([input]) => String(input).includes('/api/accounting/month?month=') && String(input).includes('category=food')
      )
    ).toBe(true);

    const monthInput = host.querySelector('input[type="month"]') as HTMLInputElement | null;
    expect(monthInput).toBeTruthy();
    fillInput(monthInput!, '2026-05');
    expect(
      await waitFor(() =>
        pageFetchMock.mock.calls.some(([input]) => String(input).includes('/api/accounting/month?month=2026-05')) && host.textContent?.includes('¥51.00')
          ? host
          : null
      )
    ).toBeTruthy();
  });

  it('opens the in-site media preview shell for uploaded videos', async () => {
    window.history.pushState({}, '', '/files');
    const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/posts')) return fetchMock(input);
      if (url === '/api/users/me') return Response.json(sessionFor('admin'));
      if (url.startsWith('/api/files/file-1/preview-link')) {
        return Response.json({ link: { path: '/api/files/raw/file-1.mp4' } });
      }
      if (url.startsWith('/api/files')) {
        return Response.json({
          folder: null,
          breadcrumbs: [],
          folders: [],
          files: [
            {
              id: 'file-1',
              originalName: 'lesson.mp4',
              contentType: 'video/mp4',
              sizeBytes: 1024,
              uploadedAt: '2026-06-20T00:00:00.000Z',
              folderId: ''
            }
          ]
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', pageFetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    root.render(<App />);

    const previewButton = await waitFor(() => host.querySelector('.file-item .ghost'));
    expect(previewButton).toBeTruthy();
    (previewButton as HTMLButtonElement).click();

    expect(await waitFor(() => host.querySelector('.media-preview-page'))).toBeTruthy();
    expect(host.querySelector('.media-preview-shell')?.textContent).toContain('lesson.mp4');
    expect(host.querySelector('video.media-preview-player')).toBeTruthy();
    expect(host.querySelector('.media-preview-overlay button')?.textContent).toContain('播放');
    (host.querySelector('.media-preview-overlay button') as HTMLButtonElement).click();
    expect(await waitFor(() => host.querySelector('video.media-preview-player')?.getAttribute('src') ? host : null)).toBeTruthy();
    expect(host.querySelector('video.media-preview-player')?.getAttribute('src')).toBe(
      `${window.location.origin}/api/files/raw/file-1.mp4`
    );
    expect(host.querySelector('video.media-preview-player')?.getAttribute('draggable')).toBe('false');
  });
});
