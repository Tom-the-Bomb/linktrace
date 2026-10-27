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

// mirrors the API's categories
export function sectionOf(url: string): string {
  const seg = parse(url)?.pathname.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

export function hostSlug(url: string): string {
  return parse(url)?.host.replace(/[^a-z0-9.-]/gi, '-') ?? 'site';
}
