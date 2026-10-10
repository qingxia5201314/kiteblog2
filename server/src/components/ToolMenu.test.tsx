import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolMenu, type ToolMenuItem } from './ToolMenu';

const items: ToolMenuItem[] = [
  { active: true, label: '记账', to: '/accounting' },
  { active: false, label: '文件', to: '/files' }
];

describe('ToolMenu', () => {
  let host: HTMLDivElement;
  let outside: HTMLButtonElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    outside = document.createElement('button');
    outside.textContent = '页面空白处';
    document.body.append(host, outside);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    outside.remove();
  });

  function renderMenu(routeKey = '/') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[routeKey]}>
          <ToolMenu items={items} routeKey={routeKey} />
        </MemoryRouter>
      );
    });
  }

  function details() {
    return host.querySelector<HTMLDetailsElement>('details.tool-menu')!;
  }

  function summary() {
    return host.querySelector<HTMLElement>('summary')!;
  }

  function openMenu() {
    act(() => summary().click());
    expect(details().open).toBe(true);
  }

  it('toggles from the summary and exposes the popup relationship', () => {
    renderMenu();

    const popup = host.querySelector<HTMLElement>('.tool-menu > div')!;
    expect(summary().getAttribute('aria-expanded')).toBe('false');
    expect(summary().getAttribute('aria-controls')).toBe(popup.id);
    expect(details().open).toBe(false);

    openMenu();
    expect(summary().getAttribute('aria-expanded')).toBe('true');

    act(() => summary().click());
    expect(details().open).toBe(false);
    expect(summary().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on an outside pointer interaction but not on an interaction inside the popup', () => {
    renderMenu();
    openMenu();

    const popup = host.querySelector<HTMLElement>('.tool-menu > div')!;
    act(() => popup.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(details().open).toBe(true);

    act(() => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(details().open).toBe(false);
  });

  it('closes after choosing a tool and preserves active-link semantics', () => {
    renderMenu();
    openMenu();

    const accountingLink = host.querySelector<HTMLAnchorElement>('a[href="/accounting"]')!;
    expect(accountingLink.className).toBe('active');
    expect(accountingLink.getAttribute('aria-current')).toBe('page');

    act(() => accountingLink.click());
    expect(details().open).toBe(false);
  });

  it('closes on Escape, restores focus to the summary, and updates ARIA state', () => {
    renderMenu();
    openMenu();

    const filesLink = host.querySelector<HTMLAnchorElement>('a[href="/files"]')!;
    act(() => filesLink.focus());
    expect(document.activeElement).toBe(filesLink);

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));

    expect(details().open).toBe(false);
    expect(summary().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(summary());
  });

  it('closes when routeKey changes', () => {
    renderMenu('/');
    openMenu();

    renderMenu('/files');

    expect(details().open).toBe(false);
    expect(summary().getAttribute('aria-expanded')).toBe('false');
  });
});
