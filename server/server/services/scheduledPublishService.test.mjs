import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostStore } from '../postStore.mjs';
import { createRevisionStore } from '../revisionStore.mjs';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createPostRevisionService } from './postRevisionService.mjs';
import { createScheduledPublishService } from './scheduledPublishService.mjs';

let tempDir;
const now = new Date('2026-07-11T12:00:00.000Z');

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-scheduled-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

async function createFixture(dbPath = join(tempDir, 'blog.sqlite')) {
  const database = await createSqliteDatabase({ dbPath });
  const postStore = await createPostStore({ database });
  const revisionStore = createRevisionStore({ database });
  const revisionService = createPostRevisionService({ database, postStore, revisionStore });
  const service = createScheduledPublishService({ database, postStore, revisionService, now: () => now });
  const post = postStore.create({
    title: 'Scheduled post', summary: '', category: 'notes', tags: [], content: 'Body',
    status: 'draft', cover: 'notes', coverImage: ''
  });
  return { database, postStore, revisionStore, revisionService, service, post };
}

describe('scheduled publish service', () => {
  it('only schedules future timestamps and updates the existing schedule', async () => {
    const { post, service } = await createFixture();

    expect(() => service.schedule(post.id, '2026-07-11T11:59:00.000Z')).toThrow('future');
    const scheduled = service.schedule(post.id, '2026-07-11T13:00:00.000Z');
    const rescheduled = service.schedule(post.id, '2026-07-11T14:00:00.000Z');

    expect(scheduled.status).toBe('scheduled');
    expect(rescheduled.scheduledAt).toBe('2026-07-11T14:00:00.000Z');
    expect(service.listDue()).toEqual([]);
  });

  it('cancels a schedule back to draft', async () => {
    const { post, service } = await createFixture();
    service.schedule(post.id, '2026-07-11T13:00:00.000Z');

    const cancelled = service.cancel(post.id);

    expect(cancelled).toMatchObject({ status: 'draft', scheduledAt: '', scheduleError: '' });
  });

  it('publishes due posts once across repeated polling and records a protected pre-publish revision', async () => {
    const { post, postStore, revisionStore, service } = await createFixture();
    service.schedule(post.id, '2026-07-11T11:00:00.000Z', { allowPast: true });

    const first = service.runDue();
    const second = service.runDue();

    expect(first).toEqual({ published: [post.id], failed: [] });
    expect(second).toEqual({ published: [], failed: [] });
    expect(postStore.get(post.id)).toMatchObject({ status: 'published', publishedAt: now.toISOString(), scheduledAt: '' });
    expect(revisionStore.list(post.id).filter((revision) => revision.source === 'scheduled-publish')).toHaveLength(1);
    expect(revisionStore.list(post.id).find((revision) => revision.source === 'scheduled-publish')?.isProtected).toBe(true);
  });

  it('continues a persisted schedule after restart', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    const first = await createFixture(dbPath);
    first.service.schedule(first.post.id, '2026-07-11T11:00:00.000Z', { allowPast: true });

    const second = await createFixture(dbPath);
    second.service.runDue();

    expect(second.postStore.get(first.post.id)?.status).toBe('published');
  });

  it('records failures and supports a manual retry without duplicate publication', async () => {
    const { database, post, postStore, revisionService, service } = await createFixture();
    service.schedule(post.id, '2026-07-11T11:00:00.000Z', { allowPast: true });
    const brokenRevisionService = { ...revisionService, snapshot: vi.fn(() => { throw new Error('snapshot failed'); }) };
    const brokenService = createScheduledPublishService({ database, postStore, revisionService: brokenRevisionService, now: () => now });

    const failed = brokenService.runDue();
    const failedPost = postStore.get(post.id);
    const retried = service.retry(post.id);

    expect(failed.failed[0]).toMatchObject({ id: post.id, message: 'snapshot failed' });
    expect(failedPost?.scheduleError).toBe('snapshot failed');
    expect(postStore.get(post.id)?.scheduleError).toBe('');
    expect(retried.status).toBe('published');
    expect(service.retry(post.id).status).toBe('published');
  });
});
