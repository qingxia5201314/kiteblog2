import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPostStore } from '../postStore.mjs';
import { createPostQueryService, parsePublicPostQuery } from './postQueryService.mjs';

let db;
let store;
let service;

async function addPost({ publishedAt, ...draft }) {
  const post = store.create({
    title: draft.title,
    summary: draft.summary ?? 'summary',
    category: draft.category ?? 'life',
    tags: draft.tags ?? [],
    content: draft.content ?? 'content',
    status: draft.status ?? 'published',
    cover: draft.category ?? 'life',
    coverImage: ''
  });
  db.run('UPDATE posts SET published_at = ?, updated_at = ? WHERE id = ?', [publishedAt, publishedAt, post.id]);
  return post;
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  store = await createPostStore({ database: { db, persist() {} } });
  db.run('DELETE FROM posts');
  service = createPostQueryService({ store, now: () => new Date('2026-07-11T12:00:00.000Z') });
});

describe('parsePublicPostQuery', () => {
  it('normalizes defaults, comma-separated tags, and bounded filters', () => {
    expect(parsePublicPostQuery(new URLSearchParams())).toMatchObject({
      limit: 8,
      q: '',
      tags: [],
      category: 'all',
      date: 'all',
      cursor: null
    });
    expect(parsePublicPostQuery(new URLSearchParams('limit=24&q= React &tags=One,two&tags=THREE'))).toMatchObject({
      limit: 24,
      q: 'React',
      tags: ['One', 'two', 'THREE']
    });
  });

  it.each([
    ['limit=0'],
    ['limit=25'],
    [`q=${'x'.repeat(121)}`],
    ['tags=1,2,3,4,5,6,7,8,9,10,11'],
    ['category=invalid'],
    ['date=week'],
    ['cursor=not-a-valid-cursor']
  ])('rejects invalid public query %s', (query) => {
    expect(() => parsePublicPostQuery(new URLSearchParams(query))).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it.each([
    { query: `tags=${'x'.repeat(65)}`, label: 'a tag longer than 64 characters' },
    {
      query: `tags=${Array.from({ length: 6 }, (_, index) => `${index}${'x'.repeat(53)}`).join(',')}`,
      label: 'more than 320 tag characters'
    },
    {
      query: `cursor=${encodeURIComponent(`${Buffer.from(JSON.stringify({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'post' })).toString('base64url')}${' '.repeat(513)}`)}`,
      label: 'a cursor longer than 512 encoded characters'
    },
    {
      query: `cursor=${Buffer.from(JSON.stringify({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'x'.repeat(129) })).toString('base64url')}`,
      label: 'a cursor id longer than 128 characters'
    }
  ])('rejects $label', ({ query }) => {
    expect(() => parsePublicPostQuery(new URLSearchParams(query))).toThrowError(expect.objectContaining({ status: 400 }));
  });
});

describe('public post query', () => {
  it('uses an opaque stable cursor without duplicates and returns compact published rows', async () => {
    await addPost({ title: 'First', publishedAt: '2026-07-10T00:00:00.000Z', content: 'one two three' });
    await addPost({ title: 'Second', publishedAt: '2026-07-09T00:00:00.000Z' });
    await addPost({ title: 'Third', publishedAt: '2026-07-08T00:00:00.000Z' });
    await addPost({ title: 'Draft', publishedAt: '2026-07-11T00:00:00.000Z', status: 'draft' });

    const firstPage = service.query(new URLSearchParams('limit=2'));
    const secondPage = service.query(new URLSearchParams(`limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`));

    expect(firstPage).toMatchObject({ hasMore: true, total: 3 });
    expect(firstPage.posts.map((post) => post.title)).toEqual(['First', 'Second']);
    expect(secondPage.posts.map((post) => post.title)).toEqual(['Third']);
    expect(secondPage).toMatchObject({ nextCursor: null, hasMore: false, total: 3 });
    expect(new Set([...firstPage.posts, ...secondPage.posts].map((post) => post.id)).size).toBe(3);
    expect(firstPage.posts[0]).not.toHaveProperty('content');
    expect(firstPage.posts[0]).toMatchObject({ publishedAt: '2026-07-10T00:00:00.000Z', readingMinutes: 1 });
  });

  it('applies category, current-year date, and case-insensitive exact multi-tag AND filters', async () => {
    await addPost({
      title: 'Matching',
      category: 'study',
      tags: ['React', 'Security'],
      publishedAt: '2026-02-01T00:00:00.000Z'
    });
    await addPost({ title: 'Missing tag', category: 'study', tags: ['React'], publishedAt: '2026-03-01T00:00:00.000Z' });
    await addPost({
      title: 'Substring tag',
      category: 'study',
      tags: ['Reactive', 'Security'],
      publishedAt: '2026-04-01T00:00:00.000Z'
    });
    await addPost({
      title: 'Last year',
      category: 'study',
      tags: ['React', 'Security'],
      publishedAt: '2025-12-31T23:59:59.000Z'
    });

    const result = service.query(new URLSearchParams('category=study&date=year&tags=react,SECURITY'));

    expect(result.posts.map((post) => post.title)).toEqual(['Matching']);
    expect(result.total).toBe(1);
  });

  it('orders search by weighted field score, then publish time, and escapes LIKE wildcards', async () => {
    await addPost({ title: 'notes title', category: 'life', publishedAt: '2026-01-01T00:00:00.000Z' });
    await addPost({ title: 'Tag hit', tags: ['NOTES'], category: 'life', publishedAt: '2026-02-01T00:00:00.000Z' });
    await addPost({ title: 'Category hit', category: 'notes', publishedAt: '2026-03-01T00:00:00.000Z' });
    await addPost({ title: 'Summary hit', summary: 'contains notes', category: 'life', publishedAt: '2026-04-01T00:00:00.000Z' });
    await addPost({ title: 'Body hit', content: 'contains notes', category: 'life', publishedAt: '2026-05-01T00:00:00.000Z' });
    await addPost({ title: 'Literal %_ marker', category: 'life', publishedAt: '2026-06-01T00:00:00.000Z' });
    await addPost({ title: 'Would match wildcard', category: 'life', publishedAt: '2026-07-01T00:00:00.000Z' });

    const weighted = service.query(new URLSearchParams('q=NoTeS'));
    const escaped = service.query(new URLSearchParams('q=%25_'));

    expect(weighted.posts.map((post) => post.title)).toEqual([
      'notes title',
      'Category hit',
      'Tag hit',
      'Summary hit',
      'Body hit'
    ]);
    expect(escaped.posts.map((post) => post.title)).toEqual(['Literal %_ marker']);
  });

  it('keeps relevance pagination stable by carrying score, publish time, and id in the cursor', async () => {
    await addPost({ title: 'match alpha', publishedAt: '2026-07-10T00:00:00.000Z' });
    await addPost({ title: 'match beta', publishedAt: '2026-07-09T00:00:00.000Z' });
    await addPost({ title: 'Other', summary: 'match', publishedAt: '2026-07-11T00:00:00.000Z' });

    const firstPage = service.query(new URLSearchParams('q=match&limit=1'));
    const cursorPayload = JSON.parse(Buffer.from(firstPage.nextCursor, 'base64url').toString('utf8'));
    const secondPage = service.query(
      new URLSearchParams(`q=match&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`)
    );

    expect(cursorPayload).toEqual(expect.objectContaining({ score: 5, publishedAt: expect.any(String), id: expect.any(String) }));
    expect(secondPage.posts[0].title).toBe('match beta');
  });

  it('scores a non-empty search page once while returning the full total', async () => {
    await addPost({ title: 'match alpha', publishedAt: '2026-07-10T00:00:00.000Z' });
    await addPost({ title: 'match beta', publishedAt: '2026-07-09T00:00:00.000Z' });
    const originalExec = db.exec.bind(db);
    let scoringScans = 0;
    db.exec = (sql, params) => {
      if (sql.includes(' AS score')) scoringScans += 1;
      return originalExec(sql, params);
    };

    const result = service.query(new URLSearchParams('q=match&limit=1'));

    expect(result).toMatchObject({ total: 2, hasMore: true });
    expect(scoringScans).toBe(1);
  });

  it('uses a fallback count only when a search cursor produces an empty page', async () => {
    const post = await addPost({ title: 'match alpha', publishedAt: '2026-07-10T00:00:00.000Z' });
    const cursor = Buffer.from(JSON.stringify({
      score: 5,
      publishedAt: '2026-07-10T00:00:00.000Z',
      id: post.id
    })).toString('base64url');
    const originalExec = db.exec.bind(db);
    let scoringScans = 0;
    db.exec = (sql, params) => {
      if (sql.includes(' AS score')) scoringScans += 1;
      return originalExec(sql, params);
    };

    const result = service.query(new URLSearchParams(`q=match&limit=1&cursor=${cursor}`));

    expect(result).toMatchObject({ posts: [], total: 1, hasMore: false });
    expect(scoringScans).toBe(2);
  });
});
