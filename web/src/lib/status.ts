import type { JobStatus } from '../api';
import type { Tone } from './colours';

// whether a crawl has stopped, so polling can end
export function isTerminalStatus(status: JobStatus | undefined): boolean {
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
  blocked: 'Blocked',
  unknown: 'Unknown',
};

// label for a page's outcome: "200 OK", "404", "DNS failure"...
export function pageStatusLabel(alive: boolean, code: number, errorType: string): string {
  if (alive) {
    return `${code || 200} OK`;
  }
  if (errorType === 'http_4xx' || errorType === 'server_error') {
    return code ? String(code) : errorType === 'http_4xx' ? '4xx' : '5xx';
  }
  return FAILURE_LABEL[errorType] ?? (code ? String(code) : 'Failed');
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

export function jobStatusChip(status: string): string {
  switch (status) {
    case 'complete':
      return 'chip-ok';
    case 'failed':
      return 'chip-bad';
    case 'crawling':
    case 'pending':
      return 'chip-warn';
    default:
      return 'chip-neutral';
  }
}
