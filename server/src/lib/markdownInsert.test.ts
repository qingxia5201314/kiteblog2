import { describe, expect, it } from 'vitest';
import { createMarkdownImageBlock, getFirstClipboardImage, insertAtSelection } from './markdownInsert';

describe('markdown insert helpers', () => {
  it('inserts markdown at the active selection', () => {
    expect(insertAtSelection('hello world', '![img](/api/images/raw/img-1)', 6, 11)).toEqual({
      value: 'hello ![img](/api/images/raw/img-1)',
      cursor: 35
    });
  });

  it('extracts the first image file from clipboard items', () => {
    const image = new File(['png'], 'pasted.png', { type: 'image/png' });
    const text = new File(['hello'], 'note.txt', { type: 'text/plain' });

    expect(getFirstClipboardImage([
      { kind: 'file', type: 'text/plain', getAsFile: () => text },
      { kind: 'file', type: 'image/png', getAsFile: () => image }
    ])).toBe(image);
  });

  it('formats inserted images as standalone markdown blocks', () => {
    expect(createMarkdownImageBlock('pasted.png', '/api/images/raw/img-1')).toBe(
      '\n\n![pasted.png](/api/images/raw/img-1)\n\n'
    );
  });
});
