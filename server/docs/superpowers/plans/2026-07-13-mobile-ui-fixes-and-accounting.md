# Mobile UI Fixes and Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four approved mobile UI issues while preserving the homepage layout, existing site theme, authentication flows, and accounting business logic.

**Architecture:** Keep changes inside the frontend presentation layer. Use a controlled `ToolMenu` component for dismissible navigation, pure accounting presentation helpers for ledger labels and timestamps, a controlled mobile-only accounting tab component, and late-loaded page/feature CSS overrides for responsive styling. Existing hooks and API calls remain unchanged.

**Tech Stack:** React 19, React Router 7, TypeScript 5.9, CSS, Vitest 4, jsdom, Vite 7.

---

## File map

- Create `src/components/ToolMenu.tsx`: controlled tools dropdown with outside-click, link, route-change, and Escape dismissal.
- Create `src/components/ToolMenu.test.tsx`: interaction and accessibility tests for `ToolMenu`.
- Modify `src/components/Layout.tsx`: replace inline `<details>` tools markup with `ToolMenu`.
- Modify `src/styles/layout.css`: retain the current visual style and support controlled open state.
- Create `src/styles/home-filter-layer.test.js`: regression coverage for the filter stacking fix.
- Modify `src/styles/pages/home.css`: raise only the open filter layer without changing homepage layout.
- Create `src/styles/features/mobile-unlock.css`: shared phone layout for the four existing `.unlock-panel` forms.
- Create `src/styles/mobile-unlock-layout.test.js`: verify responsive rules and all four page usages.
- Modify `src/styles/index.css`: load `mobile-unlock.css` and the final accounting overrides after `App.css`.
- Create `src/lib/accountingPresentation.ts`: pure ledger title and created-time formatting helpers.
- Create `src/lib/accountingPresentation.test.ts`: presentation-rule tests, including the “其他” fallback.
- Create `src/components/accounting/AccountingMobileTabs.tsx`: accessible controlled mobile tabs.
- Create `src/components/accounting/AccountingMobileTabs.test.tsx`: tab selection tests.
- Modify `src/pages/AccountingPage.tsx`: wire mobile tabs, presentation helpers, and button classes without changing request or mutation logic.
- Modify `src/styles/pages/accounting.css`: final mobile paper-style layout, particles, entry animation, and approved button styles.
- Create `src/styles/accounting-mobile-ui.test.js`: static regression checks for panel rules and the full-width white glint.
- Modify `src/App.test.tsx`: one integration test proving “记一笔” is the initial mobile panel and panel changes preserve mounted accounting content.

### Task 1: Fix the homepage filter stacking layer only

**Files:**
- Create: `src/styles/home-filter-layer.test.js`
- Modify: `src/styles/pages/home.css:385-510`

- [ ] **Step 1: Write the failing CSS regression test**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homeCss = readFileSync(resolve(process.cwd(), 'src/styles/pages/home.css'), 'utf8');

describe('home filter stacking layer', () => {
  it('raises only the open filter above the article panel without changing grid layout', () => {
    expect(homeCss).toContain('Home filter stacking fix');
    expect(homeCss).toMatch(/\.home-filter-panel\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*3;/s);
    expect(homeCss).toMatch(/\.home-post-panel\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;/s);
    expect(homeCss).toMatch(/\.index-filters \.filter-menu\[open\]\s*\{[^}]*z-index:\s*40;/s);
    expect(homeCss).toMatch(/\.index-filters \.filter-menu\s*>\s*div\s*\{[^}]*z-index:\s*41;/s);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/styles/home-filter-layer.test.js`

Expected: FAIL because `Home filter stacking fix` and the stacking rules do not exist.

- [ ] **Step 3: Add the minimal stacking-only CSS**

Append to `src/styles/pages/home.css` without changing display, grid, width, padding, or order rules:

```css
/* Home filter stacking fix: preserve layout and raise only the floating menu. */
.home-filter-panel {
  overflow: visible;
  position: relative;
  z-index: 3;
}

.home-post-panel {
  position: relative;
  z-index: 1;
}

.index-filters .filter-menu {
  position: relative;
}

.index-filters .filter-menu[open] {
  z-index: 40;
}

.index-filters .filter-menu > div {
  z-index: 41;
}
```

- [ ] **Step 4: Run the focused test and existing article-discovery tests**

Run: `npm test -- --run src/styles/home-filter-layer.test.js src/features/articles/articleDiscovery.test.tsx`

Expected: PASS with no changed article query or layout assertions.

- [ ] **Step 5: Commit the isolated homepage fix**

```powershell
git add -- src/styles/home-filter-layer.test.js src/styles/pages/home.css
git commit -m "fix: keep mobile article filters above results"
```

### Task 2: Make the tools menu dismissible and accessible

**Files:**
- Create: `src/components/ToolMenu.tsx`
- Create: `src/components/ToolMenu.test.tsx`
- Modify: `src/components/Layout.tsx:1-105`
- Modify: `src/styles/layout.css:28-159`

- [ ] **Step 1: Write failing interaction tests**

Create `src/components/ToolMenu.test.tsx`:

```tsx
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolMenu } from './ToolMenu';

const items = [
  { label: '记账', to: '/accounting', active: false },
  { label: '文件', to: '/files', active: false }
];

describe('ToolMenu', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  async function renderMenu(routeKey = '/') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(<MemoryRouter><ToolMenu items={items} routeKey={routeKey} /></MemoryRouter>);
    });
    return { host, root };
  }

  async function openMenu(host: HTMLElement) {
    const details = host.querySelector('details') as HTMLDetailsElement;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle', { bubbles: true }));
    });
    return details;
  }

  it('closes when the user clicks outside or chooses a link', async () => {
    const { host } = await renderMenu();
    const details = await openMenu(host);
    expect(details.open).toBe(true);
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(details.open).toBe(false);

    await openMenu(host);
    await act(async () => (host.querySelector('a[href="/accounting"]') as HTMLAnchorElement).click());
    expect(details.open).toBe(false);
  });

  it('closes on Escape, returns focus, and exposes expanded state', async () => {
    const { host } = await renderMenu();
    const details = await openMenu(host);
    const summary = host.querySelector('summary') as HTMLElement;
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(summary.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when the route key changes', async () => {
    const { host, root } = await renderMenu('/');
    const details = await openMenu(host);
    await act(async () => {
      root.render(<MemoryRouter><ToolMenu items={items} routeKey="/files" /></MemoryRouter>);
    });
    expect(details.open).toBe(false);
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run src/components/ToolMenu.test.tsx`

Expected: FAIL because `./ToolMenu` does not exist.

- [ ] **Step 3: Implement the controlled component**

Create `src/components/ToolMenu.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export interface ToolMenuItem {
  active: boolean;
  label: string;
  to: string;
}

export function ToolMenu({ items, routeKey }: { items: ToolMenuItem[]; routeKey: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => setOpen(false), [routeKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <details
      className="tool-menu"
      data-open={open ? 'true' : 'false'}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
      ref={rootRef}
    >
      <summary aria-controls="tool-menu-links" aria-expanded={open} ref={triggerRef}>工具</summary>
      <div id="tool-menu-links">
        {items.map((item) => (
          <Link
            aria-current={item.active ? 'page' : undefined}
            className={item.active ? 'active' : ''}
            key={item.to}
            onClick={() => setOpen(false)}
            to={item.to}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 4: Replace the inline menu in `Layout.tsx`**

Add `import { ToolMenu } from './ToolMenu';`, then replace the existing authenticated `<details className="tool-menu">…</details>` with:

```tsx
<ToolMenu
  items={[
    { label: '记账', to: '/accounting', active: isNavActive('/accounting') },
    { label: '文件', to: '/files', active: isNavActive('/files') },
    { label: '图床', to: '/images', active: isNavActive('/images') },
    { label: '后台', to: '/admin', active: isNavActive('/admin') }
  ]}
  routeKey={location.pathname}
/>
```

Keep the logged-out “登录” link unchanged. In `src/styles/layout.css`, retain `[open]` selectors and add the controlled-state equivalent:

```css
.tool-menu[data-open='true'] > div {
  animation: tool-menu-pop 150ms ease-out;
}
```

- [ ] **Step 5: Run component and app navigation tests**

Run: `npm test -- --run src/components/ToolMenu.test.tsx src/App.test.tsx`

Expected: PASS, including existing public-navigation and active-link checks.

- [ ] **Step 6: Commit the menu behavior**

```powershell
git add -- src/components/ToolMenu.tsx src/components/ToolMenu.test.tsx src/components/Layout.tsx src/styles/layout.css
git commit -m "fix: dismiss the tools menu outside its popup"
```

### Task 3: Fix all four mobile unlock layouts

**Files:**
- Create: `src/styles/features/mobile-unlock.css`
- Create: `src/styles/mobile-unlock-layout.test.js`
- Modify: `src/styles/index.css:1-16`

- [ ] **Step 1: Write the failing responsive-layout test**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/features/mobile-unlock.css'), 'utf8');
const pageSources = ['AdminPage.tsx', 'FilesPage.tsx', 'ImagesPage.tsx', 'AccountingPage.tsx']
  .map((file) => readFileSync(resolve(process.cwd(), 'src/pages', file), 'utf8'));

describe('mobile unlock layout', () => {
  it('keeps all four password forms inside narrow viewports', () => {
    expect(pageSources.every((source) => source.includes('className="unlock-panel"'))).toBe(true);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.unlock-panel\s*\{[\s\S]*width:\s*min\(100%, 520px\)/);
    expect(css).toMatch(/\.unlock-panel input,[\s\S]*\.unlock-panel button\s*\{[\s\S]*min-height:\s*48px;[\s\S]*width:\s*100%/);
    expect(css).toMatch(/\.unlock-panel p\s*\{[^}]*line-height:\s*1\.7;/s);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/styles/mobile-unlock-layout.test.js`

Expected: FAIL because `mobile-unlock.css` does not exist.

- [ ] **Step 3: Add the shared mobile-only override**

Create `src/styles/features/mobile-unlock.css`:

```css
/* Shared phone layout for admin, files, images, and accounting unlock forms. */
@media (max-width: 720px) {
  .unlock-panel {
    box-sizing: border-box;
    margin: clamp(28px, 9vh, 72px) auto;
    max-width: calc(100vw - 24px);
    min-width: 0;
    padding: 24px 18px;
    width: min(100%, 520px);
  }

  .unlock-panel h1 {
    font-size: clamp(1.75rem, 8vw, 2.35rem);
    line-height: 1.08;
  }

  .unlock-panel p {
    line-height: 1.7;
    max-width: 38rem;
  }

  .unlock-panel input,
  .unlock-panel button {
    box-sizing: border-box;
    min-height: 48px;
    min-width: 0;
    width: 100%;
  }
}
```

Import it after `App.css` in `src/styles/index.css`:

```css
@import './features/mobile-unlock.css';
```

- [ ] **Step 4: Run the focused test and production build**

Run: `npm test -- --run src/styles/mobile-unlock-layout.test.js && npm run build`

Expected: test PASS; TypeScript and Vite build exit 0.

- [ ] **Step 5: Commit the unlock layout**

```powershell
git add -- src/styles/features/mobile-unlock.css src/styles/mobile-unlock-layout.test.js src/styles/index.css
git commit -m "fix: fit password panels to mobile viewports"
```

### Task 4: Isolate and apply the approved ledger display rules

**Files:**
- Create: `src/lib/accountingPresentation.ts`
- Create: `src/lib/accountingPresentation.test.ts`
- Modify: `src/pages/AccountingPage.tsx:1-35, 390-455`

- [ ] **Step 1: Write failing pure-function tests**

```ts
import { describe, expect, it } from 'vitest';
import { AccountingEntry } from './accounting';
import { formatAccountingCreatedAt, getAccountingEntryTitle } from './accountingPresentation';

const entry: AccountingEntry = {
  id: 'entry-1', type: 'expense', amountCents: 200000, category: 'other', account: '微信',
  spentAt: '2026-07-01', note: '住房', includeInSaving: true,
  createdAt: '2026-07-05T08:24:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z'
};

describe('accounting entry presentation', () => {
  it('uses note and payment method for the other category', () => {
    expect(getAccountingEntryTitle(entry)).toBe('住房 · 微信');
    expect(getAccountingEntryTitle({ ...entry, note: '   ' })).toBe('其他 · 微信');
  });

  it('uses category and payment method for normal categories', () => {
    expect(getAccountingEntryTitle({ ...entry, category: 'food', note: '午饭' })).toBe('餐饮 · 微信');
  });

  it('formats only the immutable creation time', () => {
    const before = formatAccountingCreatedAt(entry);
    const after = formatAccountingCreatedAt({ ...entry, updatedAt: '2099-01-01T00:00:00.000Z' });
    expect(after).toBe(before);
    expect(before).not.toContain('发生');
    expect(before).not.toContain(entry.spentAt);
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm test -- --run src/lib/accountingPresentation.test.ts`

Expected: FAIL because `accountingPresentation.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

```ts
import { AccountingCategory, AccountingEntry, getAccountingCategory } from './accounting';

export function getAccountingEntryTitle(
  entry: AccountingEntry,
  categories?: AccountingCategory[]
): string {
  const category = getAccountingCategory(entry.category, categories);
  const note = entry.note.trim();
  const subject = entry.category === 'other' && note ? note : category.name;
  return `${subject} · ${entry.account}`;
}

export function formatAccountingCreatedAt(entry: AccountingEntry): string {
  return new Date(entry.createdAt).toLocaleString('zh-CN');
}
```

- [ ] **Step 4: Use the helpers in `AccountingPage.tsx`**

Import both helpers. Replace the entry title and `<small>` content with:

```tsx
<strong>{getAccountingEntryTitle(entry, accountingData?.categories)}</strong>
<small>
  <time dateTime={entry.createdAt}>{formatAccountingCreatedAt(entry)}</time>
  <em className={`entry-saving-badge ${entry.includeInSaving ? 'active' : ''}`}>
    {entry.includeInSaving ? '存钱项目' : '普通流水'}
  </em>
</small>
```

Type the map callback as `(entry: AccountingEntry)` instead of `any`. Add `className="entry-edit"` to the edit button. Do not modify `spentAt` inputs, save payloads, sort order, hooks, or APIs.

- [ ] **Step 5: Run helper and accounting regression tests**

Run: `npm test -- --run src/lib/accountingPresentation.test.ts src/lib/accounting.test.ts src/App.test.tsx`

Expected: PASS; existing filter requests and accounting sorting remain unchanged.

- [ ] **Step 6: Commit the presentation rules**

```powershell
git add -- src/lib/accountingPresentation.ts src/lib/accountingPresentation.test.ts src/pages/AccountingPage.tsx
git commit -m "feat: simplify accounting ledger labels and times"
```

### Task 5: Add mobile accounting panels and the approved visual system

**Files:**
- Create: `src/components/accounting/AccountingMobileTabs.tsx`
- Create: `src/components/accounting/AccountingMobileTabs.test.tsx`
- Create: `src/styles/accounting-mobile-ui.test.js`
- Modify: `src/pages/AccountingPage.tsx:70-560`
- Modify: `src/styles/pages/accounting.css`
- Modify: `src/styles/index.css`
- Modify: `src/App.test.tsx:1274-1360`

- [ ] **Step 1: Write failing mobile-tab component tests**

```tsx
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountingMobileTabs } from './AccountingMobileTabs';

describe('AccountingMobileTabs', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  afterEach(() => roots.splice(0).forEach((root) => root.unmount()));

  it('marks entry as selected and reports a new selection', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn();
    await act(async () => root.render(<AccountingMobileTabs active="entry" onChange={onChange} />));
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toBe('记一笔');
    await act(async () => (host.querySelector('[data-accounting-tab="ledger"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith('ledger');
  });
});
```

- [ ] **Step 2: Write the failing CSS regression test**

Create `src/styles/accounting-mobile-ui.test.js`:

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/pages/accounting.css'), 'utf8');
const imports = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');

describe('accounting mobile UI CSS', () => {
  it('loads accounting overrides after the legacy App stylesheet', () => {
    expect(imports.indexOf("@import '../App.css'"))
      .toBeLessThan(imports.lastIndexOf("@import './pages/accounting.css'"));
  });

  it('shows only the selected accounting panel on phones', () => {
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\[data-accounting-panel\][\s\S]*display:\s*none/);
    expect(css).toMatch(/\[data-accounting-panel\]\.is-mobile-active[\s\S]*display:\s*grid/);
  });

  it('moves the white save-button glint fully across its container', () => {
    expect(css).toMatch(/@keyframes accounting-button-glint[\s\S]*left:\s*-20%/);
    expect(css).toMatch(/@keyframes accounting-button-glint[\s\S]*left:\s*115%/);
    expect(css).not.toMatch(/@keyframes accounting-button-glint\s*\{[^}]*translateX\(/s);
  });
});
```

- [ ] **Step 3: Run both focused tests and verify RED**

Run: `npm test -- --run src/components/accounting/AccountingMobileTabs.test.tsx src/styles/accounting-mobile-ui.test.js`

Expected: FAIL because the component and final CSS rules do not exist.

- [ ] **Step 4: Implement the controlled mobile tabs**

Create `src/components/accounting/AccountingMobileTabs.tsx`:

```tsx
import React from 'react';

export type AccountingPanel = 'overview' | 'entry' | 'ledger' | 'plan';

const TABS: Array<{ id: AccountingPanel; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'entry', label: '记一笔' },
  { id: 'ledger', label: '流水' },
  { id: 'plan', label: '计划' }
];

export function AccountingMobileTabs({
  active,
  onChange
}: {
  active: AccountingPanel;
  onChange: (panel: AccountingPanel) => void;
}) {
  return (
    <div aria-label="记账分区" className="accounting-mobile-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          aria-controls={`accounting-panel-${tab.id}`}
          aria-selected={active === tab.id}
          data-accounting-tab={tab.id}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire presentation-only panel state into `AccountingPage.tsx`**

Add:

```tsx
const [activeMobilePanel, setActiveMobilePanel] = useState<AccountingPanel>('entry');
```

Render `<AccountingMobileTabs active={activeMobilePanel} onChange={setActiveMobilePanel} />` immediately after `.accounting-hero`. Add the following attributes/classes without moving handlers or changing submissions:

```tsx
<section
  className={`accounting-metrics ${activeMobilePanel === 'overview' ? 'is-mobile-active' : ''}`}
  data-accounting-panel="overview"
  id="accounting-panel-overview"
>
```

```tsx
<form
  className={`accounting-card accounting-form ${activeMobilePanel === 'entry' ? 'is-mobile-active' : ''}`}
  data-accounting-panel="entry"
  id="accounting-panel-entry"
  onSubmit={saveAccountingEntry}
>
```

Apply the same pattern to the ledger section (`ledger`) and saving form (`plan`). Add `accounting-primary-action` to the main save button, `accounting-secondary-action` to non-danger panel actions, and retain `danger` on delete buttons.

- [ ] **Step 6: Add the final late-loaded accounting CSS**

Move the existing `@import './pages/accounting.css';` line in `src/styles/index.css` to immediately after `@import '../App.css';`. Append the following exact rules to `src/styles/pages/accounting.css`:

```css
.accounting-mobile-tabs {
  display: none;
}

.accounting-page::before,
.accounting-page::after {
  border-radius: 50%;
  content: '';
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.accounting-page > * {
  position: relative;
  z-index: 1;
}

.accounting-page::before {
  animation: accounting-particle-drift 4.4s ease-in-out infinite;
  background: #d84b49;
  box-shadow: 0 0 12px rgba(216, 75, 73, 0.58);
  height: 8px;
  left: 5%;
  top: 18%;
  width: 8px;
}

.accounting-page::after {
  animation: accounting-particle-drift 5.1s -2.1s ease-in-out infinite reverse;
  background: #69b58a;
  box-shadow: 0 0 12px rgba(105, 181, 138, 0.52);
  bottom: 12%;
  height: 7px;
  right: 5%;
  width: 7px;
}

@keyframes accounting-panel-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
  to { opacity: 1; transform: none; }
}

@keyframes accounting-particle-drift {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0); }
  50% { transform: translate3d(8px, -13px, 0) rotate(12deg); }
}

@keyframes accounting-button-glint {
  0% { left: -20%; opacity: 0; transform: skewX(-18deg); }
  8% { opacity: 1; }
  68% { left: 115%; opacity: 1; transform: skewX(-18deg); }
  76%, 100% { left: 115%; opacity: 0; transform: skewX(-18deg); }
}

.accounting-primary-action {
  background: #c83e3b;
  border: 0;
  clip-path: polygon(0 0, 93% 0, 100% 25%, 100% 100%, 7% 100%, 0 75%);
  color: #fff;
  filter: drop-shadow(0 7px 0 #8e2b29) drop-shadow(0 12px 18px rgba(143, 43, 41, 0.2));
  min-height: 47px;
  overflow: hidden;
  position: relative;
}

.accounting-primary-action::after {
  animation: accounting-button-glint 3.6s ease-in-out infinite;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  content: '';
  height: 170%;
  left: -20%;
  position: absolute;
  top: -35%;
  width: 34px;
}

.accounting-primary-action:active {
  filter: drop-shadow(0 1px 0 #8e2b29) drop-shadow(0 5px 9px rgba(143, 43, 41, 0.16));
  transform: translateY(6px);
}

.entry-edit {
  background: #fff;
  border: 1px solid #59473f;
  border-radius: 6px;
  box-shadow: 2px 2px 0 #d5ad4e;
  color: #46362f;
}

.accounting-secondary-action {
  background: #fff;
  border: 1px solid #59473f;
  border-radius: 6px;
  box-shadow: 2px 2px 0 #d5ad4e;
  color: #46362f;
  min-height: 38px;
}

.entry-item .danger {
  background: #fff;
  border: 1px solid #c64a47;
  clip-path: polygon(0 0, 82% 0, 100% 30%, 100% 100%, 0 100%);
  color: #aa3432;
}

@media (max-width: 720px) {
  .accounting-hero {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 16px;
  }

  .accounting-hero-art,
  .accounting-hero > div:first-child > p:not(.eyebrow) {
    display: none;
  }

  .accounting-hero h1 {
    font-size: clamp(1.35rem, 6vw, 1.8rem);
  }

  .accounting-actions {
    align-items: flex-end;
    gap: 6px;
  }

  .accounting-mobile-tabs {
    border-bottom: 1px solid rgba(42, 19, 15, 0.12);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 12px;
  }

  .accounting-mobile-tabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #786963;
    min-height: 44px;
  }

  .accounting-mobile-tabs button[aria-selected='true'] {
    border-bottom-color: #d84b49;
    color: #b73735;
  }

  .accounting-layout {
    display: contents;
  }

  [data-accounting-panel] {
    display: none;
  }

  [data-accounting-panel].is-mobile-active {
    animation: accounting-panel-enter 420ms ease both;
    display: grid;
    margin-top: 12px;
  }

  .ledger-filter-grid,
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-item {
    border-left: 3px solid #d84b49;
    grid-template-columns: 32px minmax(0, 1fr) auto;
  }

  .entry-actions {
    grid-column: 3;
  }
}

@media (max-width: 380px) {
  .ledger-filter-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
```

Do not add performance-detection JavaScript or change existing request handlers.

- [ ] **Step 7: Add one app-level wiring test**

In the existing accounting test section of `src/App.test.tsx`, add this complete integration test:

```tsx
it('opens accounting on entry and switches mobile presentation panels', async () => {
  window.localStorage.setItem(
    'kitepop-accounting-session',
    JSON.stringify({ token: 'accounting-token', expiresAt: '2099-01-01T00:00:00.000Z' })
  );
  window.history.pushState({}, '', '/accounting');
  const pageFetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/posts') || url.startsWith('/api/users/me')) return fetchMock(input);
    if (url.startsWith('/api/accounting/month')) {
      return Response.json({
        entries: [],
        categories: [
          { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
          { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' },
          { id: 'other', name: '其他', type: 'both', accent: '#68706a' }
        ],
        settings: { monthlyBudgetCents: 0, savingGoal: null },
        summary: {
          incomeCents: 0,
          expenseCents: 0,
          savingIncomeCents: 0,
          savingExpenseCents: 0,
          savingNetExpenseCents: 0,
          balanceCents: 0,
          dailyExpenseCents: 0,
          budgetLimitCents: 0,
          plannedAvailableCents: 0,
          targetSavingCents: 0,
          budgetUsedPercent: 0,
          budgetRemainingCents: 0,
          topExpenseCategory: null
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

  const tabs = await waitFor(() => host.querySelector('.accounting-mobile-tabs'));
  expect(tabs?.querySelector('[aria-selected="true"]')?.textContent).toBe('记一笔');
  expect(host.querySelector('[data-accounting-panel="entry"]')?.classList.contains('is-mobile-active')).toBe(true);

  const ledgerTab = tabs?.querySelector('[data-accounting-tab="ledger"]') as HTMLButtonElement;
  ledgerTab.click();
  expect(await waitFor(() => host.querySelector('[data-accounting-panel="ledger"].is-mobile-active'))).toBeTruthy();
  expect(host.querySelector('[data-accounting-panel="entry"]')?.classList.contains('is-mobile-active')).toBe(false);
});
```

- [ ] **Step 8: Run all focused accounting tests**

Run:

```powershell
npm test -- --run src/components/accounting/AccountingMobileTabs.test.tsx src/styles/accounting-mobile-ui.test.js src/lib/accountingPresentation.test.ts src/lib/accounting.test.ts src/App.test.tsx
```

Expected: all focused suites PASS; no React `act` warnings or unhandled fetch errors.

- [ ] **Step 9: Commit the accounting mobile UI**

```powershell
git add -- src/components/accounting/AccountingMobileTabs.tsx src/components/accounting/AccountingMobileTabs.test.tsx src/styles/accounting-mobile-ui.test.js src/pages/AccountingPage.tsx src/styles/pages/accounting.css src/styles/index.css src/App.test.tsx
git commit -m "feat: redesign the mobile accounting workspace"
```

### Task 6: Full verification and visual acceptance

**Files:**
- Verify only; change a file only if a failing test identifies an in-scope regression.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test -- --run`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: `tsc --noEmit` and `vite build` exit 0.

- [ ] **Step 3: Inspect the final diff for scope violations**

Run:

```powershell
git diff --check
git diff --stat HEAD~5..HEAD
git status --short
```

Expected: no whitespace errors; only the files listed in this plan changed; no generated `.superpowers` mockups are staged.

- [ ] **Step 4: Perform mobile viewport checks**

Start the app with `npm run dev` and inspect widths 320px, 375px, and 430px:

- Homepage layout is unchanged; the open article filter covers the article list.
- All four unlock pages have no horizontal overflow.
- Accounting opens on “记一笔”; all four panels switch without losing form data.
- Ledger titles and timestamps follow the approved rules.
- The white save-button glint travels completely from left outside to right outside.
- Tool menu closes on outside click, link click, `Esc`, and navigation.

- [ ] **Step 5: Record final verification evidence**

Run: `git status --short`

Expected: clean worktree after the task commits, or only explicitly identified pre-existing user changes.
