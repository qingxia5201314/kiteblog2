import { describe, expect, it } from 'vitest';
import { applyMarkdownIndent } from './markdownIndent';

describe('markdown indentation', () => {
  it('inserts two spaces at the caret without losing its position', () => {
    expect(applyMarkdownIndent('hello', 2, 2, false)).toEqual({
      value: 'he  llo',
      selectionStart: 4,
      selectionEnd: 4
    });
  });

  it('indents every selected line and preserves the selected block', () => {
    expect(applyMarkdownIndent('- one\n- two\nend', 0, 11, false)).toEqual({
      value: '  - one\n  - two\nend',
      selectionStart: 2,
      selectionEnd: 15
    });
  });

  it('outdents selected lines with Shift+Tab', () => {
    expect(applyMarkdownIndent('  - one\n  - two', 2, 15, true)).toEqual({
      value: '- one\n- two',
      selectionStart: 0,
      selectionEnd: 11
    });
  });

  it('outdents the current line when there is no selection', () => {
    expect(applyMarkdownIndent('before\n  nested', 11, 11, true)).toEqual({
      value: 'before\nnested',
      selectionStart: 9,
      selectionEnd: 9
    });
  });
});
