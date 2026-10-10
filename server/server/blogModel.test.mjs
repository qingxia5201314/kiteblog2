import { describe, expect, it } from 'vitest';
import { calculateReadingMinutes } from './blogModel.mjs';

describe('calculateReadingMinutes', () => {
  it('uses the shared latin-word and CJK estimate with a one-minute minimum', () => {
    expect(calculateReadingMinutes('short text')).toBe(1);
    expect(calculateReadingMinutes(`${'word '.repeat(220)}中文`)).toBe(2);
  });
});
