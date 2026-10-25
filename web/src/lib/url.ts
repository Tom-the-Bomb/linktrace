export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// path + query only, for compact display; the report header already names the host
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
}

// first path segment as "/segment", "/" for the homepage; mirrors the API's categories
export function sectionOf(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? `/${seg}` : '/';
  } catch {
    return '/';
  }
}

// the host, safe for a file name
export function hostSlug(url: string): string {
  try {
    return new URL(url).host.replace(/[^a-z0-9.-]/gi, '-');
  } catch {
    return 'site';
  }
}
