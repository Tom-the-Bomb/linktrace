import type { JobStatus } from '../api';
import type { Tone } from './colours';

// whether a crawl has stopped, so polling can end
export function isTerminalStatus(status: string | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'stopped';
}

// checker error_type -> plain label; keys mirror internal/checker
const FAILURE_LABEL: Record<string, string> = {
  timeout: 'Timeout',
  dns_failure: 'DNS failure',
  connection_refused: 'Refused',
  connection_reset: 'Conn. reset',
  redirect_loop: 'Redirect loop',
  ssl_error: 'SSL error',
  soft_404: 'Soft 404',
  http_4xx: '4xx',
  server_error: '5xx',
  blocked: 'Blocked',
  unknown: 'Unknown',
};

// label for a page's outcome: "200 OK", "404", "DNS failure"...
export function pageStatusLabel(alive: boolean, code: number, errorType: string): string {
  if (alive) {
    return `${code || 200} OK`;
  }
  // an HTTP error shows its actual code ("404", "503") when there is one
  if (code && (errorType === 'http_4xx' || errorType === 'server_error')) {
    return String(code);
  }
  return FAILURE_LABEL[errorType] ?? (code ? String(code) : 'Failed');
}

// one plain sentence per checker error_type; shared by the landing page and the report
export const FAILURE_EXPLANATION: Record<string, string> = {
  dns_failure: "The domain name doesn't point to a server (the DNS lookup failed).",
  timeout: 'The server took too long to respond.',
  connection_refused: 'The server refused the connection, or dropped it partway through.',
  connection_reset: 'The server refused the connection, or dropped it partway through.',
  ssl_error: "The site's certificate is invalid, expired or issued for a different domain.",
  redirect_loop: 'The page redirects back to itself, or goes through more than 10 redirects.',
  soft_404: "The page loads with a 200 status, but its content says it couldn't be found.",
  http_4xx: "The server says the page doesn't exist or can't be accessed (404, 403 and so on).",
  server_error: 'The server hit an error while responding (500, 502 and so on).',
  blocked:
    'A bot check or rate limit answered instead of the page. These are marked in amber rather than red, since the page itself may be fine.',
  unknown: 'The URL could not be checked (it may be malformed, or not an http or https link).',
};

// short label for grouping broken pages by cause ("404" and "410" both group under 4xx)
export function failureGroup(errorType: string): string {
  return FAILURE_LABEL[errorType] ?? 'Other';
}

// blocked is an anti-bot wall, not real rot, so it reads as a warning
export function pageStatusTone(alive: boolean, errorType: string): Tone {
  if (alive) {
    return 'ok';
  }
  return errorType === 'blocked' ? 'warn' : 'bad';
}

const JOB_LABEL: Record<JobStatus, string> = {
  pending: 'Queued',
  crawling: 'Crawling',
  complete: 'Complete',
  failed: 'Failed',
  stopped: 'Stopped',
};

export function jobStatusLabel(status: string): string {
  return JOB_LABEL[status as JobStatus] ?? status;
}

export function jobStatusTone(status: string): Tone | 'neutral' {
  switch (status) {
    case 'complete':
      return 'ok';
    case 'failed':
      return 'bad';
    case 'crawling':
    case 'pending':
      return 'warn';
    default:
      return 'neutral';
  }
}
