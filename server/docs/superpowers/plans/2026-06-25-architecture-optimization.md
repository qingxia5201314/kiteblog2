# Website Architecture Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the blog's frontend and backend boundaries so session-driven loading is consistent, admin functionality is modular, homepage payload is lighter, and storage behavior remains safe for current SQLite-backed production data.

**Architecture:** Shrink `AppContext` to global session/notification concerns, move feature data loading into domain hooks/providers, split the admin page into focused components, lazy-load non-home routes, and introduce backend service wrappers that preserve current API behavior while isolating storage assumptions.

**Tech Stack:** React 19, React Router 7, TypeScript, Vite, Vitest, Hono, SQLite via `sql.js`, Node file storage

---

### Task 1: Extract a Shared Admin Session API

**Files:**
- Create: `src/lib/adminSession.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/pages/FilesPage.tsx`
- Modify: `src/pages/ImagesPage.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing regression tests for shared admin session restore and login propagation**

Add tests covering:

```tsx
it('restores admin session once and shares it across admin, files, and images routes', async () => {
  window.localStorage.setItem(
    'kitepop-admin-session',
    JSON.stringify({ token: 'admin-token', expiresAt: '2099-01-01T00:00:00.000Z' })
  );
  // Assert each route consumes the shared token-driven data flow without page-local token drift.
});
```

```tsx
it('updates shared admin session after route-level admin login', async () => {
  // Login from files or images page and assert the shared session store is updated once.
});
```

- [ ] **Step 2: Run the app tests and verify the new session-sharing test fails**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: FAIL because admin session persistence and route-local login/update behavior is still duplicated across pages.

- [ ] **Step 3: Implement a shared admin session helper**

Create `src/lib/adminSession.ts` with:

```ts
const ADMIN_SESSION_KEY = 'kitepop-admin-session';

export interface SavedAdminSession {
  token: string;
  expiresAt?: string;
}

export function loadSavedAdminSession(): SavedAdminSession | null { /* restore + expiry guard */ }
export function saveAdminSession(session: SavedAdminSession): void { /* localStorage write */ }
export function clearAdminSession(): void { /* localStorage remove */ }
```

This module must own the storage key and expiration handling currently embedded in `AppContext`.

- [ ] **Step 4: Move AppContext to the shared session helper**

Update `src/context/AppContext.tsx` so it imports `loadSavedAdminSession`, `saveAdminSession`, and `clearAdminSession` instead of keeping its own admin-session storage helpers.

Expected shape:

```ts
const [adminUnlocked, setAdminUnlocked] = useState(() => Boolean(loadSavedAdminSession()));
const [adminToken, setAdminToken] = useState(() => loadSavedAdminSession()?.token ?? '');
```

- [ ] **Step 5: Make AdminPage, FilesPage, and ImagesPage reuse the shared session helper**

Replace direct `window.localStorage.setItem('kitepop-admin-session', ...)` calls with `saveAdminSession(...)` and remove page-local copies of admin session persistence logic.

Keep current UI and route behavior unchanged.

- [ ] **Step 6: Re-run the app tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: PASS. Shared admin session behavior is consistent across admin/files/images flows.

---

### Task 2: Shrink AppContext and Introduce Blog Data Controller

**Files:**
- Create: `src/hooks/useBlogData.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Test: `src/App.test.tsx`
- Test: `src/lib/blogApi.test.ts`

- [ ] **Step 1: Write the failing tests for article loading outside AppContext**

Add regression coverage showing:

```tsx
it('loads public posts on public routes without relying on AppContext post state', async () => {
  // Assert homepage still renders from a dedicated blog-data path.
});
```

```tsx
it('loads drafts through the blog data controller after admin session restore', async () => {
  // Assert blog data loading remains session-aware after AppContext is reduced.
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```powershell
npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts
```

Expected: FAIL because article list ownership is still tied to `AppContext`.

- [ ] **Step 3: Create `useBlogData`**

Create `src/hooks/useBlogData.ts` that owns:

```ts
export function useBlogData(adminToken: string, adminUnlocked: boolean, notify: NotifyFn) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const loadPosts = useCallback(async (includeDrafts = adminUnlocked, token = adminToken) => {
    // listPosts + error notification
  }, [adminToken, adminUnlocked, notify]);

  useEffect(() => {
    void loadPosts(adminUnlocked, adminToken);
  }, [adminToken, adminUnlocked, loadPosts]);

  return { posts, loadPosts };
}
```

- [ ] **Step 4: Remove post ownership from AppContext**

Update `AppContextType` to stop exposing `posts` and `loadPosts`.

`AppContext` should keep:

- `notification`
- `adminUnlocked`
- `adminToken`
- `loginAdmin`
- `logoutAdmin`
- `userSession`
- `loginUser`
- `logoutUser`

- [ ] **Step 5: Move HomePage and AdminPage to `useBlogData`**

Use the new controller in each page that actually needs posts:

- `HomePage` loads public posts or current route-visible posts
- `AdminPage` loads draft-inclusive posts using shared admin session state

If duplicate fetching appears, add a lightweight provider in a later task rather than re-expanding `AppContext`.

- [ ] **Step 6: Re-run targeted tests**

Run:

```powershell
npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts
```

Expected: PASS. Public pages and admin draft behavior remain correct after AppContext shrinkage.

---

### Task 3: Create a Reusable Admin Data Hook and Remove Page-Local Duplication

**Files:**
- Create: `src/hooks/useAdminAccess.ts`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/pages/FilesPage.tsx`
- Modify: `src/pages/ImagesPage.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing route-level access tests**

Add tests showing:

```tsx
it('uses one shared admin access flow across admin, files, and images pages', async () => {
  // Verify each route unlocks and refreshes data using the same token/session contract.
});
```

- [ ] **Step 2: Run the route-shell tests and verify failure**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: FAIL because route-local unlock and token sync behavior is still duplicated.

- [ ] **Step 3: Implement `useAdminAccess`**

Create:

```ts
export function useAdminAccess() {
  const { notify, adminToken, loginAdmin } = useApp();
  const [password, setPassword] = useState('');

  const unlockAdmin = async () => {
    // POST /api/admin/login
    // loginAdmin(token, expiresAt)
  };

  return { adminToken, password, setPassword, unlockAdmin };
}
```

- [ ] **Step 4: Replace route-local login handlers**

Update `AdminPage`, `FilesPage`, and `ImagesPage` so they use `useAdminAccess` instead of directly performing local session persistence.

Preserve:

- existing unlock forms
- current success/error notifications
- auto-load-after-login behavior

- [ ] **Step 5: Re-run route-shell tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: PASS. Route-local unlock duplication is gone without changing visible behavior.

---

### Task 4: Split AdminPage into Focused Components

**Files:**
- Create: `src/components/admin/ArticleManager.tsx`
- Create: `src/components/admin/EditorPanel.tsx`
- Create: `src/components/admin/UserManager.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/hooks/useEditor.ts`
- Test: `src/App.test.tsx`
- Test: `src/components/shared.test.tsx`

- [ ] **Step 1: Write failing component-level admin tests**

Add tests asserting:

```tsx
it('renders article management, user management, and editor panel through separate admin components', async () => {
  // Assert the current admin shell still exposes all three behaviors.
});
```

- [ ] **Step 2: Run admin tests and verify failure**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: FAIL because `AdminPage` is still monolithic.

- [ ] **Step 3: Extract `ArticleManager`**

Move:

- article list
- status filter
- expand/collapse logic
- edit/publish/delete buttons

Keep parent-provided callbacks for mutations.

- [ ] **Step 4: Extract `UserManager`**

Move:

- user list rendering
- create/update/delete user form UI

Keep current API behavior and messages unchanged.

- [ ] **Step 5: Extract `EditorPanel`**

Move:

- article form
- Markdown toolbar
- cover upload
- preview

Reuse `useEditor` where appropriate instead of leaving page-local editor code in `AdminPage`.

- [ ] **Step 6: Simplify `AdminPage` to orchestration only**

`AdminPage` should become the coordinator that wires together:

- `useAdminAccess`
- `useBlogData`
- `useEditor`
- `ArticleManager`
- `EditorPanel`
- `UserManager`

- [ ] **Step 7: Re-run admin tests**

Run:

```powershell
npm test -- --run src/App.test.tsx src/components/shared.test.tsx
```

Expected: PASS. Admin behavior is preserved while code is split into focused modules.

---

### Task 5: Add Route-Level Lazy Loading

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/lazy.ts`
- Test: `src/App.test.tsx`
- Verify: build output

- [ ] **Step 1: Write failing tests for lazy-loaded route shells**

Add tests asserting the routes still render after lazy loading:

```tsx
it('renders admin, files, images, and accounting routes through lazy-loaded page modules', async () => {
  // Assert route shells still appear after async route resolution.
});
```

- [ ] **Step 2: Run route-shell tests and verify failure**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: FAIL because routes are still eagerly imported.

- [ ] **Step 3: Add lazy page exports**

Create `src/pages/lazy.ts`:

```ts
import { lazy } from 'react';

export const LazyHomePage = lazy(() => import('./HomePage').then((m) => ({ default: m.HomePage })));
export const LazyAccountingPage = lazy(() => import('./AccountingPage').then((m) => ({ default: m.AccountingPage })));
export const LazyFilesPage = lazy(() => import('./FilesPage').then((m) => ({ default: m.FilesPage })));
export const LazyImagesPage = lazy(() => import('./ImagesPage').then((m) => ({ default: m.ImagesPage })));
export const LazyAdminPage = lazy(() => import('./AdminPage').then((m) => ({ default: m.AdminPage })));
```

- [ ] **Step 4: Wrap route elements with `Suspense`**

Update `src/App.tsx` to use:

```tsx
<Suspense fallback={<div className="page-loading">Loading...</div>}>
  <Routes>...</Routes>
</Suspense>
```

Keep the route structure unchanged.

- [ ] **Step 5: Re-run route-shell tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: PASS. Existing routes still load correctly under lazy imports.

- [ ] **Step 6: Verify build output**

Run:

```powershell
npm run build
```

Expected: PASS. The main bundle should remain successful and route chunking should improve relative to the current single large path.

---

### Task 6: Introduce Backend Service Wrappers for Posts, Files, and Images

**Files:**
- Create: `server/services/postService.mjs`
- Create: `server/services/fileService.mjs`
- Create: `server/services/imageService.mjs`
- Modify: `server/index.mjs`
- Modify: `server/routes/posts.mjs`
- Modify: `server/routes/files.mjs`
- Modify: `server/routes/images.mjs`
- Test: `server/postStore.test.mjs`
- Test: `server/fileStore.test.mjs`
- Test: `server/imagesRoutes.test.mjs`

- [ ] **Step 1: Write failing backend tests for service-backed behavior**

Add or extend tests to show route behavior still works when orchestration moves out of routes:

```js
it('serves image raw content and metadata through the image service contract', async () => {});
it('creates signed file links through the file service contract', async () => {});
it('lists posts with draft inclusion rules through the post service contract', async () => {});
```

- [ ] **Step 2: Run backend tests and verify failure**

Run:

```powershell
npm test -- --run server/postStore.test.mjs server/fileStore.test.mjs server/imagesRoutes.test.mjs
```

Expected: FAIL because no service wrapper layer exists yet.

- [ ] **Step 3: Create service wrappers**

Each service should expose a minimal interface that calls the current store while preserving behavior, for example:

```js
export function createImageService({ imageStore }) {
  return {
    listImages() { return imageStore.listImages(); },
    saveImage(upload) { return imageStore.saveImage(upload); },
    loadRawImage(id) { return imageStore.getImage(id); },
    removeImage(id) { return imageStore.deleteImage(id); }
  };
}
```

Do not redesign storage behavior in this step.

- [ ] **Step 4: Inject services from `server/index.mjs`**

Set them in Hono context alongside existing stores:

```js
c.set('postService', postService);
c.set('fileService', fileService);
c.set('imageService', imageService);
```

- [ ] **Step 5: Update routes to use services instead of direct store orchestration**

Routes should still return the same response shapes and status codes.

- [ ] **Step 6: Re-run backend tests**

Run:

```powershell
npm test -- --run server/postStore.test.mjs server/fileStore.test.mjs server/imagesRoutes.test.mjs
```

Expected: PASS. Backend behavior stays the same while storage seams become explicit.

---

### Task 7: Full Regression Verification, Commit Chain, and Deployment

**Files:**
- Modify: `progress.md`
- Verify: current refactor files

- [ ] **Step 1: Run the full targeted frontend/backend verification set**

Run:

```powershell
npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts src/components/shared.test.tsx server/postStore.test.mjs server/fileStore.test.mjs server/imagesRoutes.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the full project test suite**

Run:

```powershell
npm test -- --run
```

Expected: PASS with zero failed test files.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 4: Update progress log**

Append a task entry covering:

- shared admin session/data-layer refactor
- admin page decomposition
- lazy loading
- backend service wrappers
- test/build verification
- rollback approach

- [ ] **Step 5: Commit the implementation**

```bash
git add src server docs/superpowers/plans/2026-06-25-architecture-optimization.md progress.md
git commit -m "Refactor website architecture boundaries"
```

- [ ] **Step 6: Push and deploy**

Follow the repository default completion path:

```bash
git push origin main
```

Then on VPS:

```bash
cd /opt/kitepop-blog
git pull --ff-only origin main
npm install
npm run build
rm -rf /var/www/myblog/*
cp -r dist/* /var/www/myblog/
systemctl restart kitepop-blog.service
systemctl is-active kitepop-blog.service
curl -sS -D - http://127.0.0.1/api/posts | head -c 400 && echo
curl -I http://127.0.0.1/
```

Expected: service `active`, homepage `200`, post API `200`.
