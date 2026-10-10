import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieName(secure) {
  return secure ? '__Host-kitepop_session' : 'kitepop_dev_session';
}

function secureCookies(c) {
  const authConfig = c.get('authConfig');
  if (!authConfig || typeof authConfig.secureCookies !== 'boolean') {
    throw new Error('authConfig.secureCookies must be boolean');
  }
  return authConfig.secureCookies;
}

function cookieOptions(c) {
  return {
    path: '/',
    httpOnly: true,
    secure: secureCookies(c),
    sameSite: 'Lax'
  };
}

export function readSessionCookie(c) {
  const name = sessionCookieName(secureCookies(c));
  try {
    return getCookie(c, name) || '';
  } catch {
    return '';
  }
}

export function writeSessionCookie(c, token) {
  const options = cookieOptions(c);
  setCookie(c, sessionCookieName(options.secure), token, {
    ...options,
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(c) {
  const options = cookieOptions(c);
  deleteCookie(c, sessionCookieName(options.secure), options);
}
