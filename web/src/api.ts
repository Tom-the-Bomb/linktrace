// Typed wrappers around the LinkTrace REST API; types mirror the Go handler responses.

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

export type JobStatus = 'pending' | 'crawling' | 'complete' | 'failed' | 'stopped';

export interface Status {
  job_id: string;
  url: string;
  status: JobStatus;
  created_at: string;
  discovered: number;
  checked: number;
  healthy: number;
  rotten: number;
  // true for the account or browser that started the crawl; only they can stop or delete it
  can_manage: boolean;
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
  // set when robots.txt disallows everything; the crawl is refused before any page is fetched
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

// status 0 means no response arrived
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// nullOn: a status that means "none" (404, 401) and resolves to null instead of throwing
function jsonRequest<T>(path: string, init?: RequestInit): Promise<T>;
function jsonRequest<T>(
  path: string,
  init: RequestInit | undefined,
  nullOn: number,
): Promise<T | null>;
async function jsonRequest<T>(
  path: string,
  init?: RequestInit,
  nullOn?: number,
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // fetch only rejects when no response arrived (offline, DNS, CORS)
    throw new ApiError(0, "Can't reach LinkTrace. Check your connection and try again.");
  }
  if (res.status === nullOn) {
    return null;
  }
  if (!res.ok) {
    // prefer the server {error} message; a 5xx without one came from the proxy while the API is down
    let msg =
      res.status >= 500
        ? "LinkTrace isn't responding right now. Try again in a moment."
        : `${res.status} ${res.statusText || 'request failed'}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {
        msg = body.error;
      }
    } catch {
      /* response wasn't JSON, keep the default */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

// defaults to https://, and URL turns an international domain into the ASCII form its links use
// (bücher.de -> xn--bcher-kva.de). joined: the site was already being crawled, so this joined it
export function createCheck(input: string): Promise<{ job_id: string; joined?: boolean }> {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    url = new URL(url).href;
  } catch {
    /* malformed; the server explains what's wrong */
  }
  return jsonRequest('/check', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function cancelCheck(id: string): Promise<{ job_id: string; status: string }> {
  return jsonRequest(`/check/${id}/cancel`, { method: 'POST' });
}

export function deleteJob(id: string): Promise<{ job_id: string; status: string }> {
  return jsonRequest(`/check/${id}`, { method: 'DELETE' });
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

// rotten/uncrawled pages have no audit row; return null on 404 so the drawer shows empty
export function getSEODetail(id: string, url: string): Promise<SEODetail | null> {
  return jsonRequest(`/check/${id}/seo?url=${encodeURIComponent(url)}`, undefined, 404);
}

export interface Me {
  username: string;
}

export interface HistoryRun {
  job_id: string;
  created_at: string;
  status: JobStatus;
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

export function deleteAccount(): Promise<{ ok: boolean }> {
  return jsonRequest('/auth/account', { method: 'DELETE' });
}

// returns null when anonymous (401 isn't an error here, it's a valid state)
export function getMe(): Promise<Me | null> {
  return jsonRequest('/auth/me', undefined, 401);
}

export function getHistory(): Promise<HistoryEntry[]> {
  return jsonRequest('/history');
}
