import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MarkdownContent } from '../components/MarkdownContent';
import { BlogPost } from '../lib/blog';
import { getArticlePreview } from '../lib/blogApi';

export function ArticlePreviewPage() {
  const { id = '' } = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getArticlePreview(id)
      .then((nextPost) => {
        if (!cancelled) setPost(nextPost);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : '预览加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <section className="article-preview-state">
        <h1>无法打开预览</h1>
        <p>{error}</p>
        <Link to="/admin">返回后台</Link>
      </section>
    );
  }

  if (!post) return <div className="page-loading" role="status">预览加载中...</div>;

  return (
    <section className="article-page article-preview-page">
      <div className="article-preview-banner">
        <strong>预览模式</strong>
        <span>此页面不会发布文章或创建版本</span>
        <Link to={`/admin?edit=${encodeURIComponent(post.id)}`}>返回编辑器</Link>
      </div>
      <div className="article-preview-shell">
        <header className="article-header-card">
          <div className="article-header-copy">
            <p className="eyebrow">Draft preview</p>
            <h1>{post.title || '未命名文章'}</h1>
            <p className="summary">{post.summary || '暂无摘要'}</p>
            <div className="tag-row">
              {post.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
        </header>
        <article className="article-body-card">
          <div className="article-body"><MarkdownContent content={post.content || '暂无正文'} /></div>
        </article>
      </div>
    </section>
  );
}
