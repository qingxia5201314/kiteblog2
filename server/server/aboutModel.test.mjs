import { describe, expect, it } from 'vitest'

import { emptyAboutProfile, normalizeAboutProfile } from './aboutModel.mjs'

describe('about profile contract', () => {
  it('provides an empty profile with stable fields', () => {
    expect(emptyAboutProfile()).toEqual({
      avatarUrl: '',
      displayName: '',
      identityTags: [],
      intro: '',
      githubUrl: '',
      content: '',
      updatedAt: '',
    })
  })

  it('normalizes whitespace, tags, and a GitHub profile URL', () => {
    expect(normalizeAboutProfile({
      avatarUrl: '  https://example.test/avatar.png  ',
      displayName: '  Kite  ',
      identityTags: [' Developer ', 'developer', ' Blogger ', 'BLOGGER'],
      intro: '  Hello there.  ',
      githubUrl: '  https://github.com/KitePPP/  ',
      content: '  keep markdown whitespace  ',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })).toEqual({
      avatarUrl: 'https://example.test/avatar.png',
      displayName: 'Kite',
      identityTags: ['Developer', 'Blogger'],
      intro: 'Hello there.',
      githubUrl: 'https://github.com/KitePPP',
      content: '  keep markdown whitespace  ',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })
  })

  it('requires a non-empty display name', () => {
    expect(() => normalizeAboutProfile({ displayName: '   ' })).toThrow('请填写名称')
  })

  it.each([null, 42, 'profile', [], new Date(0)])('safely rejects non-profile input %j', (input) => {
    expect(() => normalizeAboutProfile(input)).toThrow('请填写名称')
  })

  it.each([
    'http://github.com/KitePPP',
    'https://www.github.com/KitePPP',
    'https://github.com',
    'https://github.com//',
    'https://github.com///',
    'https://github.com/KitePPP/repos',
    'https://github.com/orgs/openai',
    'https://github.com:444/KitePPP',
    'https://github.com/-KitePPP',
    'https://github.com/KitePPP-',
    'https://github.com/Kite--PPP',
    `https://github.com/${'k'.repeat(40)}`,
    'https://user:pass@github.com/KitePPP',
    'https://example.com/KitePPP',
  ])('rejects non-profile GitHub URL %s', (githubUrl) => {
    expect(() => normalizeAboutProfile({ displayName: 'Kite', githubUrl }))
      .toThrow('请输入有效的 GitHub 个人主页链接')
  })

  it('accepts all field length and collection boundaries', () => {
    const identityTags = Array.from({ length: 8 }, (_, index) => `${index}`.repeat(30))
    const profile = normalizeAboutProfile({
      displayName: 'n'.repeat(80),
      identityTags,
      intro: 'i'.repeat(280),
      content: 'c'.repeat(100000),
    })

    expect(profile.displayName).toHaveLength(80)
    expect(profile.identityTags).toEqual(identityTags)
    expect(profile.intro).toHaveLength(280)
    expect(profile.content).toHaveLength(100000)
  })

  it('accepts a 39-character GitHub username with single hyphen separators', () => {
    const username = `${'a'.repeat(18)}-b-${'c'.repeat(18)}`
    expect(normalizeAboutProfile({
      displayName: 'Kite',
      githubUrl: `https://github.com/${username}/`,
    }).githubUrl).toBe(`https://github.com/${username}`)
  })

  it.each([
    ['displayName', { displayName: 'n'.repeat(81) }, '名称不能超过 80 个字符'],
    ['identityTags count', { displayName: 'Kite', identityTags: Array.from({ length: 9 }, (_, index) => String(index)) }, '身份标签不能超过 8 个'],
    ['identity tag length', { displayName: 'Kite', identityTags: ['t'.repeat(31)] }, '身份标签不能超过 30 个字符'],
    ['intro', { displayName: 'Kite', intro: 'i'.repeat(281) }, '简介不能超过 280 个字符'],
    ['content', { displayName: 'Kite', content: 'c'.repeat(100001) }, '内容不能超过 100000 个字符'],
  ])('rejects values beyond the %s boundary', (_field, input, message) => {
    expect(() => normalizeAboutProfile(input)).toThrow(message)
  })
})
