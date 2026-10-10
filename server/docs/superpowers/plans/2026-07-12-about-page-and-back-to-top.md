# About Page and Back-to-Top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database-backed, admin-editable `/about` page with SOS-styled motion and a responsive global back-to-top control.

**Architecture:** A focused `aboutStore` owns the single SQLite profile row, Hono routes expose public read and admin update operations, and a typed React API module connects the public page and admin editor. The about page reuses the shared Markdown and image-upload paths; the back-to-top behavior stays isolated in a layout-level component.

**Tech Stack:** React 19, React Router 7, TypeScript, Hono, sql.js/SQLite, Vitest, CSS animations and IntersectionObserver.

---

## File map

- Create `server/aboutModel.mjs`: normalization, limits, GitHub URL validation, and empty-profile contract.
- Create `server/aboutModel.test.mjs`: model validation tests.
- Create `server/aboutStore.mjs`: schema initialization and single-row persistence.
- Create `server/aboutStore.test.mjs`: schema and persistence tests.
- Create `server/routes/about.mjs`: public `GET /api/about` route.
- Create `server/routes/aboutRoutes.test.mjs`: public and admin route contract tests.
- Modify `server/routes/admin.mjs`: authenticated `GET`/`PUT /api/admin/about` endpoints.
- Modify `server/index.mjs`: construct/inject `aboutStore` and mount public route.
- Create `src/lib/about.ts`: shared `AboutProfile` type and empty value.
- Create `src/lib/aboutApi.ts`: public/admin requests.
- Create `src/lib/aboutApi.test.ts`: API request and error parsing tests.
- Create `src/pages/AboutPage.tsx`: public profile view, empty/error states, Markdown rendering, and motion hooks.
- Create `src/pages/AboutPage.test.tsx`: public-page behavior tests.
- Create `src/components/admin/AboutManager.tsx`: admin form, avatar upload, validation, and preview.
- Create `src/components/admin/AboutManager.test.tsx`: admin workflow tests.
- Modify `src/pages/AdminPage.tsx`: mount the about module using the current admin token.
- Create `src/components/BackToTop.tsx`: global scroll threshold and click behavior.
- Create `src/components/BackToTop.test.tsx`: opacity-state and scroll tests.
- Modify `src/components/Layout.tsx`: add navigation link and global component.
- Modify `src/App.tsx` and `src/pages/lazy.ts`: register lazy `/about` route.
- Create `src/styles/pages/about.css`: responsive about-page visuals and motion.
- Create `src/styles/features/back-to-top.css`: opacity transition, button styling, and safe-area behavior.
- Modify `src/styles/index.css`: import both new stylesheets.
- Modify `src/App.test.tsx`: routing/navigation integration coverage.

### Task 1: Define and validate the about profile contract

**Files:**
- Create: `server/aboutModel.mjs`
- Create: `server/aboutModel.test.mjs`

- [ ] **Step 1: Write failing model tests**

```js
import { describe, expect, it } from 'vitest';
import { emptyAboutProfile, normalizeAboutProfile } from './aboutModel.mjs';

describe('aboutModel', () => {
  it('returns a stable empty public profile', () => {
    expect(emptyAboutProfile()).toEqual({
      avatarUrl: '', displayName: '', identityTags: [], intro: '', githubUrl: '', content: '', updatedAt: ''
    });
  });

  it('trims fields and deduplicates identity tags', () => {
    expect(normalizeAboutProfile({
      avatarUrl: '/api/images/raw/avatar', displayName: ' Kite ', identityTags: [' SRC ', 'src', '生活'],
      intro: ' hello ', githubUrl: 'https://github.com/kite', content: '# Hi'
    }).identityTags).toEqual(['SRC', '生活']);
  });

  it('rejects an empty name and non-GitHub URLs', () => {
    expect(() => normalizeAboutProfile({ displayName: '', identityTags: [] })).toThrow('请填写名称');
    expect(() => normalizeAboutProfile({ displayName: 'Kite', githubUrl: 'https://example.com/kite' }))
      .toThrow('请输入有效的 GitHub 个人主页链接');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- server/aboutModel.test.mjs --run`

Expected: FAIL because `server/aboutModel.mjs` does not exist.

- [ ] **Step 3: Implement the model**

```js
const LIMITS = { name: 80, tagCount: 8, tag: 30, intro: 280, content: 100_000 };

export function emptyAboutProfile() {
  return { avatarUrl: '', displayName: '', identityTags: [], intro: '', githubUrl: '', content: '', updatedAt: '' };
}

function githubUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.pathname === '/') {
    throw new Error('请输入有效的 GitHub 个人主页链接');
  }
  return url.toString().replace(/\/$/, '');
}

export function normalizeAboutProfile(input = {}) {
  const displayName = String(input.displayName || '').trim();
  if (!displayName) throw new Error('请填写名称');
  if (displayName.length > LIMITS.name) throw new Error('名称不能超过 80 个字符');
  const seen = new Set();
  const identityTags = (Array.isArray(input.identityTags) ? input.identityTags : [])
    .map((tag) => String(tag).trim()).filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()))
    .slice(0, LIMITS.tagCount);
  if (identityTags.some((tag) => tag.length > LIMITS.tag)) throw new Error('单个身份标签不能超过 30 个字符');
  const intro = String(input.intro || '').trim();
  const content = String(input.content || '');
  if (intro.length > LIMITS.intro) throw new Error('简短介绍不能超过 280 个字符');
  if (content.length > LIMITS.content) throw new Error('详细介绍不能超过 100000 个字符');
  return { avatarUrl: String(input.avatarUrl || '').trim(), displayName, identityTags, intro,
    githubUrl: githubUrl(String(input.githubUrl || '').trim()), content, updatedAt: String(input.updatedAt || '') };
}
```

- [ ] **Step 4: Run the model tests**

Run: `npm test -- server/aboutModel.test.mjs --run`

Expected: PASS.

- [ ] **Step 5: Commit the profile contract**

```bash
git add server/aboutModel.mjs server/aboutModel.test.mjs
git commit -m "feat: define about profile contract"
```

### Task 2: Persist the single about profile row

**Files:**
- Create: `server/aboutStore.mjs`
- Create: `server/aboutStore.test.mjs`

- [ ] **Step 1: Write failing store tests**

```js
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createAboutStore } from './aboutStore.mjs';

describe('aboutStore', () => {
  const roots = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
  it('starts empty and persists an upsert across database reopen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'about-store-')); roots.push(root);
    const dbPath = join(root, 'blog.sqlite');
    let database = await createSqliteDatabase({ dbPath });
    let store = createAboutStore({ database });
    expect(store.get().displayName).toBe('');
    store.save({ displayName: 'Kite', identityTags: ['SRC'], githubUrl: 'https://github.com/kite' });
    database = await createSqliteDatabase({ dbPath });
    store = createAboutStore({ database });
    expect(store.get()).toMatchObject({ displayName: 'Kite', identityTags: ['SRC'] });
  });
});
```

- [ ] **Step 2: Run the store test and verify failure**

Run: `npm test -- server/aboutStore.test.mjs --run`

Expected: FAIL because `createAboutStore` is missing.

- [ ] **Step 3: Implement schema creation, row mapping, and upsert**

```js
import { emptyAboutProfile, normalizeAboutProfile } from './aboutModel.mjs';

export function createAboutStore({ database }) {
  const { db } = database;
  const missing = !db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='about_profile'").length;
  db.run(`CREATE TABLE IF NOT EXISTS about_profile (
    profile_key TEXT PRIMARY KEY, avatar_url TEXT NOT NULL, display_name TEXT NOT NULL,
    identity_tags_json TEXT NOT NULL, intro TEXT NOT NULL, github_url TEXT NOT NULL,
    content TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  if (missing) database.persist();
  return {
    get() {
      const result = db.exec("SELECT * FROM about_profile WHERE profile_key = 'primary'");
      if (!result.length) return emptyAboutProfile();
      const row = Object.fromEntries(result[0].columns.map((column, index) => [column, result[0].values[0][index]]));
      return { avatarUrl: row.avatar_url, displayName: row.display_name, identityTags: JSON.parse(row.identity_tags_json),
        intro: row.intro, githubUrl: row.github_url, content: row.content, updatedAt: row.updated_at };
    },
    save(input) {
      const profile = { ...normalizeAboutProfile(input), updatedAt: new Date().toISOString() };
      db.run(`INSERT INTO about_profile VALUES ('primary', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_key) DO UPDATE SET avatar_url=excluded.avatar_url, display_name=excluded.display_name,
        identity_tags_json=excluded.identity_tags_json, intro=excluded.intro, github_url=excluded.github_url,
        content=excluded.content, updated_at=excluded.updated_at`,
        [profile.avatarUrl, profile.displayName, JSON.stringify(profile.identityTags), profile.intro,
          profile.githubUrl, profile.content, profile.updatedAt]);
      database.persist(); return profile;
    }
  };
}
```

- [ ] **Step 4: Run store and database tests**

Run: `npm test -- server/aboutStore.test.mjs server/aboutModel.test.mjs --run`

Expected: PASS.

- [ ] **Step 5: Commit persistence**

```bash
git add server/aboutStore.mjs server/aboutStore.test.mjs
git commit -m "feat: persist about profile"
```

### Task 3: Expose public and admin APIs

**Files:**
- Create: `server/routes/about.mjs`
- Create: `server/routes/aboutRoutes.test.mjs`
- Modify: `server/routes/admin.mjs`
- Modify: `server/index.mjs`

- [ ] **Step 1: Write route contract tests using a small Hono test app**

```js
it('serves the public profile and protects updates', async () => {
  expect((await (await app.request('/api/about')).json()).profile.displayName).toBe('Kite');
  expect((await app.request('/api/admin/about', { method: 'PUT', body: '{}' })).status).toBe(401);
});

it('updates the profile for an admin session', async () => {
  const response = await app.request('/api/admin/about', {
    method: 'PUT', headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Kite', identityTags: [], githubUrl: 'https://github.com/kite' })
  });
  expect(response.status).toBe(200);
  expect((await response.json()).profile.githubUrl).toBe('https://github.com/kite');
});
```

- [ ] **Step 2: Run route tests and verify 404 failures**

Run: `npm test -- server/routes/aboutRoutes.test.mjs --run`

Expected: FAIL because the routes are not mounted.

- [ ] **Step 3: Add the public router and admin handlers**

```js
// server/routes/about.mjs
import { Hono } from 'hono';
export const aboutRoutes = new Hono().get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return c.json({ profile: c.get('aboutStore').get() });
});

// append to server/routes/admin.mjs before export
app.get('/about', requireAdmin, (c) => c.json({ profile: c.get('aboutStore').get() }));
app.put('/about', requireAdmin, async (c) => {
  try { return c.json({ profile: c.get('aboutStore').save(await c.req.json()) }); }
  catch (error) { return c.json({ ok: false, message: error?.message || 'About save failed' }, 400); }
});
```

In `server/index.mjs`, import and create `aboutStore`, inject it with `c.set('aboutStore', aboutStore)`, import `aboutRoutes`, and mount `app.route('/api/about', aboutRoutes)` before the API fallback.

- [ ] **Step 4: Run route and existing API tests**

Run: `npm test -- server/routes/aboutRoutes.test.mjs server/apiFallback.test.mjs server/adminSession.test.mjs --run`

Expected: PASS.

- [ ] **Step 5: Commit API wiring**

```bash
git add server/routes/about.mjs server/routes/aboutRoutes.test.mjs server/routes/admin.mjs server/index.mjs
git commit -m "feat: expose about profile APIs"
```

### Task 4: Add the typed browser API and public About page

**Files:**
- Create: `src/lib/about.ts`
- Create: `src/lib/aboutApi.ts`
- Create: `src/lib/aboutApi.test.ts`
- Create: `src/pages/AboutPage.tsx`
- Create: `src/pages/AboutPage.test.tsx`
- Modify: `src/pages/lazy.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing API and page tests**

```tsx
it('loads and renders the profile with one GitHub action', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: {
    avatarUrl: '/api/images/raw/avatar', displayName: 'Kite', identityTags: ['SRC', '生活'],
    intro: '记录技术与生活', githubUrl: 'https://github.com/kite', content: '# 我是谁', updatedAt: ''
  } })));
  root.render(<AboutPage />);
  expect(await waitFor(() => host.querySelector('.about-profile-name'))).toHaveTextContent('Kite');
  expect(host.querySelectorAll('.about-social-link')).toHaveLength(1);
  expect(host.querySelector('.about-social-link')).toHaveAttribute('href', 'https://github.com/kite');
});
```

Add tests for retry after a rejected request, omission of the GitHub button when blank, and avatar fallback after an `error` event.

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `npm test -- src/lib/aboutApi.test.ts src/pages/AboutPage.test.tsx --run`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement types and API calls**

```ts
export interface AboutProfile {
  avatarUrl: string; displayName: string; identityTags: string[]; intro: string;
  githubUrl: string; content: string; updatedAt: string;
}

export async function getAboutProfile(): Promise<AboutProfile> {
  const response = await fetch('/api/about');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '个人资料加载失败');
  return payload.profile;
}

export async function updateAboutProfile(profile: AboutProfile, token: string): Promise<AboutProfile> {
  const response = await fetch('/api/admin/about', { method: 'PUT', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
  }, body: JSON.stringify(profile) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '个人资料保存失败');
  return payload.profile;
}
```

- [ ] **Step 4: Implement the public page and lazy route**

`AboutPage` must own `loading | error | profile`, call `getAboutProfile`, render an empty state when `displayName` and `content` are both empty, use `ImageWithFallback`, render only one GitHub link, and pass `profile.content` to `MarkdownContent`. Add `LazyAboutPage` to `lazy.ts` and `<Route path="/about" element={<LazyAboutPage />} />` to `App.tsx`.

- [ ] **Step 5: Run API and public-page tests**

Run: `npm test -- src/lib/aboutApi.test.ts src/pages/AboutPage.test.tsx --run`

Expected: PASS.

- [ ] **Step 6: Commit the public feature**

```bash
git add src/lib/about.ts src/lib/aboutApi.ts src/lib/aboutApi.test.ts src/pages/AboutPage.tsx src/pages/AboutPage.test.tsx src/pages/lazy.ts src/App.tsx
git commit -m "feat: add public about page"
```

### Task 5: Add the admin About editor with avatar upload

**Files:**
- Create: `src/components/admin/AboutManager.tsx`
- Create: `src/components/admin/AboutManager.test.tsx`
- Modify: `src/lib/aboutApi.ts`
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Write failing admin workflow tests**

Render `AboutManager` with an admin token and mocked `getAdminAboutProfile`, `updateAboutProfile`, and `uploadHostedImage`. Assert that opening the panel loads fields, selecting a PNG replaces `avatarUrl` with `/api/images/raw/avatar-2`, submitting sends trimmed tags, and a rejected save keeps the typed Markdown content visible.

```tsx
expect(updateAboutProfile).toHaveBeenCalledWith(expect.objectContaining({
  displayName: 'Kite', identityTags: ['SRC', '生活'], avatarUrl: '/api/images/raw/avatar-2'
}), 'admin-token');
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- src/components/admin/AboutManager.test.tsx --run`

Expected: FAIL because `AboutManager` does not exist.

- [ ] **Step 3: Add authenticated read API**

```ts
export async function getAdminAboutProfile(token: string): Promise<AboutProfile> {
  const response = await fetch('/api/admin/about', { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '个人资料加载失败');
  return payload.profile;
}
```

- [ ] **Step 4: Implement `AboutManager`**

Use a focused component with `open`, `loading`, `saving`, `uploading`, `profile`, `tagInput`, and `preview` state. Reuse `uploadHostedImage(file, token)`, accept images only, show the returned path immediately, validate `displayName` and a `https://github.com/` URL before submit, render edit/preview tabs for Markdown, and call `notify` without clearing state on failure.

- [ ] **Step 5: Mount the manager in `AdminPage`**

Add an `about` key to `adminPanelOpen` and render:

```tsx
<AboutManager
  adminPanelOpen={adminPanelOpen.about}
  adminToken={localAdminToken}
  notify={notify}
  onTogglePanel={() => setAdminPanelOpen((current) => ({ ...current, about: !current.about }))}
/>
```

- [ ] **Step 6: Run admin tests**

Run: `npm test -- src/components/admin/AboutManager.test.tsx src/App.test.tsx --run`

Expected: PASS.

- [ ] **Step 7: Commit the editor**

```bash
git add src/components/admin/AboutManager.tsx src/components/admin/AboutManager.test.tsx src/lib/aboutApi.ts src/pages/AdminPage.tsx
git commit -m "feat: edit about profile from admin"
```

### Task 6: Add navigation and the global opacity-based back-to-top control

**Files:**
- Create: `src/components/BackToTop.tsx`
- Create: `src/components/BackToTop.test.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
it('uses opacity state after 400px and scrolls to the top', async () => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
  const scrollTo = vi.fn(); vi.stubGlobal('scrollTo', scrollTo);
  root.render(<BackToTop />); window.dispatchEvent(new Event('scroll'));
  const button = await waitFor(() => host.querySelector('.back-to-top.is-visible'));
  expect(button).toHaveAttribute('aria-hidden', 'false');
  (button as HTMLButtonElement).click();
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
});
```

Add a threshold-under-400 assertion for `.is-hidden`, `tabIndex=-1`, and disabled pointer behavior through the class contract.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/components/BackToTop.test.tsx --run`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the isolated component**

```tsx
export function BackToTop() {
  const [visible, setVisible] = useState(() => window.scrollY > 400);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <button aria-hidden={!visible} aria-label="回到页面顶部"
    className={`back-to-top ${visible ? 'is-visible' : 'is-hidden'}`} tabIndex={visible ? 0 : -1}
    onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
    <span aria-hidden="true">↑</span>
  </button>;
}
```

- [ ] **Step 4: Wire navigation and the global control**

Add a public `/about` `Link` immediately after “首页” and render `<BackToTop />` after `#main-content` in `Layout`. Extend `App.test.tsx` to assert the link exists and gains `aria-current="page"` on `/about`.

- [ ] **Step 5: Run component and routing tests**

Run: `npm test -- src/components/BackToTop.test.tsx src/App.test.tsx --run`

Expected: PASS.

- [ ] **Step 6: Commit navigation and scrolling**

```bash
git add src/components/BackToTop.tsx src/components/BackToTop.test.tsx src/components/Layout.tsx src/App.test.tsx
git commit -m "feat: add about navigation and back-to-top"
```

### Task 7: Apply SOS visuals, motion, and mobile layouts

**Files:**
- Create: `src/styles/pages/about.css`
- Create: `src/styles/features/back-to-top.css`
- Modify: `src/styles/index.css`
- Modify: `src/pages/AboutPage.tsx`
- Modify: `src/components/admin/AboutManager.tsx`

- [ ] **Step 1: Add stable animation and layout class hooks to component tests**

Assert `.about-sos-watermark`, `.about-avatar-ring`, `.about-reveal`, `.about-content`, `.about-manager`, and `.back-to-top` exist so CSS selectors cannot silently drift.

- [ ] **Step 2: Run the focused tests and confirm missing-hook failures**

Run: `npm test -- src/pages/AboutPage.test.tsx src/components/admin/AboutManager.test.tsx src/components/BackToTop.test.tsx --run`

Expected: FAIL on the newly asserted class hooks.

- [ ] **Step 3: Implement about-page CSS**

Use existing tokens (`--sos-red`, paper backgrounds, borders, shadows). Build a centered hero with an absolutely positioned oversized rotated watermark, rotating dashed avatar ring, staggered `opacity/transform` reveals, GitHub offset shadow, a readable Markdown card, and `overflow: clip`. Add pointer-based CSS custom properties only on `(hover: hover) and (pointer: fine)`. At `max-width: 620px`, reduce watermark and avatar size, wrap tags, remove pointer parallax, constrain tables/code/links, and keep a single column.

- [ ] **Step 4: Implement the opacity-led back-to-top CSS**

```css
.back-to-top { position:fixed; right:18px; bottom:calc(18px + env(safe-area-inset-bottom)); width:48px; height:48px;
  opacity:0; pointer-events:none; transform:translateY(12px); transition:opacity 240ms ease, transform 240ms ease; }
.back-to-top.is-visible { opacity:1; pointer-events:auto; transform:translateY(0); }
@media (max-width:620px) { .back-to-top { width:44px; height:44px; right:12px; } }
@media (prefers-reduced-motion:reduce) { .about-sos-watermark, .about-avatar-ring { animation:none; }
  .about-reveal { opacity:1; transform:none; } }
```

- [ ] **Step 5: Add reveal and parallax behavior**

Use one `IntersectionObserver` in `AboutPage` to add `is-revealed` to `.about-reveal` elements. Update `--about-parallax-x/y` from pointer movement only for fine pointers, clear values on pointer leave, and disconnect observers on unmount.

- [ ] **Step 6: Style the admin module and import stylesheets**

Keep the existing admin card/form/button language, make the form single-column below 760px, constrain avatar preview, and import `pages/about.css` plus `features/back-to-top.css` from `src/styles/index.css`.

- [ ] **Step 7: Run focused tests and production build**

Run: `npm test -- src/pages/AboutPage.test.tsx src/components/admin/AboutManager.test.tsx src/components/BackToTop.test.tsx --run`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 8: Commit visuals and responsive behavior**

```bash
git add src/styles/pages/about.css src/styles/features/back-to-top.css src/styles/index.css src/pages/AboutPage.tsx src/components/admin/AboutManager.tsx
git commit -m "feat: style responsive about experience"
```

### Task 8: Full regression and manual acceptance

**Files:**
- Modify only files needed to correct failures found by the checks below.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test -- --run`

Expected: all test files pass with no unhandled rejection.

- [ ] **Step 2: Run the production build again**

Run: `npm run build`

Expected: exit code 0 and generated `dist` assets.

- [ ] **Step 3: Inspect desktop behavior**

Run the app with `npm run dev` and the API server with the project’s normal `npm start` environment. At a 1440×900 viewport verify navigation activation, SOS watermark motion, avatar fallback/upload, the single GitHub link, Markdown readability, admin save/reload, and the back-to-top opacity transition across 400px.

- [ ] **Step 4: Inspect mobile behavior**

At 390×844 and 320×568 verify no horizontal scroll, wrapped tags, one-column content and admin form, 44px back-to-top target, safe-area spacing, readable Markdown tables/code, and no pointer parallax.

- [ ] **Step 5: Inspect accessibility fallbacks**

Use keyboard navigation to verify focus visibility and hidden back-to-top exclusion. Emulate `prefers-reduced-motion: reduce` and confirm content stays visible while continuous rotation, drift, parallax, and smooth scrolling stop.

- [ ] **Step 6: Commit only if verification required fixes**

```bash
git add -u
git commit -m "fix: harden about page acceptance"
```

If no files changed, do not create an empty commit.
