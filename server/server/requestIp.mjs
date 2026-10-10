import { getConnInfo } from '@hono/node-server/conninfo';

function isLoopbackAddress(address) {
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized.startsWith('127.') || normalized.startsWith('::ffff:127.');
}

export function requestIp(c, { fallback = 'unknown' } = {}) {
  try {
    const address = getConnInfo(c)?.remote?.address;
    const peer = typeof address === 'string' && address.trim() ? address.trim() : fallback;
    if (c.get('authConfig')?.trustProxy === true && isLoopbackAddress(peer)) {
      const forwarded = String(c.req.header('x-real-ip') ?? '').trim();
      if (forwarded) return forwarded;
    }
    return peer;
  } catch {
    return fallback;
  }
}
