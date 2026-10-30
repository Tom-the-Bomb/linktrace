import type { JobStatus } from '../api';
import type { Tone } from './colours';

export function isTerminalStatus(status: JobStatus | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'stopped';
}

// keys mirror internal/checker
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

export function pageStatusLabel(alive: boolean, code: number, errorType: string): string {
  if (alive) {
    return `${code || 200} OK`;
  }
  if (code && (errorType === 'http_4xx' || errorType === 'server_error')) {
    return String(code);
  }
  return FAILURE_LABEL[errorType] ?? (code ? String(code) : 'Failed');
}

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
    'A bot check or rate limit answered instead of the page, so the page itself may be fine.',
  unknown: "The URL couldn't be checked (it may be malformed, or not an http or https link).",
};

const CODE_EXPLANATION: Record<number, string> = {
  401: 'The page needs a login to view (401 Unauthorized).',
  403: 'The server refused access to the page (403 Forbidden).',
  404: "The server says the page doesn't exist (404 Not Found).",
  410: 'The server says the page was removed for good (410 Gone).',
  500: 'The server hit an error while building the page (500 Internal Server Error).',
  502: 'A proxy in front of the site got a bad answer from it (502 Bad Gateway).',
  503: 'The server is temporarily unavailable (503 Service Unavailable).',
  504: 'A proxy in front of the site gave up waiting for it (504 Gateway Timeout).',
};

// same code rule as pageStatusLabel, so the sentence matches the chip
export function failureReason(errorType: string, code: number): string {
  if (code && (errorType === 'http_4xx' || errorType === 'server_error')) {
    return (
      CODE_EXPLANATION[code] ??
      (errorType === 'http_4xx'
        ? `The server answered with a ${code} error, so the page can't be loaded.`
        : `The server hit an error while responding (${code}).`)
    );
  }
  return FAILURE_EXPLANATION[errorType] ?? "The page couldn't be loaded.";
}

export function failureGroup(errorType: string): string {
  return FAILURE_LABEL[errorType] ?? 'Other';
}

// blocked is a bot wall, not real rot
export function pageStatusTone(alive: boolean, errorType: string): Tone {
  if (alive) {
    return 'ok';
  }
  return errorType === 'blocked' ? 'warn' : 'bad';
}

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone | 'neutral' }> = {
  pending: { label: 'Queued', tone: 'warn' },
  crawling: { label: 'Crawling', tone: 'warn' },
  complete: { label: 'Complete', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
  stopped: { label: 'Stopped', tone: 'neutral' },
};
