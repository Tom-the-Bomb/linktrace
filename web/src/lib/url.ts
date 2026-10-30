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

export function pathOf(url: string): string {
  const u = parse(url);
  return u ? u.pathname + u.search || '/' : url;
}

// mirrors the API's categories, which split the decoded path
export function sectionOf(url: string): string {
  let path = parse(url)?.pathname ?? '/';
  try {
    path = decodeURIComponent(path);
  } catch {
    /* not UTF-8 */
  }
  const seg = path.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

export function hostSlug(url: string): string {
  return parse(url)?.host.replace(/[^a-z0-9.-]/gi, '-') ?? 'site';
}
