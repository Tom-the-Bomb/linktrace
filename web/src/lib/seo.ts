// trailing slash stripped so callers can append paths
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? 'https://linktrace.tomthebomb.dev'
).replace(/\/$/, '');

export const SITE_NAME = 'LinkTrace';

// also duplicated in index.html, the manifest, and the OG image
export const DEFAULT_DESCRIPTION =
  "Give LinkTrace a domain and it finds the broken links on your site, tells you why each one broke, scores each page's SEO and maps the whole site.";

export const DEFAULT_TITLE = 'LinkTrace | Broken link and SEO checker';
