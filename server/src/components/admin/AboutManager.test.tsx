import { act, StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutManager } from './AboutManager';

const { getAdminAboutProfile, updateAboutProfile, uploadHostedImage } = vi.hoisted(() => ({
  getAdminAboutProfile: vi.fn(),
  updateAboutProfile: vi.fn(),
  uploadHostedImage: vi.fn()
}));

vi.mock('../../lib/aboutApi', () => ({ getAdminAboutProfile, updateAboutProfile }));
vi.mock('../../lib/imageApi', () => ({ uploadHostedImage }));

const profile = {
  avatarUrl: '/old.png',
  displayName: 'Kite',
  identityTags: ['安全研究', '写作者'],
  intro: '记录生活与技术。',
  githubUrl: 'https://github.com/kite',
  content: '# 关于我',
  updatedAt: '2026-07-12T00:00:00.000Z'
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AboutManager', () => {
  const roots: Root[] = [];
  const notify = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getAdminAboutProfile.mockReset();
    updateAboutProfile.mockReset();
    uploadHostedImage.mockReset();
    notify.mockReset();
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  function render(open = false, strict = false) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const rerender = (nextOpen: boolean) => act(() => {
      const manager = <AboutManager adminPanelOpen={nextOpen} notify={notify} onTogglePanel={vi.fn()} />;
      root.render(strict ? <StrictMode>{manager}</StrictMode> : manager);
    });
    rerender(open);
    return { host, rerender };
  }

  function input(host: HTMLElement, label: string) {
    return host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement;
  }

  function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    act(() => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('loads once per open cycle and refreshes from the server when reopened', async () => {
    getAdminAboutProfile
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({ ...profile, displayName: '重新打开后的资料', content: '# 新资料' });
    const { host, rerender } = render(false);
    expect(getAdminAboutProfile).not.toHaveBeenCalled();

    rerender(true);
    await flush();
    expect(getAdminAboutProfile).toHaveBeenCalledTimes(1);
    expect(input(host, '名称').value).toBe('Kite');
    expect(input(host, '身份标签').value).toBe('安全研究, 写作者');
    expect(input(host, 'Markdown 详细介绍').value).toBe('# 关于我');

    rerender(true);
    await flush();
    expect(getAdminAboutProfile).toHaveBeenCalledTimes(1);

    rerender(false);
    rerender(true);
    await flush();
    expect(getAdminAboutProfile).toHaveBeenCalledTimes(2);
    expect(input(host, '名称').value).toBe('重新打开后的资料');
    expect(input(host, 'Markdown 详细介绍').value).toBe('# 新资料');
  });

  it('does not duplicate the open-cycle request in StrictMode', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true, true);
    await flush();

    expect(getAdminAboutProfile).toHaveBeenCalledTimes(1);
    expect(input(host, '名称').value).toBe('Kite');
  });

  it('disables every editing control while loading and fills the form after the response', async () => {
    let resolveLoad!: (loaded: typeof profile) => void;
    getAdminAboutProfile.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    const { host } = render(true);

    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.admin-about-form input, .admin-about-form textarea'))
      .every((control) => control.disabled)).toBe(true);
    expect(Array.from(host.querySelectorAll<HTMLButtonElement>('.admin-about-form button'))
      .every((button) => button.disabled)).toBe(true);

    resolveLoad(profile);
    await flush();
    expect(input(host, '名称').value).toBe('Kite');
    expect(input(host, '名称').disabled).toBe(false);
    expect(Array.from(host.querySelectorAll<HTMLButtonElement>('.admin-about-markdown-tabs button'))
      .every((button) => !button.disabled)).toBe(true);
  });

  it('clears pending state immediately when the panel closes', async () => {
    let resolveLoad!: (loaded: typeof profile) => void;
    getAdminAboutProfile.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    const { host, rerender } = render(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载个人资料');

    rerender(false);

    expect(Array.from(host.querySelectorAll('[role="status"]')).some((item) => item.textContent?.includes('正在加载个人资料'))).toBe(false);
    expect(host.querySelector('form')).toBeFalsy();
    resolveLoad(profile);
    await flush();
    expect(host.querySelector('form')).toBeFalsy();
  });

  it('uploads a PNG into the preview without saving the profile', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    uploadHostedImage.mockResolvedValue({ path: '/images/new.png' });
    const { host } = render(true);
    await flush();

    const file = new File(['png'], 'avatar.png', { type: 'image/png' });
    const picker = input(host, '上传头像') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();

    expect(uploadHostedImage).toHaveBeenCalledWith(file);
    expect(host.querySelector<HTMLImageElement>('.admin-about-avatar-preview')?.src).toContain('/images/new.png');
    expect(updateAboutProfile).not.toHaveBeenCalled();
  });

  it('rejects non-images and keeps the previous avatar', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();

    const picker = input(host, '上传头像') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
    act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));

    expect(uploadHostedImage).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLImageElement>('.admin-about-avatar-preview')?.src).toContain('/old.png');
    expect(notify).toHaveBeenCalledWith('error', '请选择图片文件');
  });

  it('parses tags and saves the complete payload, then refreshes from the response', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    updateAboutProfile.mockResolvedValue({ ...profile, displayName: '服务端名称', identityTags: ['A', 'B', 'C'], updatedAt: 'new' });
    const { host } = render(true);
    await flush();

    change(input(host, '名称'), '新名称');
    change(input(host, '身份标签'), ' A， B\nA, C ');
    change(input(host, '简短介绍'), '新简介');
    change(input(host, 'GitHub 个人链接'), 'https://github.com/new-user');
    change(input(host, 'Markdown 详细介绍'), '## 新内容');
    const form = host.querySelector('form')!;
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await flush();

    expect(updateAboutProfile).toHaveBeenCalledWith({
      avatarUrl: '/old.png', displayName: '新名称', identityTags: ['A', 'B', 'C'], intro: '新简介',
      githubUrl: 'https://github.com/new-user', content: '## 新内容', updatedAt: '2026-07-12T00:00:00.000Z'
    });
    expect(input(host, '名称').value).toBe('服务端名称');
    expect(input(host, '身份标签').value).toBe('A, B, C');
    expect(notify).toHaveBeenCalledWith('success', '关于我资料已保存');
  });

  it('keeps all edits when saving fails and validates GitHub before sending', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    updateAboutProfile.mockRejectedValue(new Error('保存失败'));
    const { host } = render(true);
    await flush();

    change(input(host, 'Markdown 详细介绍'), '不会丢失的 Markdown');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(input(host, 'Markdown 详细介绍').value).toBe('不会丢失的 Markdown');
    expect(notify).toHaveBeenCalledWith('error', '保存失败');

    updateAboutProfile.mockClear();
    change(input(host, 'GitHub 个人链接'), 'https://github.com/user/repos');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(updateAboutProfile).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith('error', 'GitHub 链接必须是 https://github.com/{用户名}');
  });

  it('rejects a trimmed display name over 80 characters before saving', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, '名称'), ` ${'名'.repeat(81)} `);

    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(updateAboutProfile).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith('error', '名称不能超过 80 个字符');
  });

  it('shows display-name errors inline, focuses the field, and clears the error on edit', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, '名称'), '   ');

    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(host.querySelector('#admin-about-display-name-error[role="alert"]')?.textContent).toBe('请填写名称');
    expect(input(host, '名称').getAttribute('aria-describedby')).toBe('admin-about-display-name-error');
    expect(document.activeElement).toBe(input(host, '名称'));
    change(input(host, '名称'), '新名称');
    expect(host.querySelector('#admin-about-display-name-error')).toBeFalsy();
  });

  it.each([
    ['身份标签', 'A,B,C,D,E,F,G,H,I', '身份标签不能超过 8 个', 'admin-about-identity-tags-error'],
    ['身份标签', `${'长'.repeat(31)},正常`, '身份标签不能超过 30 个字符', 'admin-about-identity-tags-error'],
    ['简短介绍', '介'.repeat(281), '简介不能超过 280 个字符', 'admin-about-intro-error'],
    ['Markdown 详细介绍', '文'.repeat(100001), '内容不能超过 100000 个字符', 'admin-about-content-error'],
    ['GitHub 个人链接', 'https://github.com/user/repos', 'GitHub 链接必须是 https://github.com/{用户名}', 'admin-about-github-url-error']
  ])('validates %s inline and focuses its first invalid control', async (label, value, message, errorId) => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, label), value);

    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(updateAboutProfile).not.toHaveBeenCalled();
    expect(host.querySelector(`#${errorId}[role="alert"]`)?.textContent).toBe(message);
    expect(document.activeElement).toBe(input(host, label));
  });

  it('focuses the first invalid field when several fields are invalid', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, '名称'), '');
    change(input(host, '简短介绍'), '介'.repeat(281));

    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(document.activeElement).toBe(input(host, '名称'));
    expect(host.querySelector('#admin-about-intro-error')?.textContent).toBe('简介不能超过 280 个字符');
  });

  it('matches the server by trimming intro whitespace before the length limit', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    updateAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, '简短介绍'), `  ${'介'.repeat(280)}  `);

    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();

    expect(updateAboutProfile).toHaveBeenCalledTimes(1);
    expect(host.querySelector('#admin-about-intro-error')).toBeFalsy();
  });

  it('renders Markdown in the preview tab', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host } = render(true);
    await flush();
    change(input(host, 'Markdown 详细介绍'), '## 预览标题\n\n**粗体**');
    const preview = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '预览')!;
    act(() => preview.click());
    expect(host.querySelector('.admin-about-markdown-preview h3')?.textContent).toBe('预览标题');
    expect(host.querySelector('.admin-about-markdown-preview strong')?.textContent).toBe('粗体');
  });

  it('connects the collapsible panel and Markdown tabs with accessible semantics', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    const { host, rerender } = render(false);
    const toggle = host.querySelector('.admin-about-group .panel-heading button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('admin-about-panel');

    rerender(true);
    await flush();
    expect(host.querySelector('#admin-about-panel')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const tablist = host.querySelector('[role="tablist"]')!;
    const tabs = tablist.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-controls')).toBe('admin-about-markdown-edit-panel');
    expect(host.querySelector('#admin-about-markdown-edit-panel[role="tabpanel"]')?.getAttribute('aria-labelledby'))
      .toBe('admin-about-markdown-edit-tab');

    act(() => (tabs[1] as HTMLButtonElement).click());
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-controls')).toBe('admin-about-markdown-preview-panel');
    expect(host.querySelector('#admin-about-markdown-preview-panel[role="tabpanel"]')?.getAttribute('aria-labelledby'))
      .toBe('admin-about-markdown-preview-tab');
  });

  it('does not overwrite current input when loading fails', async () => {
    let reject!: (error: Error) => void;
    getAdminAboutProfile.mockReturnValue(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const { host } = render(true);
    change(input(host, '名称'), '正在输入');
    reject(new Error('加载失败'));
    await flush();
    expect(input(host, '名称').value).toBe('正在输入');
    expect(notify).toHaveBeenCalledWith('error', '加载失败');
  });

  it('ignores a late upload after closing and is usable when reopened', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    let resolveUpload!: (image: { path: string }) => void;
    uploadHostedImage.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const { host, rerender } = render(true);
    await flush();

    const picker = input(host, '上传头像') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['png'], 'avatar.png', { type: 'image/png' })] });
    act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));
    rerender(false);
    resolveUpload({ path: '/late.png' });
    await flush();
    rerender(true);
    await flush();

    expect((input(host, '上传头像') as HTMLInputElement).disabled).toBe(false);
    expect(host.querySelector<HTMLImageElement>('.admin-about-avatar-preview')?.src).toContain('/old.png');
  });

  it('keeps the full form and restores uploading after an upload failure', async () => {
    getAdminAboutProfile.mockResolvedValue(profile);
    uploadHostedImage.mockRejectedValue(new Error('图片服务失败'));
    const { host } = render(true);
    await flush();
    change(input(host, '名称'), '保留名称');
    change(input(host, 'Markdown 详细介绍'), '保留 Markdown');

    const picker = input(host, '上传头像') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['png'], 'avatar.png', { type: 'image/png' })] });
    act(() => picker.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();

    expect(host.querySelector<HTMLImageElement>('.admin-about-avatar-preview')?.src).toContain('/old.png');
    expect(input(host, '名称').value).toBe('保留名称');
    expect(input(host, 'Markdown 详细介绍').value).toBe('保留 Markdown');
    expect(picker.disabled).toBe(false);
    expect(notify).toHaveBeenLastCalledWith('error', '图片服务失败');
  });

});
