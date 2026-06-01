// trailing slash stripped so callers can append paths
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://linktrace.tomthebomb.dev').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'LinkTrace';

// also duplicated in index.html, the manifest, and the OG image
export const DEFAULT_DESCRIPTION =
  'Enter a domain. Find broken links, score your on-page SEO, and explore your whole site as an interactive graph.';

export const DEFAULT_TITLE = 'LinkTrace — Distributed site & link auditor';
