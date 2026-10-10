export interface ArticleHeading {
  id: string;
  level: 2 | 3 | 4;
  title: string;
}

export function headingSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'section';
}

export function extractArticleHeadings(content: string): ArticleHeading[] {
  const counts = new Map<string, number>();
  const headings: ArticleHeading[] = [];
  const pattern = /^(#{1,3})\s+(.+)$/gm;
  let match;

  while ((match = pattern.exec(content))) {
    const title = match[2].replace(/[*_`]/g, '').trim();
    const base = headingSlug(title);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    headings.push({
      id: count === 1 ? base : `${base}-${count}`,
      level: Math.min(4, match[1].length + 1) as 2 | 3 | 4,
      title
    });
  }

  return headings;
}
