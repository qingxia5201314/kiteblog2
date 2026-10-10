const SITE_NAME = 'Kitepop SOS';
const HOME_DESCRIPTION = 'Kitepop 的个人博客，记录个人生活、SRC 挖掘案例、专业学习与知识点。';

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value = '') {
  return escapeHtml(value);
}

export function stripMarkdown(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>$~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(siteUrl, value = '') {
  if (!value) return `${siteUrl}/favicon.png`;
  try {
    return new URL(value, `${siteUrl}/`).toString();
  } catch {
    return `${siteUrl}/favicon.png`;
  }
}

function jsonLdScript(value) {
  return `<script type="application/ld+json" data-kitepop-jsonld>${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`;
}

function renderMeta({ siteUrl, path, title, description, image, type = 'website', post }) {
  const canonical = new URL(path, `${siteUrl}/`).toString();
  const imageUrl = absoluteUrl(siteUrl, image);
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    '<link rel="alternate" type="application/rss+xml" title="Kitepop SOS RSS" href="/rss.xml" />'
  ];

  if (post) {
    tags.push(`<meta property="article:published_time" content="${escapeHtml(post.createdAt)}" />`);
    tags.push(`<meta property="article:modified_time" content="${escapeHtml(post.updatedAt)}" />`);
    post.tags.forEach((tag) => tags.push(`<meta property="article:tag" content="${escapeHtml(tag)}" />`));
    tags.push(
      jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        datePublished: post.createdAt,
        dateModified: post.updatedAt,
        mainEntityOfPage: canonical,
        image: imageUrl,
        author: { '@type': 'Person', name: 'Kitepop' },
        publisher: { '@type': 'Organization', name: SITE_NAME }
      })
    );
  } else {
    tags.push(
      jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: SITE_NAME,
        description,
        url: canonical
      })
    );
  }

  return tags.join('\n    ');
}

function renderMarkdownPreview(content = '') {
  const escaped = escapeHtml(content);
  return escaped
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>')
    .split(/\n{2,}/)
    .map((block) => (/^<h[23]>/.test(block) ? block : `<p>${block.replaceAll('\n', '<br />')}</p>`))
    .join('\n');
}

function renderHomeFallback(posts) {
  const items = posts
    .slice(0, 12)
    .map(
      (post) => `<article>
        <h2><a href="/posts/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
        <p>${escapeHtml(post.summary)}</p>
        <small>${escapeHtml(post.updatedAt)} · ${escapeHtml(post.tags.join(' / '))}</small>
      </article>`
    )
    .join('\n');
  return `<main class="seo-fallback"><h1>${SITE_NAME}</h1><p>${HOME_DESCRIPTION}</p>${items}</main>`;
}

function renderPostFallback(post) {
  return `<main class="seo-fallback article-fallback">
    <p><a href="/">返回首页</a></p>
    <article>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.summary)}</p>
      <small>${escapeHtml(post.updatedAt)} · ${escapeHtml(post.tags.join(' / '))}</small>
      ${renderMarkdownPreview(post.content)}
    </article>
  </main>`;
}

export function renderSeoPage(indexHtml, { siteUrl, post, posts = [] }) {
  const title = post ? `${post.title} | ${SITE_NAME}` : `${SITE_NAME} | 生活、SRC、学习与知识记录`;
  const description = post ? stripMarkdown(post.summary || post.content).slice(0, 180) : HOME_DESCRIPTION;
  const path = post ? `/posts/${encodeURIComponent(post.slug)}` : '/';
  const head = renderMeta({
    siteUrl,
    path,
    title,
    description,
    image: post?.coverImage,
    type: post ? 'article' : 'website',
    post
  });
  const fallback = post ? renderPostFallback(post) : renderHomeFallback(posts);

  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"></div><noscript>${fallback}</noscript>`);
}

export function renderRobots(siteUrl) {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /accounting\nDisallow: /files\nDisallow: /images\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function renderSitemap(siteUrl, posts) {
  const urls = [
    `<url><loc>${escapeXml(`${siteUrl}/`)}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...posts.map(
      (post) => `<url><loc>${escapeXml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}`)}</loc><lastmod>${escapeXml(
        post.updatedAt
      )}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    )
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join(
    ''
  )}</urlset>`;
}

export function renderRss(siteUrl, posts) {
  const items = posts
    .slice(0, 30)
    .map(
      (post) => `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(
        `${siteUrl}/posts/${encodeURIComponent(post.slug)}`
      )}</link><guid>${escapeXml(`${siteUrl}/posts/${encodeURIComponent(post.slug)}`)}</guid><pubDate>${new Date(
        post.updatedAt
      ).toUTCString()}</pubDate><description>${escapeXml(post.summary)}</description></item>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${SITE_NAME}</title><link>${escapeXml(
    `${siteUrl}/`
  )}</link><description>${escapeXml(HOME_DESCRIPTION)}</description>${items}</channel></rss>`;
}
