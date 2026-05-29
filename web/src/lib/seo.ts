// Central SEO config. SITE_URL drives canonical + og:url and is overridable per deploy via
// VITE_SITE_URL; the trailing slash is stripped so callers can append paths.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://linktrace.tomthebomb.dev').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'LinkTrace';

// Also duplicated in index.html, the manifest, and the OG image.
export const DEFAULT_DESCRIPTION =
  'Enter a domain. Find broken links, score your on-page SEO, and explore your whole site as an interactive graph.';

export const DEFAULT_TITLE = 'LinkTrace — Distributed site & link auditor';
