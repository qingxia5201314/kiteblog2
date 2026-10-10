export function apiNotFound(c) {
  return c.json({ ok: false, message: 'API route not found' }, 404);
}
