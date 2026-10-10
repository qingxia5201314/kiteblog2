const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SERIALIZED_HTTP_ORIGIN = /^https?:\/\/[^/?#]+\/?$/i;

function normalizedHttpOrigin(value, { strict = false } = {}) {
  if (
    strict &&
    (typeof value !== 'string' ||
      /[\s\\@]/.test(value) ||
      !SERIALIZED_HTTP_ORIGIN.test(value))
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (
      strict &&
      (url.username ||
        url.password ||
        (url.pathname !== '' && url.pathname !== '/') ||
        url.search ||
        url.hash)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseOriginList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// extraOrigins lets alternate hostnames of this same site (for example a DNS-only upload host)
// submit writes. It only relaxes the CSRF origin check; no CORS headers are ever emitted.
export function createOriginGuard({ production, siteUrl, extraOrigins = [] }) {
  const expectedProductionOrigin = production ? normalizedHttpOrigin(siteUrl) : null;
  if (production && !expectedProductionOrigin) {
    throw new Error('SITE_URL must be a valid HTTP(S) URL in production');
  }
  const trustedExtraOrigins = new Set(
    extraOrigins.map((origin) => {
      const normalized = normalizedHttpOrigin(origin, { strict: true });
      if (!normalized) throw new Error(`Trusted origin must be a bare HTTP(S) origin: ${origin}`);
      return normalized;
    })
  );

  return async function originGuard(c, next) {
    if (SAFE_METHODS.has(c.req.method)) return next();

    const originHeader = c.req.header('Origin');
    if (!production && originHeader === undefined) return next();

    const suppliedOrigin = normalizedHttpOrigin(originHeader, { strict: true });
    const expectedOrigin = production ? expectedProductionOrigin : new URL(c.req.url).origin;
    if (!suppliedOrigin || (suppliedOrigin !== expectedOrigin && !trustedExtraOrigins.has(suppliedOrigin))) {
      return c.json({ ok: false, message: 'Forbidden' }, 403);
    }

    return next();
  };
}
