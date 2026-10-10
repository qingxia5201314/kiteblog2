import { MouseEvent, useEffect, useId, useRef, useState } from 'react';
import type { ArticleHeading } from '../../../lib/headings';

export function MobileArticleToc({
  headings,
  progress,
  activeHeadingId
}: {
  headings: ArticleHeading[];
  progress: number;
  activeHeadingId: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const currentHeading = headings.find((heading) => heading.id === activeHeadingId) ?? headings[0];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (headings.length === 0) return null;

  const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, heading: ArticleHeading) => {
    event.preventDefault();
    const target = document.getElementById(heading.id);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#${heading.id}`);
    target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  };

  return (
    <div className={`mobile-article-toc ${open ? 'open' : ''}`}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="mobile-toc-trigger"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <span><small>当前章节</small><strong>{currentHeading?.title || '文章目录'}</strong></span>
        <span className="mobile-toc-progress">{progress}%</span>
        <span aria-hidden="true" className="mobile-toc-chevron">⌃</span>
      </button>
      <div aria-hidden={!open} className="mobile-toc-panel" id={panelId}>
        <div className="mobile-toc-panel-heading">
          <strong>文章目录</strong>
          <button aria-label="关闭文章目录" onClick={() => setOpen(false)} type="button">&times;</button>
        </div>
        <nav aria-label="移动端文章目录">
          {headings.map((heading) => (
            <a
              aria-current={heading.id === activeHeadingId ? 'location' : undefined}
              className={`level-${heading.level}`}
              href={`#${heading.id}`}
              key={heading.id}
              onClick={(event) => navigateToHeading(event, heading)}
            >
              {heading.title}
            </a>
          ))}
        </nav>
      </div>
      {open ? <button aria-label="关闭文章目录" className="mobile-toc-backdrop" onClick={() => setOpen(false)} type="button" /> : null}
    </div>
  );
}
