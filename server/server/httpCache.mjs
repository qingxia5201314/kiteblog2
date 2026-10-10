export const PUBLIC_DYNAMIC_CACHE = 'public, max-age=60, must-revalidate';
export const PUBLIC_FEED_CACHE = 'public, max-age=300, must-revalidate';

export async function authenticatedResponseCache(c, next) {
  await next();
  const cacheControl = c.res.headers.get('Cache-Control') || '';
  const explicitlyPublic = /^public(?:\s*,|\s|$)/i.test(cacheControl);
  if (c.get('authSession') && !explicitlyPublic) c.header('Cache-Control', 'private, no-store');
}
