import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../lib/blog';
import { AppProvider, useApp } from './AppContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  restoreUserSessionRequest: vi.fn<() => Promise<UserSession | null>>(),
  logoutUserRequest: vi.fn<() => Promise<void>>()
}));

vi.mock('../lib/apiClient', () => ({
  AUTH_EXPIRED_EVENT: 'kitepop:auth-expired',
  restoreUserSessionRequest: apiMocks.restoreUserSessionRequest,
  logoutUserRequest: apiMocks.logoutUserRequest
}));

const readerSession: UserSession = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'reader-1',
    username: 'reader',
    nickname: 'Reader',
    permission: 'reader',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  }
};

const adminSession: UserSession = {
  expiresAt: '2099-02-01T00:00:00.000Z',
  user: { ...readerSession.user, id: 'admin-1', username: 'admin', nickname: 'Admin', permission: 'admin' }
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

describe('AppProvider auth lifecycle', () => {
  let root: Root;
  let host: HTMLDivElement;
  let app: ReturnType<typeof useApp>;

  function Probe() {
    app = useApp();
    return <output>{`${app.authReady}:${app.userSession?.user.username ?? 'anonymous'}`}</output>;
  }

  async function renderProvider() {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <AppProvider>
          <Probe />
        </AppProvider>
      );
    });
  }

  beforeEach(() => {
    apiMocks.restoreUserSessionRequest.mockReset();
    apiMocks.logoutUserRequest.mockReset();
    apiMocks.logoutUserRequest.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  it('does not let a late initial anonymous restore clear a newer login', async () => {
    const initialRestore = deferred<UserSession | null>();
    apiMocks.restoreUserSessionRequest.mockReturnValueOnce(initialRestore.promise);
    await renderProvider();

    act(() => app.loginUser(adminSession));
    await act(async () => initialRestore.resolve(null));

    expect(app.authReady).toBe(true);
    expect(app.userSession).toEqual(adminSession);
  });

  it('revalidates an auth-expired event and keeps the current cookie identity when it is valid', async () => {
    apiMocks.restoreUserSessionRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(adminSession);
    await renderProvider();
    act(() => app.loginUser(adminSession));

    await act(async () => {
      window.dispatchEvent(new Event('kitepop:auth-expired'));
      await Promise.resolve();
    });

    expect(apiMocks.restoreUserSessionRequest).toHaveBeenCalledTimes(2);
    expect(app.userSession).toEqual(adminSession);
  });

  it('clears the current identity only after silent revalidation confirms it is invalid', async () => {
    apiMocks.restoreUserSessionRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await renderProvider();
    act(() => app.loginUser(readerSession));

    await act(async () => {
      window.dispatchEvent(new Event('kitepop:auth-expired'));
      await Promise.resolve();
    });

    expect(apiMocks.restoreUserSessionRequest).toHaveBeenCalledTimes(2);
    expect(app.userSession).toBeNull();
  });

  it('ignores a stale auth revalidation result after a newer login', async () => {
    const revalidation = deferred<UserSession | null>();
    apiMocks.restoreUserSessionRequest
      .mockResolvedValueOnce(readerSession)
      .mockReturnValueOnce(revalidation.promise);
    await renderProvider();

    act(() => window.dispatchEvent(new Event('kitepop:auth-expired')));
    act(() => app.loginUser(adminSession));
    await act(async () => revalidation.resolve(null));

    expect(app.userSession).toEqual(adminSession);
  });

  it('does not let an initial restore revive a session after revalidation confirmed expiry', async () => {
    const initialRestore = deferred<UserSession | null>();
    apiMocks.restoreUserSessionRequest
      .mockReturnValueOnce(initialRestore.promise)
      .mockResolvedValueOnce(null);
    await renderProvider();

    await act(async () => {
      window.dispatchEvent(new Event('kitepop:auth-expired'));
      await Promise.resolve();
    });
    expect(app.userSession).toBeNull();

    await act(async () => initialRestore.resolve(readerSession));
    expect(app.userSession).toBeNull();
  });

  it('coalesces concurrent logout calls and does not clear a login that happens before completion', async () => {
    const logout = deferred<void>();
    apiMocks.restoreUserSessionRequest.mockResolvedValueOnce(readerSession);
    apiMocks.logoutUserRequest.mockReturnValueOnce(logout.promise);
    await renderProvider();

    let firstLogout!: Promise<void>;
    let secondLogout!: Promise<void>;
    act(() => {
      firstLogout = app.logoutUser();
      secondLogout = app.logoutUser();
    });
    expect(secondLogout).toBe(firstLogout);
    expect(apiMocks.logoutUserRequest).toHaveBeenCalledOnce();

    act(() => app.loginUser(adminSession));
    await act(async () => logout.resolve());
    await expect(firstLogout).resolves.toBeUndefined();
    expect(app.userSession).toEqual(adminSession);
  });

  it('ignores auth-expired events while logout is pending so an old session cannot win', async () => {
    const logout = deferred<void>();
    apiMocks.restoreUserSessionRequest
      .mockResolvedValueOnce(readerSession)
      .mockResolvedValueOnce(readerSession);
    apiMocks.logoutUserRequest.mockReturnValueOnce(logout.promise);
    await renderProvider();

    let pendingLogout!: Promise<void>;
    act(() => {
      pendingLogout = app.logoutUser();
    });
    await act(async () => {
      window.dispatchEvent(new Event('kitepop:auth-expired'));
      await Promise.resolve();
    });
    await act(async () => logout.resolve());
    await expect(pendingLogout).resolves.toBeUndefined();

    expect(app.userSession).toBeNull();
    expect(apiMocks.restoreUserSessionRequest).toHaveBeenCalledOnce();
  });

  it('clears the initiating identity after a failed logout and allows a later retry', async () => {
    apiMocks.restoreUserSessionRequest.mockResolvedValueOnce(readerSession);
    apiMocks.logoutUserRequest.mockRejectedValueOnce(new Error('network unavailable'));
    await renderProvider();

    let failedLogout!: Promise<void>;
    act(() => {
      failedLogout = app.logoutUser();
    });
    await act(async () => {
      await expect(failedLogout).rejects.toThrow('network unavailable');
    });
    expect(app.userSession).toBeNull();

    apiMocks.logoutUserRequest.mockResolvedValueOnce(undefined);
    let retry!: Promise<void>;
    act(() => {
      retry = app.logoutUser();
    });
    await act(async () => retry);
    expect(apiMocks.logoutUserRequest).toHaveBeenCalledTimes(2);
  });
});
