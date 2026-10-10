import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAboutProfile, getAdminAboutProfile, updateAboutProfile } from './aboutApi';

const profile = {
  avatarUrl: '/avatar.png',
  displayName: 'Kite',
  identityTags: ['安全研究', '写作者'],
  intro: '记录生活与技术。',
  githubUrl: 'https://github.com/kite',
  content: '# 关于我',
  updatedAt: '2026-07-12T00:00:00.000Z'
};

describe('about api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the public profile with revalidation enabled', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ profile })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAboutProfile()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith('/api/about', { cache: 'no-cache', credentials: 'same-origin' });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });

  it('passes an optional abort signal to public profile requests', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ profile }));
    vi.stubGlobal('fetch', fetchMock);

    await getAboutProfile(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/about', {
      cache: 'no-cache',
      credentials: 'same-origin',
      signal: controller.signal
    });
  });

  it('uses same-origin cookies for admin reads and JSON updates', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ profile })));
    vi.stubGlobal('fetch', fetchMock);

    await getAdminAboutProfile();
    await updateAboutProfile(profile);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/about', {
      cache: 'no-cache',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/about', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile)
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });

  it('surfaces a stable Chinese message from non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: '资料不存在' }, { status: 404 })));

    await expect(getAboutProfile()).rejects.toThrow('资料不存在');
  });

  it('turns invalid JSON and network failures into actionable Chinese errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    await expect(getAboutProfile()).rejects.toThrow('个人资料响应格式异常，请稍后重试');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getAboutProfile()).rejects.toThrow('无法连接个人资料服务，请检查网络后重试');
  });
});
