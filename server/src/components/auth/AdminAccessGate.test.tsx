import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../lib/blog';
import { AdminAccessGate } from './AdminAccessGate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const loginUser = vi.fn();
const logoutUser = vi.fn<() => Promise<void>>(async () => undefined);
const { loginUserRequest } = vi.hoisted(() => ({ loginUserRequest: vi.fn() }));
let gateState: {
  authReady: boolean;
  userSession: UserSession | null;
  isAdmin: boolean;
};

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ ...gateState, loginUser, logoutUser })
}));

vi.mock('../../lib/apiClient', () => ({ loginUserRequest }));

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
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { ...readerSession.user, id: 'admin-1', username: 'admin', permission: 'admin' }
};

const secondAdminSession: UserSession = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { ...adminSession.user, id: 'admin-2', username: 'second-admin', nickname: 'Second Admin' }
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

describe('AdminAccessGate', () => {
  const roots: Root[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  function renderGate(state: typeof gateState) {
    gateState = state;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    act(() => {
      root.render(
        <AdminAccessGate>
          <p>protected child</p>
        </AdminAccessGate>
      );
    });

    return host;
  }

  function fillInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('shows progress while the cookie identity is being restored', () => {
    const host = renderGate({ authReady: false, userSession: null, isAdmin: false });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('正在确认登录状态');
  });

  it('shows the login form to anonymous visitors', () => {
    const host = renderGate({ authReady: true, userSession: null, isAdmin: false });
    const loginButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '登录');
    expect(loginButton).toBeTruthy();
    expect(host.querySelector<HTMLInputElement>('input[name="username"]')?.autocomplete).toBe('username');
    expect(host.querySelector<HTMLInputElement>('input[name="username"]')?.required).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[name="password"]')?.autocomplete).toBe('current-password');
    expect(host.querySelector<HTMLInputElement>('input[name="password"]')?.type).toBe('password');
    expect(host.querySelector<HTMLInputElement>('input[name="password"]')?.required).toBe(true);
  });

  it('logs in with the entered credentials and hands the cookie session to the provider', async () => {
    loginUserRequest.mockResolvedValueOnce(adminSession);
    const host = renderGate({ authReady: true, userSession: null, isAdmin: false });
    const username = host.querySelector<HTMLInputElement>('input[name="username"]')!;
    const password = host.querySelector<HTMLInputElement>('input[name="password"]')!;
    fillInput(username, 'admin');
    fillInput(password, 'secret123');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(loginUserRequest).toHaveBeenCalledWith('admin', 'secret123');
    expect(loginUser).toHaveBeenCalledWith(adminSession);
    expect(password.value).toBe('');
  });

  it('denies readers without rendering protected content', () => {
    const host = renderGate({ authReady: true, userSession: readerSession, isAdmin: false });
    expect(host.textContent).toContain('当前账号没有管理员权限');
    expect(host.textContent).not.toContain('protected child');

    act(() => {
      Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '退出登录')?.click();
    });
    expect(logoutUser).toHaveBeenCalledOnce();
  });

  it('disables reader logout while pending and does not submit it twice', async () => {
    const logout = deferred<void>();
    logoutUser.mockReturnValueOnce(logout.promise);
    const host = renderGate({ authReady: true, userSession: readerSession, isAdmin: false });
    const button = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === '退出登录')!;

    act(() => {
      button.click();
      button.click();
    });
    expect(logoutUser).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);

    act(() => button.click());
    expect(logoutUser).toHaveBeenCalledOnce();

    await act(async () => logout.resolve());
    expect(button.disabled).toBe(false);
  });

  it('consumes a rejected reader logout and displays a generic error', async () => {
    logoutUser.mockRejectedValueOnce(new Error('network unavailable'));
    const host = renderGate({ authReady: true, userSession: readerSession, isAdmin: false });

    await act(async () => {
      Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '退出登录')?.click();
    });

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('退出登录失败，请重试');
    expect(logoutUser).toHaveBeenCalledOnce();
  });

  it('renders protected content for administrators', () => {
    const host = renderGate({ authReady: true, userSession: adminSession, isAdmin: true });
    expect(host.textContent).toContain('protected child');
  });

  it('remounts protected state when the active administrator identity changes', () => {
    let nextInstance = 0;
    function StatefulChild() {
      const [instance] = useState(() => ++nextInstance);
      return <output data-instance>{instance}</output>;
    }

    gateState = { authReady: true, userSession: adminSession, isAdmin: true };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<AdminAccessGate><StatefulChild /></AdminAccessGate>));
    expect(host.querySelector('[data-instance]')?.textContent).toBe('1');

    gateState = { authReady: true, userSession: secondAdminSession, isAdmin: true };
    act(() => root.render(<AdminAccessGate><StatefulChild /></AdminAccessGate>));

    expect(host.querySelector('[data-instance]')?.textContent).toBe('2');
  });
});
