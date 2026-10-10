import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingMobileTabs } from './AccountingMobileTabs';

describe('AccountingMobileTabs', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('exposes the controlled pressed state and links every control to its panel', () => {
    const onChange = vi.fn();

    act(() => root.render(<AccountingMobileTabs active="entry" onChange={onChange} />));

    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-accounting-tab]'));
    const entryTab = tabs.find((tab) => tab.textContent === '记一笔');
    const ledgerTab = tabs.find((tab) => tab.textContent === '流水');

    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('记账工作区');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => [tab.id, tab.getAttribute('aria-controls')])).toEqual([
      ['accounting-tab-overview', 'accounting-panel-overview'],
      ['accounting-tab-entry', 'accounting-panel-entry'],
      ['accounting-tab-ledger', 'accounting-panel-ledger'],
      ['accounting-tab-plan', 'accounting-panel-plan']
    ]);
    expect(entryTab?.getAttribute('aria-pressed')).toBe('true');
    expect(entryTab?.tabIndex).toBe(0);
    expect(ledgerTab?.getAttribute('aria-pressed')).toBe('false');
    expect(ledgerTab?.tabIndex).toBe(-1);

    act(() => ledgerTab?.click());

    expect(onChange).toHaveBeenCalledWith('ledger');
  });

  it('supports wrapped arrows, Home, and End while moving real focus', () => {
    const onChange = vi.fn();

    act(() => root.render(<AccountingMobileTabs active="entry" onChange={onChange} />));

    const overviewTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="overview"]')!;
    const entryTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="entry"]')!;
    const ledgerTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="ledger"]')!;
    const planTab = host.querySelector<HTMLButtonElement>('[data-accounting-tab="plan"]')!;

    const press = (tab: HTMLButtonElement, key: string) => {
      onChange.mockClear();
      act(() => {
        tab.focus();
        tab.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
      });
    };

    press(entryTab, 'ArrowRight');
    expect(onChange).toHaveBeenCalledWith('ledger');
    expect(document.activeElement).toBe(ledgerTab);

    press(overviewTab, 'ArrowLeft');
    expect(onChange).toHaveBeenCalledWith('plan');
    expect(document.activeElement).toBe(planTab);

    press(ledgerTab, 'Home');
    expect(onChange).toHaveBeenCalledWith('overview');
    expect(document.activeElement).toBe(overviewTab);

    press(entryTab, 'End');
    expect(onChange).toHaveBeenCalledWith('plan');
    expect(document.activeElement).toBe(planTab);
  });
});
