import { describe, expect, it } from 'vitest';
import { extractArticleHeadings } from './headings';

describe('article heading extraction', () => {
  it('creates hierarchical unique anchors for repeated markdown headings', () => {
    expect(extractArticleHeadings('# 开始\n\n## 细节\n\n## 细节')).toEqual([
      { id: '开始', level: 2, title: '开始' },
      { id: '细节', level: 3, title: '细节' },
      { id: '细节-2', level: 3, title: '细节' }
    ]);
  });
});
