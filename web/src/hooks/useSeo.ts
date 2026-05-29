import { useEffect } from 'react';

import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME, SITE_URL } from '../lib/seo';

interface SeoOptions {
  // Page title without the site suffix, e.g. "Sign in". Omit for the default home title.
  title?: string;
  description?: string;
  // Canonical path, e.g. "/auth". Omit for the home page ("/").
  path?: string;
  // App/transient pages (auth, history, per-job reports) shouldn't be indexed.
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

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Keeps the document title and the SEO-relevant meta tags in sync as the user
// navigates the SPA. The static defaults live in index.html for first paint /
// social scrapers; this just updates them on client-side route changes.
export function useSeo({ title, description, path, noindex }: SeoOptions = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
    const desc = description ?? DEFAULT_DESCRIPTION;
    const url = `${SITE_URL}${path ?? '/'}`;

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertCanonical(url);
  }, [title, description, path, noindex]);
}
