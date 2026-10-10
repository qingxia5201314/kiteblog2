import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeImageUrl } from '../lib/imageUrl';
import { headingSlug } from '../lib/headings';
import { ImageWithFallback } from './shared';

export function normalizeParenthesizedMath(markdown: string) {
  let fenceMarker = '';
  return markdown
    .split('\n')
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? '';
      if (fence) {
        if (!fenceMarker) fenceMarker = fence[0];
        else if (fence[0] === fenceMarker) fenceMarker = '';
        return line;
      }
      if (fenceMarker) return line;

      return line
        .split(/(`+[^`]*`+)/g)
        .map((part, index) => (index % 2 === 0 ? part.replace(/\\\((.+?)\\\)/g, '$$$1$') : part))
        .join('');
    })
    .join('\n');
}

function headingText(value: unknown): string {
  if (Array.isArray(value)) return value.map(headingText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'props' in value) {
    return headingText((value as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

export function renderMarkdown(content: string) {
  const headingCounts = new Map<string, number>();
  const headingId = (children: unknown) => {
    const base = headingSlug(headingText(children));
    const count = (headingCounts.get(base) ?? 0) + 1;
    headingCounts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a({ children, href }) {
          return (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          );
        },
        h1({ children }) {
          return <h2 id={headingId(children)}>{children}</h2>;
        },
        h2({ children }) {
          return <h3 id={headingId(children)}>{children}</h3>;
        },
        h3({ children }) {
          return <h4 id={headingId(children)}>{children}</h4>;
        },
        img({ alt, src }) {
          if (!src) return null;
          const imageUrl = normalizeImageUrl(src);
          if (!imageUrl) return null;

          return (
            <figure className="article-image">
              <ImageWithFallback
                alt={alt || '文章图片'}
                src={imageUrl}
                fallback={<span className="article-image-fallback">图片暂时无法加载</span>}
              />
              {alt ? <figcaption>{alt}</figcaption> : null}
            </figure>
          );
        },
        pre({ children }) {
          return <pre className="article-code">{children}</pre>;
        },
        table({ children }) {
          return (
            <div className="article-table-wrap">
              <table>{children}</table>
            </div>
          );
        }
      }}
    >
      {normalizeParenthesizedMath(content)}
    </ReactMarkdown>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  return <>{renderMarkdown(content)}</>;
}
