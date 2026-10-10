import { act, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutPage } from './AboutPage';

const completeProfile = {
  avatarUrl: '/custom-avatar.png',
  displayName: 'Kite',
  identityTags: ['安全研究', '写作者'],
  intro: '记录生活与技术。',
  githubUrl: 'https://github.com/kite',
  content: '# 长一点的自我介绍\n\n这里有 **Markdown** 内容。',
  updatedAt: '2026-07-12T00:00:00.000Z'
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('about page', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  function renderPage(strict = false) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(strict ? <StrictMode><AboutPage /></StrictMode> : <AboutPage />));
    return host;
  }

  it('moves from loading to a complete profile with one GitHub link and Markdown', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (resolveResponse = resolve))));
    const host = renderPage();

    expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载');
    resolveResponse(Response.json({ profile: completeProfile }));
    await flush();

    expect(host.querySelector('.about-page')).toBeTruthy();
    expect(host.querySelector('.about-hero.about-reveal')).toBeTruthy();
    expect(host.querySelector('.about-sos-watermark')).toBeTruthy();
    expect(host.querySelector('.about-avatar-parallax > .about-avatar-ring img')?.getAttribute('src')).toBe('/custom-avatar.png');
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');
    expect(host.querySelector('.about-identity-tags')?.textContent).toContain('安全研究');
    expect(host.textContent).toContain('记录生活与技术。');
    const githubLinks = host.querySelectorAll('a.about-social-link[href="https://github.com/kite"]');
    expect(githubLinks).toHaveLength(1);
    expect(githubLinks[0].getAttribute('target')).toBe('_blank');
    expect(githubLinks[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(host.querySelector('.about-content h2.about-reveal')?.textContent).toBe('长一点的自我介绍');
    expect(host.querySelector('.about-content strong')?.textContent).toBe('Markdown');
    expect(document.title).toBe('关于我 | Kitepop SOS');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('记录生活与技术。');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/about$/);
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toMatch(/\/about$/);
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(JSON.parse(document.head.querySelector('script[data-kitepop-jsonld]')?.textContent || '{}')).toMatchObject({
      '@type': 'ProfilePage',
      url: expect.stringMatching(/\/about$/)
    });
  });

  it('uses stable About metadata while the profile is still loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    renderPage();

    expect(document.title).toBe('关于我 | Kitepop SOS');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('了解 Kitepop 的个人介绍、身份与创作记录。');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/about$/);
  });

  it('does not render a social link when GitHub is empty and permits an empty Markdown body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: { ...completeProfile, githubUrl: '', content: '' } })));
    const host = renderPage();
    await flush();

    expect(host.querySelector('.about-social-link')).toBeFalsy();
    expect(host.querySelector('.about-content')).toBeFalsy();
    expect(host.querySelector('.about-hero')).toBeTruthy();
  });

  it('shows a friendly empty state when the whole profile is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: {
      avatarUrl: '', displayName: '', identityTags: [], intro: '', githubUrl: '', content: '', updatedAt: ''
    } })));
    const host = renderPage();
    await flush();

    expect(host.querySelector('.about-page [role="status"]')?.textContent).toContain('个人资料还在准备中');
  });

  it('treats a profile without both display name and content as empty despite other fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: {
      avatarUrl: '/avatar.png',
      displayName: '   ',
      identityTags: ['安全研究'],
      intro: '只有简介',
      githubUrl: 'https://github.com/kite',
      content: '\n ',
      updatedAt: '2026-07-12T00:00:00.000Z'
    } })));
    const host = renderPage();
    await flush();

    expect(host.querySelector('.about-page [role="status"]')?.textContent).toContain('个人资料还在准备中');
    expect(host.querySelector('.about-hero')).toBeFalsy();
  });

  it('shows an error and retries the request', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ profile: completeProfile }));
    vi.stubGlobal('fetch', fetchMock);
    const host = renderPage();
    await flush();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('无法连接个人资料服务');
    const retry = host.querySelector('button') as HTMLButtonElement;
    act(() => retry.click());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');
  });

  it('aborts the superseded StrictMode request and ignores its late response', async () => {
    const pending: Array<{ resolve: (response: Response) => void; signal?: AbortSignal }> = [];
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ resolve, signal: init?.signal || undefined });
    })));
    const host = renderPage(true);

    expect(pending).toHaveLength(2);
    expect(pending[0].signal?.aborted).toBe(true);
    pending[1].resolve(Response.json({ profile: completeProfile }));
    await flush();
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');

    pending[0].resolve(Response.json({ profile: { ...completeProfile, displayName: '旧资料' } }));
    await flush();
    expect(host.querySelector('.about-profile-name')?.textContent).toBe('Kite');
    expect(host.textContent).not.toContain('旧资料');
  });

  it('aborts the active request on unmount and ignores a late completion', async () => {
    let resolveResponse!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal || undefined;
      return new Promise<Response>((resolve) => { resolveResponse = resolve; });
    }));
    const host = renderPage();
    const root = roots.pop()!;

    act(() => root.unmount());
    expect(requestSignal?.aborted).toBe(true);
    resolveResponse(Response.json({ profile: completeProfile }));
    await flush();
    expect(host.textContent).toBe('');
  });

  it('falls back to the brand avatar when the avatar is missing or fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: completeProfile })));
    const host = renderPage();
    await flush();

    const avatar = host.querySelector('.about-avatar-ring img') as HTMLImageElement;
    act(() => avatar.dispatchEvent(new Event('error')));
    expect(host.querySelector('.about-avatar-ring img')?.getAttribute('src')).toMatch(/haruhi-avatar/);
  });

  it('reveals observed sections with one observer and disconnects it on unmount', async () => {
    const observed: Element[] = [];
    const unobserved: Element[] = [];
    let callback!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    class ObserverMock {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }
      observe(element: Element) { observed.push(element); }
      unobserve(element: Element) { unobserved.push(element); }
      disconnect() { disconnect(); }
    }
    vi.stubGlobal('IntersectionObserver', ObserverMock);
    /*
      Class syntax is intentional: production correctly constructs the native API
      with `new`, and Vitest function mocks are not constructable here.
    */
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: completeProfile })));
    const host = renderPage();
    await flush();

    const hero = host.querySelector('.about-hero')!;
    const heading = host.querySelector('.about-content > h2')!;
    const paragraph = host.querySelector('.about-content > p')!;
    const sections = [hero, heading, paragraph];
    expect(observed).toEqual(sections);
    expect(sections.every((section) => section.classList.contains('about-reveal'))).toBe(true);
    expect(sections.every((section) => section.classList.contains('is-reveal-pending'))).toBe(true);
    expect((paragraph as HTMLElement).style.getPropertyValue('--about-reveal-delay')).toBe('80ms');

    act(() => callback([{ target: sections[0], isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(sections[0].classList.contains('is-revealed')).toBe(true);
    expect(sections[0].classList.contains('is-reveal-pending')).toBe(false);
    expect(unobserved).toEqual([sections[0]]);

    const root = roots.pop()!;
    act(() => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('shows reveal content immediately when observers are unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: completeProfile })));
    const host = renderPage();
    await flush();

    const blocks = [...host.querySelectorAll('.about-hero, .about-content > *')];
    expect(blocks).toHaveLength(3);
    expect(blocks.every((section) => section.classList.contains('about-reveal'))).toBe(true);
    expect(blocks.every((section) => section.classList.contains('is-revealed'))).toBe(true);
  });

  it('coalesces page-local pointer moves into one animation frame and cancels pending work', async () => {
    let nextFrame = 1;
    const frames = new Map<number, FrameRequestCallback>();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    const cancelAnimationFrame = vi.fn((id: number) => frames.delete(id));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('pointer: fine') })));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ profile: completeProfile })));
    const host = renderPage();
    await flush();
    const page = host.querySelector<HTMLElement>('.about-page')!;
    const bounds = vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });

    act(() => {
      page.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 300 }));
      page.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 240 }));
      page.dispatchEvent(new MouseEvent('pointermove', { clientX: 750, clientY: 200 }));
    });
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(bounds).not.toHaveBeenCalled();
    act(() => frames.get(1)?.(16));
    expect(bounds).toHaveBeenCalledOnce();
    expect(page.style.getPropertyValue('--about-parallax-x')).toBe('0.5');
    expect(page.style.getPropertyValue('--about-parallax-y')).toBe('-0.5');

    act(() => page.dispatchEvent(new Event('pointerleave')));
    expect(page.style.getPropertyValue('--about-parallax-x')).toBe('0');
    expect(page.style.getPropertyValue('--about-parallax-y')).toBe('0');

    act(() => page.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 400 })));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    const root = roots.pop()!;
    act(() => root.unmount());
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(page.style.getPropertyValue('--about-parallax-x')).toBe('0');
    expect(page.style.getPropertyValue('--about-parallax-y')).toBe('0');
  });
});
