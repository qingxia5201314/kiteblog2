import { calculateReadingMinutes } from '../blogModel.mjs';

const ALLOWED_CATEGORIES = new Set(['life', 'src', 'study', 'notes', 'all']);
const ALLOWED_DATES = new Set(['all', '7d', '30d', 'year']);

export class PublicPostQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublicPostQueryError';
    this.status = 400;
  }
}

function decodeCursor(value, search) {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const validBase =
      cursor &&
      typeof cursor === 'object' &&
      typeof cursor.publishedAt === 'string' &&
      !Number.isNaN(Date.parse(cursor.publishedAt)) &&
      typeof cursor.id === 'string' &&
      cursor.id.length > 0 &&
      cursor.id.length <= 128;
    const validScore = !search || (typeof cursor.score === 'number' && Number.isFinite(cursor.score));
    const validShape = search
      ? Object.keys(cursor).every((key) => ['score', 'publishedAt', 'id'].includes(key))
      : Object.keys(cursor).every((key) => ['publishedAt', 'id'].includes(key)) && !('score' in cursor);
    if (!validBase || !validScore || !validShape) throw new Error('Invalid cursor');
    return cursor;
  } catch {
    throw new PublicPostQueryError('Invalid cursor');
  }
}

function encodeCursor(post, search) {
  const cursor = search
    ? { score: post._score, publishedAt: post.publishedAt, id: post.id }
    : { publishedAt: post.publishedAt, id: post.id };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function toCompactPublicPost(post) {
  const { content = '', _score, ...compact } = post;
  return {
    ...compact,
    readingMinutes: post.readingMinutes ?? calculateReadingMinutes(content)
  };
}

export function parsePublicPostQuery(searchParams) {
  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null && !/^\d+$/.test(rawLimit)) {
    throw new PublicPostQueryError('Invalid limit');
  }
  const limit = rawLimit === null ? 8 : Number(rawLimit);
  if (limit < 1 || limit > 24) throw new PublicPostQueryError('Invalid limit');

  const rawQuery = searchParams.get('q') ?? '';
  if (rawQuery.length > 120) throw new PublicPostQueryError('Search query is too long');
  const q = rawQuery.trim();
  const tags = searchParams
    .getAll('tags')
    .flatMap((value) => value.split(','))
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 10) throw new PublicPostQueryError('Too many tags');
  if (tags.some((tag) => tag.length > 64)) throw new PublicPostQueryError('Tag is too long');
  if (tags.reduce((total, tag) => total + tag.length, 0) > 320) {
    throw new PublicPostQueryError('Tags are too long');
  }

  const category = searchParams.get('category') || 'all';
  if (!ALLOWED_CATEGORIES.has(category)) throw new PublicPostQueryError('Invalid category');
  const date = searchParams.get('date') || 'all';
  if (!ALLOWED_DATES.has(date)) throw new PublicPostQueryError('Invalid date');

  const rawCursor = searchParams.get('cursor');
  if (rawCursor && rawCursor.length > 512) throw new PublicPostQueryError('Cursor is too long');
  return {
    limit,
    q,
    tags,
    category,
    date,
    cursor: rawCursor ? decodeCursor(rawCursor, Boolean(q)) : null
  };
}

function dateFromFilter(date, now) {
  if (date === 'all') return null;
  const value = new Date(now);
  if (date === 'year') {
    return new Date(Date.UTC(value.getUTCFullYear(), 0, 1)).toISOString();
  }
  value.setUTCDate(value.getUTCDate() - (date === '7d' ? 7 : 30));
  return value.toISOString();
}

export function createPostQueryService({ store, now = () => new Date() }) {
  return {
    query(searchParams) {
      const query = parsePublicPostQuery(searchParams);
      const result = store.queryPublic({
        ...query,
        dateFrom: dateFromFilter(query.date, now()),
        limit: query.limit + 1
      });
      const hasMore = result.posts.length > query.limit;
      const pageRows = result.posts.slice(0, query.limit);
      const lastPost = pageRows.at(-1);

      return {
        posts: pageRows.map(toCompactPublicPost),
        nextCursor: hasMore && lastPost ? encodeCursor(lastPost, Boolean(query.q)) : null,
        hasMore,
        total: result.total
      };
    }
  };
}
