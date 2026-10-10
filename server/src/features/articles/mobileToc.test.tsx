import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileArticleToc } from './components/MobileArticleToc';

const headings = [
  { id: 'intro', title: '介绍', level: 2 as const },
  { id: 'details', title: '详细内容', level: 3 as const }
];

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('mobile article toc', () => {
  it('opens accessibly, marks the current heading, navigates, and returns focus', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('matchMedia', matchMedia);
    const target = document.createElement('h2');
    target.id = 'details';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => root.render(<MobileArticleToc activeHeadingId="details" headings={headings} progress={42} />));
    const trigger = host.querySelector('.mobile-toc-trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('详细内容');
    expect(trigger.textContent).toContain('42%');

    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const activeLink = host.querySelector('[aria-current="location"]') as HTMLAnchorElement;
    expect(activeLink.textContent).toContain('详细内容');
    act(() => activeLink.click());
    expect(window.location.hash).toBe('#details');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(async () => Promise.resolve());
    expect(document.activeElement).toBe(trigger);
    root.unmount();
  });

  it('closes on Escape and disables smooth movement for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const target = document.createElement('h2');
    target.id = 'intro';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<MobileArticleToc activeHeadingId="intro" headings={headings} progress={5} />));
    const trigger = host.querySelector('.mobile-toc-trigger') as HTMLButtonElement;
    act(() => trigger.click());
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click());
    act(() => (host.querySelector('a[href="#intro"]') as HTMLAnchorElement).click());
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    root.unmount();
  });
});
