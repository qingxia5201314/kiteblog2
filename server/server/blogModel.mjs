import { randomUUID } from 'node:crypto';

const PINYIN_SEGMENTS = {
  服: 'fu',
  务: 'wu',
  端: 'duan',
  发: 'fa',
  布: 'bu',
  测: 'ce',
  试: 'shi',
  更: 'geng',
  新: 'xin',
  周: 'zhou',
  末: 'mo',
  生: 'sheng',
  活: 'huo',
  记: 'ji',
  录: 'lu',
  把: 'ba',
  节: 'jie',
  奏: 'zou',
  慢: 'man',
  下: 'xia',
  来: 'lai',
  挖: 'wa',
  掘: 'jue',
  案: 'an',
  例: 'li',
  一: 'yi',
  次: 'ci',
  越: 'yue',
  权: 'quan',
  风: 'feng',
  险: 'xian',
  复: 'fu',
  盘: 'pan',
  学: 'xue',
  习: 'xi',
  笔: 'bi',
  常: 'chang',
  用: 'yong',
  命: 'ming',
  令: 'ling',
  速: 'su',
  查: 'cha'
};

export function createSlug(title) {
  const slug = Array.from(title.trim().toLowerCase())
    .map((char) => {
      if (/[a-z0-9]/.test(char)) return char;
      if (PINYIN_SEGMENTS[char]) return `-${PINYIN_SEGMENTS[char]}-`;
      return '-';
    })
    .join('')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || `post-${Date.now()}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  return randomUUID();
}

export function sortPostsByDate(posts) {
  return [...posts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function calculateReadingMinutes(content) {
  const latinWords = content.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const cjkChars = content.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return Math.max(1, Math.ceil((latinWords + cjkChars / 2) / 220));
}

export function uniqueSlug(title, posts, currentId) {
  const base = createSlug(title);
  let slug = base;
  let index = 2;

  while (posts.some((post) => post.slug === slug && post.id !== currentId)) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}
