import { describe, expect, it } from 'vitest';
import { renderRobots, renderRss, renderSeoPage, renderSitemap } from './seo.mjs';

const post = {
  id: 'p1',
  slug: 'clean-route',
  title: '干净文章路由',
  summary: '文章可以直接打开并带完整 SEO 元数据。',
  category: 'study',
  tags: ['React', 'SEO'],
  content: '## 正文\n\n这段正文应当出现在无 JavaScript HTML 中。',
  status: 'published',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  cover: 'study',
  coverImage: '/api/images/raw/cover'
};

describe('SEO document rendering', () => {
  it('injects article metadata, JSON-LD, canonical URL, and no-script content', () => {
    const html = renderSeoPage('<html><head><title>old</title></head><body><div id="root"></div></body></html>', {
      siteUrl: 'https://blog.example',
      post
    });

    expect(html).toContain('<title>干净文章路由 | Kitepop SOS</title>');
    expect(html).toContain('<link rel="canonical" href="https://blog.example/posts/clean-route"');
    expect(html).toContain('<meta property="og:type" content="article"');
    expect(html).toContain('<script type="application/ld+json" data-kitepop-jsonld>');
    expect(html.match(/data-kitepop-jsonld/g)).toHaveLength(1);
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toContain('这段正文应当出现在无 JavaScript HTML 中');
  });

  it('renders real crawler and feed documents', () => {
    expect(renderRobots('https://blog.example')).toContain('Sitemap: https://blog.example/sitemap.xml');
    expect(renderSitemap('https://blog.example', [post])).toContain('https://blog.example/posts/clean-route');
    expect(renderRss('https://blog.example', [post])).toContain('<title>干净文章路由</title>');
  });
});
