function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  return parse(url)?.host ?? url;
}

// path + query only, for compact display; the report header already names the host
export function pathOf(url: string): string {
  const u = parse(url);
  return u ? u.pathname + u.search || '/' : url;
}

// first path segment as "/segment", "/" for the homepage; mirrors the API's categories
export function sectionOf(url: string): string {
  const seg = parse(url)?.pathname.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

// the host, safe for a file name
export function hostSlug(url: string): string {
  return parse(url)?.host.replace(/[^a-z0-9.-]/gi, '-') ?? 'site';
}
