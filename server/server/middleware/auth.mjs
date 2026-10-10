import { requestIp } from '../requestIp.mjs';
import { emitSecurityEvent } from '../securityLog.mjs';
import { readSessionCookie } from '../sessionCookie.mjs';

export function requireAdmin(c, next) {
  const user = currentUser(c);
  if (!user || user.permission !== 'admin') {
    const status = user ? 403 : 401;
    emitSecurityEvent(c.get('securityLog'), {
      type: 'admin_access_denied',
      result: user ? 'forbidden' : 'unauthorized',
      userId: String(user?.id ?? ''),
      ip: requestIp(c)
    });
    return c.json({ ok: false, message: user ? 'Forbidden' : 'Unauthorized' }, status);
  }
  return next();
}

export function isAdmin(c) {
  return currentUser(c)?.permission === 'admin';
}

export async function hydrateAuth(c, next) {
  const rawToken = readSessionCookie(c);
  c.set('authToken', rawToken);
  const authSession = (await c.get('userStore').verifySession(rawToken)) ?? null;
  c.set('authSession', authSession);
  await next();
}

export function currentUser(c) {
  return c.get('authSession')?.user ?? null;
}

export function requireUser(c, next) {
  if (!currentUser(c)) return c.json({ ok: false, message: 'Unauthorized' }, 401);
  return next();
}
