import type { JobStatus } from '../api';

// isTerminalStatus reports whether a crawl has stopped progressing (so polling can end and
// the UI can switch from "crawling" to "done" affordances).
export function isTerminalStatus(status: JobStatus | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'stopped';
}
