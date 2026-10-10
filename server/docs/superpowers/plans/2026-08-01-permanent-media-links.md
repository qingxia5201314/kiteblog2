# Permanent Media Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give uploaded audio and video stable public URLs ending in their original extension while preserving signed access for every other file.

**Architecture:** Derive the public media path from existing file metadata without a schema migration. The store owns media eligibility and extension validation, the service exposes those operations, and the existing raw route reuses one streaming response path for both public media and signed files.

**Tech Stack:** Node.js, Hono, sql.js, React, TypeScript, Vitest

---

### Task 1: Store-level permanent media links

**Files:**
- Modify: `server/fileStore.test.mjs`
- Modify: `server/fileStore.mjs`

- [ ] **Step 1: Write failing store tests**

Add tests proving that `lesson.MP4` produces `/api/files/raw/<id>.mp4` without `token`, that the exact public lookup succeeds, and that a mismatched suffix or non-media file is rejected. Also assert media without an extension falls back to a signed link.

```js
it('creates permanent public links for media using the original extension', async () => {
  const media = await store.saveFile({
    originalName: 'lesson.MP4',
    contentType: 'video/mp4',
    buffer: Buffer.from('video')
  });

  expect(store.createAccessLink(media.id)).toEqual({
    path: `/api/files/raw/${encodeURIComponent(media.id)}.mp4`
  });
  expect(store.getPublicMedia(media.id, 'mp4')).toMatchObject({ id: media.id });
  expect(store.getPublicMedia(media.id, 'webm')).toBeNull();
});
```

- [ ] **Step 2: Run the store tests and verify RED**

Run: `npm test -- --run server/fileStore.test.mjs`

Expected: FAIL because media still receives a tokenized path and `getPublicMedia` does not exist.

- [ ] **Step 3: Implement minimal store behavior**

Add focused helpers that extract a normalized safe extension and recognize stored audio/video MIME types. Update `createAccessLink(id)` to return `{ path }` for eligible media and preserve the current `{ path, token }` behavior otherwise. Add `getPublicMedia(id, extension)` that verifies MIME eligibility, exact normalized extension, database presence, and backing-file existence.

- [ ] **Step 4: Run the store tests and verify GREEN**

Run: `npm test -- --run server/fileStore.test.mjs`

Expected: all store tests PASS.

- [ ] **Step 5: Commit the store unit**

```text
git add server/fileStore.mjs server/fileStore.test.mjs
git commit -m "feat: add permanent media links"
```

### Task 2: Serve permanent media paths with Range support

**Files:**
- Modify: `server/fileRangeResponses.test.mjs`
- Modify: `server/services/fileService.mjs`
- Modify: `server/routes/files.mjs`

- [ ] **Step 1: Write failing route tests**

Add tests for anonymous `GET /api/files/raw/<id>.mp4`, anonymous Range playback, mismatched-extension `404`, non-media `404`, deletion `404`, and continued signed access for a normal file. Update the administrator link-generation assertion so media returns a path with no `token` property.

```js
const response = await app.request(`/api/files/raw/${file.id}.mp4`, {
  headers: { Range: 'bytes=2-5' }
});
expect(response.status).toBe(206);
expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
expect(await response.text()).toBe('2345');
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm test -- --run server/fileRangeResponses.test.mjs`

Expected: FAIL with `404` for the suffixed public path.

- [ ] **Step 3: Add the service operation and route resolution**

Expose `getPublicMedia(id, extension)` from `fileService`. In the raw handler, parse a final safe suffix from `:id`; resolve tokenless suffixed requests through `getPublicMedia`, resolve existing unsuffixed requests through `getFileForToken`, then pass either result into the existing stat/header/Range streaming logic.

- [ ] **Step 4: Run route and header tests and verify GREEN**

Run: `npm test -- --run server/fileRangeResponses.test.mjs server/fileDownloadHeaders.test.mjs`

Expected: all route and header tests PASS.

- [ ] **Step 5: Commit the HTTP unit**

```text
git add server/services/fileService.mjs server/routes/files.mjs server/fileRangeResponses.test.mjs
git commit -m "feat: serve permanent media URLs"
```

### Task 3: Update client types and file-page wording

**Files:**
- Modify: `src/lib/fileApi.ts`
- Modify: `src/lib/fileApi.test.ts`
- Modify: `src/pages/FilesPage.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing client and page tests**

Make the API fixture return `{ path: '/api/files/raw/file-1.mp4' }` and assert the returned link does not require a token. Add a page-level test that copies the origin-qualified `.mp4` URL, displays it as a permanent media link, and previews using the same URL.

```ts
expect(await createFileLink('file-1')).toEqual({
  path: '/api/files/raw/file-1.mp4'
});
```

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `npm test -- --run src/lib/fileApi.test.ts src/App.test.tsx`

Expected: FAIL because `FileLink.token` is required and the page still labels every result as signed.

- [ ] **Step 3: Implement minimal client and UI changes**

Change `FileLink.token` to optional. In `FilesPage`, detect audio/video from `contentType` when choosing success text, generated-link label, hero description, and delete confirmation. Keep non-media wording signed and describe media as public permanent links. Continue converting returned relative paths with `new URL(link.path, window.location.origin)` for copy and preview.

- [ ] **Step 4: Run focused frontend tests and verify GREEN**

Run: `npm test -- --run src/lib/fileApi.test.ts src/App.test.tsx`

Expected: all focused frontend tests PASS.

- [ ] **Step 5: Commit the frontend unit**

```text
git add src/lib/fileApi.ts src/lib/fileApi.test.ts src/pages/FilesPage.tsx src/App.test.tsx
git commit -m "feat: expose permanent media links in file UI"
```

### Task 4: Documentation and full verification

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Document behavior and verification**

Add a dated entry describing the tokenless `.ext` media URL, unchanged signed non-media access, backward compatibility, changed files, tests, and rollback commits.

- [ ] **Step 2: Run formatting checks**

Run: `git diff --check`

Expected: exit code `0` with no whitespace errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript validation and Vite production build PASS.

- [ ] **Step 5: Commit documentation**

```text
git add progress.md
git commit -m "docs: record permanent media links"
```
