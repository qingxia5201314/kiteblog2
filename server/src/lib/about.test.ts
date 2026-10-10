import { describe, expect, it } from 'vitest';
import { EMPTY_ABOUT_PROFILE, emptyAboutProfile } from './about';

describe('about profile empty values', () => {
  it('keeps the shared constant deeply frozen while returning independent mutable drafts', () => {
    const first = emptyAboutProfile();
    const second = emptyAboutProfile();

    expect(Object.isFrozen(EMPTY_ABOUT_PROFILE)).toBe(true);
    expect(Object.isFrozen(EMPTY_ABOUT_PROFILE.identityTags)).toBe(true);
    expect(first.identityTags).not.toBe(second.identityTags);

    first.identityTags.push('写作者');
    expect(first.identityTags).toEqual(['写作者']);
    expect(second.identityTags).toEqual([]);
    expect(EMPTY_ABOUT_PROFILE.identityTags).toEqual([]);
  });
});
