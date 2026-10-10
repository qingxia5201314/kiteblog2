import { describe, expect, it } from 'vitest';
import { formatTagInput, parseTagInput } from './tags';

describe('tag input helpers', () => {
  it('splits tags only by commas and keeps spaces inside a tag', () => {
    expect(parseTagInput('SRC case, 生活 记录，知识点')).toEqual(['SRC case', '生活 记录', '知识点']);
  });

  it('formats tags with Chinese commas for editing', () => {
    expect(formatTagInput(['SRC case', '生活 记录'])).toBe('SRC case，生活 记录');
  });
});
