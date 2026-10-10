# Upload Limits

File warehouse uploads are limited by `FILE_UPLOAD_LIMIT`.

- Default: `0`, which means the app layer does not enforce a file size limit.
- Set `FILE_UPLOAD_LIMIT` to a positive byte value when you want the app layer to reject larger uploads.
- Reverse proxies must allow at least the same request size. For Nginx, set `client_max_body_size 0;` for unlimited uploads, or set a sufficiently large positive value for the site that proxies this app.

Image host uploads continue to use `IMAGE_UPLOAD_LIMIT`.

## Chunked file uploads

The file warehouse UI uploads through `/api/files/uploads` in 8 MiB chunks (4 in parallel, each retried with backoff). Every request stays far below Cloudflare's 100 MB per-request cap and Node's 300 s `requestTimeout`, so large files work through the proxied `kitepop.top` origin.

- `POST /api/files/uploads` with `{ fileName, contentType, sizeBytes, folderId }` opens a session. The size is checked against `FILE_UPLOAD_LIMIT` and free disk space up front.
- `PUT /api/files/uploads/:id/chunks/:index` streams one chunk straight to its offset in `UPLOAD_DIR/.partial/`. Re-sending a chunk is safe.
- `POST /api/files/uploads/:id/complete` moves the assembled file into `UPLOAD_DIR` and records it. Retrying it after success returns the same file.
- `DELETE /api/files/uploads/:id` cancels. Sessions idle for an hour are swept, and `.partial/` is cleared on startup.

Keep request buffering enabled in Nginx (the default) for proxies that serve these routes: with `proxy_request_buffering off` over HTTP/2, Nginx throttles each upload stream to its small receive window.

## Extra trusted origins

`EXTRA_TRUSTED_ORIGINS` is an optional comma-separated list of bare origins (for example `https://upload.kitepop.top`) whose writes pass the origin guard in addition to `SITE_URL`. Use it for a DNS-only host that serves the same app. No CORS headers are sent, so pages must be loaded from that host itself, and it keeps its own login session because the session cookie is host-only.
