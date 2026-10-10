import type { BlogUser, UserSession } from './blog';

export const AUTH_EXPIRED_EVENT = 'kitepop:auth-expired';

export function broadcastAuthExpiry(): void {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function sameOriginRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
  shouldBroadcastAuthExpiry = true
): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: 'same-origin' });
  if (shouldBroadcastAuthExpiry && response.status === 401) {
    broadcastAuthExpiry();
  }
  return response;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return sameOriginRequest(input, init);
}

function isBlogUser(value: unknown): value is BlogUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.nickname === 'string' &&
    (user.permission === 'reader' || user.permission === 'admin') &&
    typeof user.createdAt === 'string' &&
    typeof user.updatedAt === 'string'
  );
}

async function parseSessionResponse(response: Response): Promise<UserSession> {
  if (!response.ok) throw new Error('Authentication request failed');

  const payload = (await response.json()) as Record<string, unknown>;
  if (typeof payload.expiresAt !== 'string' || !isBlogUser(payload.user)) {
    throw new Error('Authentication response was invalid');
  }

  return { expiresAt: payload.expiresAt, user: payload.user };
}

export async function loginUserRequest(username: string, password: string): Promise<UserSession> {
  return parseSessionResponse(
    await apiFetch('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
  );
}

export async function registerUserRequest(draft: {
  username: string;
  password: string;
  nickname: string;
}): Promise<UserSession> {
  return parseSessionResponse(
    await apiFetch('/api/users/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
  );
}

export async function restoreUserSessionRequest(): Promise<UserSession | null> {
  const response = await sameOriginRequest('/api/users/me', {}, false);
  if (response.status === 401) return null;
  return parseSessionResponse(response);
}

export async function getCurrentUserRequest(): Promise<UserSession> {
  return parseSessionResponse(await apiFetch('/api/users/me'));
}

export async function logoutUserRequest(): Promise<void> {
  const response = await apiFetch('/api/users/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Logout request failed');
}
