# Article Platform Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable server-side article discovery, mobile reading navigation, database-backed revision and recovery workflows, scheduled publishing, and authenticated full-page preview without growing the existing page monoliths.

**Architecture:** Public discovery is a cursor-based query service backed by parameterized SQLite queries and consumed by a dedicated React pagination hook. Editorial behavior is split into revision, draft, and scheduled-publishing services over the existing post database; Hono routes remain thin. New UI lives under feature folders and reuses the existing `MarkdownContent` renderer.

**Tech Stack:** React 19, React Router, TypeScript, Hono, sql.js/SQLite, Vitest, CSS.

---

### Task 1: Public query contract and cursor pagination

**Files:**
- Create: `server/services/postQueryService.mjs`
- Create: `server/services/postQueryService.test.mjs`
- Modify: `server/postStore.mjs`
- Modify: `server/services/postService.mjs`
- Modify: `server/routes/posts.mjs`
- Modify: `server/postsRoutes.test.mjs`

- [ ] Write failing tests for an opaque cursor ordered by effective publish/update time and ID, no duplicate rows between pages, `posts/nextCursor/hasMore/total`, query-length validation, category/date/multi-tag filters, and weighted title/tag/category/summary/body search.
- [ ] Run `npm test -- --run server/services/postQueryService.test.mjs server/postsRoutes.test.mjs` and confirm failures are caused by the missing query service and response contract.
- [ ] Implement `parsePublicPostQuery(urlSearchParams)`, cursor encode/decode, and `createPostQueryService({ store })`. Cap page size at 24, search at 120 characters, tags at 10 entries, and reject malformed cursors with a 400 response. Non-search cursors contain `{ publishedAt, id }`; search cursors contain `{ score, publishedAt, id }` so relevance pagination remains stable.
- [ ] Add `store.queryPublic(options)` using parameterized SQL. Search ordering is score descending, effective published date descending, ID descending; non-search ordering is effective published date descending, ID descending. Return honest compact rows without a `content` field and include precomputed reading minutes while still using content for matching. Map `published_at` back to `publishedAt` for full posts.
- [ ] Wire `/api/posts` so legacy admin/full-list calls remain compatible, while public pagination requests return the new contract and public article detail remains unchanged.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Frontend pagination, debounce, and safe highlighting

**Files:**
- Create: `src/features/articles/api/articleQueryApi.ts`
- Create: `src/features/articles/hooks/useArticlePagination.ts`
- Create: `src/features/articles/components/ArticleList.tsx`
- Create: `src/features/articles/components/ArticleSearch.tsx`
- Create: `src/features/articles/components/SearchHighlight.tsx`
- Create: `src/features/articles/components/LoadMoreButton.tsx`
- Create: `src/features/articles/articleDiscovery.test.tsx`
- Create: `src/styles/features/article-discovery.css`
- Modify: `src/lib/blog.ts`
- Modify: `src/lib/blogApi.ts`
- Modify: `src/context/BlogDataContext.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/index.css`

- [ ] Write failing component/hook tests for first-page loading, append-only loading, request de-duplication, retry after failure, reset on filter change, 300 ms search debounce, URL-derived filters, empty state, and text-node highlighting of hostile strings.
- [ ] Run the targeted test and confirm it fails before production code exists.
- [ ] Add `PublicPostQuery`, `PublicPostPage`, and compact post types; centralize the query request in `articleQueryApi.ts`.
- [ ] Implement `useArticlePagination` with an abort controller, request sequence guard, in-flight guard, reset on normalized filters, and separate initial/load-more error states.
- [ ] Implement the four focused components. `SearchHighlight` must split strings into React text/`<mark>` nodes and must not use HTML injection.
- [ ] Stop the public `BlogDataProvider` from loading the full list automatically; retain authenticated full-list loading for the admin. Compose the new feature components in `HomePage` and keep query/category/tags/date in the URL.
- [ ] Re-run targeted tests and existing app/API tests.

### Task 3: Mobile article table of contents

**Files:**
- Create: `src/features/articles/components/MobileArticleToc.tsx`
- Create: `src/features/articles/hooks/useArticleReadingState.ts`
- Create: `src/features/articles/mobileToc.test.tsx`
- Create: `src/styles/features/mobile-article-toc.css`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/pages/article.css`
- Modify: `src/styles/index.css`

- [ ] Write failing tests for collapsed-by-default state, `aria-expanded/aria-controls`, current heading, progress, close-after-navigation, hash history updates, Escape close, focus return, and reduced-motion scrolling.
- [ ] Run the test and confirm expected failure.
- [ ] Extract article progress and active-heading observation into `useArticleReadingState`.
- [ ] Implement a mobile-only sticky trigger and safe-area-aware drawer. Keep the existing desktop rail TOC and share heading/progress state.
- [ ] On link activation, push the hash, scroll with `smooth` unless reduced motion is requested, close the drawer, and return focus to the trigger.
- [ ] Re-run targeted tests.

### Task 4: Revision schema, store, service, and admin API

**Files:**
- Create: `server/revisionStore.mjs`
- Create: `server/revisionStore.test.mjs`
- Create: `server/services/postRevisionService.mjs`
- Create: `server/services/postRevisionService.test.mjs`
- Create: `server/routes/revisions.mjs`
- Create: `server/revisionsRoutes.test.mjs`
- Modify: `server/postStore.mjs`
- Modify: `server/services/postService.mjs`
- Modify: `server/index.mjs`
- Modify: `server/routes/posts.mjs`

- [ ] Write failing persistence tests for idempotent schema migration, complete snapshots, newest-first listing, protected/non-protected deletion, manual-save/publish/withdraw sources, restore backup creation, and restore-to-draft behavior.
- [ ] Write failing route tests proving every revision endpoint requires admin authentication.
- [ ] Implement `post_revisions` with indexed `post_id/created_at`, explicit snapshot columns, `source`, `editor_user_id`, and `is_protected`.
- [ ] Make schema initialization report whether DDL/DML changed the database and persist migrations immediately. Preserve existing `published_at` values, but only initialize missing publish timestamps for rows whose status is `published`; never mark old drafts as previously published.
- [ ] Implement `createPostRevisionService({ revisionStore, postStore })` for snapshot, list, get, delete, compare payload, and atomic restore semantics. Restoring first snapshots the current post as protected `restore-backup`, applies the selected snapshot as `draft`, then records `restore`.
- [ ] Route `GET /api/admin/posts/:id/revisions`, `GET /:revisionId`, `POST /:revisionId/restore`, and `DELETE /:revisionId`; keep route handlers thin.
- [ ] Make manual create/update/status operations record exactly one revision with sources `create`, `manual-save`, `publish`, `withdraw`, or `schedule`; autosave writes no revision.
- [ ] Re-run targeted store/service/route tests.

### Task 5: Scheduled publishing job

**Files:**
- Create: `server/services/scheduledPublishService.mjs`
- Create: `server/services/scheduledPublishService.test.mjs`
- Create: `server/jobs/scheduledPublishing.mjs`
- Create: `server/jobs/scheduledPublishing.test.mjs`
- Modify: `server/postStore.mjs`
- Modify: `server/services/postService.mjs`
- Modify: `server/routes/admin.mjs`
- Modify: `server/index.mjs`
- Modify: `src/lib/blog.ts`

- [ ] Write failing tests for adding `scheduled_at/schedule_error`, scheduling only future times, cancellation to draft, due-item lookup, idempotent repeated polling, restart-safe execution, protected pre-publish revision, error recording, and manual retry.
- [ ] Run the tests and confirm expected failures.
- [ ] Add repeatable migrations and indexes for scheduled rows. Extend status to `draft/published/withdrawn/scheduled` while preserving existing values.
- [ ] Implement the scheduling service so the transition checks `status='scheduled'` and due time in the same operation before publishing. Record a protected pre-publish revision and set actual publish time once.
- [ ] Start one immediate run after store initialization and a 60-second unref'd interval. Expose admin schedule/cancel/retry endpoints and record concise server errors.
- [ ] Re-run targeted tests.

### Task 6: Draft autosave and recovery workflow

**Files:**
- Create: `server/services/draftService.mjs`
- Create: `server/services/draftService.test.mjs`
- Create: `src/features/editor/hooks/useDraftAutosave.ts`
- Create: `src/features/editor/components/DraftRecoveryDialog.tsx`
- Create: `src/features/editor/draftRecovery.test.tsx`
- Modify: `server/routes/admin.mjs`
- Modify: `server/services/postService.mjs`
- Modify: `src/lib/blogApi.ts`
- Modify: `src/hooks/useEditor.ts`
- Modify: `src/lib/draftAutosave.ts`
- Modify: `src/pages/AdminPage.tsx`

- [ ] Write failing backend tests for database persistence across restart, newer-than-post detection, autosave upsert without revision, clear/discard, and server-created draft binding.
- [ ] Write failing frontend tests for 10-second silent saves, countdown/status text, no concurrent overwrite, local offline fallback, recovery/view/discard choices, and keepalive final save.
- [ ] Implement `draftService` as the only owner of editor snapshots and draft-post upsert behavior; keep revisions separate.
- [ ] Upgrade the local draft repository to a backward-compatible envelope containing `schemaVersion`, `editingId`, `updatedAt`, and `draft` so local/server/current timestamps can be compared.
- [ ] Rewrite `useEditor` as the single owner of form/editing state and compose `useDraftAutosave` with refs for latest content/token, one in-flight request, dirty-generation tracking, local fallback, online reconciliation, and `fetch(..., { keepalive: true })` on page hide.
- [ ] Show the recovery dialog only when the server snapshot is newer than the current post. Do not silently overwrite the editor.
- [ ] Remove the duplicate editor/autosave state machine from `AdminPage`; compose `useEditor`, the autosave hook, and the recovery dialog instead.
- [ ] Re-run targeted tests and the existing autosave regression.

### Task 7: Authenticated full-page preview

**Files:**
- Create: `src/pages/ArticlePreviewPage.tsx`
- Create: `src/pages/ArticlePreviewPage.test.tsx`
- Create: `src/features/editor/components/ArticlePreviewAction.tsx`
- Modify: `src/pages/lazy.ts`
- Modify: `src/App.tsx`
- Modify: `server/routes/admin.mjs`
- Modify: `src/lib/blogApi.ts`
- Modify: `src/components/MarkdownContent.tsx`
- Modify: `src/styles/pages/article.css`

- [ ] Write failing route/API tests proving unauthenticated preview is 401 and an authenticated refresh resolves the current database autosave snapshot without mutating status, timestamps, or revisions.
- [ ] Write failing React tests proving preview uses `MarkdownContent`, KaTeX-capable article structure, the shared TOC, a visible preview banner, and a return-to-editor link.
- [ ] Add `GET /api/admin/article-preview/:id` that resolves the matching autosave snapshot first and then the stored post. It must be `private, no-store` and must not write data.
- [ ] Add `/admin/preview/:id` as a lazy route. Load with the existing admin token and reuse article rendering components rather than copying Markdown logic.
- [ ] Make the editor preview action flush the current autosave before opening the route in a new tab.
- [ ] Re-run targeted tests.

### Task 8: Editor revision and schedule UI

**Files:**
- Create: `src/features/editor/api/editorWorkflowApi.ts`
- Create: `src/features/editor/hooks/useRevisionHistory.ts`
- Create: `src/features/editor/components/RevisionPanel.tsx`
- Create: `src/features/editor/components/RevisionDiff.tsx`
- Create: `src/features/editor/components/PublishScheduleControl.tsx`
- Create: `src/features/editor/editorWorkflow.test.tsx`
- Create: `src/styles/features/editor-workflow.css`
- Modify: `src/components/admin/EditorPanel.tsx`
- Modify: `src/components/admin/ArticleManager.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles/index.css`

- [ ] Write failing tests for newest-first revisions, view/diff/restore/delete controls, protected delete disablement, schedule validation, cancellation, retry, and status labels for draft/published/withdrawn/scheduled.
- [ ] Run the test and confirm expected failure.
- [ ] Centralize workflow API calls and implement the revision hook with independent loading/error states.
- [ ] Implement focused UI components and compose them into the editor. A restore refreshes the form with draft status; schedule actions refresh the admin list.
- [ ] Keep `EditorPanel` presentational. Move revision loading, schedule mutation, draft recovery, and preview flushing out of `AdminPage`; leave the page responsible only for composing those hooks/components and refreshing the admin post collection.
- [ ] Re-run targeted and app-level tests.

### Task 9: Full regression, responsive verification, and deployment

**Files:**
- Modify: `progress.md`

- [ ] Run `npm test -- --run`, `npm run build`, and `git diff --check` from a clean dependency state.
- [ ] Verify direct article/detail/preview refresh and public/admin API authorization. Confirm public pagination transfers compact rows only.
- [ ] Capture 320, 390, 768, and 1440 px browser checks for homepage pagination, empty/error states, mobile TOC, editor workflow panels, and preview without horizontal overflow or overlap.
- [ ] Check added lines for passwords, tokens, database paths, uploaded content, and VPS secrets.
- [ ] Record migrations, protocols, tests, limitations, and rollback notes in `progress.md`; commit focused changes and push `main`.
- [ ] Before VPS update, back up SQLite, static root, Nginx config, environment file, and any tracked remote changes. Pull without overwriting remote modifications, build, restart, and verify all listed old/new workflows.
