// Central SEO config. SITE_URL drives canonical + og:url; override per deploy
// with VITE_SITE_URL. Keep the trailing slash off so callers can append paths.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://linktrace.tomthebomb.dev').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'LinkTrace';

// The one-liner used in index.html, the manifest, the OG image, and the hero —
// keep these in sync if you reword it.
export const DEFAULT_DESCRIPTION =
  'Enter a domain. Find broken links, score your on-page SEO, and explore your whole site as an interactive graph.';

export const DEFAULT_TITLE = 'LinkTrace — Distributed site & link auditor';
