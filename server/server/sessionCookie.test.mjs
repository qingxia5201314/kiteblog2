import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookie,
  readSessionCookie,
  sessionCookieName,
  writeSessionCookie
} from './sessionCookie.mjs';

function createCookieApp(authConfig) {
  const app = new Hono();
  app.onError((error, c) => c.text(error.message, 500));
  app.use('*', async (c, next) => {
    if (authConfig !== undefined) c.set('authConfig', authConfig);
    await next();
  });
  app.get('/read', (c) => c.json({ token: readSessionCookie(c) }));
  app.post('/write', (c) => {
    writeSessionCookie(c, 'token+/=;? %');
    return c.json({ ok: true });
  });
  app.post('/clear', (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });
  return app;
}

describe('session cookies', () => {
  it('uses separate production and development names', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(sessionCookieName(true)).toBe('__Host-kitepop_session');
    expect(sessionCookieName(false)).toBe('kitepop_dev_session');
  });

  it.each([
    [true, '__Host-kitepop_session', true],
    [false, 'kitepop_dev_session', false]
  ])('writes the secure=%s cookie with the required attributes', async (secureCookies, name, expectsSecure) => {
    const response = await createCookieApp({ secureCookies }).request('/write', { method: 'POST' });
    const header = response.headers.get('set-cookie');

    expect(header).toContain(`${name}=token%2B%2F%3D%3B%3F%20%25`);
    expect(header).toContain('Max-Age=2592000');
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toMatch(/(?:^|;)\s*Domain=/i);
    if (expectsSecure) expect(header).toContain('Secure');
    else expect(header).not.toMatch(/(?:^|;)\s*Secure(?:;|$)/i);
  });

  it.each([
    [true, '__Host-kitepop_session'],
    [false, 'kitepop_dev_session']
  ])('reads only the cookie selected by secure=%s', async (secureCookies, expectedName) => {
    const otherName = sessionCookieName(!secureCookies);
    const response = await createCookieApp({ secureCookies }).request('/read', {
      headers: { Cookie: `${otherName}=wrong; ${expectedName}=right%2Bvalue` }
    });

    expect(await response.json()).toEqual({ token: 'right+value' });
  });

  it('returns an empty token for missing and malformed cookies without throwing', async () => {
    const app = createCookieApp({ secureCookies: true });
    const missing = await app.request('/read');
    const malformed = await app.request('/read', {
      headers: { Cookie: 'broken; =bad; __Host-kitepop_session="unterminated\u0001"; other=%E0%A4%A' }
    });

    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ token: '' });
    expect(malformed.status).toBe(200);
    expect(await malformed.json()).toEqual({ token: '' });
  });

  it.each([
    [true, '__Host-kitepop_session', true],
    [false, 'kitepop_dev_session', false]
  ])('clears the secure=%s cookie with matching scope', async (secureCookies, name, expectsSecure) => {
    const response = await createCookieApp({ secureCookies }).request('/clear', { method: 'POST' });
    const header = response.headers.get('set-cookie');

    expect(header).toContain(`${name}=`);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toMatch(/(?:^|;)\s*Domain=/i);
    if (expectsSecure) expect(header).toContain('Secure');
    else expect(header).not.toMatch(/(?:^|;)\s*Secure(?:;|$)/i);
  });

  it.each([
    ['read', 'missing authConfig', 'GET', undefined],
    ['read', 'empty authConfig', 'GET', {}],
    ['read', 'non-boolean secureCookies', 'GET', { secureCookies: 'false' }],
    ['write', 'missing authConfig', 'POST', undefined],
    ['write', 'empty authConfig', 'POST', {}],
    ['write', 'non-boolean secureCookies', 'POST', { secureCookies: 'false' }],
    ['clear', 'missing authConfig', 'POST', undefined],
    ['clear', 'empty authConfig', 'POST', {}],
    ['clear', 'non-boolean secureCookies', 'POST', { secureCookies: 'false' }]
  ])('%s rejects %s', async (route, _configLabel, method, authConfig) => {
    const response = await createCookieApp(authConfig).request(`/${route}`, { method });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('authConfig.secureCookies must be boolean');
  });
});
