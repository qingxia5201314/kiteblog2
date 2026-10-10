# SEO and performance rollout

## Repository changes

- Clean article URLs use `/posts/:slug` and support direct browser refreshes.
- The Hono server injects page-specific metadata and no-JavaScript article content into the built SPA document.
- `/robots.txt`, `/sitemap.xml`, and `/rss.xml` are real generated documents.
- Public post lists use `summary=1`; the article route fetches full content only when needed.
- The favicon was reduced from 392,748 bytes to 8,422 bytes.
- Public list and article responses use short cache lifetimes with `must-revalidate`, so withdrawn content is not intentionally served stale.
- The checked-in Nginx configuration enables gzip and immutable caching for hashed assets.

## Deployment steps

1. Keep `kitepop.top` and `www.kitepop.top` pointed at the VPS serving the application.
2. Set `SITE_URL=https://kitepop.top` in the backend service environment.
3. Obtain a Let's Encrypt certificate before enabling the TLS server block:

   `certbot certonly --webroot -w /var/www/certbot -d kitepop.top -d www.kitepop.top`

4. Install `deploy/nginx-kitepop.conf` as the site configuration and run `nginx -t`.
5. Reload Nginx and verify HTTP redirects to HTTPS.
6. Keep HSTS disabled until HTTPS, uploads, API calls, and all required subdomains have remained stable.
7. Install the Brotli module before uncommenting the `brotli` directives. Gzip works without that optional module.

## Benchmark notes

The supplied audit baseline was mobile LCP 4.22s, main JS 925,906B, CSS 116,725B, and no content encoding. The final local build references a 267,911B main JS file and a 92,317B main CSS file; Markdown/KaTeX remain in a separate on-demand chunk. Re-run the same browser/network profile after deployment because compression, TLS, cache headers, and server-rendered HTML cannot be measured accurately from the local Vite build alone.
