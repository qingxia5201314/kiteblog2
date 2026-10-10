import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createOriginGuard, parseOriginList } from './origin.mjs';

const MALFORMED_SERIALIZED_ORIGINS = [
  'https:blog.example',
  'https:/blog.example',
  'https:\\\\blog.example',
  'https://blog.example/.',
  'https://blog.example/a/..',
  'https://blog.example/%2e'
];

function createApp(options) {
  const app = new Hono();
  app.use('*', createOriginGuard(options));
  app.all('*', (c) => c.json({ ok: true, method: c.req.method }));
  return app;
}

describe('createOriginGuard', () => {
  it.each([undefined, '', 'not a URL', '/relative', 'mailto:admin@example.com'])(
    'rejects invalid production SITE_URL %j when the guard is created',
    (siteUrl) => {
      expect(() => createOriginGuard({ production: true, siteUrl })).toThrow(/SITE_URL.*valid/i);
    }
  );

  it.each(['GET', 'HEAD', 'OPTIONS'])('passes %s through without inspecting Origin', async (method) => {
    const response = await createApp({ production: true, siteUrl: 'https://blog.example/settings' }).request(
      'https://blog.example/resource',
      { method, headers: { Origin: 'not a URL' } }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    if (method !== 'HEAD') expect(await response.json()).toEqual({ ok: true, method });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects a missing Origin for production %s requests',
    async (method) => {
      const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
        'https://blog.example/resource',
        { method }
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it.each(['null', 'not a URL', 'https://other.example'])(
    'rejects production Origin %j',
    async (origin) => {
      const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
        'https://blog.example/resource',
        { method: 'POST', headers: { Origin: origin } }
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it.each(['https://blog.example', 'https://blog.example/'])(
    'uses only the normalized production SITE_URL origin for Origin %s',
    async (origin) => {
      const response = await createApp({
        production: true,
        siteUrl: 'https://BLOG.example:443/admin?from=config'
      }).request('https://unrelated.internal/write', {
        method: 'POST',
        headers: { Origin: origin }
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, method: 'POST' });
    }
  );

  it.each([
    ['HTTP://[::1]:4173/', 'http://[::1]:4173/admin?from=config'],
    ['https://blog.example:8443', 'https://blog.example:8443/admin?from=config']
  ])('accepts serialized production Origin %s with an explicit port', async (origin, siteUrl) => {
    const response = await createApp({ production: true, siteUrl }).request(
      'https://unrelated.internal/write',
      { method: 'POST', headers: { Origin: origin } }
    );

    expect(response.status).toBe(200);
  });

  it.each([
    'https://blog.example/admin',
    'https://blog.example?from=header',
    'https://blog.example#fragment',
    'https://admin:secret@blog.example'
  ])('rejects malformed production Origin %j', async (origin) => {
    const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
      'https://blog.example/write',
      { method: 'POST', headers: { Origin: origin } }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
  });

  it.each(MALFORMED_SERIALIZED_ORIGINS)(
    'rejects malformed serialized production Origin %j',
    async (origin) => {
      const response = await createApp({ production: true, siteUrl: 'https://blog.example' }).request(
        'https://blog.example/write',
        { method: 'POST', headers: { Origin: origin } }
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it('allows a missing Origin outside production even when SITE_URL is invalid', async () => {
    const response = await createApp({ production: false, siteUrl: 'not a URL' }).request(
      'http://localhost:4173/write',
      { method: 'POST' }
    );

    expect(response.status).toBe(200);
  });

  it('accepts a normalized Origin matching the current request origin outside production', async () => {
    const response = await createApp({ production: false }).request('http://LOCALHOST:80/write', {
      method: 'PATCH',
      headers: { Origin: 'http://localhost' }
    });

    expect(response.status).toBe(200);
  });

  it.each([
    ['HTTP://[::1]:4173/', 'http://[::1]:4173/write'],
    ['https://blog.example:8443', 'https://blog.example:8443/write']
  ])('accepts serialized development Origin %s with an explicit port', async (origin, requestUrl) => {
    const response = await createApp({ production: false }).request(requestUrl, {
      method: 'PATCH',
      headers: { Origin: origin }
    });

    expect(response.status).toBe(200);
  });

  it.each([
    'http://localhost:4173/admin',
    'http://localhost:4173?from=header',
    'http://localhost:4173#fragment',
    'http://admin:secret@localhost:4173'
  ])('rejects malformed development Origin %j', async (origin) => {
    const response = await createApp({ production: false }).request('http://localhost:4173/write', {
      method: 'POST',
      headers: { Origin: origin }
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
  });

  it.each(MALFORMED_SERIALIZED_ORIGINS)(
    'rejects malformed serialized development Origin %j',
    async (origin) => {
      const response = await createApp({ production: false }).request('https://blog.example/write', {
        method: 'POST',
        headers: { Origin: origin }
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it.each(['null', 'not a URL', 'http://localhost:4174'])(
    'rejects development Origin %j when the request is on another origin',
    async (origin) => {
      const response = await createApp({ production: false }).request('http://localhost:4173/write', {
        method: 'DELETE',
        headers: { Origin: origin }
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, message: 'Forbidden' });
    }
  );

  it('accepts configured extra origins without emitting CORS headers', async () => {
    const app = createApp({
      production: true,
      siteUrl: 'https://blog.example',
      extraOrigins: parseOriginList(' https://upload.blog.example , ')
    });

    const trusted = await app.request('https://blog.example/write', {
      method: 'PUT',
      headers: { Origin: 'https://upload.blog.example' }
    });
    const untrusted = await app.request('https://blog.example/write', {
      method: 'PUT',
      headers: { Origin: 'https://evil.blog.example' }
    });

    expect(trusted.status).toBe(200);
    expect(trusted.headers.get('access-control-allow-origin')).toBeNull();
    expect(trusted.headers.get('access-control-allow-credentials')).toBeNull();
    expect(untrusted.status).toBe(403);
  });

  it.each(['upload.blog.example', 'https://upload.blog.example/path', 'javascript:alert(1)'])(
    'rejects malformed extra origin %j when the guard is created',
    (origin) => {
      expect(() =>
        createOriginGuard({ production: true, siteUrl: 'https://blog.example', extraOrigins: [origin] })
      ).toThrow(/Trusted origin/);
    }
  );
});
