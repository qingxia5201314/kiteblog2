export type BlogCategoryId = 'life' | 'src' | 'study' | 'notes';

export type PostStatus = 'draft' | 'published' | 'withdrawn' | 'scheduled';

export type PostDateFilter = 'all' | '7d' | '30d' | 'year';

export type CoverTone = BlogCategoryId;

export interface BlogCategory {
  id: BlogCategoryId;
  name: string;
  description: string;
  accent: string;
}

export type CategoryIcon = 'sun' | 'shield' | 'book' | 'hash';

export const CATEGORY_ICONS: Record<BlogCategoryId, CategoryIcon> = {
  life: 'sun',
  src: 'shield',
  study: 'book',
  notes: 'hash'
};

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: BlogCategoryId;
  tags: string[];
  content: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  scheduledAt?: string;
  scheduleError?: string;
  cover: CoverTone;
  coverImage?: string;
}

export interface BlogPostSummary extends Omit<BlogPost, 'content'> {
  readingMinutes: number;
}

export interface PublicPostQuery {
  category: BlogCategoryId | 'all';
  date: PostDateFilter;
  q: string;
  tags: string[];
  cursor?: string | null;
  limit?: number;
}

export interface PublicPostPage {
  posts: BlogPostSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export type BlogPostDraft = Omit<BlogPost, 'id' | 'slug' | 'createdAt' | 'updatedAt'>;

export interface ArticleAutosaveDraft {
  editingId: string | null;
  draft: BlogPostDraft;
  updatedAt?: string;
}

export interface PostRevision {
  id: string;
  postId: string;
  title: string;
  summary: string;
  content: string;
  category: BlogCategoryId;
  tags: string[];
  cover: CoverTone;
  coverImage: string;
  status: PostStatus;
  editorUserId: string;
  source: string;
  isProtected: boolean;
  createdAt: string;
}

export interface PostRevisionComparison {
  current: BlogPost;
  revision: PostRevision;
  changes: Array<{ field: string; current: unknown; revision: unknown }>;
}

export interface PostComment {
  id: string;
  postId: string;
  userId?: string;
  nickname: string;
  role: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PostCommentDraft {
  content: string;
}

export interface BlogUser {
  id: string;
  username: string;
  nickname: string;
  permission: 'reader' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  expiresAt: string;
  user: BlogUser;
}

export interface PostFilter {
  category?: BlogCategoryId | 'all';
  query?: string;
  tag?: string;
  tags?: string[];
  includeDrafts?: boolean;
}

const PINYIN_SEGMENTS: Record<string, string> = {
  挖: 'wa',
  掘: 'jue',
  案: 'an',
  例: 'li',
  登: 'deng',
  录: 'lu',
  繞: 'rao',
  绕: 'rao',
  过: 'guo',
  復: 'fu',
  复: 'fu',
  盘: 'pan',
  学: 'xue',
  習: 'xi',
  习: 'xi',
  笔: 'bi',
  記: 'ji',
  记: 'ji',
  后: 'hou',
  台: 'tai',
  发: 'fa',
  布: 'bu',
  测: 'ce',
  试: 'shi',
  更: 'geng',
  新: 'xin',
  个: 'ge',
  人: 'ren',
  生: 'sheng',
  活: 'huo',
  专: 'zhuan',
  业: 'ye',
  知: 'zhi',
  识: 'shi',
  点: 'dian',
  整: 'zheng',
  理: 'li',
  周: 'zhou',
  末: 'mo',
  安: 'an',
  全: 'quan',
  研: 'yan',
  究: 'jiu',
  越: 'yue',
  权: 'quan',
  风: 'feng',
  险: 'xian'
};

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    id: 'life',
    name: '个人生活',
    description: '日常、旅行、阅读、运动和阶段性复盘',
    accent: '#2f7d67'
  },
  {
    id: 'src',
    name: 'SRC 挖掘案例',
    description: '漏洞挖掘思路、脱敏复盘和验证链路',
    accent: '#b6423c'
  },
  {
    id: 'study',
    name: '专业学习',
    description: '课程、书单、实验和工程能力提升记录',
    accent: '#4266b2'
  },
  {
    id: 'notes',
    name: '知识点记录',
    description: '碎片知识、命令速查、概念卡片和清单',
    accent: '#8a5a19'
  }
];

export const SAMPLE_POSTS: BlogPost[] = [
  {
    id: 'seed-life-1',
    slug: 'zhou-mo-sheng-huo-ji-lu',
    title: '周末生活记录：把节奏慢下来',
    summary: '一次普通周末的散步、读书和复盘，把生活从待办事项里拿回来。',
    category: 'life',
    tags: ['生活', '复盘', '阅读'],
    content: `## 今天的节奏

上午整理房间，下午出门走了一段路。没有特别宏大的事情，但能把状态记录下来，本身就是一种稳定。

## 记下来的小事

- 读完一本书的两个章节
- 重新整理了学习桌
- 晚上复盘了下周计划

生活内容不追求产出感，只记录真实的状态变化。`,
    status: 'published',
    createdAt: '2026-06-01',
    updatedAt: '2026-06-01',
    cover: 'life',
    coverImage: ''
  },
  {
    id: 'seed-src-1',
    slug: 'src-yue-quan-feng-xian-fu-pan',
    title: 'SRC 挖掘案例：一次越权风险复盘',
    summary: '从入口识别、权限边界、请求重放到报告撰写，记录一条脱敏验证链路。',
    category: 'src',
    tags: ['SRC', '越权', '复盘'],
    content: `## 背景

本记录只保留方法论，不包含真实目标、接口、参数和敏感响应。

## 验证链路

1. 识别用户可控资源 ID
2. 对比不同角色的响应差异
3. 复核服务端是否只依赖前端状态
4. 形成最小可复现证据

## 结论

好的案例记录要能复现思路，也要避免泄露真实业务细节。`,
    status: 'published',
    createdAt: '2026-06-03',
    updatedAt: '2026-06-03',
    cover: 'src',
    coverImage: ''
  },
  {
    id: 'seed-study-1',
    slug: 'react-19-xue-xi-bi-ji',
    title: 'React 19 学习笔记',
    summary: '记录组件拆分、状态边界和表单交互里的几个实践点。',
    category: 'study',
    tags: ['React', '前端', '学习'],
    content: `## 组件边界

页面组件负责组织流程，纯函数负责处理数据，表单组件只关心输入和提交。

## 复盘

学习笔记最好包含三个部分：遇到的问题、当时的判断、后续可复用的结论。`,
    status: 'published',
    createdAt: '2026-06-05',
    updatedAt: '2026-06-05',
    cover: 'study',
    coverImage: ''
  },
  {
    id: 'seed-notes-1',
    slug: 'chang-yong-ming-ling-su-cha',
    title: '常用命令速查',
    summary: '把常用开发、搜索、构建命令整理成可快速检索的知识卡片。',
    category: 'notes',
    tags: ['命令', '效率', '知识点'],
    content: `## 搜索

\`\`\`
rg "keyword" src
rg --files
\`\`\`

## 构建

\`\`\`
npm run build
npm test -- --run
\`\`\`

知识点记录要短、准、可再次使用。`,
    status: 'published',
    createdAt: '2026-06-07',
    updatedAt: '2026-06-07',
    cover: 'notes',
    coverImage: ''
  }
];

export function createSlug(title: string): string {
  const segments = Array.from(title.trim().toLowerCase()).map((char) => {
    if (/[a-z0-9]/.test(char)) return char;
    if (PINYIN_SEGMENTS[char]) return `-${PINYIN_SEGMENTS[char]}-`;
    if (/[\s:_：/\\|]+/.test(char)) return '-';
    return '-';
  });

  const slug = segments
    .join('')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || `post-${Date.now()}`;
}

export function calculateReadingMinutes(content: string): number {
  const latinWords = content.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const cjkChars = content.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const estimatedUnits = latinWords + cjkChars / 2;

  return Math.max(1, Math.ceil(estimatedUnits / 220));
}

export function sortPostsByDate<T extends { updatedAt: string }>(posts: T[]): T[] {
  return [...posts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function filterPosts(posts: BlogPost[], filter: PostFilter = {}): BlogPost[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  const selectedTags = [
    ...(filter.tag ? [filter.tag] : []),
    ...(filter.tags ?? [])
  ]
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return sortPostsByDate(
    posts.filter((post) => {
      const statusMatches = filter.includeDrafts || post.status === 'published';
      const categoryMatches = !filter.category || filter.category === 'all' || post.category === filter.category;
      const queryTarget = `${post.title} ${post.summary} ${post.tags.join(' ')} ${post.content}`.toLowerCase();
      const queryMatches = !query || queryTarget.includes(query);
      const postTags = post.tags.map((postTag) => postTag.toLowerCase());
      const tagMatches = selectedTags.every((tag) => postTags.includes(tag));

      return statusMatches && categoryMatches && queryMatches && tagMatches;
    })
  );
}

export function getCategory(categoryId: BlogCategoryId): BlogCategory {
  return BLOG_CATEGORIES.find((category) => category.id === categoryId) ?? BLOG_CATEGORIES[0];
}

export function getCategoryIcon(categoryId: BlogCategoryId): CategoryIcon {
  return CATEGORY_ICONS[categoryId] ?? CATEGORY_ICONS.life;
}
