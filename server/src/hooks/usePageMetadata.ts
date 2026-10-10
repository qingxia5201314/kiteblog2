import { useEffect } from 'react';
import { BlogPost } from '../lib/blog';
import { normalizeImageUrl } from '../lib/imageUrl';

const HOME_TITLE = 'Kitepop SOS | 生活、SRC、学习与知识记录';
const HOME_DESCRIPTION = 'Kitepop 的个人博客，记录个人生活、SRC 挖掘案例、专业学习与知识点。';

export interface StaticPageMetadata {
  title: string;
  description: string;
  path: `/${string}`;
  schemaType?: 'WebPage' | 'ProfilePage';
  subjectName?: string;
}

function ensureMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

function ensureCanonical(href: string) {
  let element = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

function canonicalOrigin() {
  const existing = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!existing?.href) return window.location.origin;
  try {
    return new URL(existing.href, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function usePageMetadata(post: BlogPost | null, staticPage?: StaticPageMetadata) {
  useEffect(() => {
    const title = staticPage?.title || (post ? `${post.title} | Kitepop SOS` : HOME_TITLE);
    const description = staticPage?.description || post?.summary || HOME_DESCRIPTION;
    const publicOrigin = canonicalOrigin();
    const canonical = new URL(staticPage?.path || (post ? `/posts/${post.slug}` : '/'), `${publicOrigin}/`).toString();
    const normalizedImage = normalizeImageUrl(post?.coverImage || '');
    const image = normalizedImage
      ? new URL(normalizedImage, `${publicOrigin}/`).toString()
      : `${publicOrigin}/favicon.png`;

    document.title = title;
    ensureCanonical(canonical);
    ensureMeta('meta[name="description"]', { name: 'description', content: description });
    ensureMeta('meta[property="og:type"]', { property: 'og:type', content: post && !staticPage ? 'article' : 'website' });
    ensureMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    ensureMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    ensureMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    ensureMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    ensureMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    ensureMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    ensureMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });

    let jsonLd = document.head.querySelector('script[data-kitepop-jsonld]') as HTMLScriptElement | null;
    if (!jsonLd) {
      jsonLd = document.createElement('script');
      jsonLd.type = 'application/ld+json';
      jsonLd.dataset.kitepopJsonld = 'true';
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(
      staticPage
        ? {
            '@context': 'https://schema.org',
            '@type': staticPage.schemaType || 'WebPage',
            name: staticPage.title,
            description,
            url: canonical,
            ...(staticPage.schemaType === 'ProfilePage'
              ? {
                  mainEntity: {
                    '@type': 'Person',
                    name: staticPage.subjectName || 'Kitepop',
                    description,
                    url: canonical
                  }
                }
              : {})
          }
        : post
        ? {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description,
            datePublished: post.createdAt,
            dateModified: post.updatedAt,
            mainEntityOfPage: canonical,
            image,
            author: { '@type': 'Person', name: 'Kitepop' }
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Kitepop SOS',
            description,
            url: canonical
          }
    );
  }, [post, staticPage]);
}
