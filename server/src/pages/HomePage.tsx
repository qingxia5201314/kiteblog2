import React, { lazy, Suspense, useMemo, useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useBlogData } from '../context/BlogDataContext';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { extractArticleHeadings } from '../lib/headings';
import {
  BLOG_CATEGORIES,
  BlogCategoryId,
  BlogPost,
  PostDateFilter,
  calculateReadingMinutes,
  getCategory,
  getCategoryIcon
} from '../lib/blog';
import {
  listPostComments,
  createPostComment,
  updatePostComment,
  deletePostComment,
  getPost,
  loginUser as loginUserRequest,
  registerUser as registerUserRequest
} from '../lib/blogApi';
import {
  Icon,
  FilterMenu,
  ImageWithFallback,
  formatDateTime,
  getSafeImageUrl,
  permissionLabel
} from '../components/shared';
import { TiltCard } from '../components/effects/TiltCard';
import { ArticleList } from '../features/articles/components/ArticleList';
import { ArticleSearch } from '../features/articles/components/ArticleSearch';
import { LoadMoreButton } from '../features/articles/components/LoadMoreButton';
import { MobileArticleToc } from '../features/articles/components/MobileArticleToc';
import { useArticlePagination } from '../features/articles/hooks/useArticlePagination';
import { useArticleReadingState } from '../features/articles/hooks/useArticleReadingState';
import haruhiCutoutImage from '../assets/haruhi-cutout.png';

const LazyMarkdownContent = lazy(() =>
  import('../components/MarkdownContent').then((module) => ({ default: module.MarkdownContent }))
);

interface CommentFormState {
  content: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

export function HomePage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userSession, isAdmin, notify, loginUser, logoutUser } = useApp();
  const { posts: adminPosts } = useBlogData();
  const filterKey = searchParams.toString();
  const filters = useMemo(() => {
    const categoryParam = searchParams.get('category') as BlogCategoryId | null;
    const category: BlogCategoryId | 'all' = BLOG_CATEGORIES.some((item) => item.id === categoryParam)
      ? categoryParam!
      : 'all';
    const tags = (searchParams.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10);
    const dateParam = searchParams.get('date') as PostDateFilter | null;
    const date: PostDateFilter = dateParam && ['all', '7d', '30d', 'year'].includes(dateParam) ? dateParam : 'all';
    return { category, tags, date, q: (searchParams.get('q') ?? '').slice(0, 120) };
  }, [filterKey, searchParams]);
  const activeCategory = filters.category;
  const activeTags = filters.tags;
  const query = filters.q;
  const dateFilter = filters.date;
  const articlePage = useArticlePagination({
    enabled: !slug,
    query: { category: activeCategory, date: dateFilter, q: query, tags: activeTags, limit: 8 }
  });
  const indexedPosts = articlePage.posts;

  const [postComments, setPostComments] = useState<any[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentForm, setCommentForm] = useState<CommentFormState>({ content: '' });
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDrafts, setCommentEditDrafts] = useState<Record<string, string>>({});
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userForm, setUserForm] = useState({ username: '', password: '', nickname: '' });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'error'; message: string } | null>(null);
  const [fullDetailPost, setFullDetailPost] = useState<BlogPost | null>(null);
  const [detailLoadFailed, setDetailLoadFailed] = useState(false);
  const articleBodyRef = useRef<HTMLElement | null>(null);

  const publishedCount = articlePage.total;
  const draftCount = adminPosts.filter((post) => post.status === 'draft').length;
  const detailPostView = fullDetailPost && (!slug || fullDetailPost.slug === slug || fullDetailPost.id === slug)
    ? fullDetailPost
    : null;
  const detailPostSlug = detailPostView?.slug;
  const canEditDetailPost = isAdmin;
  const srcPostCount = indexedPosts.filter((post) => post.category === 'src').length;
  const articleHeadings = useMemo(
    () => extractArticleHeadings(detailPostView?.content || ''),
    [detailPostView?.content]
  );
  const { progress: readingProgress, activeHeadingId } = useArticleReadingState({
    articleRef: articleBodyRef,
    headings: articleHeadings,
    enabled: Boolean(detailPostView)
  });

  usePageMetadata(detailPostView);

  const writeFiltersToUrl = useCallback(
    (
      patch: { category?: BlogCategoryId | 'all'; query?: string; tags?: string[]; date?: PostDateFilter },
      replace = false
    ) => {
      const nextCategory = patch.category ?? activeCategory;
      const nextQuery = patch.query ?? query;
      const nextTags = patch.tags ?? activeTags;
      const nextDate = patch.date ?? dateFilter;
      const next = new URLSearchParams();
      if (nextCategory !== 'all') next.set('category', nextCategory);
      if (nextQuery.trim()) next.set('q', nextQuery.trim());
      if (nextTags.length > 0) next.set('tags', nextTags.join(','));
      if (nextDate !== 'all') next.set('date', nextDate);
      setSearchParams(next, { replace });
    },
    [activeCategory, activeTags, dateFilter, query, setSearchParams]
  );

  const buildFilterSearch = useCallback(
    (patch: { category?: BlogCategoryId | 'all'; query?: string; tags?: string[]; date?: PostDateFilter }) => {
      const nextCategory = patch.category ?? activeCategory;
      const nextQuery = patch.query ?? query;
      const nextTags = patch.tags ?? activeTags;
      const nextDate = patch.date ?? dateFilter;
      const next = new URLSearchParams();
      if (nextCategory !== 'all') next.set('category', nextCategory);
      if (nextQuery.trim()) next.set('q', nextQuery.trim());
      if (nextTags.length > 0) next.set('tags', nextTags.join(','));
      if (nextDate !== 'all') next.set('date', nextDate);
      const value = next.toString();
      return value ? `?${value}` : '';
    },
    [activeCategory, activeTags, dateFilter, query]
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      writeFiltersToUrl({ query: value }, true);
    },
    [writeFiltersToUrl]
  );

  const handleCategoryChange = useCallback(
    (value: string) => {
      const category = value as BlogCategoryId | 'all';
      writeFiltersToUrl({ category });
    },
    [writeFiltersToUrl]
  );

  const handleDateChange = useCallback(
    (value: string) => {
      const date = value as PostDateFilter;
      writeFiltersToUrl({ date });
    },
    [writeFiltersToUrl]
  );

  const handleTagFilter = useCallback(
    (tag: string) => {
      const nextTags = activeTags.some((selectedTag) => selectedTag.toLowerCase() === tag.toLowerCase())
        ? activeTags.filter((selectedTag) => selectedTag.toLowerCase() !== tag.toLowerCase())
        : [...activeTags, tag];
      navigate(`/${buildFilterSearch({ tags: nextTags })}`);
    },
    [activeTags, buildFilterSearch, navigate]
  );

  const handleClearTags = useCallback(() => {
    writeFiltersToUrl({ tags: [] });
  }, [writeFiltersToUrl]);

  useEffect(() => {
    if (!detailPostView?.slug) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [detailPostView?.slug]);

  useEffect(() => {
    if (!slug) {
      setFullDetailPost(null);
      setDetailLoadFailed(false);
      return;
    }

    let cancelled = false;
    setFullDetailPost(null);
    setDetailLoadFailed(false);
    getPost(slug)
      .then((post) => {
        if (!cancelled) {
          setFullDetailPost(post);
          setDetailLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFullDetailPost(null);
          setDetailLoadFailed(true);
          notify('error', '文章加载失败，请稍后重试');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [notify, slug]);

  useEffect(() => {
    if (!detailPostSlug) {
      setPostComments([]);
      setEditingCommentId(null);
      setCommentEditDrafts({});
      return;
    }

    let cancelled = false;
    setPostComments([]);
    setEditingCommentId(null);
    setCommentEditDrafts({});

    listPostComments(detailPostSlug)
      .then((comments) => {
        if (!cancelled) setPostComments(comments);
      })
      .catch(() => {
        if (!cancelled) {
          setPostComments([]);
          notify('error', '评论加载失败，请稍后重试');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailPostSlug]);

  const handleCommentSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!detailPostView || commentLoading) return;
      if (!userSession) {
        notify('error', '请先登录后再评论');
        return;
      }
      if (!commentForm.content.trim()) {
        notify('error', '请填写评论内容');
        return;
      }

      try {
        const comment = await createPostComment(detailPostView.slug, commentForm);
        setPostComments((current) => [comment, ...current]);
        setCommentForm({ content: '' });
        notify('success', '评论已发布');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论发布失败');
      }
    },
    [detailPostView, commentLoading, userSession, commentForm, notify]
  );

  const handleEditComment = useCallback(
    (commentId: string, content: string) => {
      setEditingCommentId(commentId);
      setCommentEditDrafts((current) => ({ ...current, [commentId]: content }));
    },
    []
  );

  const handleSaveEdit = useCallback(
    async (commentId: string) => {
      if (!detailPostView || !userSession) return;
      const content = (commentEditDrafts[commentId] ?? '').trim();
      if (!content) {
        notify('error', '评论内容不能为空');
        return;
      }

      try {
        const updated = await updatePostComment(
          detailPostView.slug,
          commentId,
          { content }
        );
        setPostComments(postComments.map((item) => (item.id === updated.id ? updated : item)));
        setEditingCommentId(null);
        notify('success', '评论已更新');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论更新失败');
      }
    },
    [detailPostView, userSession, commentEditDrafts, postComments, notify]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!detailPostView || !userSession) return;
      if (!window.confirm('确定删除这条评论吗？')) return;

      try {
        await deletePostComment(detailPostView.slug, commentId);
        setPostComments(postComments.filter((item) => item.id !== commentId));
        if (editingCommentId === commentId) setEditingCommentId(null);
        notify('success', '评论已删除');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : '评论删除失败');
      }
    },
    [detailPostView, userSession, postComments, editingCommentId, notify]
  );

  const handleUserAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (authSubmitting) return;
      const username = userForm.username.trim();
      const password = userForm.password;
      const nickname = userForm.nickname.trim();

      if (!username || !password) {
        const message = '请输入用户名和密码';
        setAuthFeedback({ type: 'error', message });
        notify('error', message);
        return;
      }

      if (!USERNAME_PATTERN.test(username)) {
        const message = '用户名只能使用 3-24 位字母、数字或下划线';
        setAuthFeedback({ type: 'error', message });
        notify('error', message);
        return;
      }

      if (password.length < 6) {
        const message = '密码至少 6 位';
        setAuthFeedback({ type: 'error', message });
        notify('error', message);
        return;
      }

      try {
        setAuthSubmitting(true);
        setAuthFeedback(null);
        const session =
          authMode === 'register'
            ? await registerUserRequest({ username, password, nickname })
            : await loginUserRequest(username, password);
        if (!session?.expiresAt || !session?.user) {
          throw new Error('Invalid user session');
        }
        loginUser(session);
        setUserForm({ username: '', password: '', nickname: '' });
        notify('success', authMode === 'register' ? '注册成功，已登录' : '登录成功');
      } catch (error) {
        const message = authMode === 'register' ? '注册失败，请换个用户名或检查密码' : '登录失败，请检查用户名和密码';
        setAuthFeedback({ type: 'error', message });
        notify('error', message);
      } finally {
        setAuthSubmitting(false);
      }
    },
    [authMode, authSubmitting, loginUser, notify, userForm]
  );

  const handleEditDetailPost = useCallback(() => {
    if (!detailPostView) return;
    navigate(`/admin?edit=${encodeURIComponent(detailPostView.id)}`);
  }, [detailPostView, navigate]);

  if (slug && detailLoadFailed) {
    return (
      <section className="article-page article-not-found">
        <div className="article-page-shell">
          <div className="article-page-main">
            <section className="article-header-card">
              <div className="article-header-copy">
                <p className="eyebrow">404 / Article</p>
                <h1>文章不存在或已撤下</h1>
                <p className="summary">这个链接暂时无法访问，请返回文章列表查看现有内容。</p>
                <Link className="back-link" to="/">
                  返回文章列表
                </Link>
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  // Detail view
  if (detailPostView) {
    return (
      <section className="article-page">
        <MobileArticleToc
          activeHeadingId={activeHeadingId}
          headings={articleHeadings}
          progress={readingProgress}
        />
        <div className="article-page-shell">
          <aside className="article-page-rail">
            <Link className="back-link" to={`/${buildFilterSearch({})}`}>
              返回文章列表
            </Link>
            {canEditDetailPost ? (
              <button className="article-edit-link article-admin-edit" onClick={handleEditDetailPost} type="button">
                <Icon name="edit" />
                修改文章
              </button>
            ) : null}
            <div className="article-rail-card article-focus-card">
              <p className="eyebrow">Reading Focus</p>
              <strong>{getCategory(detailPostView.category).name}</strong>
              <span>{formatDateTime(detailPostView.updatedAt)}</span>
              <span>{calculateReadingMinutes(detailPostView.content)} 分钟阅读</span>
            </div>
            <div className="article-rail-card article-tags-card">
              <p className="eyebrow">Active Tags</p>
              <div className="tag-row article-rail-tags">
                {detailPostView.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={activeTags.includes(tag) ? 'active' : ''}
                    onClick={() => handleTagFilter(tag)}
                  >
                    <Icon name="tag" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="article-rail-card article-reading-card">
              <div className="reading-progress-label">
                <strong>阅读进度</strong>
                <span>{readingProgress}%</span>
              </div>
              <progress max="100" value={readingProgress} />
              {articleHeadings.length > 0 ? (
                <nav aria-label="文章目录" className="article-toc">
                  {articleHeadings.map((heading) => (
                    <a
                      aria-current={heading.id === activeHeadingId ? 'location' : undefined}
                      className={`level-${heading.level}${heading.id === activeHeadingId ? ' active' : ''}`}
                      href={`#${heading.id}`}
                      key={heading.id}
                    >
                      {heading.title}
                    </a>
                  ))}
                </nav>
              ) : null}
            </div>
          </aside>
          <div className="article-page-main">
            <section className="article-header-card">
              <div className="article-header-media">
                <ImageWithFallback
                  alt={detailPostView.title}
                  className="article-cover-image"
                  src={getSafeImageUrl(detailPostView.coverImage)}
                  fallback={
                    <div className={`article-cover cover-${detailPostView.cover}`}>
                    <span>
                      <Icon name={getCategoryIcon(detailPostView.category)} />
                      {getCategory(detailPostView.category).name}
                    </span>
                    </div>
                  }
                />
              </div>
              <div className="article-header-copy">
                <p className="article-meta">
                  <span>
                    <Icon name="calendar" />
                    {formatDateTime(detailPostView.updatedAt)}
                  </span>
                  <span>
                    <Icon name="clock" />
                    {calculateReadingMinutes(detailPostView.content)} 分钟阅读
                  </span>
                  <span>
                    <Icon name={getCategoryIcon(detailPostView.category)} />
                    {getCategory(detailPostView.category).name}
                  </span>
                </p>
                <h1>{detailPostView.title}</h1>
                <p className="summary">{detailPostView.summary}</p>
                <div className="tag-row">
                  {detailPostView.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={activeTags.includes(tag) ? 'active' : ''}
                      onClick={() => handleTagFilter(tag)}
                    >
                      <Icon name="tag" />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="article-body-card" ref={articleBodyRef}>
              <div className="article-body">
                <Suspense fallback={<div className="article-render-loading">正文加载中...</div>}>
                  <LazyMarkdownContent content={detailPostView.content} />
                </Suspense>
              </div>
            </section>
            <section className="comment-panel">
              <div className="panel-heading">
                <h3>评论 · {postComments.length}</h3>
                {userSession ? (
                  <div className="comment-user-chip">
                    <strong>{userSession.user.nickname}</strong>
                    <span>{permissionLabel(userSession.user.permission)}</span>
                  </div>
                ) : null}
              </div>
              {userSession ? (
                <form className="comment-form" onSubmit={handleCommentSubmit}>
                  <textarea
                    aria-label="评论内容"
                    onChange={(event) =>
                      setCommentForm((current) => ({ ...current, content: event.target.value }))
                    }
                    placeholder="写点想法..."
                    value={commentForm.content}
                  />
                  <button disabled={commentLoading} type="submit">
                    {commentLoading ? '发布中...' : '发布评论'}
                  </button>
                </form>
              ) : (
                <div className="comment-empty-card">
                  <strong>登录后可评论</strong>
                  <p>注册后默认只有阅读权限，评论会自动显示你的昵称和权限身份。</p>
                </div>
              )}
              <div className="comment-list">
                {postComments.map((comment: any) => (
                  <article className="comment-item" key={comment.id}>
                    <strong>
                      {comment.nickname}
                      <span>{comment.role}</span>
                    </strong>
                    {editingCommentId === comment.id ? (
                      <div className="comment-edit-box">
                        <textarea
                          aria-label="编辑评论"
                          onChange={(event) =>
                            setCommentEditDrafts((current) => ({
                              ...current,
                              [comment.id]: event.target.value
                            }))
                          }
                          value={commentEditDrafts[comment.id] ?? ''}
                        />
                        <div className="comment-actions">
                          <button onClick={() => handleSaveEdit(comment.id)} type="button">
                            保存
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setEditingCommentId(null)}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{comment.content}</p>
                    )}
                    <div className="comment-meta">
                      <small>{formatDateTime(comment.updatedAt || comment.createdAt)}</small>
                      {userSession &&
                      (userSession.user.permission === 'admin' || comment.userId === userSession.user.id) ? (
                        <div className="comment-actions">
                          <button
                            className="ghost"
                            onClick={() => handleEditComment(comment.id, comment.content)}
                            type="button"
                          >
                            编辑
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDeleteComment(comment.id)}
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
                {postComments.length === 0 ? <div className="empty-state">还没有评论。</div> : null}
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  // Home view
  return (
    <div className="home-page">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">SOS Brigade Log</p>
          <h1>Kitepop SOS</h1>
          <p>这里沉淀个人生活、SRC 挖掘案例、专业学习和知识点记录。</p>
          <div className="hero-notes">
            <span>Poster-led identity</span>
            <span>Life / SRC / Study / Notes</span>
          </div>
          <div className="hero-actions">
            <Link className="button-link" to="/admin">
              SOS 发文
            </Link>
            {srcPostCount > 0 ? (
              <Link className="button-link ghost" to="/?category=src">
                查看 SRC 复盘
              </Link>
            ) : null}
          </div>
        </div>
        <TiltCard className="hero-visual hero-art" aria-label="blog visual cover">
          <img alt="凉宫春日主题人物" height="760" src={haruhiCutoutImage} width="620" />
          <span className="hero-art-ring" aria-hidden="true" />
          <span className="hero-art-corners" aria-hidden="true" />
        </TiltCard>
        <img
          alt=""
          aria-hidden="true"
          className="hero-character-compact"
          height="760"
          src={haruhiCutoutImage}
          width="620"
        />
      </section>

      <section className="metrics-strip">
        <span>
          <Icon name="spark" />
          <strong>{publishedCount}</strong> 已发布
        </span>
        <span>
          <Icon name="draft" />
          <strong>{draftCount}</strong> 草稿
        </span>
        <span>
          <Icon name="grid" />
          <strong>{BLOG_CATEGORIES.length}</strong> 内容模块
        </span>
      </section>

      <section className="user-auth-card">
        {userSession ? (
          <>
            <div>
              <strong>{userSession.user.nickname}</strong>
              <span>{userSession.user.permission === 'admin' ? '团长' : '团员'}</span>
            </div>
            <button
              className="ghost"
              onClick={() => void logoutUser().catch(() => notify('error', '退出登录失败'))}
              type="button"
            >
              退出登录
            </button>
          </>
        ) : (
          <form onSubmit={handleUserAuthSubmit}>
            <div className="segmented-control compact-tabs">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('login');
                  setAuthFeedback(null);
                }}
                type="button"
              >
                登录
              </button>
              <button
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('register');
                  setAuthFeedback(null);
                }}
                type="button"
              >
                注册
              </button>
            </div>
            <input
              aria-label="用户名"
              autoComplete="username"
              onChange={(event) =>
                setUserForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="用户名"
              value={userForm.username}
            />
            <input
              aria-label="密码"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              onChange={(event) =>
                setUserForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="密码"
              type="password"
              value={userForm.password}
            />
            {authMode === 'register' ? (
              <input
                aria-label="昵称"
                autoComplete="nickname"
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, nickname: event.target.value }))
                }
                placeholder="昵称"
                value={userForm.nickname}
              />
            ) : null}
            {authFeedback ? <p className={`auth-feedback ${authFeedback.type}`}>{authFeedback.message}</p> : null}
            <button disabled={authSubmitting} type="submit">
              {authMode === 'register' ? '创建账号' : '登录评论'}
            </button>
          </form>
        )}
      </section>

      <section className="home-post-section" id="articles">
        <div className="home-post-shell">
          <aside className="post-panel home-filter-panel">
            <div className="home-filter-header">
              <div>
                <p className="eyebrow">Index / Filter</p>
                <h2>文章索引</h2>
              </div>
              <span className="filter-total">{articlePage.total} 篇</span>
            </div>
            <div className="home-filter-search">
              <ArticleSearch onChange={handleQueryChange} value={query} />
            </div>
            <div className="index-filters" aria-label="文章索引筛选">
              <FilterMenu
                label={
                  {
                    all: '全部时间',
                    '7d': '最近 7 天',
                    '30d': '最近 30 天',
                    year: '今年'
                  }[dateFilter]
                }
                options={[
                  ['all', '全部时间'],
                  ['7d', '最近 7 天'],
                  ['30d', '最近 30 天'],
                  ['year', '今年']
                ]}
                onSelect={handleDateChange}
              />
              <FilterMenu
                label={activeCategory === 'all' ? '全部分类' : getCategory(activeCategory).name}
                options={[
                  ['all', '全部分类'],
                  ...BLOG_CATEGORIES.map((category) => [category.id, category.name] as [string, string])
                ]}
                onSelect={handleCategoryChange}
              />
            </div>
            <p className="home-filter-hint">
              点击文章页标签可加入筛选，这里会保留当前标签组合。
            </p>
            {activeTags.length > 0 && (
              <div className="tag-filter-group">
                {activeTags.map((tag) => (
                  <button
                    key={tag}
                    className="tag-filter-chip"
                    type="button"
                    onClick={() => handleTagFilter(tag)}
                  >
                    <Icon name="tag" />
                    {tag}
                    <span aria-hidden="true">&times;</span>
                  </button>
                ))}
                <button
                  className="tag-filter-clear"
                  type="button"
                  onClick={handleClearTags}
                >
                  清除全部
                </button>
              </div>
            )}
          </aside>
          <section className="post-panel home-post-panel">
            <div className="home-post-header">
              <div>
                <p className="eyebrow">Selected Writing</p>
                <h2>最近文章</h2>
              </div>
              <p>从生活记录到漏洞复盘，按时间与标签继续展开。</p>
            </div>
            {articlePage.loading ? <p className="article-list-status" role="status">正在加载文章...</p> : null}
            {!articlePage.loading && articlePage.error ? (
              <div className="article-list-empty" role="status">
                <strong>文章加载失败</strong>
                <span>{articlePage.error}</span>
                <button onClick={articlePage.retry} type="button">重试</button>
              </div>
            ) : null}
            {!articlePage.loading && !articlePage.error && indexedPosts.length === 0 ? (
              <div className="article-list-empty">
                <strong>没有找到匹配文章</strong>
                <span>可以清除搜索、标签或分类后重新查看。</span>
                <button onClick={() => setSearchParams(new URLSearchParams())} type="button">清除筛选</button>
              </div>
            ) : null}
            <ArticleList detailSearch={buildFilterSearch({})} posts={indexedPosts} query={query} />
            {indexedPosts.length > 0 ? (
              <LoadMoreButton
                error={articlePage.loadMoreError}
                hasMore={articlePage.hasMore}
                loading={articlePage.loadingMore}
                onLoadMore={articlePage.loadMore}
                onRetry={articlePage.retry}
              />
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
