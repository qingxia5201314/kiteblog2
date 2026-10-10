# Navigation And Hero Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant public navigation and render the complete Haruhi character without damaged pixels or head clipping.

**Architecture:** Keep navigation behavior in `Layout.tsx`, homepage content in `HomePage.tsx`, and final hero sizing in the already-last-loaded `src/styles/pages/home.css`. Reuse the clean repository PNG instead of creating another image asset or adding another compatibility override to `App.css`.

**Tech Stack:** React 19, React Router, TypeScript, CSS, Vitest, Vite, Playwright browser checks.

---

### Task 1: Remove Redundant Navigation

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/pages/home.css`

- [ ] **Step 1: Write the failing navigation test**

Add an app-level assertion that the authenticated top bar contains `首页` and `工具`, does not contain `文章`, `分类`, `专题`, or `关于`, and does not render `.home-about`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/App.test.tsx -t "keeps only useful public navigation"`

Expected: FAIL because the four redundant links and `.home-about` still exist.

- [ ] **Step 3: Implement the minimal navigation change**

Remove the four links from `Layout.tsx`, remove the `home-about` section from `HomePage.tsx`, and remove its ordering and presentation rules from `home.css`. Keep the existing authenticated tool menu and logged-out login link unchanged.

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- --run src/App.test.tsx -t "keeps only useful public navigation"`

Expected: PASS.

### Task 2: Restore The Complete Hero Character

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/pages/home.css`

- [ ] **Step 1: Write the failing asset test**

Assert that the desktop hero image and compact mobile image use `/haruhi-cutout.png` rather than the damaged WebP mock.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/App.test.tsx -t "uses the clean complete hero character"`

Expected: FAIL because `HomePage.tsx` still imports `haruhi-cutout.webp`.

- [ ] **Step 3: Switch the asset and define stable sizing**

Import `haruhi-cutout.png`. On desktop, give the card a stable 440px height with top padding and cap the image below the card height so the hair has visible clearance. On tablet and mobile, use fixed responsive image caps and keep `object-fit: contain` without upward translation or scale cropping.

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- --run src/App.test.tsx -t "uses the clean complete hero character"`

Expected: PASS.

### Task 3: Verify And Deploy

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run regression verification**

Run `npm test -- --run`, `npm run build`, and `git diff --check`.

- [ ] **Step 2: Verify visuals**

Start the local production server and capture 1440x900 and 390x844 screenshots. Verify no horizontal overflow; the head has visible clearance; the character has no white/gray corruption; and the top bar contains only the chosen entries.

- [ ] **Step 3: Record and commit**

Append the verified result to `progress.md`, commit the implementation, and push `main`.

- [ ] **Step 4: Deploy VPS**

Back up the live SQLite database, Nginx configuration, and static root; pull the verified commit; install dependencies; rebuild; restart `kitepop-blog.service`; and verify homepage, article, API, and static asset responses.
