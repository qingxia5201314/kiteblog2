import { describe, expect, it } from 'vitest';
import {
  BLOG_CATEGORIES,
  BlogPost,
  calculateReadingMinutes,
  createSlug,
  filterPosts,
  getCategoryIcon,
  sortPostsByDate
} from './blog';

describe('blog helpers', () => {
  it('creates stable slugs from mixed Chinese and English titles', () => {
    expect(createSlug('SRC 挖掘案例：登录绕过复盘')).toBe('src-wa-jue-an-li-deng-lu-rao-guo-fu-pan');
    expect(createSlug('  React 19 学习笔记  ')).toBe('react-19-xue-xi-bi-ji');
  });

  it('calculates at least one minute of reading time', () => {
    expect(calculateReadingMinutes('短内容')).toBe(1);
    expect(calculateReadingMinutes('word '.repeat(1200))).toBe(6);
  });

  it('filters published posts by category and keyword', () => {
    const posts: BlogPost[] = [
      {
        id: '1',
        slug: 'life',
        title: '周末生活记录',
        summary: '散步和阅读',
        category: 'life' as const,
        tags: ['生活'],
        content: '今天去散步。',
        status: 'published' as const,
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
        cover: 'life'
      },
      {
        id: '2',
        slug: 'src',
        title: '支付逻辑复盘',
        summary: '越权风险',
        category: 'src' as const,
        tags: ['SRC'],
        content: '一次越权案例。',
        status: 'draft' as const,
        createdAt: '2026-06-02',
        updatedAt: '2026-06-02',
        cover: 'src'
      }
    ];

    expect(filterPosts(posts, { category: 'life' })).toHaveLength(1);
    expect(filterPosts(posts, { query: '越权', includeDrafts: true })).toHaveLength(1);
    expect(filterPosts(posts, { query: '越权' })).toHaveLength(0);
  });

  it('filters published posts by tag', () => {
    const posts: BlogPost[] = [
      {
        id: '1',
        slug: 'src-one',
        title: 'SRC case one',
        summary: 'published case',
        category: 'src' as const,
        tags: ['SRC', '越权'],
        content: 'published src case',
        status: 'published' as const,
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
        cover: 'src'
      },
      {
        id: '2',
        slug: 'src-two',
        title: 'SRC case two',
        summary: 'draft case',
        category: 'src' as const,
        tags: ['src'],
        content: 'draft src case',
        status: 'draft' as const,
        createdAt: '2026-06-02',
        updatedAt: '2026-06-02',
        cover: 'src'
      },
      {
        id: '3',
        slug: 'life',
        title: 'Life note',
        summary: 'other tag',
        category: 'life' as const,
        tags: ['生活'],
        content: 'life note',
        status: 'published' as const,
        createdAt: '2026-06-03',
        updatedAt: '2026-06-03',
        cover: 'life'
      }
    ];

    expect(filterPosts(posts, { tag: 'src' }).map((post) => post.id)).toEqual(['1']);
    expect(filterPosts(posts, { tag: 'src', includeDrafts: true }).map((post) => post.id)).toEqual(['2', '1']);
  });

  it('filters published posts by multiple selected tags', () => {
    const posts: BlogPost[] = [
      {
        id: '1',
        slug: 'src-auth',
        title: 'SRC auth case',
        summary: 'published case',
        category: 'src' as const,
        tags: ['SRC', 'Auth Bypass', '越权'],
        content: 'published src case',
        status: 'published' as const,
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
        cover: 'src'
      },
      {
        id: '2',
        slug: 'src-only',
        title: 'SRC only case',
        summary: 'published case',
        category: 'src' as const,
        tags: ['SRC'],
        content: 'published src case',
        status: 'published' as const,
        createdAt: '2026-06-02',
        updatedAt: '2026-06-02',
        cover: 'src'
      },
      {
        id: '3',
        slug: 'draft-auth',
        title: 'Draft auth case',
        summary: 'draft case',
        category: 'src' as const,
        tags: ['SRC', 'Auth Bypass'],
        content: 'draft src case',
        status: 'draft' as const,
        createdAt: '2026-06-03',
        updatedAt: '2026-06-03',
        cover: 'src'
      }
    ];

    expect(filterPosts(posts, { tags: ['src', 'auth bypass'] }).map((post) => post.id)).toEqual(['1']);
    expect(filterPosts(posts, { tags: ['src', 'auth bypass'], includeDrafts: true }).map((post) => post.id)).toEqual([
      '3',
      '1'
    ]);
  });

  it('sorts posts newest first and exposes four blog categories', () => {
    const posts = [
      { id: 'old', updatedAt: '2026-01-01' },
      { id: 'new', updatedAt: '2026-06-01' }
    ];

    expect(sortPostsByDate(posts)[0].id).toBe('new');
    expect(BLOG_CATEGORIES.map((category) => category.id)).toEqual(['life', 'src', 'study', 'notes']);
  });

  it('provides stable icons for article categories', () => {
    expect(BLOG_CATEGORIES.map((category) => getCategoryIcon(category.id))).toEqual(['sun', 'shield', 'book', 'hash']);
    expect(getCategoryIcon('life')).toBe('sun');
  });
});
