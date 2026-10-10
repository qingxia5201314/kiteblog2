import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requestIp } from './requestIp.mjs';

function nodeEnv(remoteAddress) {
  return {
    incoming: {
      socket: {
        remoteAddress,
        remotePort: 43_210,
        remoteFamily: remoteAddress.includes(':') ? 'IPv6' : 'IPv4'
      }
    }
  };
}

function createApp({ trustProxy, fallback } = {}) {
  const app = new Hono();
  app.get('/', (c) => {
    c.set('authConfig', { trustProxy });
    return c.text(requestIp(c, fallback === undefined ? undefined : { fallback }));
  });
  return app;
}

describe('requestIp', () => {
  it('returns the direct Node peer address', async () => {
    const response = await createApp().request('/', {}, nodeEnv('198.51.100.10'));

    expect(await response.text()).toBe('198.51.100.10');
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'trusts x-real-ip from loopback peer %s when proxy trust is enabled',
    async (peerAddress) => {
      const response = await createApp({ trustProxy: true }).request(
        '/',
        { headers: { 'X-Real-IP': '203.0.113.44' } },
        nodeEnv(peerAddress)
      );

      expect(await response.text()).toBe('203.0.113.44');
    }
  );

  it.each([
    ['proxy trust is disabled', false, '127.0.0.1'],
    ['the direct peer is not loopback', true, '198.51.100.20']
  ])('ignores x-real-ip when %s', async (_label, trustProxy, peerAddress) => {
    const response = await createApp({ trustProxy }).request(
      '/',
      { headers: { 'X-Real-IP': '203.0.113.44' } },
      nodeEnv(peerAddress)
    );

    expect(await response.text()).toBe(peerAddress);
  });

  it('uses unknown when connection inspection fails', async () => {
    const response = await createApp().request('/');

    expect(await response.text()).toBe('unknown');
  });

  it('supports a caller-supplied fallback', async () => {
    const response = await createApp({ fallback: 'direct' }).request('/');

    expect(await response.text()).toBe('direct');
  });
});
