import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostStore } from '../postStore.mjs';
import { createRevisionStore } from '../revisionStore.mjs';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createPostRevisionService } from './postRevisionService.mjs';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-revision-service-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

async function createFixture() {
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  const postStore = await createPostStore({ database });
  const revisionStore = createRevisionStore({ database });
  const service = createPostRevisionService({ database, postStore, revisionStore });
  const post = postStore.create({
    title: 'Current title', summary: 'Current summary', category: 'notes', tags: ['current'],
    content: '# Current', status: 'published', cover: 'notes', coverImage: ''
  });
  return { database, postStore, revisionStore, service, post };
}

describe('post revision service', () => {
  it('creates snapshots and reports field-level comparison with the current post', async () => {
    const { postStore, service, post } = await createFixture();
    const revision = service.snapshot(post, { source: 'manual-save', editorUserId: 'admin' });
    postStore.update(post.id, { title: 'Changed title', tags: ['changed'] });

    const comparison = service.compare(post.id, revision.id);

    expect(comparison.changes.map((change) => change.field)).toEqual(expect.arrayContaining(['title', 'tags']));
    expect(comparison.revision.title).toBe('Current title');
    expect(comparison.current.title).toBe('Changed title');
  });

  it('backs up current content before restoring a historical snapshot as a draft', async () => {
    const { postStore, revisionStore, service, post } = await createFixture();
    const historical = service.snapshot(post, { source: 'manual-save', editorUserId: 'admin' });
    postStore.update(post.id, { title: 'Unsaved current title', content: '# New content' });

    const restored = service.restore(post.id, historical.id, { editorUserId: 'admin' });
    const revisions = revisionStore.list(post.id);

    expect(restored).toMatchObject({ title: 'Current title', content: '# Current', status: 'draft' });
    expect(revisions.some((revision) => revision.source === 'restore-backup' && revision.title === 'Unsaved current title' && revision.isProtected)).toBe(true);
    expect(revisions.some((revision) => revision.source === 'restore' && revision.title === 'Current title')).toBe(true);
  });

  it('rejects cross-post restore and protected revision deletion', async () => {
    const { postStore, service, post } = await createFixture();
    const other = postStore.create({
      title: 'Other', summary: '', category: 'life', tags: [], content: 'Other', status: 'draft', cover: 'life', coverImage: ''
    });
    const protectedRevision = service.snapshot(post, { source: 'publish', editorUserId: 'admin', isProtected: true });

    expect(() => service.restore(other.id, protectedRevision.id, { editorUserId: 'admin' })).toThrow('Revision does not belong to this post');
    expect(service.remove(protectedRevision.id)).toBe(false);
  });
});
