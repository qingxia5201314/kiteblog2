import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { BlogPost } from '../lib/blog';
import { listPosts } from '../lib/blogApi';

interface BlogDataContextType {
  posts: BlogPost[];
  loadPosts: (includeDrafts?: boolean) => Promise<void>;
}

const BlogDataContext = createContext<BlogDataContextType | undefined>(undefined);

export function BlogDataProvider({ children }: { children: ReactNode }) {
  const { isAdmin, notify, userSession } = useApp();
  const adminScope = isAdmin && userSession ? `admin:${userSession.user.id}` : null;
  const activeScope = adminScope ?? 'public';
  const [ownedPosts, setOwnedPosts] = useState<{ ownerScope: string; posts: BlogPost[] }>(() => ({
    ownerScope: activeScope,
    posts: []
  }));
  const requestGenerationRef = useRef(0);
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;

  const loadPosts = useCallback(async (includeDrafts = isAdmin) => {
    if (includeDrafts && !adminScope) return;
    const requestScope = activeScope;
    if (requestScope !== activeScopeRef.current) return;
    const generation = ++requestGenerationRef.current;
    try {
      const nextPosts = await listPosts({ includeDrafts, summary: !includeDrafts });
      if (generation === requestGenerationRef.current && requestScope === activeScopeRef.current) {
        setOwnedPosts({ ownerScope: requestScope, posts: nextPosts });
      }
    } catch {
      if (generation === requestGenerationRef.current && requestScope === activeScopeRef.current) {
        notify('error', '文章加载失败，请稍后重试');
      }
    }
  }, [activeScope, adminScope, isAdmin, notify]);

  useEffect(() => {
    void loadPosts(isAdmin);
  }, [activeScope, isAdmin, loadPosts]);

  const posts = ownedPosts.ownerScope === activeScope ? ownedPosts.posts : [];

  return <BlogDataContext.Provider value={{ posts, loadPosts }}>{children}</BlogDataContext.Provider>;
}

export function useBlogData() {
  const context = useContext(BlogDataContext);
  if (!context) {
    throw new Error('useBlogData must be used within BlogDataProvider');
  }
  return context;
}
