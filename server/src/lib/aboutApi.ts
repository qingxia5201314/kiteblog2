import { AboutProfile } from './about';
import { apiFetch } from './apiClient';

const RESPONSE_ERROR = '个人资料响应格式异常，请稍后重试';
const NETWORK_ERROR = '无法连接个人资料服务，请检查网络后重试';
const REQUEST_ERROR = '获取个人资料失败，请稍后重试';

function isAboutProfile(value: unknown): value is AboutProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<AboutProfile>;
  return (
    typeof profile.avatarUrl === 'string' &&
    typeof profile.displayName === 'string' &&
    Array.isArray(profile.identityTags) &&
    profile.identityTags.every((tag) => typeof tag === 'string') &&
    typeof profile.intro === 'string' &&
    typeof profile.githubUrl === 'string' &&
    typeof profile.content === 'string' &&
    typeof profile.updatedAt === 'string'
  );
}

async function parseProfileResponse(response: Response): Promise<AboutProfile> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok ? RESPONSE_ERROR : REQUEST_ERROR);
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? (payload as { message?: unknown }).message
      : undefined;
    throw new Error(typeof message === 'string' && message.trim() ? message : REQUEST_ERROR);
  }

  const profile = payload && typeof payload === 'object' && 'profile' in payload
    ? (payload as { profile?: unknown }).profile
    : undefined;
  if (!isAboutProfile(profile)) throw new Error(RESPONSE_ERROR);
  return profile;
}

async function requestProfile(input: RequestInfo | URL, init?: RequestInit): Promise<AboutProfile> {
  try {
    return await parseProfileResponse(await apiFetch(input, init));
  } catch (error) {
    if (error instanceof TypeError) throw new Error(NETWORK_ERROR);
    throw error;
  }
}

export function getAboutProfile(signal?: AbortSignal): Promise<AboutProfile> {
  return requestProfile('/api/about', signal ? { cache: 'no-cache', signal } : { cache: 'no-cache' });
}

export function getAdminAboutProfile(): Promise<AboutProfile> {
  return requestProfile('/api/admin/about', {
    cache: 'no-cache'
  });
}

export function updateAboutProfile(profile: AboutProfile): Promise<AboutProfile> {
  return requestProfile('/api/admin/about', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile)
  });
}
