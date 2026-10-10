import { describe, expect, it, vi } from 'vitest';
import { createPostService } from './postService.mjs';

function makePost(status = 'draft') {
  return {
    id: 'post-1', slug: 'post-1', title: 'Title', summary: '', category: 'notes', tags: [],
    content: 'Body', status, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    publishedAt: status === 'published' ? '2026-07-01T00:00:00.000Z' : '', cover: 'notes', coverImage: ''
  };
}

describe('post service revision integration', () => {
  it('records create, manual save, publish, and withdraw exactly once', () => {
    let current = makePost('draft');
    const store = {
      list: () => [current],
      get: () => current,
      create: vi.fn(() => current),
      update: vi.fn((_id, patch) => {
        current = { ...current, ...patch };
        return current;
      })
    };
    const revisionService = { snapshot: vi.fn() };
    const service = createPostService({ store, revisionService });

    service.createPost(current, { editorUserId: 'admin' });
    service.updatePost(current.id, { title: 'Edited' }, { editorUserId: 'admin' });
    service.updatePost(current.id, { status: 'published' }, { editorUserId: 'admin' });
    service.updatePost(current.id, { status: 'draft' }, { editorUserId: 'admin' });

    expect(revisionService.snapshot.mock.calls.map(([, metadata]) => metadata.source)).toEqual([
      'create', 'manual-save', 'publish', 'withdraw'
    ]);
    expect(revisionService.snapshot).toHaveBeenCalledTimes(4);
    expect(revisionService.snapshot.mock.calls[2][1].isProtected).toBe(true);
    expect(revisionService.snapshot.mock.calls[3][1].isProtected).toBe(true);
  });
});
