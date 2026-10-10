# Permanent media links design

## Goal

Make uploaded audio and video usable as stable public media-hosting assets. Their URLs must preserve the original file extension, require no token, and have no expiration time.

## Scope

- Public permanent links apply only to files whose stored `contentType` starts with `video/` or `audio/`.
- Other uploaded files retain the existing signed-token access model.
- Existing signed media links remain valid for compatibility until the file is deleted or a later migration explicitly removes them.

## URL contract

The permanent media URL has this form:

```text
/api/files/raw/<file-id>.<original-extension>
```

The extension is derived from the sanitized original filename, normalized to lowercase, and URL-encoded as part of the path. A request is served only when the requested extension matches the stored media extension. Media without a usable filename extension does not receive a permanent public link and falls back to the existing signed-link behavior.

## Backend behavior

- The file store exposes lookup by ID for public media while checking that the record is audio or video and that its backing file still exists.
- The raw route accepts both the new suffixed public path and the existing tokenized path.
- Public media requests require no authentication or query token.
- Existing response headers and byte-range behavior are reused so seeking in browser audio/video players continues to work.
- Deleted files return `404` through both permanent and signed URLs.
- Link-generation endpoints remain administrator-only. For eligible media they return a permanent link without a token; for other files they keep returning a signed link.

## Frontend behavior

- `FileLink.token` becomes optional because permanent media links do not carry a token.
- Copying a link for eligible media copies the permanent origin-qualified URL.
- Opening the media preview uses the same permanent URL.
- User-facing copy calls media URLs permanent links while retaining signed-link wording for non-media files where practical.

## Compatibility and security

- File listing, upload, folder management, link generation, and deletion remain administrator-only.
- Anonymous access is limited to exact IDs and extensions for stored audio/video records.
- Arbitrary file types cannot become public merely by requesting an audio/video-looking suffix; eligibility is based on stored metadata.
- Existing signed access remains unchanged for non-media files.

## Tests

- File-store tests cover extension extraction, permanent media-link generation, public media lookup, mismatched extensions, non-media rejection, and deletion.
- Route tests cover anonymous full and Range responses for permanent media URLs and `404` behavior for invalid paths.
- API/frontend tests cover tokenless media links and their use by copy and preview flows.
- The focused suite runs first, followed by the project build and full test suite.
