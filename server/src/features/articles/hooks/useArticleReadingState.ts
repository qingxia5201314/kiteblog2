import { RefObject, useEffect, useState } from 'react';
import type { ArticleHeading } from '../../../lib/headings';

export function useArticleReadingState({
  articleRef,
  headings,
  enabled
}: {
  articleRef: RefObject<HTMLElement | null>;
  headings: ArticleHeading[];
  enabled: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState('');

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      setActiveHeadingId('');
      return;
    }

    let frame = 0;
    const update = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const article = articleRef.current;
        if (!article) return;
        const rect = article.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const articleTop = rect.top + window.scrollY;
        const articleHeight = article.offsetHeight || rect.height;
        const readableStart = articleTop - viewportHeight * 0.18;
        const readableEnd = articleTop + articleHeight - viewportHeight * 0.72;
        const value = ((window.scrollY - readableStart) / Math.max(1, readableEnd - readableStart)) * 100;
        setProgress(Math.max(0, Math.min(100, Math.round(value))));

        let nextHeading = headings[0]?.id || '';
        for (const heading of headings) {
          const target = document.getElementById(heading.id);
          if (target && target.getBoundingClientRect().top <= 180) nextHeading = heading.id;
        }
        setActiveHeadingId(nextHeading);
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('hashchange', update);
    };
  }, [articleRef, enabled, headings]);

  return { progress, activeHeadingId };
}
