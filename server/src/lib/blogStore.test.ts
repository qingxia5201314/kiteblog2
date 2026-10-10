import { beforeEach, describe, expect, it } from 'vitest';
import { createBlogRepository } from './blogStore';

describe('blog repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds initial posts only once', () => {
    const repository = createBlogRepository('kitepop-test');

    const firstLoad = repository.list();
    repository.create({
      title: '新增文章',
      summary: '测试摘要',
      category: 'notes',
      tags: ['测试'],
      content: '测试正文',
      status: 'published',
      cover: 'notes'
    });

    const secondLoad = repository.list();

    expect(firstLoad.length).toBeGreaterThanOrEqual(4);
    expect(secondLoad.length).toBe(firstLoad.length + 1);
  });

  it('creates, updates, and deletes posts', () => {
    const repository = createBlogRepository('kitepop-test');
    const created = repository.create({
      title: '后台发布测试',
      summary: '从管理台发布',
      category: 'study',
      tags: ['后台'],
      content: '正文内容',
      status: 'draft',
      cover: 'study',
      coverImage: 'https://img.example.com/cover.png'
    });

    const updated = repository.update(created.id, {
      title: '后台发布测试更新',
      status: 'published'
    });

    expect(updated?.slug).toBe('hou-tai-fa-bu-ce-shi-geng-xin');
    expect(updated?.coverImage).toBe('https://img.example.com/cover.png');
    expect(repository.get(created.id)?.status).toBe('published');
    expect(repository.remove(created.id)).toBe(true);
    expect(repository.get(created.id)).toBeUndefined();
  });
});
