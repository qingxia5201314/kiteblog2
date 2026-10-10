import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostStore } from '../postStore.mjs';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createDraftService } from './draftService.mjs';
import { createPostService } from './postService.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-draft-service-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

const draft = {
  title: '数据库草稿', summary: '自动保存', category: 'notes', tags: ['draft'],
  content: '# 正文', status: 'draft', cover: 'notes', coverImage: ''
};

describe('draft service', () => {
  it('creates and binds a draft post on the first non-empty autosave without creating a revision', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const postStore = await createPostStore({ database });
    const revisionService = { snapshot: vi.fn() };
    const service = createDraftService({ postStore, revisionService });

    const saved = service.save({ editingId: null, draft });

    expect(saved.editingId).toBeTruthy();
    expect(postStore.get(saved.editingId)).toMatchObject({ title: draft.title, status: 'draft' });
    expect(revisionService.snapshot).not.toHaveBeenCalled();
  });

  it('updates an existing draft but never overwrites a published article during autosave', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const postStore = await createPostStore({ database });
    const service = createDraftService({ postStore });
    const editable = postStore.create(draft);
    const published = postStore.create({ ...draft, title: 'Published', status: 'published' });

    service.save({ editingId: editable.id, draft: { ...draft, title: 'Updated draft' } });
    service.save({ editingId: published.id, draft: { ...draft, title: 'Must not replace published' } });

    expect(postStore.get(editable.id)?.title).toBe('Updated draft');
    expect(postStore.get(published.id)?.title).toBe('Published');
    expect(service.get()?.draft.title).toBe('Must not replace published');
  });

  it('publishes an autosaved draft by updating the same post', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const postStore = await createPostStore({ database });
    const draftService = createDraftService({ postStore });
    const postService = createPostService({ store: postStore });

    const snapshot = draftService.save({ editingId: null, draft });
    const published = postService.updatePost(snapshot.editingId, { ...draft, status: 'published' });

    expect(published).toMatchObject({ id: snapshot.editingId, status: 'published', title: draft.title });
    expect(postStore.list({ includeDrafts: true }).filter((post) => post.title === draft.title)).toHaveLength(1);
  });

  it('persists across restart and only offers recovery for newer content that differs from the post', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const database = await createSqliteDatabase({ dbPath });
    const postStore = await createPostStore({ database });
    const service = createDraftService({ postStore });
    const post = postStore.create(draft);
    service.save({ editingId: post.id, draft: { ...draft, content: 'newer snapshot' } });

    const restartedStore = await createPostStore({ dbPath });
    const restarted = createDraftService({ postStore: restartedStore });

    expect(restarted.get()?.draft.content).toBe('newer snapshot');
    expect(restarted.getRecovery(post.id)).toBeNull();

    const published = restartedStore.create({ ...draft, title: 'Published', status: 'published' });
    const saved = restarted.save({ editingId: published.id, draft: { ...draft, title: 'Edited published copy', status: 'published' } });
    expect(restarted.getRecovery(published.id)?.updatedAt).toBe(saved.updatedAt);
  });

  it('clears a discarded database draft', async () => {
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
    const postStore = await createPostStore({ database });
    const service = createDraftService({ postStore });
    service.save({ editingId: null, draft });

    expect(service.discard()).toBe(true);
    expect(service.get()).toBeNull();
  });
});
