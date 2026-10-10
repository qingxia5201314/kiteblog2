# UI Motion Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Kitepop Blog's front-end UI source files and then add controlled depth, motion, and 3D effects without changing backend data, auth, or database behavior.

**Architecture:** Start with a no-visual-change CSS split so the project gets a safer structure before any polish. Then extract shared presentational components, improve the home/article surfaces, unify tool pages, and add motion/effects as isolated layers with reduced-motion support.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS modules-by-file through global imports, Vitest, existing Hono/sql.js backend untouched

---

### Task 1: Create a No-Visual-Change Style Structure

**Files:**
- Create: `src/styles/index.css`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Create: `src/styles/layout.css`
- Create: `src/styles/motion.css`
- Create: `src/styles/effects.css`
- Create: `src/styles/pages/home.css`
- Create: `src/styles/pages/article.css`
- Create: `src/styles/pages/admin.css`
- Create: `src/styles/pages/accounting.css`
- Create: `src/styles/pages/files.css`
- Create: `src/styles/pages/images.css`
- Create: `src/styles/pages/media.css`
- Modify: `src/main.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

- [x] **Step 1: Add a style import index**

Create `src/styles/index.css`:

```css
@import './tokens.css';
@import './base.css';
@import './layout.css';
@import './motion.css';
@import './effects.css';
@import './pages/home.css';
@import './pages/article.css';
@import './pages/admin.css';
@import './pages/accounting.css';
@import './pages/files.css';
@import './pages/images.css';
@import './pages/media.css';
```

- [x] **Step 2: Move the top-level app CSS import**

In `src/main.tsx`, replace:

```ts
import './App.css';
```

with:

```ts
import './styles/index.css';
```

Expected: the app still compiles after `index.css` imports `App.css` during the first safe step.

- [x] **Step 3: Add a temporary compatibility import**

At the bottom of `src/styles/index.css`, add:

```css
@import '../App.css';
```

Expected: this keeps visual output unchanged while the split files are created.

- [x] **Step 4: Run baseline tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
npm run build
```

Expected: PASS. If this fails, stop and restore the previous direct `App.css` import before continuing.

- [x] **Step 5: Move only CSS custom properties and resets**

Move `:root`, `body`, generic `button`, `input`, `textarea`, `select`, and global focus rules from `src/App.css` into `src/styles/tokens.css` and `src/styles/base.css`. Do not rename selectors.

Expected: `App.css` shrinks, but selectors and computed styles remain equivalent.

- [x] **Step 6: Run full regression**

Run:

```powershell
npm test -- --run
npm run build
```

Expected: PASS. Commit only after both commands pass.

- [x] **Step 7: Commit Task 1**

Run:

```powershell
git add src/main.tsx src/App.css src/styles progress.md
git commit -m "split base style structure"
```

### Task 2: Move Page-Specific CSS Without Changing Behavior

**Files:**
- Modify: `src/App.css`
- Modify: `src/styles/pages/home.css`
- Modify: `src/styles/pages/article.css`
- Modify: `src/styles/pages/admin.css`
- Modify: `src/styles/pages/accounting.css`
- Modify: `src/styles/pages/files.css`
- Modify: `src/styles/pages/images.css`
- Modify: `src/styles/pages/media.css`

- [ ] **Step 1: Move home selectors**

Move selectors beginning with or primarily targeting:

```css
.hero-band
.hero-copy
.hero-visual
.hero-art
.metrics-strip
.home-post-section
.home-post-shell
.home-filter-panel
.home-post-panel
.post-list
.post-item
```

from `src/App.css` to `src/styles/pages/home.css`.

- [ ] **Step 2: Move article selectors**

Move selectors beginning with or primarily targeting:

```css
.article-page
.article-page-shell
.article-page-rail
.article-page-main
.article-header-card
.article-body-card
.comment-panel
.comment-form
.comment-list
.comment-item
```

to `src/styles/pages/article.css`.

- [ ] **Step 3: Move tool page selectors**

Move admin selectors to `admin.css`, accounting selectors to `accounting.css`, file selectors to `files.css`, image selectors to `images.css`, and media-preview selectors to `media.css`. Keep the original selector names.

- [ ] **Step 4: Run focused route tests**

Run:

```powershell
npm test -- --run src/App.test.tsx src/pages/MediaPreviewPage.test.tsx
npm run build
```

Expected: PASS. No route should lose its main page shell.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/App.css src/styles progress.md
git commit -m "move page styles into focused files"
```

### Task 3: Extract Shared Presentation Components

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Panel.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/EmptyState.tsx`
- Create: `src/components/ui/SectionHeader.tsx`
- Test: `src/components/shared.test.tsx`

- [x] **Step 1: Create `Panel`**

Create `src/components/ui/Panel.tsx`:

```tsx
import { ReactNode } from 'react';

interface PanelProps {
  className?: string;
  children: ReactNode;
}

export function Panel({ className = '', children }: PanelProps) {
  return <section className={['ui-panel', className].filter(Boolean).join(' ')}>{children}</section>;
}
```

- [x] **Step 2: Create small UI helpers**

Create `Button.tsx`, `Badge.tsx`, `EmptyState.tsx`, and `SectionHeader.tsx` with simple className passthroughs. Do not move business logic into these components.

- [x] **Step 3: Add smoke tests**

Add tests that render each component and assert the expected text/class exists.

- [x] **Step 4: Run component tests**

Run:

```powershell
npm test -- --run src/components/shared.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit Task 3**

Run:

```powershell
git add src/components/ui src/components/shared.test.tsx progress.md
git commit -m "add shared ui presentation components"
```

### Task 4: Improve Home and Article Layout

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/pages/home.css`
- Modify: `src/styles/pages/article.css`
- Test: `src/App.test.tsx`

- [x] **Step 1: Add layout regression tests**

Add tests asserting:

```tsx
expect(host.querySelector('.hero-band')).toBeTruthy();
expect(host.querySelector('.post-list')).toBeTruthy();
expect(host.querySelector('.article-page')).toBeTruthy();
expect(host.querySelector('.comment-panel')).toBeTruthy();
```

- [x] **Step 2: Tune home visual hierarchy**

Use the existing `hero-band`, `hero-art`, `post-item`, and filter classes. Adjust CSS only. Do not change post filtering, tag filtering, article opening, comments, or auth logic.

- [x] **Step 3: Tune article/comment hierarchy**

Adjust article and comment spacing, borders, and metadata layout through CSS only.

- [x] **Step 4: Run app tests and build**

Run:

```powershell
npm test -- --run src/App.test.tsx
npm run build
```

Expected: PASS.

- [x] **Step 5: Commit Task 4**

Run:

```powershell
git add src/pages/HomePage.tsx src/styles/pages/home.css src/styles/pages/article.css src/App.test.tsx progress.md
git commit -m "polish home and article layout"
```

### Task 5: Add Isolated Motion and 3D Effects

**Files:**
- Create: `src/components/effects/ParallaxStage.tsx`
- Create: `src/components/effects/TiltCard.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/styles/motion.css`
- Modify: `src/styles/effects.css`
- Test: `src/App.test.tsx`

- [x] **Step 1: Create `TiltCard`**

Create a wrapper that only adds class names and CSS variables. It must not fetch data or own feature state.

```tsx
import { ReactNode } from 'react';

interface TiltCardProps {
  className?: string;
  children: ReactNode;
}

export function TiltCard({ className = '', children }: TiltCardProps) {
  return <div className={['tilt-card', className].filter(Boolean).join(' ')}>{children}</div>;
}
```

- [x] **Step 2: Add CSS-only 3D hover**

In `effects.css`, add a conservative hover transform:

```css
.tilt-card {
  transform-style: preserve-3d;
  transition: transform 180ms ease, box-shadow 200ms ease, border-color 200ms ease;
}

@media (hover: hover) {
  .tilt-card:hover {
    transform: translateY(-3px) perspective(900px) rotateX(1.2deg);
  }
}
```

- [x] **Step 3: Add reduced-motion guard**

In `motion.css`, add:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }

  .pointer-particle {
    display: none !important;
  }
}
```

- [x] **Step 4: Apply effects only to visual cards**

Apply `tilt-card` classes to home article cards and hero visual wrappers. Do not apply it to form controls, admin rows, file upload dropzones, or accounting input cards.

- [x] **Step 5: Run regression**

Run:

```powershell
npm test -- --run src/App.test.tsx src/pages/MediaPreviewPage.test.tsx
npm run build
```

Expected: PASS.

- [x] **Step 6: Commit Task 5**

Run:

```powershell
git add src/components/effects src/components/Layout.tsx src/styles src/pages/HomePage.tsx src/App.test.tsx progress.md
git commit -m "add controlled motion and depth effects"
```

### Task 6: Final Verification and Deployment

**Files:**
- Modify: `progress.md`

- [x] **Step 1: Run full test suite**

Run:

```powershell
npm test -- --run
```

Expected: PASS.

- [x] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. Existing Vite large chunk warning is acceptable unless a new error appears.

- [x] **Step 3: Manual route smoke check**

Open the local production/dev site and check:

```text
/
/admin
/accounting
/files
/images
/files/preview
```

Expected: no blank page, no horizontal overflow, auth controls clickable, article comments visible, file/image lists visible after saved admin session.

- [x] **Step 4: Commit final notes**

Run:

```powershell
git add progress.md
git commit -m "document ui motion verification"
```

- [ ] **Step 5: Push and deploy when approved**

Run the existing GitHub push and VPS deployment flow only after the implementation has passed local verification.

## Self-Review

- Spec coverage: The plan covers structure split, shared UI, home/article polish, tool-page safety, motion/3D effects, reduced motion, tests, build, and deployment.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: Component names and paths are consistent across tasks.
