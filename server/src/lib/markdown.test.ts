import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('markdown parser', () => {
  it('parses headings, paragraphs, and blockquotes', () => {
    expect(parseMarkdown('# 标题\n\n> 引用\n\n正文')).toEqual([
      { type: 'heading', level: 1, text: '标题' },
      { type: 'blockquote', text: '引用' },
      { type: 'paragraph', text: '正文' }
    ]);
  });

  it('groups unordered and ordered lists', () => {
    expect(parseMarkdown('- A\n- B\n\n1. One\n2. Two')).toEqual([
      { type: 'list', ordered: false, items: ['A', 'B'] },
      { type: 'list', ordered: true, items: ['One', 'Two'] }
    ]);
  });

  it('keeps fenced code blocks as one markdown block', () => {
    expect(parseMarkdown('```bash\nnpm run build\nnpm test\n```')).toEqual([
      { type: 'code', language: 'bash', code: 'npm run build\nnpm test' }
    ]);
  });

  it('parses display math blocks without treating code formulas as math', () => {
    expect(parseMarkdown('$$\nE = mc^2\n$$')).toEqual([
      { type: 'math', formula: 'E = mc^2' }
    ]);

    expect(parseMarkdown('```text\n$notMath$\n```')).toEqual([
      { type: 'code', language: 'text', code: '$notMath$' }
    ]);
  });

  it('preserves an unclosed display math block as paragraph text', () => {
    expect(parseMarkdown('$$\nE = mc^2')).toEqual([
      { type: 'paragraph', text: '$$\nE = mc^2' }
    ]);
  });

  it('parses standalone markdown images', () => {
    expect(parseMarkdown('![封面](https://img.example.com/a.png)')).toEqual([
      { type: 'image', alt: '封面', url: 'https://img.example.com/a.png' }
    ]);
  });

  it('parses hosted image markdown paths', () => {
    expect(parseMarkdown('![pasted](/api/images/raw/img-1)')).toEqual([
      { type: 'image', alt: 'pasted', url: '/api/images/raw/img-1' }
    ]);
  });
});
