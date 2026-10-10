import { Link } from 'react-router-dom';
import type { BlogPostSummary } from '../../../lib/blog';
import { getCategory, getCategoryIcon } from '../../../lib/blog';
import { Icon, ImageWithFallback, formatDateTime, getSafeImageUrl } from '../../../components/shared';
import { SearchHighlight } from './SearchHighlight';

export function ArticleList({ posts, query, detailSearch }: { posts: BlogPostSummary[]; query: string; detailSearch: string }) {
  return (
    <div className="post-list">
      {posts.map((post) => {
        const category = getCategory(post.category);
        return (
          <Link className="post-item tilt-card" key={post.id} to={`/posts/${post.slug}${detailSearch}`}>
            <span className="post-item-cover">
              <ImageWithFallback
                alt={`${post.title} 封面`}
                className="cover-thumb"
                height={88}
                src={getSafeImageUrl(post.coverImage)}
                width={88}
                fallback={<span className={`cover-dot cover-${post.cover}`}><Icon name={getCategoryIcon(post.category)} /></span>}
              />
            </span>
            <span className="post-item-copy">
              <span className="post-item-topline"><em>{category.name}</em><span>{formatDateTime(post.updatedAt)}</span></span>
              <strong><SearchHighlight query={query} text={post.title} /></strong>
              <small><SearchHighlight query={query} text={post.summary} /></small>
              <span className="post-item-footer">
                <span><Icon name="clock" />{post.readingMinutes} 分钟</span>
                <span><Icon name="tag" />{post.tags.slice(0, 2).join(' · ') || '未设标签'}</span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
