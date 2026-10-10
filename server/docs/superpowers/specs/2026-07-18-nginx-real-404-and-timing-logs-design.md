# Real 404 Responses and Timing Logs Design

## Goal

Return a genuine HTTP 404 for unknown blog paths and unknown hosts while preserving all existing API upstream routing. Extend Nginx access logs with the request host and request/upstream timing data needed to distinguish domains and diagnose slow requests.

## Current behavior

- The canonical HTTPS virtual host proxies general requests to the Node server.
- The Node server ends with a catch-all GET route that serves `dist/index.html`, so unknown blog paths return HTTP 200.
- The first configured Nginx server can accept an unmatched `Host`, so an unknown host may be redirected to or served by the blog instead of returning 404.
- The checked-in Nginx configuration does not define a site access-log format containing `$host`, `$request_time`, and `$upstream_response_time`.
- Unknown `/api/*` routes already reach the API fallback and return its JSON 404 response. That ordering and behavior must not change.

## Routing design

### Canonical blog host

Keep the canonical `kitepop.top` Nginx proxy behavior unchanged. The Node server will explicitly serve the SPA shell only for these existing client routes:

- `/accounting`
- `/about`
- `/files`
- `/files/preview`
- `/images`
- `/admin`
- `/admin/preview/:id`

Existing dedicated handlers remain responsible for `/`, `/posts/:slug`, `/robots.txt`, `/sitemap.xml`, `/rss.xml`, `/favicon.png`, and `/assets/*`. A missing or unpublished article continues to return 404. After all known routes, an unmatched GET returns a plain HTTP 404 rather than `index.html`.

Non-GET unknown routes continue to use Hono's normal 404 behavior.

### API routes

Do not change the Nginx catch-all proxy, API middleware order, mounted API routers, or `app.all('/api/*', apiNotFound)`. Requests under `/api/*`, including unknown API paths, continue to reach the Node upstream and retain their current status, JSON body, headers, and authentication/origin handling.

### Host routing

Add explicit default Nginx servers for both port 80 and port 443. They return HTTP 404 without redirecting or proxying. The TLS default server uses the existing certificate paths so Nginx can complete TLS before returning the HTTP response.

The named hosts retain their current behavior:

- HTTP `kitepop.top` and `www.kitepop.top` redirect to canonical HTTPS.
- HTTPS `www.kitepop.top` redirects to `https://kitepop.top`.
- HTTPS `kitepop.top` serves/proxies the application.

## Logging design

Define a named Nginx access-log format in the site include with, at minimum:

- `$host`
- `$request_time`
- `$upstream_response_time`

Use that format for the default-host responses, redirects, and canonical application server. Requests that do not contact an upstream naturally record `-` for upstream response time. Keep the existing `access_log off` behavior for immutable `/assets/` requests.

## Verification

Add regression tests before changing production configuration. The tests will verify:

1. Every confirmed SPA route is explicitly served.
2. The broad `app.get('*', ...index.html...)` fallback is removed and unknown blog GETs resolve to 404.
3. The API fallback remains before all frontend/static handling and its behavior remains unchanged.
4. Port 80 and port 443 each have a default server that returns 404 and does not proxy or redirect.
5. The named canonical and `www` host behavior remains intact.
6. The selected access-log format contains `$host`, `$request_time`, and `$upstream_response_time` and is applied to the relevant servers.
7. The focused test suite and production build pass.

## Scope

Only `deploy/nginx-kitepop.conf`, the Node frontend fallback registration, and their regression tests are in scope. No API route, API middleware, database behavior, frontend component, or live VPS configuration is changed by this repository update.
