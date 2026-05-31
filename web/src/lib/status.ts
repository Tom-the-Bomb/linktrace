import type { JobStatus } from '../api';

// isTerminalStatus reports whether a crawl has stopped (so polling can end and the UI flips to done)
export function isTerminalStatus(status: JobStatus | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'stopped';
}
