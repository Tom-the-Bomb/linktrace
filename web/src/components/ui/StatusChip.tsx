import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';

import type { Tone } from '../../lib/colours';
import {
  isTerminalStatus,
  jobStatusLabel,
  jobStatusTone,
  pageStatusLabel,
  pageStatusTone,
} from '../../lib/status';
import { Badge } from './badge';
import { Spinner } from './spinner';

const TONE_ICON = { ok: CircleCheck, warn: CircleAlert, bad: CircleX };

// icon + word carry the meaning, colour only reinforces it
export function ToneChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <Badge variant={tone} mono>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden="true" />
      {children}
    </Badge>
  );
}

// a crawled page's outcome
export function StatusChip({
  alive,
  code,
  error,
}: {
  alive: boolean;
  code: number;
  error: string;
}) {
  return (
    <ToneChip tone={pageStatusTone(alive, error)}>{pageStatusLabel(alive, code, error)}</ToneChip>
  );
}

// a crawl's state, led by a spinner while it's still running
export function JobStatusChip({ status }: { status: string }) {
  return (
    <Badge variant={jobStatusTone(status)}>
      {!isTerminalStatus(status) && <Spinner className="size-3" aria-hidden="true" />}
      {jobStatusLabel(status)}
    </Badge>
  );
}
