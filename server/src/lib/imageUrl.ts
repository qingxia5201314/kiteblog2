export function normalizeImageUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/api/images/raw/')) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith('/api/images/raw/')) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    const isLocalHttp =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol === 'https:' || isLocalHttp) return url.toString();
  } catch {
    return undefined;
  }

  return undefined;
}
