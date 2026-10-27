import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';

import type { JobStatus } from '../../api';
import type { Tone } from '../../lib/colours';
import { JOB_STATUS, isTerminalStatus, pageStatusLabel, pageStatusTone } from '../../lib/status';
import { Badge } from './badge';
import { Spinner } from './spinner';

const TONE_ICON = { ok: CircleCheck, warn: CircleAlert, bad: CircleX };

// icon + word, so the meaning doesn't rely on colour
export function ToneChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <Badge variant={tone} mono>
      <Icon className="size-3" strokeWidth={2.5} />
      {children}
    </Badge>
  );
}

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

export function JobStatusChip({ status }: { status: JobStatus }) {
  const { label, tone } = JOB_STATUS[status];
  return (
    <Badge variant={tone}>
      {!isTerminalStatus(status) && <Spinner className="size-3" aria-hidden="true" />}
      {label}
    </Badge>
  );
}
