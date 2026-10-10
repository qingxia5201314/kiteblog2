# Media Preview

This repository supports in-site preview for uploaded `video/*` and `audio/*` files.

## Behavior

- Files are still stored behind signed links.
- The file list includes a preview action for audio and video files.
- The preview page loads media lazily and only requests the stream after the user clicks play.
- Raw file delivery supports HTTP `Range` requests, so browser players can seek normally.
- Video previews now show a visible player control strip and switch layout from the video's real metadata.
- Portrait videos use a portrait stage instead of being forced into a landscape `16 / 9` frame.

## Routes

- File preview page: `/files/preview`
- Signed preview link API: `POST /api/files/:id/preview-link`

## Verification

- `npm test -- --run src/pages/MediaPreviewPage.test.tsx src/App.test.tsx -t "MediaPreviewPage|opens the in-site media preview shell"`
- `npm run build`

## Rollback

- `git checkout -- src/App.css src/pages/MediaPreviewPage.tsx docs/media-preview.md progress.md`
- `git rm src/pages/MediaPreviewPage.test.tsx`
