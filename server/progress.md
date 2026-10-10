## 2026-06-20 - Task: Fix Haruhi hero image and avatar rendering
### What was done
- Rebuilt the homepage Haruhi hero image as a browser-stable transparent WebP.
- Removed the enclosed white gap between the arm and body in the hero cutout.
- Replaced the harsh white base under the character with a subtle shadow only.
- Switched the site avatar to a standard JPEG asset to avoid browser decode failures.
- Added an explicit favicon link in `index.html`.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview at `http://127.0.0.1:4180/`: verified in browser that the hero image reports `naturalWidth=620`, the avatar is rendered through a CSS background image, and there is no horizontal overflow.

### Notes
- `index.html`: added the favicon link.
- `src/App.tsx`: changed the hero import to the transparent WebP asset and removed the topbar avatar `<img>`.
- `src/App.css`: adjusted the hero visual area, soft bottom shadow, metric-card styling, and avatar background path.
- `src/assets/haruhi-avatar.jpg`: added a browser-stable avatar image.
- `src/assets/haruhi-cutout.png`: replaced with the cleaned transparent hero cutout source.
- `src/assets/haruhi-cutout.webp`: added the transparent hero asset used by the page.
- Rollback: run `git checkout -- index.html src/App.css src/App.tsx src/assets/haruhi-cutout.png progress.md` and delete `src/assets/haruhi-avatar.jpg` plus `src/assets/haruhi-cutout.webp`.

## 2026-06-20 - Task: Make admin content management list two-column
### What was done
- Added a dedicated `admin-content-group` class to the admin content management panel.
- Changed the expanded content management panel to a two-column grid when there is enough room.
- Kept the panel heading, create button, and status filter spanning the full width.
- Kept the layout responsive by falling back to one column on narrow screens.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- CSS/structure check: the admin content panel now has a dedicated class, while the user management panel is not affected by the new grid rules.

### Notes
- `src/pages/AdminPage.tsx`: added the content-management-specific class name.
- `src/App.css`: added the responsive two-column grid rules for admin content cards.
- Rollback: run `git checkout -- src/pages/AdminPage.tsx src/App.css progress.md`.

## 2026-06-20 - Task: Narrow admin content management panel
### What was done
- Reduced the visual width of the admin content management area on narrower admin layouts.
- Tightened the two-column card spacing so the list feels less stretched.
- Changed the responsive breakpoint so the two-column list falls back to one column before the cards become cramped.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.

### Notes
- `src/App.css`: limited the admin list width under 980px, tightened the content grid gap, and adjusted the single-column breakpoint to 760px.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Fix admin two-column layout proportions
### What was done
- Reduced the admin page's left column share so it no longer takes about half of the desktop layout.
- Made the content-management two-column cards scale down inside the narrower column.
- Tightened the content-management filter tabs, post title, status badge, and metadata text so they no longer push into the editor area.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.

### Notes
- `src/App.css`: adjusted the admin grid column ratio and added scoped compact styles for the content-management double-column list.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Force compact admin content column
### What was done
- Replaced the proportional admin left column with a fixed 430px desktop column so it no longer visually takes about half of the page.
- Converted the content-management cards to a compact two-column mode with smaller title, badge, icon, metadata, and filter-tab sizing.
- Removed the previous 500px minimum-width behavior that prevented the prior narrowing from being visible.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: measured `.admin-layout` at 959px wide, `.admin-list` at 430px, `.editor-panel` at 509px, content cards at 175px each, and horizontal overflow at 0px.

### Notes
- `src/App.css`: changed the admin desktop grid to `430px minmax(0, 1fr)` and added compact scoped styles for `.admin-content-group`.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Fix compact admin card expansion behavior
### What was done
- Stopped unexpanded cards in the same row from stretching when a neighboring content card is expanded.
- Changed the compact content-card action area to a three-column button row so edit, status, and delete actions stay on one line.
- Reduced the compact action button size so the row fits inside the narrow double-column card.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: expanded card measured 112px tall, neighboring unexpanded card stayed 70px tall, the three action buttons stayed on the same row at 49px each, and horizontal overflow was 0px.

### Notes
- `src/App.css`: removed equal-height stretching from compact content cards and added scoped three-column compact action-button rules.
- Rollback: run `git checkout -- src/App.css progress.md`.

## 2026-06-20 - Task: Fix compact admin user management
### What was done
- Updated the user management panel to use compact form and row layouts that fit the 430px admin column.
- Kept the new-user permission selector and submit button on the same row.
- Fixed user-list loading after an existing admin session is restored, so the user list no longer appears empty just because the page was opened from a saved session.
- Switched the user list loader to the existing `/api/admin/users` client wrapper.

### Testing
- `npm run build`: passed. Vite production build completed successfully.
- `npm test -- --run`: passed. 24 test files and 83 tests passed.
- Local preview with mocked admin data: rendered 2 user rows, measured the new-user form at 358px wide, kept the permission selector and 78px submit button on the same row, and horizontal overflow was 0px.

### Notes
- `src/pages/AdminPage.tsx`: loads admin users through `listUsers`, syncs restored admin sessions into the page state, and fetches users once per active admin token.
- `src/App.css`: added scoped compact styles for `.admin-user-group` forms, user rows, inputs, selects, and buttons.
- Rollback: run `git checkout -- src/pages/AdminPage.tsx src/App.css progress.md`.

## 2026-06-20 - Task: Fix broken article cover images
### What was done
- Added a reusable image fallback component so failed image loads no longer show browser broken-image icons.
- Applied the fallback to homepage article covers, article detail covers, and markdown article images.
- Added regression coverage for failed image loading and styled the article-image fallback state.

### Testing
- `npm test -- --run src/components/shared.test.tsx`: passed. The fallback renders after an image error event.
- `npm test -- --run`: passed. 25 test files and 84 tests passed.
- `npm run build`: passed. Vite production build completed successfully.
- Checked live post cover URLs: site-hosted `/api/images/raw/...` URLs returned 200; one external `pub.mini-tools.uk` image returned 404, which is now handled by the fallback UI.

### Notes
- `src/components/shared.tsx`: added `ImageWithFallback` and used it for markdown images.
- `src/pages/HomePage.tsx`: replaced homepage and detail cover `<img>` rendering with the fallback-aware component.
- `src/App.css`: added the styled fallback block for failed article-body images.
- `src/components/shared.test.tsx`: added regression coverage for image-load failure fallback.
- `src/App.test.tsx`: kept asset mocks current after the Haruhi cutout asset changed to `.webp`.
- Rollback: run `git checkout -- src/components/shared.tsx src/pages/HomePage.tsx src/App.css src/App.test.tsx progress.md && git rm src/components/shared.test.tsx`.

## 2026-06-20 - Task: Fix raw image loading root cause
### What was done
- Reworked the public image raw route so stored images are served from file bytes instead of an unstable Node stream response.
- Added explicit HEAD support for `/api/images/raw/:id`, preventing image probes or cache validation requests from crashing the API process.
- Added server route regression coverage for GET byte delivery and HEAD header-only responses.

### Testing
- `npm test -- --run server/imagesRoutes.test.mjs`: passed. GET returns image bytes and HEAD returns headers without a body.
- `npm test -- --run`: passed. 26 test files and 85 tests passed.
- `npm run build`: passed. Vite production build completed successfully.
- Pre-fix VPS evidence: several existing `/api/images/raw/:id` image URLs returned 502 despite files existing in `data/images`, and service logs showed repeated `ERR_INVALID_STATE: ReadableStream is already closed` crashes.

### Notes
- `server/routes/images.mjs`: changed raw image delivery to `readFile`/Buffer responses and added a HEAD route.
- `server/imagesRoutes.test.mjs`: added server-level coverage for raw image GET and HEAD behavior.
- Rollback: run `git checkout -- server/routes/images.mjs progress.md && git rm server/imagesRoutes.test.mjs`.

## 2026-06-20 - Task: Auto-load file and image admin lists
### What was done
- Fixed image hosting so the saved admin session automatically loads the image list when the page opens.
- Fixed file storage so the saved admin session automatically loads the current folder when the page opens or changes folders.
- Synchronized page-local admin tokens with the restored app-level admin session so upload, delete, copy, and refresh actions do not keep using an empty initial token.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Existing admin sessions now auto-load `/api/images` and `/api/files` on page entry.
- `npm test -- --run`: passed. 26 test files and 87 tests passed.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/hooks/useImages.ts`: added token-driven automatic image list loading.
- `src/hooks/useFiles.ts`: added token/folder-driven automatic file folder loading.
- `src/pages/ImagesPage.tsx`: synced local admin token from restored app admin token.
- `src/pages/FilesPage.tsx`: synced local admin token from restored app admin token.
- `src/App.test.tsx`: added regression coverage for auto-loading image and file lists from a saved admin session.
- Rollback: run `git checkout -- src/hooks/useImages.ts src/hooks/useFiles.ts src/pages/ImagesPage.tsx src/pages/FilesPage.tsx src/App.test.tsx progress.md`.

## 2026-06-21 - Task: Add light active state to top navigation
### What was done
- Added route-aware active state to the top navigation buttons.
- Added `aria-current="page"` for the active navigation item.
- Updated the active navigation visual style to a light selected pill with subtle red border, soft shadow, and underline.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. The current route now marks the matching top nav item active.
- `npm test -- --run`: passed. 26 test files and 88 tests passed.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/components/Layout.tsx`: reads the current route and applies active navigation attributes/classes.
- `src/App.css`: adds the light active top-nav styling.
- `src/App.test.tsx`: adds regression coverage for the active nav state.
- Rollback: run `git checkout -- src/components/Layout.tsx src/App.css src/App.test.tsx progress.md`.

## 2026-06-24 - Task: Design Markdown math support
### What was done
- Defined the supported inline and display LaTeX syntax for blog Markdown.
- Specified a shared KaTeX rendering path so admin preview and article detail remain consistent.
- Defined editor controls, error handling, responsive styling, tests, and out-of-scope behavior.

### Testing
- Design self-review completed: no placeholders, contradictory requirements, database changes, or undefined rendering paths remain.

### Notes
- `docs/superpowers/specs/2026-06-24-markdown-math-design.md`: records the approved Markdown math design.
- `progress.md`: records this design task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/specs/2026-06-24-markdown-math-design.md`.

## 2026-06-24 - Task: Plan Markdown math support
### What was done
- Created a TDD implementation plan covering KaTeX dependency setup, display-math parsing, shared formula rendering, admin editor controls, styling, and regression verification.
- Mapped each requirement from the approved design to exact files, test commands, and expected outcomes.

### Testing
- Plan self-review completed against the approved design: inline and display formulas, escaped dollar signs, code exclusions, shared preview/detail rendering, invalid formula handling, mobile overflow, and editor controls are covered.
- Placeholder and type-consistency review completed with no unresolved implementation steps.

### Notes
- `docs/superpowers/plans/2026-06-24-markdown-math.md`: contains the implementation plan.
- `progress.md`: records this planning task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/plans/2026-06-24-markdown-math.md`.

## 2026-06-24 - Task: Implement Markdown math support
### What was done
- Added KaTeX rendering for inline `$...$` and display `$$...$$` formulas.
- Kept escaped dollar signs and formulas inside code spans or fenced code blocks as normal source text.
- Reused the shared Markdown renderer so admin preview and article detail render formulas identically.
- Added inline and display formula insertion buttons to the admin Markdown toolbar.
- Added responsive formula styling so long display equations scroll horizontally on narrow screens.

### Testing
- `npm test -- --run src/lib/markdown.test.ts`: passed. Display formula parsing and code-block exclusion are covered.
- `npm test -- --run src/lib/math.test.ts src/components/shared.test.tsx src/lib/markdown.test.ts`: passed. KaTeX rendering, invalid formulas, escaped dollars, inline code, and display rendering are covered.
- `npm test -- --run src/App.test.tsx`: passed. Admin formula toolbar controls are covered.
- `npm test -- --run`: passed. 27 test files and 95 tests passed.
- `npm run build`: passed. Vite emitted the KaTeX CSS and font assets; the build reports a non-blocking chunk-size warning after adding KaTeX.

### Notes
- `package.json`, `package-lock.json`: add KaTeX and its TypeScript declarations.
- `src/lib/markdown.ts`, `src/lib/markdown.test.ts`: add display-math block parsing and regression tests.
- `src/lib/math.ts`, `src/lib/math.test.ts`: add the non-throwing KaTeX rendering helper and tests.
- `src/components/shared.tsx`, `src/components/shared.test.tsx`: render inline/display formulas through the shared Markdown path and test escaping/code exclusions.
- `src/main.tsx`: loads KaTeX base styles.
- `src/pages/AdminPage.tsx`, `src/App.test.tsx`: add and test formula toolbar controls.
- `src/App.css`: adds inline and responsive display formula styling.
- `docs/superpowers/plans/2026-06-24-markdown-math.md`: marks the implementation plan complete.
- Rollback: run `git revert <implementation-commit>` after this task is committed, or restore the listed files from commit `6824d9b`.

## 2026-06-25 - Task: Auto-load draft posts after restoring admin session
### What was done
- Fixed the admin article list so a restored backend session immediately reloads posts with draft visibility instead of staying on the public-only article snapshot.
- Added a regression test that reproduces the exact refresh-only draft visibility bug from the admin page.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Restored admin sessions now auto-load draft posts, and existing admin shell checks still pass.
- `npm test -- --run src/lib/blogApi.test.ts src/App.test.tsx`: passed. Draft-request API coverage and admin-page regression coverage both pass.
- `npm run build`: passed. Vite production build completed successfully.

### Notes
- `src/context/AppContext.tsx`: reloads posts when admin session state changes so restored sessions fetch drafts automatically.
- `src/App.test.tsx`: adds the regression test for draft visibility after session restore.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/context/AppContext.tsx src/App.test.tsx progress.md`.

## 2026-06-25 - Task: Design website architecture optimization
### What was done
- Defined a phased architecture optimization design focused on unified frontend data loading, smaller admin boundaries, route-level lazy loading, and backend service/storage layering.
- Locked in the business-safety rules for this refactor: website flows must stay usable, file/image records must remain linked to the database, and schema migration is optional rather than automatic.

### Testing
- Design self-review completed: the scope, rollout order, data-safety rules, and verification requirements are internally consistent and do not require a forced database replacement.
- Requirement coverage review completed: session recovery, admin drafts, image hosting, file storage, accounting loading, deployment verification, and migration guardrails are all covered in the spec.

### Notes
- `docs/superpowers/specs/2026-06-25-architecture-optimization-design.md`: records the approved architecture direction and safety constraints for the refactor.
- `progress.md`: records this design task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/specs/2026-06-25-architecture-optimization-design.md`.

## 2026-06-25 - Task: Plan website architecture optimization
### What was done
- Created a phased implementation plan for shared admin session extraction, `AppContext` shrinkage, admin-page decomposition, route-level lazy loading, backend service wrappers, and final deploy verification.
- Mapped the refactor into TDD-oriented tasks with explicit files, commands, and rollback-aware verification steps.

### Testing
- Plan self-review completed: the plan covers session restore, draft loading, image/file database linkage, admin split, lazy routes, backend storage seams, and VPS deployment checks.
- Placeholder and sequencing review completed: each task stays within the approved design and keeps business continuity verification in scope.

### Notes
- `docs/superpowers/plans/2026-06-25-architecture-optimization.md`: contains the implementation plan for the architecture refactor.
- `progress.md`: records this planning task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/plans/2026-06-25-architecture-optimization.md`.

## 2026-06-25 - Task: Implement website architecture optimization
### What was done
- Moved admin-session persistence and blog post loading into dedicated shared layers, so restored sessions now drive data loading consistently across the site.
- Split the admin page into article management, editor panel, and user management modules while keeping existing publishing, autosave, image upload, and user operations available.
- Unified admin unlock behavior for admin, files, and images pages so cross-page login reuse no longer depends on refresh order.
- Added route-level lazy page bundles and preserved lightweight first-load behavior for the home route.
- Added backend post/file/image service seams without changing API response shapes, so file storage and image-host records stay linked to SQLite while future storage swaps have a clean entry point.

### Testing
- `npm test -- --run src/App.test.tsx server/postStore.test.mjs server/fileStore.test.mjs server/imagesRoutes.test.mjs`: passed. Frontend session/data-loading regressions and backend storage/image route regressions all passed.
- `npm run build`: passed. Production build completed successfully and emitted split route bundles for `AdminPage`, `FilesPage`, `ImagesPage`, `HomePage`, and `AccountingPage`.

### Notes
- `src/context/AppContext.tsx`, `src/lib/adminSession.ts`: keep only global app concerns in app context and centralize admin-session persistence.
- `src/context/BlogDataContext.tsx`, `src/App.tsx`, `src/pages/lazy.ts`, `src/pages/HomePage.tsx`: move blog data loading into its own provider and lazy-load route pages.
- `src/hooks/useAdminAccess.ts`, `src/pages/FilesPage.tsx`, `src/pages/ImagesPage.tsx`: unify admin login flow and keep file/image pages loading correctly with restored or freshly created admin sessions.
- `src/components/admin/ArticleManager.tsx`, `src/components/admin/EditorPanel.tsx`, `src/components/admin/UserManager.tsx`, `src/pages/AdminPage.tsx`: split the admin experience into focused modules while preserving publishing, preview, formula toolbar, autosave, and user-management behavior.
- `server/services/postService.mjs`, `server/services/fileService.mjs`, `server/services/imageService.mjs`, `server/index.mjs`, `server/routes/posts.mjs`, `server/routes/files.mjs`, `server/routes/images.mjs`, `server/imagesRoutes.test.mjs`: add backend service seams and keep current file/image/post API behavior covered by tests.
- `src/App.test.tsx`: refresh regression checks so they validate the current stable UI labels and session-loading behavior.
- Rollback: run `git revert <implementation-commit>` after this task is committed, or restore the listed files from commit `ed0b776` and then replay only the desired subsets.

## 2026-06-25 - Task: Fix loading fallback and new admin-page mojibake
### What was done
- Removed the visible bare `Loading...` fallback from route loading and replaced it with a lightweight three-dot loading state.
- Stopped the homepage from going through lazy loading so the main route no longer flashes the fallback during normal first paint.
- Cleaned the newly introduced admin editor mojibake so the editor toolbar, form labels, formula buttons, and preview copy render as normal Chinese text.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. Route shell rendering and admin editor formula controls still work.
- `npm run build`: passed. Production build completed successfully after the loading fallback and editor text cleanup.

### Notes
- `src/App.tsx`: switches the home route back to direct render and replaces the Suspense fallback with a minimal loader shell.
- `src/pages/lazy.ts`: removes the now-unused lazy home export.
- `src/App.css`: adds the three-dot loading state styling and animation.
- `src/components/admin/EditorPanel.tsx`: rewrites the visible editor text and formula button labels to eliminate mojibake.
- `progress.md`: records this bugfix task.
- Rollback: run `git revert <bugfix-commit>` after this task is committed, or restore `src/App.tsx`, `src/pages/lazy.ts`, `src/App.css`, `src/components/admin/EditorPanel.tsx`, and `progress.md` from commit `435ddf3`.

## 2026-06-26 - Task: Fix remaining admin-page mojibake
### What was done
- Replaced the remaining mojibake in the admin content manager, editor panel, user manager, page-loading label, and blog data loading error message with readable Chinese text.
- Added a regression check for readable admin content/user manager labels so the admin page does not silently regress to mojibake again.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. All 9 App shell/admin regression tests passed, including the new readable-label check.
- `npm run build`: passed. TypeScript and Vite production build completed successfully.
- `rg -n "鍐呭|鏂囩|鍚庡|鍥惧|鏂板|缂栬|鐢ㄦ|鑽夌|棰勮|鍧楃|琛屽唴|椤甸潰|閸|閺|鐏|锟|鎴|寮|璇|鏍|鍒" src --glob '!src/assets/**'`: no matches in source text files.

### Notes
- `src/components/admin/ArticleManager.tsx`: restored readable Chinese labels for content management, status filters, post badges, and actions.
- `src/components/admin/EditorPanel.tsx`: restored readable Chinese editor labels, placeholders, toolbar titles, upload copy, and preview fallback text.
- `src/components/admin/UserManager.tsx`: restored readable Chinese user-management labels and actions.
- `src/context/BlogDataContext.tsx`: restored the readable article-loading failure notification.
- `src/App.test.tsx`: updates admin editor label assertions and adds a regression test for readable admin manager labels.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/components/admin/ArticleManager.tsx src/components/admin/EditorPanel.tsx src/components/admin/UserManager.tsx src/context/BlogDataContext.tsx src/App.test.tsx progress.md`.

## 2026-06-26 - Task: Fix parenthesized inline math rendering
### What was done
- Added support for Markdown inline LaTeX written as `\(...\)`, so formulas like `\(a\)` and `\(3\mid12\)` render through KaTeX instead of appearing as raw source text.
- Kept the existing `$...$`, code, bold, and link inline rendering behavior unchanged.
- Corrected the reader permission label to readable Chinese text.

### Testing
- `npm test -- --run src/components/shared.test.tsx -t "renders parenthesized LaTeX inline formulas"`: passed. The regression case for `\(...\)` inline formulas now renders two KaTeX inline nodes.
- `npm test -- --run src/components/shared.test.tsx src/lib/markdown.test.ts src/lib/math.test.ts src/App.test.tsx`: passed. All 23 related Markdown, math, shared component, and app tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/components/shared.tsx`: extends inline Markdown parsing to recognize `\(...\)` formulas and render them as inline KaTeX; updates the reader permission label.
- `src/components/shared.test.tsx`: adds regression coverage for parenthesized inline formulas and readable permission labels.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/components/shared.tsx src/components/shared.test.tsx progress.md`.

## 2026-06-26 - Task: Restore accounting ledger filters
### What was done
- Reconnected the accounting ledger type and category filter dropdowns to their state setters and month-data reload path.
- Reset the collapsed ledger view when a filter changes so the refreshed list starts from the top of the filtered result set.
- Added a regression test that fails if changing either ledger filter no longer requests filtered accounting data.

### Testing
- `npm test -- --run src/App.test.tsx -t "reloads accounting entries when ledger filters change"`: failed before the fix because no filtered request was made, then passed after reconnecting the dropdown handlers.
- `npm test -- --run src/App.test.tsx src/lib/accounting.test.ts src/lib/accountingApi.test.ts server/accountingStore.test.mjs server/accountingModel.test.mjs`: passed. All 40 app/accounting regression tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/pages/AccountingPage.tsx`: wires the type/category filter selects to update filter state, reload accounting month data with the selected filter, and collapse the refreshed list.
- `src/App.test.tsx`: adds regression coverage for changing ledger filters from the accounting page.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- src/pages/AccountingPage.tsx src/App.test.tsx progress.md`.

## 2026-06-26 - Task: Add upload progress tips
### What was done
- Added an XHR upload path for file warehouse and image host uploads so the browser can report upload progress and speed.
- Added a shared right-side upload progress tip with slide-in/slide-out animation, file name, percentage, uploaded size, total size, and current speed.
- Wired file warehouse and image host upload actions to show the tip during upload, allow manual dismissal, and auto-close after upload completion or failure.

### Testing
- `npm test -- --run src/lib/uploadProgress.test.ts src/lib/fileApi.test.ts src/lib/imageApi.test.ts`: passed. Upload progress callbacks and API progress upload paths are covered.
- `npm test -- --run src/App.test.tsx -t "upload progress tips"`: passed. File warehouse and image host pages both show progress tips during upload.
- `npm test -- --run src/App.test.tsx src/lib/uploadProgress.test.ts src/lib/fileApi.test.ts src/lib/imageApi.test.ts src/lib/fileApi.test.ts src/lib/imageApi.test.ts`: passed. All 18 related tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/lib/uploadProgress.ts`: adds the XHR FormData upload helper and progress payload type.
- `src/lib/uploadProgress.test.ts`: covers progress percentage and speed reporting.
- `src/lib/fileApi.ts`, `src/lib/imageApi.ts`: keep existing fetch upload behavior by default and use the progress uploader only when a progress callback is provided.
- `src/lib/fileApi.test.ts`, `src/lib/imageApi.test.ts`: cover the progress upload path for file and image uploads.
- `src/components/UploadProgressTip.tsx`: adds the shared upload progress tip UI.
- `src/pages/FilesPage.tsx`, `src/pages/ImagesPage.tsx`: display and auto-close upload progress tips for file warehouse and image host uploads.
- `src/App.css`: styles the right-side slide-out progress tip, progress bar, and responsive layout.
- `src/App.test.tsx`: adds page-level coverage for upload progress tips.
- `progress.md`: records this feature task.
- Rollback: run `git checkout -- src/App.css src/App.test.tsx src/lib/fileApi.ts src/lib/fileApi.test.ts src/lib/imageApi.ts src/lib/imageApi.test.ts src/pages/FilesPage.tsx src/pages/ImagesPage.tsx progress.md && git rm src/lib/uploadProgress.ts src/lib/uploadProgress.test.ts src/components/UploadProgressTip.tsx`.

## 2026-06-26 - Task: Fix file link copy and standard markdown rendering
### What was done
- Fixed file warehouse link copying so it uses the existing clipboard fallback instead of directly reading `navigator.clipboard.writeText`.
- Replaced article Markdown rendering with `react-markdown` plus GFM, math, and KaTeX plugins, so standard Markdown tables render as real tables while existing formulas still render through KaTeX.
- Added article table styling so rendered Markdown tables fit the existing reading layout.

### Testing
- `npm test -- --run src/components/shared.test.tsx -t "renders standard markdown tables"`: failed before the Markdown renderer change because no table was rendered, then passed after switching to the standard renderer.
- `npm test -- --run src/App.test.tsx -t "falls back when copying file links"`: failed before the file copy fix because no clipboard fallback was used, then passed after using the shared clipboard helper.
- `npm test -- --run src/App.test.tsx src/components/shared.test.tsx src/lib/markdown.test.ts src/lib/math.test.ts src/lib/clipboard.test.ts`: passed. All 29 related app, Markdown, math, and clipboard tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; the main bundle warning remains and is larger after adding the Markdown renderer dependencies.

### Notes
- `src/pages/FilesPage.tsx`: uses `copyTextToClipboard` for signed file link copying and keeps the generated link visible for manual copy.
- `src/components/shared.tsx`: renders article Markdown with `react-markdown`, `remark-gfm`, `remark-math`, and `rehype-katex`, while preserving safe links and image fallback behavior.
- `src/components/shared.test.tsx`: adds standard Markdown table coverage and updates display math expectations for the standard renderer.
- `src/App.test.tsx`: covers file-link copy fallback when `navigator.clipboard` is unavailable.
- `src/App.css`: adds article table styles.
- `package.json`, `package-lock.json`: add Markdown rendering dependencies.
- `progress.md`: records this bugfix and renderer upgrade task.
- Rollback: run `git checkout -- package.json package-lock.json src/pages/FilesPage.tsx src/components/shared.tsx src/components/shared.test.tsx src/App.test.tsx src/App.css progress.md && npm install`.

## 2026-06-26 - Task: Fix article image and mobile detail layout
### What was done
- Restored standard Markdown images to the article image frame so desktop article images no longer render as oversized bare images.
- Added desktop image containment for article body images, keeping large images centered and capped within the reading page.
- Tightened mobile article detail layout so the page, rail, header, tags, body, code blocks, formulas, and tables stay within the phone viewport.
- Removed the fixed character background on phone-width pages so it no longer intrudes into the article reading area.

### Testing
- `npm test -- --run src/article-mobile-layout.test.js src/components/shared.test.tsx src/App.test.tsx`: passed. The regression checks cover article image wrapping, desktop/mobile article containment styles, and the existing app shell behavior.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.
- Browser screenshot verification was attempted against the local Vite server, but the Playwright browser tool failed with `net::ERR_PROXY_CONNECTION_FAILED`; this visual verification remains a tool-environment gap, not a passing visual claim.

### Notes
- `src/components/shared.tsx`: wraps standard Markdown images in the article image frame and keeps image captions.
- `src/components/shared.test.tsx`: adds regression coverage that standard Markdown images render inside `figure.article-image`.
- `src/App.css`: constrains desktop article body images and tightens mobile article detail layout/background behavior.
- `src/article-mobile-layout.test.js`: adds CSS regression checks for desktop image containment and mobile article detail containment.
- `progress.md`: records this layout bugfix task.
- Rollback: run `git checkout -- src/App.css src/components/shared.tsx src/components/shared.test.tsx progress.md && git rm src/article-mobile-layout.test.js`.

## 2026-06-28 - Task: Fix Chinese upload filename mojibake
### What was done
- Fixed multipart upload filename decoding so UTF-8 Chinese names from browser uploads are stored as readable text instead of mojibake.
- Added a narrow recovery path for previously stored file and image names that were already decoded as latin1, so existing affected records display correctly when listed.
- Applied the same filename recovery to file warehouse and image host metadata paths while keeping the existing path-safety cleanup in place.

### Testing
- `npm test -- --run server/utils/multipart.test.mjs`: failed before the fix with `å...` mojibake for `复习资料.docx`, then passed after decoding uploaded filenames correctly.
- `npm test -- --run server/utils/multipart.test.mjs server/fileStore.test.mjs server/imageStore.test.mjs src/lib/fileApi.test.ts src/lib/imageApi.test.ts`: passed. All 14 related upload, file, and image metadata tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `server/filenameEncoding.mjs`: adds the shared UTF-8 filename recovery helper.
- `server/utils/multipart.mjs`: decodes uploaded multipart filenames before passing them to storage.
- `server/utils/multipart.test.mjs`: adds regression coverage for UTF-8 Chinese filenames in multipart uploads.
- `server/fileStore.mjs`: recovers affected file names during save and list/read metadata mapping.
- `server/fileStore.test.mjs`: covers readable Chinese file names after recovery.
- `server/imageStore.mjs`: recovers affected image names during save and list/read metadata mapping.
- `server/imageStore.test.mjs`: covers readable Chinese image names and extension-based content-type detection after recovery.
- `progress.md`: records this bugfix task.
- Rollback: run `git checkout -- server/utils/multipart.mjs server/fileStore.mjs server/fileStore.test.mjs server/imageStore.mjs server/imageStore.test.mjs progress.md && git rm server/filenameEncoding.mjs server/utils/multipart.test.mjs`.

## 2026-06-28 - Task: Fix article detail browser-back return
### What was done
- Synced the article detail state with the URL hash after navigation changes, so browser Back from an article detail returns to the article list instead of leaving the detail page rendered.
- Kept the existing article detail hash format and direct article-link behavior unchanged.
- Added regression coverage for opening an article and returning to the list with browser Back.

### Testing
- `npm test -- --run src/App.test.tsx -t "returns from article detail to the article list"`: failed before the fix because the detail page stayed mounted after `hashchange`, then passed after syncing the article detail state from the hash.
- `npm test -- --run src/App.test.tsx`: passed. All 14 App tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/hooks/useBlog.ts`: listens for `hashchange` and updates the active article detail id from the URL hash.
- `src/App.test.tsx`: adds regression coverage for browser Back from article detail to the article list.
- `progress.md`: records this article navigation bugfix task.
- Rollback: run `git checkout -- src/hooks/useBlog.ts src/App.test.tsx progress.md`.

## 2026-06-29 - Task: Raise file upload limit for 205 MB videos
### What was done
- Raised the file warehouse default upload limit from 50 MB to 300 MB so a 205 MB video can pass the app-layer size check.
- Kept `FILE_UPLOAD_LIMIT` as the explicit deployment override and updated the example environment value.
- Updated the file upload page copy and added upload-limit documentation, including the matching Nginx `client_max_body_size` note.

### Testing
- `npm test -- --run server/fileUploadLimit.test.mjs`: failed before the helper/default limit existed, then passed after the default was raised to 300 MB.
- `npm test -- --run server/fileUploadLimit.test.mjs server/fileStore.test.mjs src/lib/fileApi.test.ts`: passed. All 9 related upload-limit, file-store, and file API tests passed.
- `npm test -- --run server/fileUploadLimit.test.mjs src/App.test.tsx src/lib/fileApi.test.ts`: passed. All 18 related tests passed after the upload page copy update.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `server/routes/files.mjs`: adds a 300 MB default file upload limit helper and uses it for upload checks.
- `server/fileUploadLimit.test.mjs`: adds regression coverage that the default limit allows a 205 MB video and still respects `FILE_UPLOAD_LIMIT` overrides.
- `.env.example`: raises the documented file upload limit to 300 MB.
- `src/pages/FilesPage.tsx`: updates the upload hint to show the 300 MB default.
- `docs/upload-limits.md`: documents file and proxy upload limits.
- `progress.md`: records this upload limit change.
- Rollback: run `git checkout -- .env.example server/routes/files.mjs src/pages/FilesPage.tsx progress.md && git rm server/fileUploadLimit.test.mjs docs/upload-limits.md`.

## 2026-06-29 - Task: Set file uploads to unlimited
### What was done
- Changed the file warehouse default upload limit to unlimited by using `0` as the app-layer limit value.
- Kept positive `FILE_UPLOAD_LIMIT` values as an explicit opt-in cap for deployments that still want one.
- Updated the upload page copy, example environment value, and upload-limit documentation so they all describe the unlimited default and matching Nginx setting.

### Testing
- `npm test -- --run server/fileUploadLimit.test.mjs src/App.test.tsx src/lib/fileApi.test.ts`: passed. All 18 related upload-limit, app, and file API tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `.env.example`: sets `FILE_UPLOAD_LIMIT=0` for the unlimited default.
- `server/routes/files.mjs`: changes the default file upload limit to `0`, which disables the app-layer size check.
- `server/fileUploadLimit.test.mjs`: updates regression coverage for the unlimited default and explicit override behavior.
- `src/pages/FilesPage.tsx`: updates the file upload hint to say the file warehouse is unlimited by default.
- `docs/upload-limits.md`: documents the unlimited default and Nginx `client_max_body_size 0;` setting.
- `progress.md`: records this unlimited upload limit change.
- Rollback: run `git checkout -- .env.example docs/upload-limits.md server/routes/files.mjs server/fileUploadLimit.test.mjs src/pages/FilesPage.tsx progress.md`.

## 2026-06-29 - Task: Improve file media preview flow
### What was done
- Added a dedicated in-site media preview page for uploaded audio and video files.
- Wired the file list to generate a signed preview link and open the preview page without forcing an immediate full stream load.
- Enabled HTTP `Range` responses for raw file delivery so browser players can seek correctly.
- Kept the existing signed-link access model unchanged.

### Testing
- `npm test -- --run server/fileDownloadHeaders.test.mjs server/fileRangeResponses.test.mjs src/lib/fileApi.test.ts src/App.test.tsx`: passed. All 20 related tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `server/fileDownloadHeaders.mjs`: adds `Accept-Ranges` and partial-content header helpers.
- `server/routes/files.mjs`: serves `Range` requests and exposes the preview-link endpoint.
- `server/services/fileService.mjs`: exposes a preview-link helper that reuses signed access links.
- `src/pages/FilesPage.tsx`: adds the `预览` action for audio/video files.
- `src/pages/MediaPreviewPage.tsx`: new in-site preview page that delays loading until play is clicked.
- `src/App.tsx`, `src/pages/lazy.ts`: register the preview route and lazy loader.
- `src/App.css`: styles the preview shell and media stage.
- `docs/media-preview.md`: documents the feature and rollback path.
- `progress.md`: records this media preview task.
- Rollback: run `git checkout -- server/fileDownloadHeaders.mjs server/fileDownloadHeaders.test.mjs server/routes/files.mjs server/services/fileService.mjs src/App.css src/App.tsx src/lib/fileApi.ts src/lib/fileApi.test.ts src/pages/FilesPage.tsx src/pages/lazy.ts progress.md docs/media-preview.md && git rm server/fileRangeResponses.test.mjs src/pages/MediaPreviewPage.tsx`.

## 2026-06-29 - Task: Fix media preview player controls and aspect ratio
### What was done
- Added visible preview-page player chrome so video/audio previews no longer look like a bare frame.
- Switched video preview layout from a fixed landscape frame to metadata-driven landscape, square, or portrait display.
- Kept lazy loading behavior: the signed media URL is still assigned only after the user clicks play.
- Added focused regression coverage for portrait video metadata handling.

### Testing
- `npm test -- --run src/pages/MediaPreviewPage.test.tsx src/App.test.tsx -t "MediaPreviewPage|opens the in-site media preview shell"`: passed. Both the new portrait-layout regression and the existing app preview route test passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/pages/MediaPreviewPage.tsx`: tracks loaded video metadata and exposes a player control strip plus orientation classes.
- `src/App.css`: removes the always-16:9 preview stage and adds landscape, square, and portrait media stage styles.
- `src/pages/MediaPreviewPage.test.tsx`: adds regression coverage for portrait video layout and native controls activation.
- `docs/media-preview.md`: documents the visible controls and metadata-driven aspect ratio behavior.
- `progress.md`: records this media preview fix.
- Rollback: run `git checkout -- src/App.css src/pages/MediaPreviewPage.tsx docs/media-preview.md progress.md && git rm src/pages/MediaPreviewPage.test.tsx`.

## 2026-07-06 - Task: Fix public user registration and login submission
### What was done
- Fixed the home-page public account form so login and registration submit to the existing user APIs instead of doing nothing.
- Successful login or registration now saves the returned user session through the shared app context, so the page immediately shows the current user and keeps the session.
- Connected the public logout button to clear the saved user session.
- Added regression coverage for both public login and registration from the home auth card.

### Testing
- `npm test -- --run src/App.test.tsx -t "public users"`: passed. Both public login and public registration submit to their APIs, update the UI, and persist the returned session token.
- `npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts server/userStore.test.mjs`: passed. App auth flow, frontend user API calls, and backend user sessions all passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/pages/HomePage.tsx`: wires the auth form to `loginUser` / `registerUser` API calls and the app-level user session handlers.
- `src/App.test.tsx`: adds public user login and registration regression tests.
- `docs/user-auth.md`: documents the public user auth behavior and rollback path.
- `progress.md`: records this user auth fix.
- Rollback: run `git checkout -- src/pages/HomePage.tsx src/App.test.tsx progress.md && git rm docs/user-auth.md`.

## 2026-07-06 - Task: Add visible public auth failure feedback
### What was done
- Verified the production user API directly: `/api/users/register` can create user sessions on the VPS, so the remaining issue was in the front-end interaction and feedback layer.
- Updated the home auth form to reject invalid usernames and short passwords before sending requests.
- Added an inline auth error panel inside the login/register card so failed registration or login no longer looks like no response.
- Hardened the form against malformed auth responses so a response without token/user is treated as a failure instead of breaking the logged-in view.
- Removed the temporary VPS test user created during diagnosis.

### Testing
- `npm test -- --run src/App.test.tsx -t "public auth error|public users"`: passed. Real button-click submission, public login/register session persistence, and invalid-input feedback are covered.
- `npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts server/userStore.test.mjs`: passed. App auth flow, frontend user API calls, and backend user sessions all passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.
- Local production browser check at `http://127.0.0.1:49201/`: invalid registration showed the inline username-rule error, and valid registration switched the auth card to the logged-in user state.

### Notes
- `src/pages/HomePage.tsx`: adds client-side public auth validation, inline feedback state, and session-shape validation.
- `src/App.css`: styles the inline auth feedback panel.
- `src/App.test.tsx`: changes auth tests to click the real submit button and adds invalid-registration feedback coverage.
- `docs/user-auth.md`: documents username rules and visible failure behavior.
- `progress.md`: records this follow-up auth feedback fix.
- Rollback: run `git checkout -- src/App.css src/pages/HomePage.tsx src/App.test.tsx docs/user-auth.md progress.md`.

## 2026-07-06 - Task: Load persisted article comments in detail view
### What was done
- Fixed article detail pages so they load comments from the existing `/api/posts/:slug/comments` endpoint when an article is opened.
- Cleared local comment state when leaving an article detail page so another article cannot inherit stale comments.
- Kept the existing SQLite `post_comments` storage path; the bug was the front-end not reading persisted comments on page entry.
- Changed new-comment insertion to use the current comment list state so loaded database comments are not overwritten by an older render.

### Testing
- `npm test -- --run src/App.test.tsx -t "loads persisted comments"`: passed. Opening an article detail page now fetches and displays persisted comments.
- `npm test -- --run src/App.test.tsx server/postStore.test.mjs`: passed. Frontend persisted-comment loading and backend SQLite comment storage both passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning for the main bundle.

### Notes
- `src/pages/HomePage.tsx`: loads article comments from the backend when `detailPost.slug` changes and clears stale local comment state on exit.
- `src/App.test.tsx`: adds regression coverage for persisted comment loading in article detail view.
- `docs/comments.md`: documents the comment storage and loading behavior.
- `progress.md`: records this persisted-comment loading fix.
- Rollback: run `git checkout -- src/pages/HomePage.tsx src/App.test.tsx progress.md && git rm docs/comments.md`.

## 2026-07-08 - Task: Plan structured UI and motion rollout
### What was done
- Wrote the UI/motion structure design for a phased front-end presentation-layer cleanup.
- Wrote the implementation plan for style splitting, shared UI components, page polish, controlled 3D effects, and final verification.
- Explicitly scoped the work away from database schemas, backend routes, auth token formats, and API contracts.

### Testing
- Not run; this task only created planning documentation and did not change runtime source code.

### Notes
- `docs/superpowers/specs/2026-07-08-ui-motion-structure-design.md`: defines scope, visual direction, motion rules, file structure, rollout strategy, and verification requirements.
- `docs/superpowers/plans/2026-07-08-ui-motion-structure.md`: defines task-by-task implementation steps and validation checkpoints.
- `progress.md`: records this planning task.
- Rollback: run `git checkout -- progress.md && git rm docs/superpowers/specs/2026-07-08-ui-motion-structure-design.md docs/superpowers/plans/2026-07-08-ui-motion-structure.md`.

## 2026-07-08 - Task: Split base style structure
### What was done
- Added the `src/styles/` folder structure with a single `index.css` entrypoint for future UI organization.
- Moved global design tokens and base reset styles out of `src/App.css` into `src/styles/tokens.css` and `src/styles/base.css`.
- Updated `src/main.tsx` to import `src/styles/index.css` while keeping `App.css` as a compatibility import so current page visuals stay stable.
- Marked Task 1 of the UI motion structure plan as completed.

### Testing
- `npm test -- --run src/App.test.tsx`: passed. The app shell and route regression tests still pass after the style import switch.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.
- `npm test -- --run`: passed. 33 test files and 127 tests passed.
- `npm run build`: passed again after the full test run.

### Notes
- `src/styles/index.css`: new style entrypoint that imports the structured style files and the compatibility `App.css`.
- `src/styles/tokens.css`: owns global root color, background, font stack, and typography rendering defaults.
- `src/styles/base.css`: owns box sizing, body baseline, form font inheritance, and default button cursor.
- `src/styles/layout.css`, `src/styles/motion.css`, `src/styles/effects.css`, and `src/styles/pages/*.css`: created as focused destinations for the next style-splitting phases.
- `src/main.tsx`: now imports the structured style entrypoint.
- `src/App.css`: no longer owns the base token/reset block.
- `docs/superpowers/plans/2026-07-08-ui-motion-structure.md`: marks Task 1 steps complete.
- `progress.md`: records this no-visual-change style structure split.
- Rollback: run `git checkout -- src/main.tsx src/App.css docs/superpowers/plans/2026-07-08-ui-motion-structure.md progress.md && git rm -r src/styles`.

## 2026-07-08 - Task: Move media preview styles
### What was done
- Moved the isolated media preview page CSS out of `src/App.css` and into `src/styles/pages/media.css`.
- Kept selector names unchanged so the existing media preview page markup and behavior do not need to change.
- Left the rest of the page-specific CSS in `src/App.css` for later small, independently verified migrations.

### Testing
- `npm test -- --run src/pages/MediaPreviewPage.test.tsx src/App.test.tsx -t "MediaPreviewPage|opens the in-site media preview shell"`: passed. The media preview page and route shell checks still pass after the style move.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/styles/pages/media.css`: now owns the media preview shell, header, stage, player, overlay, audio card, and control strip styles.
- `src/App.css`: no longer contains the media preview selector block.
- Rollback: run `git checkout -- src/App.css src/styles/pages/media.css progress.md`.

## 2026-07-08 - Task: Move file and image base styles
### What was done
- Moved the first isolated file warehouse style block from `src/App.css` into `src/styles/pages/files.css`.
- Moved the first isolated image hosting style block from `src/App.css` into `src/styles/pages/images.css`.
- Kept existing class names and page markup unchanged; later historical override rules remain in `src/App.css` until they can be migrated safely in smaller steps.

### Testing
- `npm test -- --run src/App.test.tsx src/lib/fileApi.test.ts src/lib/imageApi.test.ts`: passed. The app, file API client, and image API client regressions still pass after the CSS split.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/styles/pages/files.css`: now owns the base file page layout, hero, toolbar, folder grid, dropzone, link box, file list, and file badge styles.
- `src/styles/pages/images.css`: now owns the base image host layout, image dropzone, image grid, image card, and image link code styles.
- `src/App.css`: no longer contains that original contiguous file/image base block.
- Rollback: run `git checkout -- src/App.css src/styles/pages/files.css src/styles/pages/images.css progress.md`.

## 2026-07-08 - Task: Move accounting filter styles
### What was done
- Moved the accounting ledger filter grid and custom category panel base styles out of `src/App.css`.
- Kept the accounting JSX, category CRUD behavior, budget calculations, and storage/API logic untouched.
- Left later accounting override rules in `src/App.css` for later focused migrations.

### Testing
- `npm test -- --run src/App.test.tsx src/lib/accountingApi.test.ts`: passed. App-level and accounting API client regressions still pass after the style move.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/styles/pages/accounting.css`: now owns `.ledger-filter-grid`, `.custom-category-panel`, `.custom-category-controls`, `.custom-category-list`, and `.custom-category-item` base styles.
- `src/App.css`: no longer contains that original contiguous accounting filter/category block.
- Rollback: run `git checkout -- src/App.css src/styles/pages/accounting.css progress.md`.

## 2026-07-08 - Task: Add shared UI presentation components
### What was done
- Added thin shared presentation components for future UI cleanup: `Panel`, `Button`, `Badge`, `EmptyState`, and `SectionHeader`.
- Kept the components state-free and API-free; they only compose semantic elements with stable class names and custom class passthroughs.
- Added smoke coverage for the new primitives in the existing shared component test file.
- Marked Task 3 of the UI motion structure plan as completed.

### Testing
- `npm test -- --run src/components/shared.test.tsx`: first failed because `src/components/ui/*` did not exist, then passed after adding the components. The final run passed 9 tests.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/components/ui/Panel.tsx`: adds the `ui-panel` wrapper.
- `src/components/ui/Button.tsx`: adds the `ui-button` primitive with safe `type="button"` default.
- `src/components/ui/Badge.tsx`: adds the `ui-badge` primitive.
- `src/components/ui/EmptyState.tsx`: adds a reusable empty-state block.
- `src/components/ui/SectionHeader.tsx`: adds a reusable section heading block with optional eyebrow and description.
- `src/components/shared.test.tsx`: adds smoke tests for all shared UI primitives.
- `docs/superpowers/plans/2026-07-08-ui-motion-structure.md`: marks Task 3 steps complete.
- Rollback: run `git checkout -- src/components/shared.test.tsx docs/superpowers/plans/2026-07-08-ui-motion-structure.md progress.md && git rm -r src/components/ui`.

## 2026-07-08 - Task: Add controlled motion and depth effects
### What was done
- Added isolated visual effect wrappers: `TiltCard` and `ParallaxStage`.
- Added conservative CSS-only depth feedback for `.tilt-card`, using a small lift, shadow, border emphasis, and slight 3D rotation.
- Added a reduced-motion guard so users who prefer reduced motion do not get large animation or particle effects.
- Moved `motion.css` and `effects.css` imports after the compatibility `App.css` import so the explicit effect classes can win the cascade without moving legacy page styles.
- Applied `tilt-card` only to the homepage hero visual and article cards; tool panels, forms, upload zones, admin rows, and accounting inputs were not given the effect.
- Marked Task 5 of the UI motion structure plan as completed.

### Testing
- `npm test -- --run src/components/effects.test.tsx src/App.test.tsx -t "visual effect wrappers|redesigned home shell"`: first failed because the effect components and homepage classes did not exist, then passed after adding them.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/components/effects/TiltCard.tsx`: adds the state-free tilt wrapper.
- `src/components/effects/ParallaxStage.tsx`: adds the state-free parallax stage wrapper.
- `src/styles/effects.css`: owns the `.tilt-card` and `.parallax-stage` effect rules.
- `src/styles/motion.css`: owns the reduced-motion guard.
- `src/styles/index.css`: imports motion/effects after `App.css` so these explicit effect classes apply predictably.
- `src/pages/HomePage.tsx`: applies controlled depth to the homepage hero visual and post cards only.
- `src/components/effects.test.tsx` and `src/App.test.tsx`: cover the wrappers and homepage effect mounting points.
- Rollback: run `git checkout -- src/App.test.tsx src/pages/HomePage.tsx src/styles/index.css src/styles/effects.css src/styles/motion.css docs/superpowers/plans/2026-07-08-ui-motion-structure.md progress.md && git rm -r src/components/effects src/components/effects.test.tsx`.

## 2026-07-08 - Task: Polish home and article layout
### What was done
- Added final home-page layout overrides in `src/styles/pages/home.css` so the hero, visual area, filter panel, and article cards have clearer proportions.
- Added final article-detail layout overrides in `src/styles/pages/article.css` so the rail, header card, body width, and comment spacing read as a calmer detail page.
- Moved the empty `home.css` and `article.css` imports after `App.css` so their intentional page-level polish rules apply without changing migrated tool-page CSS order.
- Kept post filtering, tag filtering, article navigation, comment loading, and auth logic unchanged.
- Marked Task 4 of the UI motion structure plan as completed.

### Testing
- `npm test -- --run src/App.test.tsx -t "redesigned home shell|article detail shell|loads persisted comments|returns from article detail"`: passed. The covered homepage shell, article detail shell, persisted comments, and browser-back behavior still work.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/styles/pages/home.css`: owns the final homepage hero, home post shell, filter panel, and post-card layout overrides.
- `src/styles/pages/article.css`: owns the final article detail, article header/body, rail, and comment panel layout overrides.
- `src/styles/index.css`: imports home/article polish after the legacy compatibility stylesheet.
- `docs/superpowers/plans/2026-07-08-ui-motion-structure.md`: marks Task 4 steps complete.
- Rollback: run `git checkout -- src/styles/index.css src/styles/pages/home.css src/styles/pages/article.css docs/superpowers/plans/2026-07-08-ui-motion-structure.md progress.md`.

## 2026-07-08 - Task: Verify UI motion rollout locally
### What was done
- Ran the full frontend/server-adjacent test suite after the style split, shared UI components, motion wrappers, and home/article layout polish.
- Ran the production build after the final layout changes.
- Started the local Vite dev server at `http://127.0.0.1:49200/`.
- Smoke-checked `/`, `/admin`, `/accounting`, `/files`, `/images`, and `/files/preview` through Playwright browser evaluation for non-empty content and horizontal overflow.
- Marked Task 6 verification steps complete, leaving push/deployment pending explicit approval.

### Testing
- `npm test -- --run`: passed. 34 test files and 130 tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.
- Browser smoke checks:
  - `/`: main home shell rendered, `horizontalOverflow` was `0`; live local data had no real post item, while the mocked app test covers post-card `tilt-card` mounting.
  - `/admin`: content rendered, `horizontalOverflow` was `0`, admin unlock/layout shell existed.
  - `/accounting`: content rendered, `horizontalOverflow` was `0`, accounting page and unlock shell existed.
  - `/files`: content rendered, `horizontalOverflow` was `0`, file page and unlock shell existed.
  - `/images`: content rendered, `horizontalOverflow` was `0`, image host page and unlock shell existed.
  - `/files/preview`: without preview navigation state it redirected to `/files`, rendered content, and kept `horizontalOverflow` at `0`.

### Notes
- `docs/superpowers/plans/2026-07-08-ui-motion-structure.md`: records completed local verification steps; deployment remains unchecked.
- `progress.md`: records the final local verification evidence.
- Rollback: run `git checkout -- docs/superpowers/plans/2026-07-08-ui-motion-structure.md progress.md`.

## 2026-07-09 - Task: Add article-detail admin edit flow
### What was done
- Fixed article detail navigation so opening an article scrolls the page back to the top instead of preserving the previous list scroll position.
- Added a detail-page “修改文章” action for admin users or existing backend admin sessions.
- Wired the action to `/admin?edit=<postId>` so the backend editor can locate the same article.
- Updated the admin page to read the `edit` query, expand content management, expand the matching article row, load that article into the editor, and scroll the editor into view.
- Reused the existing `.article-edit-link` capsule style and added the stable `.article-admin-edit` hook for behavior tests.
- Added an explicit `aria-label="文章标题"` to the editor title input for accessibility and reliable testing.

### Testing
- `npm test -- --run src/App.test.tsx -t "scrolls to the top|edit article action|requested article"`: failed before the implementation for all three requested behaviors, then passed after the fix.
- `npm test -- --run`: passed. 34 test files and 133 tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed successfully; Vite still reports the existing large chunk warning.

### Notes
- `src/pages/HomePage.tsx`: scrolls on article detail entry and renders the admin-only edit action.
- `src/pages/AdminPage.tsx`: handles the `edit` query and opens the matching post in the editor.
- `src/components/admin/EditorPanel.tsx`: adds the title input aria label.
- `src/App.test.tsx`: covers scroll reset, admin detail edit entry, and admin query-driven editing.
- `progress.md`: records this task.
- Rollback: run `git checkout -- src/pages/HomePage.tsx src/pages/AdminPage.tsx src/components/admin/EditorPanel.tsx src/App.test.tsx progress.md`.

## 2026-07-10 - Task: Add database-backed admin article autosave
### What was done
- Added a SQLite-backed `article_editor_drafts` table for the backend article editor autosave snapshot.
- Added authenticated admin endpoints to read, save, and clear the current article editor draft.
- Added front-end API wrappers for the new draft endpoints.
- Updated the admin editor to show a `10s后自动保存文章` countdown in the editor info area.
- Changed autosave to run every 10 seconds, silently save the current editor form to the database, and avoid toast popups.
- Kept the existing browser local draft as a fallback cache while making the database draft the primary autosave path.
- Cleared the saved autosave draft after a normal article save succeeds.

### Testing
- `npm test -- --run server/postStore.test.mjs src/lib/blogApi.test.ts src/App.test.tsx -t "autosave|article editor autosave|article autosave draft"`: passed. Store persistence, API calls, and 10-second editor autosave behavior are covered.
- `npm test -- --run src/App.test.tsx src/lib/blogApi.test.ts server/postStore.test.mjs`: passed. Admin/editor, API client, and post store regressions passed.
- `npm test -- --run`: passed. 34 test files and 136 tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed; Vite still reports the existing non-blocking large chunk warning.

### Notes
- `server/postStore.mjs`: creates and persists `article_editor_drafts`, plus get/save/clear draft methods.
- `server/services/postService.mjs`: exposes the draft store methods through the post service.
- `server/routes/admin.mjs`: adds authenticated `/api/admin/article-draft` GET/PUT/DELETE routes.
- `src/lib/blog.ts`: adds the `ArticleAutosaveDraft` type.
- `src/lib/blogApi.ts`: adds draft read/save/clear API helpers.
- `src/pages/AdminPage.tsx`: adds the 10-second silent autosave loop and countdown text.
- `server/postStore.test.mjs`, `src/lib/blogApi.test.ts`, `src/App.test.tsx`: add regression coverage for database persistence, API wiring, and UI autosave behavior.
- Rollback: run `git checkout -- server/postStore.mjs server/postStore.test.mjs server/routes/admin.mjs server/services/postService.mjs src/App.test.tsx src/lib/blog.ts src/lib/blogApi.test.ts src/lib/blogApi.ts src/pages/AdminPage.tsx progress.md`.

## 2026-07-10 - Task: Auto-create draft posts from admin editor content
### What was done
- Changed the admin editor autosave flow so a new article form with any content automatically creates a real `draft` post in the database.
- Treats title, summary, body, tags, or cover URL as meaningful draft content.
- Uses fallback values (`未命名草稿`, `自动保存草稿`) when the user has only filled non-required fields, so the database row stays valid.
- Keeps subsequent 10-second autosaves updating the created draft post instead of creating duplicate drafts.
- Keeps published posts protected from silent overwrite: editing an already published article still uses the separate autosave backup until the user explicitly saves.
- Keeps the previous database-backed autosave snapshot in sync with the created draft post ID.

### Testing
- `npm test -- --run src/App.test.tsx -t "creates a draft post"`: passed. New admin editor content now creates a `draft` post and stores the autosave snapshot with that draft ID.
- `npm test -- --run`: passed. 34 test files and 136 tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed; Vite still reports the existing non-blocking large chunk warning.

### Notes
- `src/pages/AdminPage.tsx`: creates or updates real draft posts during silent autosave for new/draft articles while preserving published-article safety.
- `src/App.test.tsx`: updates the autosave regression to verify the automatic `draft` post creation and draft ID binding.
- Rollback: run `git checkout -- src/pages/AdminPage.tsx src/App.test.tsx progress.md`.

## 2026-07-11 - Task: Add clean article routes, SEO output, and public performance improvements
### What was done
- Replaced hash-based article navigation with refresh-safe `/posts/:slug` React Router routes and real links for article cards, branding, and navigation.
- Changed the public navigation to 首页/文章/分类/专题/关于 and moved accounting, files, images, and admin into an authenticated tools menu.
- Added query-string synchronization for category, date, search, and multi-tag filters; search uses history replacement while discrete filters remain back/forward navigable.
- Added server-rendered metadata and no-JavaScript fallback content for the homepage and article pages, including unique title, description, canonical, Open Graph, Twitter Card, and JSON-LD.
- Added generated `/robots.txt`, `/sitemap.xml`, and `/rss.xml` responses.
- Added a compact public article-list API mode and a separate single-article API so homepage requests no longer include every full article body.
- Added short public cache headers, plus ETag and revalidation caching for public hosted images.
- Split ReactMarkdown, GFM, KaTeX, and KaTeX CSS into a lazy article chunk while keeping admin preview behavior.
- Added a stable 8,422-byte public favicon, replacing the previous 392,748-byte runtime favicon.
- Compressed the homepage hero and filter layout so recent articles appear substantially earlier on mobile, tablet, and desktop while preserving the Haruhi/KITEPOP SOS identity.
- Added article reading progress, generated table-of-contents anchors, skip navigation, visible focus behavior, form autocomplete attributes, descriptive cover alt text, and corrected heading hierarchy.
- Darkened the primary red to `#c53b39`; white text contrast is 5.17:1.
- Added Hono security headers and a deployable HTTPS/gzip/immutable-cache Nginx configuration.
- Documented editorial follow-ups for generic alt text, blocked external covers, public example passwords, suspected `post`/`port` typo, duplicate summaries, and empty SRC content.

### Testing
- `npm test -- --run`: passed. 36 test files and 140 tests passed.
- `npm run build`: passed. Main JS changed from about 925.9 kB to 494.9 kB; main CSS changed from about 116.7 kB to 91.9 kB. Markdown/KaTeX now load as a separate chunk.
- Direct runtime checks: `/`, `/posts/zhou-mo-sheng-huo-ji-lu`, `/robots.txt`, `/sitemap.xml`, `/rss.xml`, `/api/posts?summary=1`, and the single-post API all returned expected content and cache headers.
- No-JavaScript article HTML contained the article title/body, canonical URL, Open Graph metadata, and BlogPosting JSON-LD.
- CDP device emulation at 320, 390, 768, and 1440 px reported zero horizontal overflow.
- First article positions were approximately y=1045, y=990, y=767, and y=877 respectively, down from the supplied mobile baseline near y=2105.
- Article detail checks at 390 and 1440 px reported zero horizontal overflow and rendered the table of contents.
- The repository has no `lint` script. An automated axe package is also not installed; primary red contrast was verified mathematically at 5.17:1, but a deployment-side axe rerun remains required.

### Notes
- `server/seo.mjs`, `server/index.mjs`: generate SEO HTML, crawler/feed documents, and security headers.
- `server/routes/posts.mjs`, `src/lib/blogApi.ts`, `src/context/BlogDataContext.tsx`: split list summaries from full article content.
- `src/pages/HomePage.tsx`, `src/hooks/useBlog.ts`, `src/components/Layout.tsx`: own clean routes, navigation, query filters, and responsive content priority.
- `src/components/MarkdownContent.tsx`, `src/lib/headings.ts`: own lazy Markdown rendering and article heading anchors.
- `deploy/nginx-kitepop.conf`, `docs/seo-performance-notes.md`: document TLS, compression, proxy, and cache deployment requirements.
- `docs/content-audit.md`: lists content that needs manual editorial review.
- Rollback: revert the implementation commit for this task; the change spans frontend routing, server rendering, API shape, styles, tests, public assets, and deployment documentation.

## 2026-07-11 - Task: Harden clean-route SEO rollout after code review
### What was done
- Stabilized notification callbacks and made article-detail fetching depend on the route slug only, preventing missing articles from triggering repeated detail and summary requests.
- Added a dedicated article-not-found state for failed client-side detail navigation.
- Reused the server-injected JSON-LD node during client navigation so SSR and CSR metadata cannot describe different pages at the same time.
- Added a persisted `published_at` marker so unpublished drafts may update their slug, while any article that has ever been published keeps its permanent URL through rename, withdrawal, restart, and republish flows.
- Replaced public article `stale-while-revalidate` caching with `must-revalidate` and added a JSON 404 guard before the SPA fallback for unknown API routes.
- Removed the unused legacy Markdown/math renderer from the public bundle and preserved `$...$`, `$$...$$`, escaped-dollar, code, and `\\(...\\)` formula support in the lazy Markdown renderer.
- Ignored local Codex/Playwright browser artifacts so they cannot be staged accidentally.

### Testing
- `npm test -- --run`: passed. 38 test files and 145 tests passed.
- `npm run build`: passed. The referenced main JS is 267,911 bytes and does not contain KaTeX; Markdown/KaTeX load from the separate 435,300-byte on-demand chunk.
- `git diff --check`: passed.

### Notes
- `dreamhunter2333.com` currently resolves to GitHub Pages, not the VPS. The application can be deployed to `104.244.91.222`, but the checked-in TLS configuration must not be enabled for that hostname until DNS points to the VPS and a certificate has been issued.

## 2026-07-11 - Task: Simplify public navigation and restore the hero character
### What was done
- Removed the redundant public `文章`, `分类`, `专题`, and `关于` navigation entries. The top bar now keeps `首页` plus `登录` for guests or the authenticated `工具` menu.
- Removed the homepage `home-about` block; article search, date, category, and tag navigation remain in the article index where they perform distinct filtering actions.
- Replaced the damaged `haruhi-cutout.webp` hero asset with the clean transparent `haruhi-cutout.png` source.
- Added stable desktop and tablet hero sizing with visible head clearance and disabled portrait translation so animation cannot move the head into the clipping edge.
- Tightened the compact mobile portrait and added a dedicated 340px rule so it does not cover the headline, copy, or action buttons.

### Testing
- `npm test -- --run`: passed. 38 test files and 147 tests passed.
- `npm run build`: passed. TypeScript and Vite production build completed.
- `git diff --check`: passed.
- Production-browser CDP checks at 320, 390, 768, and 1440 px reported zero horizontal overflow.
- The 620x802 PNG loaded completely at every viewport. Desktop head clearance measured 36px, the portrait transform resolved to `none`, and the 320px portrait did not overlap the title or action area.

### Notes
- `src/components/Layout.tsx`: owns the simplified public navigation.
- `src/pages/HomePage.tsx`: uses the clean portrait asset and no longer renders the unused about section.
- `src/styles/pages/home.css`: owns final portrait dimensions and narrow-mobile collision prevention.
- `src/App.test.tsx`: protects the navigation and portrait asset behavior from regression.
## 2026-07-12 - Task: Article discovery and editorial workflows

### What was done
- Added compact cursor pagination for public articles with `posts`, `nextCursor`, `hasMore`, and `total`.
- Added parameterized server-side weighted search across title, tags, category, summary, and Markdown content; category, date, and multiple tags can be combined.
- Added safe React text-node highlighting, debounced search, URL-backed filters, load-more retry, and duplicate-request protection.
- Added a collapsed mobile article table of contents with active heading, reading progress, hash navigation, focus return, Escape handling, and reduced-motion support.
- Added persistent `post_revisions` history with complete snapshots, protected key versions, field comparison, restore backup, and restore-to-draft behavior.
- Added persistent scheduled publishing with `scheduled_at`, `schedule_error`, startup polling, one-minute polling, idempotent publication, cancellation, and manual retry.
- Reworked 10-second autosave around a database draft service. First autosave atomically creates/binds a draft post, autosave creates no revision, concurrent saves cannot overwrite newer content, and offline/pagehide copies are retained locally.
- Added explicit recovery/view/discard UI for newer database drafts.
- Added authenticated full-page draft preview using the shared Markdown/KaTeX renderer and a lazy `/admin/preview/:id` route.
- Added focused backend/frontend modules for revision history, scheduling, preview, and autosave instead of extending the page monoliths.

### Database migrations
- `posts`: adds `published_at`, `scheduled_at`, and `schedule_error` with safe empty-string defaults plus `idx_posts_scheduled_due`.
- `post_revisions`: adds complete article snapshot columns plus `idx_post_revisions_post_created` and `idx_post_revisions_created`.
- Migrations use `CREATE ... IF NOT EXISTS` and column checks, preserve existing records, and persist immediately.
- Restore and scheduled publication use the shared SQLite transaction wrapper so partial mutations are rolled back before persistence.

### Protocols and behavior
- Public list: `GET /api/posts?limit=8&q=&category=&date=&tags=&cursor=`. Search cursors contain score/date/id; normal cursors contain date/id.
- Multi-tag filtering is AND-based. Search weights are title 5, tag/category 4, summary 2, body 1.
- Revision APIs live under `/api/admin/posts/:postId/revisions` and require an administrator session.
- Scheduling APIs live under `/api/admin/posts/:postId/schedule` and require an administrator session.
- Preview uses `GET /api/admin/article-preview/:id`, returns `private, no-store`, and never mutates article or revision state.

### Verification
- `npm test -- --run`: passed, 54 files and 214 tests.
- `npm run build`: passed with route-level chunks for admin and article preview.
- `git diff --check`: passed.
- Direct local API check returned JSON for cursor pagination; 320, 390, 768, and 1440 width checks showed no document-level horizontal overflow.
- Browser MCP's proxy cache returned a stale HTML response for one loopback API request even though direct HTTP returned JSON; this was treated as a browser-tool limitation, not deployment evidence.

### Deployment and rollback
- Back up the SQLite database, static root, Nginx configuration, and environment file before deployment.
- Build before restarting the Node service; restarting before the new hashed assets exist can briefly serve stale asset references.
- Roll back this feature set by reverting commits from `f1ed854` through `449fdeb` in reverse order, then restore the pre-deployment database backup if migrations must also be removed.

### Remaining limitations
- SQLite LIKE search is appropriate for the current data size; migrate `postQueryService` to SQLite FTS when the article corpus grows substantially.
- The former browser-preview Bearer-session limitation was resolved by the 2026-07-15 unified HttpOnly Cookie authentication migration.
- Content cleanup still needs manual review for duplicate-title summaries, generic `image.png` alt text, public password examples, `host:post` typos, and empty SRC-category calls to action.

## 2026-07-15 - Task: Document and verify unified administrator authentication

### What was done

- Updated the user-auth contract for the single site-account identity, opaque HttpOnly Cookie sessions, `/api/users/login`, `/register`, `/me`, and `/logout`.
- Documented the `permission = 'admin'` boundary across backend content, accounting, images, files, About, drafts, revisions, scheduling, previews, and user management.
- Removed obsolete documentation for shared backend/accounting passwords and browser Bearer authorization. `ADMIN_PASSWORD`, `admin_sessions`, and `accounting_sessions` are retired; the three legacy localStorage keys remain only for one-time deletion.
- Added `docs/admin-auth-deployment.md` with a stopped-service read-only administrator precondition, real `POST_DB_PATH` resolution, timestamped paired application/database backups, SHA-256 verification, matching frontend/backend deployment, production environment and Nginx gates, credential-redacted role/Cookie/Origin checks, and paired rollback.
- Kept administrator selection database-driven. Deployment requires exactly one result from `SELECT id,username,nickname FROM users WHERE permission='admin';` and never assumes a username.
- Recorded the existing project deployment names `/opt/kitepop-blog`, `/var/www/myblog`, and `kitepop-blog.service`; the untracked service environment file, active Nginx site, backup root, and release SHA are explicit guarded placeholders.
- Corrected the production restart precondition so the first migration still requires exactly one administrator, while an already-migrated database requires at least one and can retain additional administrators created through the supported user-management flow.
- Split the production TLS hosts so `www.dreamhunter2333.com` redirects to the canonical apex origin before proxying, added a live canonical-redirect deployment probe, and moved inline systemd authentication-environment conflict detection ahead of service shutdown.
- Did not connect to or deploy the VPS in this task.

### Verification

- `npm test -- --run`: passed, 87 test files and 656 tests.
- `npm run build`: passed; TypeScript and Vite completed the production build.
- Removed-auth residue scan: production runtime has no shared-password, Bearer, `adminToken`, or `accountingToken` authorization. Remaining matches are the admin-auth migration dropping old tables, `AppContext` deleting legacy localStorage keys once, negative assertions/probes in tests, and explanatory documentation.
- `git diff --check` and the staged `git diff --cached --check`: passed, including the new deployment runbook.
- Deployment-runbook syntax: all 7 Bash blocks passed `bash -n` with Git Bash, and both inline Node ESM scripts passed `node --input-type=module --check -`.
- Three-role smoke used a generated temporary directory/database, created reader/admin passwords through `createUserStore` and the real scrypt path, closed the seed database, and started the real `server/index.mjs` with production settings, `PORT=0`, and temporary upload/image directories.
- Smoke status matrix: anonymous About `401`; reader login `200` then About `403`; administrator login `200` then About `200`; cross-site administrator PUT `403`; same-site administrator PUT `200`; `/api/users/me` without a Cookie `401`; old Bearer only `401`; logout `200`; replayed Cookie `401`.
- The production login Cookie name and attributes matched `__Host-kitepop_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age=2592000`; neither the Cookie value nor generated passwords were printed.
- The smoke child shut down with code 0 and no `UV_HANDLE_CLOSING`; its database reopened successfully and the temporary directory was deleted.

### Deployment status

- Local implementation, documentation, automated gates, and smoke verification are complete.
- VPS deployment and production database migration were not executed in this task. Use the paired backup/deploy/rollback runbook before any production start.

## 2026-07-16 - Task: Align production authentication with kitepop.top

### What was done

- Confirmed that requests from `https://kitepop.top` were rejected with `403` before credential verification because the live service still accepted `Origin: http://104.244.91.222`.
- Confirmed through a credential-redacted control flow that the existing account remained valid, had administrator permission, could access `/api/users/me` and `/api/admin/about`, and was immediately logged out after the diagnostic.
- Changed the checked-in canonical production origin to `https://kitepop.top` without weakening the exact-Origin CSRF boundary or secure `__Host-` Cookie contract.
- Updated Nginx so HTTP apex/`www` redirect to HTTPS apex, HTTPS `www.kitepop.top` redirects to `https://kitepop.top`, and only the HTTPS apex block proxies to the Node service.
- Updated the Let's Encrypt paths, service environment example, deployment runbook, user-auth documentation, SEO rollout notes, and backend refactoring summary.
- Did not store the supplied password, a raw Cookie, or a session token in repository files or command output.

### Verification

- TDD RED: the production-environment tests failed while `.env.example`, Nginx, and active documentation still named the previous origin.
- TDD GREEN: `server/apiFallback.test.mjs` passed all 11 tests after the canonical-origin updates.
- `npm test -- --run`: passed, 87 test files and 656 tests.
- `npm run build`: passed; TypeScript and the Vite production build completed.
- Deployment-runbook syntax: all 7 Bash blocks and both inline Node ESM heredocs passed syntax validation.

### Deployment status

- Repository configuration is ready for `kitepop.top`.
- The VPS service environment and installed Nginx site still require the documented online update and restart; a Git commit alone does not change the running server.

## 2026-08-01 - Task: Add permanent public media links

### What was done

- Added stable anonymous URLs for uploaded audio and video in the form `/api/files/raw/<file-id>.<original-extension>`.
- Derived the lowercase extension from existing sanitized metadata, so previously uploaded media gains the new URL without a database migration or re-upload.
- Kept non-media and extensionless media behind the existing signed-token access model.
- Preserved previously issued signed media links for compatibility and retained byte-range streaming for browser seeking.
- Rejected mismatched suffixes and files whose stored MIME type is not `audio/*` or `video/*`; deleting a file invalidates both permanent and signed links.
- Updated file-link and preview-link responses, client types, copy feedback, delete confirmation, file-page description, generated-link label, and preview heading.

### Verification

- TDD RED: store tests observed tokenized media paths and a missing public-media lookup; route tests observed `404` for tokenless `.mp4` paths; page tests observed signed-link wording.
- Focused store, route, header, API, and page tests passed after implementation.
- `npm test -- --run`, `npm run build`, and `git diff --check` are the final delivery gates.

### Rollback

- Revert commits `7e30067`, `8d369e6`, and `cd49689` in that order. No database or uploaded-file migration needs rollback.
