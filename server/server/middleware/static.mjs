import { serveStatic } from '@hono/node-server/serve-static';

export function staticMiddleware() {
  return [
    serveStatic({ root: './dist', rewriteRequestPath: () => '/index.html' })
  ];
}
