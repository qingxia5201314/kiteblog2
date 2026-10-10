import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackToTop } from './BackToTop';

describe('BackToTop', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function button() {
    return host.querySelector<HTMLButtonElement>('button[aria-label="回到页面顶部"]')!;
  }

  it('stays mounted and hidden at or below the threshold, then becomes visible above it', () => {
    act(() => root.render(<BackToTop />));

    expect(button().className).toContain('is-hidden');
    expect(button().getAttribute('aria-hidden')).toBe('true');
    expect(button().tabIndex).toBe(-1);

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-hidden');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 401 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-visible');
    expect(button().getAttribute('aria-hidden')).toBe('false');
    expect(button().tabIndex).toBe(0);

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(button().className).toContain('is-hidden');
  });

  it('uses the initial scroll position before the first scroll event', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    act(() => root.render(<BackToTop />));

    expect(button().className).toContain('is-visible');
    expect(button().getAttribute('aria-hidden')).toBe('false');
  });

  it('releases focus when scrolling back below the visibility threshold', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    act(() => root.render(<BackToTop />));
    act(() => button().focus());
    expect(document.activeElement).toBe(button());

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 });
    act(() => window.dispatchEvent(new Event('scroll')));

    expect(button().className).toContain('is-hidden');
    expect(document.activeElement).not.toBe(button());
  });

  it('scrolls smoothly when reduced motion is not requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    act(() => root.render(<BackToTop />));
    act(() => button().click());

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('uses automatic scrolling for reduced motion and tolerates missing matchMedia', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    act(() => root.render(<BackToTop />));
    act(() => button().click());
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });

    vi.stubGlobal('matchMedia', undefined);
    act(() => button().click());
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('falls back to coordinate scrolling when options scrolling throws', () => {
    const scrollTo = vi.fn()
      .mockImplementationOnce(() => { throw new Error('options unsupported'); })
      .mockImplementationOnce(() => undefined);
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo });
    act(() => root.render(<BackToTop />));

    expect(() => act(() => button().click())).not.toThrow();
    expect(scrollTo.mock.calls).toEqual([
      [{ top: 0, behavior: 'smooth' }],
      [0, 0]
    ]);
  });

  it('pairs every passive scroll listener under StrictMode and leaves none active after unmount', () => {
    const activeHandlers = new Set<EventListenerOrEventListenerObject>();
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    const addEventListener = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'scroll') activeHandlers.add(listener);
      originalAdd(type, listener, options);
    });
    const removeEventListener = vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
      if (type === 'scroll') activeHandlers.delete(listener);
      originalRemove(type, listener, options);
    });
    act(() => root.render(<StrictMode><BackToTop /></StrictMode>));

    const scrollRegistrations = addEventListener.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollRegistrations.length).toBeGreaterThanOrEqual(2);
    expect(scrollRegistrations.every(([, , options]) =>
      typeof options === 'object' && options?.passive === true)).toBe(true);
    expect(activeHandlers.size).toBe(1);

    act(() => root.unmount());
    const scrollCleanups = removeEventListener.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollCleanups).toHaveLength(scrollRegistrations.length);
    expect(activeHandlers.size).toBe(0);

    root = createRoot(host);
  });
});
