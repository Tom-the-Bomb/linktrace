// Typed wrappers around the LinkTrace REST API; types mirror the Go handler responses.

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

export type JobStatus = 'pending' | 'crawling' | 'checking' | 'complete' | 'failed' | 'stopped';

export interface Status {
  job_id: string;
  url: string;
  status: JobStatus;
  discovered: number;
  checked: number;
  healthy: number;
  rotten: number;
}

export interface PageRow {
  url: string;
  is_alive: boolean;
  status_code: number;
  error_type: string;
  depth: number;
  archive_url: string;
  response_time: number;
  seo_score: number | null;
}

export interface Issue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface KeywordCount {
  term: string;
  count: number;
}

export interface CategoryReport {
  category: string;
  total_pages: number;
  rotten_pages: number;
  avg_seo_score: number;
  pattern: string;
}

export interface SiteAudit {
  robots_found: boolean;
  robots_disallow_all: boolean;
  crawl_delay: number;
  sitemap_found: boolean;
  sitemap_url_count: number;
  is_https: boolean;
  https_redirect: boolean;
  cert_valid: boolean;
  www_canonical: string;
}

export interface CrawlStats {
  total_pages: number;
  total_requests: number;
  avg_response_ms: number;
  max_response_ms: number;
  error_rate: number;
  duration_seconds: number;
}

export interface SiteSEO {
  pages_audited: number;
  duplicate_title_sets: number;
  missing_meta_desc: number;
  with_canonical: number;
  noindex_pages: number;
  with_jsonld: number;
  with_open_graph: number;
  with_twitter_cards: number;
  with_viewport: number;
  multiple_h1: number;
  missing_h1: number;
}

export interface CoverageGap {
  orphans: string[];
  not_crawled: string[];
  sitemap_dead: string[];
}

export interface Report {
  overall: {
    total_pages: number;
    rotten: number;
    healthy: number;
    avg_seo_score: number;
    top_issues: string[];
  };
  categories: CategoryReport[];
  site_audit: SiteAudit | null;
  crawl_stats: CrawlStats | null;
  site_seo: SiteSEO | null;
  coverage_gap: CoverageGap | null;
}

// Thrown by jsonRequest on non-2xx responses. Carries the HTTP status so callers can
// branch (e.g. AuthForm wants to phrase 401 as "wrong password" vs. 409 as "username taken").
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// every request goes through this so the session cookie rides along + JSON headers stay consistent.
// credentials: 'include' is what makes the browser actually send the cookie cross-origin.
async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // Prefer the server's {"error": "..."} message; fall back to status text.
    let msg = `${res.status} ${res.statusText || 'request failed'}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* response wasn't JSON, keep the default */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export function createCheck(url: string): Promise<{ job_id: string }> {
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return jsonRequest('/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export function cancelCheck(id: string): Promise<{ job_id: string; status: string }> {
  return jsonRequest(`/check/${id}/cancel`, { method: 'POST' });
}

export function getStatus(id: string): Promise<Status> {
  return jsonRequest(`/check/${id}`);
}

export function getResults(id: string): Promise<PageRow[]> {
  return jsonRequest(`/check/${id}/results`);
}

export function getReport(id: string): Promise<Report> {
  return jsonRequest(`/check/${id}/report`);
}

export interface GraphNode {
  id: string;
  url: string;
  is_alive: boolean;
  status_code: number;
  error_type: string;
  depth: number;
  seo_score: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function getGraph(id: string): Promise<GraphData> {
  return jsonRequest(`/check/${id}/graph`);
}

export interface SEODetail {
  url: string;
  title: string;
  title_length: number;
  meta_description: string;
  meta_description_length: number;
  h1_count: number;
  h2_count: number;
  h3_count: number;
  h4_count: number;
  h5_count: number;
  h6_count: number;
  images_total: number;
  images_with_alt: number;
  images_with_dims: number;
  images_lazy_loaded: number;
  images_responsive: number;
  links_internal: number;
  links_external: number;
  links_nofollow: number;
  html_lang: string;
  canonical: string;
  og_tags: Record<string, string> | null;
  twitter_tags: Record<string, string> | null;
  jsonld_count: number;
  jsonld_types: string[] | null;
  has_viewport: boolean;
  noindex: boolean;
  top_keywords: KeywordCount[] | null;
  primary_keyword: string;
  keyword_in_title: boolean;
  keyword_in_h1: boolean;
  keyword_in_url: boolean;
  issues: Issue[] | null;
  score: number;
}

// Rotten/uncrawled pages have no audit row, return null instead of throwing on 404
// so the drawer can render an empty state.
export async function getSEODetail(id: string, url: string): Promise<SEODetail | null> {
  const res = await fetch(`${BASE}/check/${id}/seo?url=${encodeURIComponent(url)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /check/${id}/seo failed: ${res.status}`);
  return res.json() as Promise<SEODetail>;
}

export interface Me {
  username: string;
}

export interface HistoryRun {
  job_id: string;
  created_at: string;
}

export interface HistoryEntry {
  url: string;
  crawl_count: number;
  last_job_id: string;
  last_crawled: string;
  runs: HistoryRun[]; // most recent first
}

export function register(username: string, password: string): Promise<Me> {
  return jsonRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<Me> {
  return jsonRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return jsonRequest('/auth/logout', { method: 'POST' });
}

// getMe returns null when anonymous (401 isn't an error here, it's a valid state)
export async function getMe(): Promise<Me | null> {
  const res = await fetch(`${BASE}/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`getMe failed: ${res.status}`);
  return res.json() as Promise<Me>;
}

export function getHistory(): Promise<HistoryEntry[]> {
  return jsonRequest('/history');
}
