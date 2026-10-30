import { useEffect } from 'react';

const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://linktrace.tomthebomb.dev').replace(
  /\/$/,
  '',
);
const SITE_NAME = 'LinkTrace';
const DEFAULT_TITLE = 'LinkTrace | Broken link and SEO checker';

interface SeoOptions {
  title?: string;
  path?: string;
  noindex?: boolean;
}

function upsertMeta(key: 'name' | 'property', value: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${value}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(key, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function useSeo({ title, path, noindex }: SeoOptions = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const url = `${SITE_URL}${path ?? '/'}`;

    document.title = fullTitle;
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:url', url);
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  }, [title, path, noindex]);
}
