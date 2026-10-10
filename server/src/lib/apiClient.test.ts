import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_EXPIRED_EVENT,
  apiFetch,
  loginUserRequest,
  logoutUserRequest,
  restoreUserSessionRequest
} from './apiClient';

const sessionPayload = {
  ok: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'admin-1',
    username: 'admin',
    nickname: 'Admin',
    permission: 'admin' as const,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  }
};

describe('apiFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends same-origin credentials while preserving request options', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'));

    await apiFetch('/api/test', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ credentials: 'same-origin', method: 'POST' })
    );
  });

  it('announces an expired session after a 401 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);

    try {
      await apiFetch('/api/private');
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    }
  });

  it('logs in through the cookie session endpoint and parses the public session shape', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(sessionPayload));

    const session = await loginUserRequest('admin', 'secret123');

    expect(fetchMock).toHaveBeenCalledWith('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
      credentials: 'same-origin'
    });
    expect(session).toEqual({ expiresAt: sessionPayload.expiresAt, user: sessionPayload.user });
    expect(session).not.toHaveProperty('token');
  });

  it('restores a cookie session and treats an unauthorized response as anonymous', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json(sessionPayload))
      .mockResolvedValueOnce(Response.json({ ok: false }, { status: 401 }));

    await expect(restoreUserSessionRequest()).resolves.toEqual({
      expiresAt: sessionPayload.expiresAt,
      user: sessionPayload.user
    });
    await expect(restoreUserSessionRequest()).resolves.toBeNull();
  });

  it('does not broadcast auth expiry while silently restoring an anonymous cookie', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false }, { status: 401 }));
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);

    try {
      await expect(restoreUserSessionRequest()).resolves.toBeNull();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    }
  });

  it('logs out through the cookie session endpoint', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));

    await logoutUserRequest();

    expect(fetchMock).toHaveBeenCalledWith('/api/users/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
  });
});
