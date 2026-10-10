import { beforeEach, describe, expect, it } from 'vitest';
import { createDraftAutosaveRepository } from './draftAutosave';

describe('draft autosave repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, loads, and clears an editor draft', () => {
    const repository = createDraftAutosaveRepository('kitepop-draft-test');
    const draft = {
      title: '自动保存测试',
      summary: '避免刷新丢内容',
      category: 'notes' as const,
      tags: ['草稿'],
      content: '正文',
      status: 'draft' as const,
      cover: 'notes' as const,
      coverImage: 'https://img.example.com/cover.png'
    };

    repository.save(draft, { editingId: 'post-1', updatedAt: '2026-07-12T00:00:00.000Z' });
    expect(repository.load()).toEqual(draft);
    expect(repository.loadEnvelope()).toEqual({
      schemaVersion: 1,
      editingId: 'post-1',
      updatedAt: '2026-07-12T00:00:00.000Z',
      draft
    });

    repository.clear();
    expect(repository.load()).toBeUndefined();
  });

  it('reads the legacy raw draft format as a versioned envelope', () => {
    const repository = createDraftAutosaveRepository('kitepop-legacy-draft');
    const draft = {
      title: '旧草稿', summary: '', category: 'life' as const, tags: [], content: 'legacy',
      status: 'draft' as const, cover: 'life' as const, coverImage: ''
    };
    localStorage.setItem('kitepop-legacy-draft', JSON.stringify(draft));

    expect(repository.loadEnvelope()).toMatchObject({ schemaVersion: 1, editingId: null, draft });
    expect(repository.loadEnvelope()?.updatedAt).toBeTruthy();
  });
});
