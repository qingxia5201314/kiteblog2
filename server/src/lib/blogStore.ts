import { BlogPost, BlogPostDraft, SAMPLE_POSTS, createSlug, sortPostsByDate } from './blog';

export interface BlogRepository {
  list(): BlogPost[];
  get(idOrSlug: string): BlogPost | undefined;
  create(draft: BlogPostDraft): BlogPost;
  update(id: string, patch: Partial<BlogPostDraft>): BlogPost | undefined;
  remove(id: string): boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `post-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniqueSlug(title: string, posts: BlogPost[], currentId?: string): string {
  const base = createSlug(title);
  let slug = base;
  let index = 2;

  while (posts.some((post) => post.slug === slug && post.id !== currentId)) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

function parsePosts(value: string | null): BlogPost[] {
  if (!value) return SAMPLE_POSTS;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : SAMPLE_POSTS;
  } catch {
    return SAMPLE_POSTS;
  }
}

export function createBlogRepository(storageKey = 'kitepop-blog-posts'): BlogRepository {
  const read = (): BlogPost[] => {
    const existing = localStorage.getItem(storageKey);

    if (!existing) {
      localStorage.setItem(storageKey, JSON.stringify(SAMPLE_POSTS));
      return SAMPLE_POSTS;
    }

    return parsePosts(existing);
  };

  const write = (posts: BlogPost[]) => {
    localStorage.setItem(storageKey, JSON.stringify(sortPostsByDate(posts)));
  };

  return {
    list() {
      return sortPostsByDate(read());
    },

    get(idOrSlug: string) {
      return read().find((post) => post.id === idOrSlug || post.slug === idOrSlug);
    },

    create(draft: BlogPostDraft) {
      const posts = read();
      const now = today();
      const post: BlogPost = {
        ...draft,
        id: createId(),
        slug: uniqueSlug(draft.title, posts),
        createdAt: now,
        updatedAt: now
      };

      write([post, ...posts]);
      return post;
    },

    update(id: string, patch: Partial<BlogPostDraft>) {
      const posts = read();
      const current = posts.find((post) => post.id === id);

      if (!current) return undefined;

      const updated: BlogPost = {
        ...current,
        ...patch,
        slug: patch.title ? uniqueSlug(patch.title, posts, id) : current.slug,
        updatedAt: today()
      };

      write(posts.map((post) => (post.id === id ? updated : post)));
      return updated;
    },

    remove(id: string) {
      const posts = read();
      const nextPosts = posts.filter((post) => post.id !== id);

      if (nextPosts.length === posts.length) return false;

      write(nextPosts);
      return true;
    }
  };
}
