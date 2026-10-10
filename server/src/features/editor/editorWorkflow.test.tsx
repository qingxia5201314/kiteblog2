import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionPanel } from './components/RevisionPanel';
import { PublishScheduleControl } from './components/PublishScheduleControl';
import {
  cancelSchedule,
  compareRevision,
  deleteRevision,
  listRevisions,
  restoreRevision,
  retrySchedule,
  schedulePost
} from './api/editorWorkflowApi';

describe('editor workflow components', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it('renders newest-first revision controls and gives every delete state a response', async () => {
    const onRemove = vi.fn();
    await act(async () => root.render(<RevisionPanel
      comparison={null} deletingRevisionId={null} error="" loading={false} onCloseComparison={vi.fn()} onCompare={vi.fn()}
      onRemove={onRemove} onRestore={vi.fn()}
      revisions={[
        { id: 'new', postId: 'p1', title: 'New', summary: '', content: '', category: 'notes', tags: [], cover: 'notes', coverImage: '', status: 'published', editorUserId: 'admin', source: 'publish', isProtected: true, createdAt: '2026-07-12T10:00:00Z' },
        { id: 'old', postId: 'p1', title: 'Old', summary: '', content: '', category: 'notes', tags: [], cover: 'notes', coverImage: '', status: 'draft', editorUserId: 'admin', source: 'manual-save', isProtected: false, createdAt: '2026-07-11T10:00:00Z' }
      ]}
    />));
    expect(Array.from(host.querySelectorAll('article strong')).map((node) => node.textContent)).toEqual(['发布', '手动保存']);
    const protectedAction = host.querySelector('button[aria-label="该版本受保护"]') as HTMLButtonElement;
    const deleteAction = host.querySelector('button[aria-label="删除版本 Old"]') as HTMLButtonElement;
    expect(protectedAction.textContent).toBe('受保护');
    await act(async () => protectedAction.click());
    await act(async () => deleteAction.click());
    expect(onRemove.mock.calls.map(([revision]) => revision.id)).toEqual(['new', 'old']);
  });

  it('shows scheduled status, failure retry, and cancellation controls', async () => {
    await act(async () => root.render(<PublishScheduleControl
      onCancel={vi.fn().mockResolvedValue(undefined)} onRetry={vi.fn().mockResolvedValue(undefined)} onSchedule={vi.fn().mockResolvedValue(undefined)}
      post={{ id: 'p1', slug: 'p1', title: 'P', summary: '', category: 'notes', tags: [], content: '', status: 'scheduled', createdAt: '', updatedAt: '', cover: 'notes', coverImage: '', scheduledAt: '2026-07-13T10:00:00Z', scheduleError: 'failed' }}
    />));
    expect(host.textContent).toContain('已计划');
    expect(host.textContent).toContain('发布失败：failed');
    expect(host.textContent).toContain('取消定时');
    expect(host.textContent).toContain('立即重试');
  });
});

describe('editor workflow API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses same-origin cookies for revision and scheduling requests', async () => {
    const post = {
      id: 'post-1', slug: 'post-1', title: 'Post', summary: '', category: 'notes', tags: [], content: '',
      status: 'draft', createdAt: '', updatedAt: '', cover: 'notes', coverImage: ''
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(Response.json({
      ok: true,
      post,
      revisions: [],
      current: post,
      revision: null,
      changes: []
    })));

    await listRevisions('post-1');
    await compareRevision('post-1', 'revision-1');
    await restoreRevision('post-1', 'revision-1');
    await deleteRevision('post-1', 'revision-1');
    await schedulePost('post-1', '2026-07-15T10:00:00.000Z');
    await cancelSchedule('post-1');
    await retrySchedule('post-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/posts/post-1/revisions', {
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/posts/post-1/revisions/revision-1/compare', {
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/admin/posts/post-1/revisions/revision-1/restore', {
      method: 'POST',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/admin/posts/post-1/revisions/revision-1', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/admin/posts/post-1/schedule', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-07-15T10:00:00.000Z' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/admin/posts/post-1/schedule', {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/admin/posts/post-1/schedule/retry', {
      method: 'POST',
      credentials: 'same-origin'
    });

    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Bearer');
  });
});
