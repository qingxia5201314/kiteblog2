import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticlePreviewPage } from './ArticlePreviewPage';

describe('article preview page', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the authenticated draft with the shared markdown article structure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ post: {
      id: 'post-1', slug: 'post-1', title: '预览标题', summary: '预览摘要', category: 'notes', tags: ['preview'],
      content: '# 章节\n\n公式 $x^2$', status: 'draft', createdAt: '', updatedAt: '', cover: 'notes', coverImage: ''
    } }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <MemoryRouter initialEntries={['/admin/preview/post-1']}>
        <Routes><Route element={<ArticlePreviewPage />} path="/admin/preview/:id" /></Routes>
      </MemoryRouter>
    ));
    await act(async () => Promise.resolve());

    expect(host.textContent).toContain('预览模式');
    expect(host.textContent).toContain('预览标题');
    expect(host.querySelector('.article-body h2#章节')).toBeTruthy();
    expect(host.querySelector('.katex')).toBeTruthy();
    expect(host.querySelector('a[href="/admin?edit=post-1"]')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/article-preview/post-1', expect.objectContaining({ credentials: 'same-origin' }));
    await act(async () => root.unmount());
    host.remove();
  });
});
