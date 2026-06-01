import type { JobStatus } from '../api';

// whether a crawl has stopped, so polling can end
export function isTerminalStatus(status: JobStatus | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'stopped';
}
