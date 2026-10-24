import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';

import type { Tone } from '../../lib/colours';
import { pageStatusLabel, pageStatusTone } from '../../lib/status';

const TONE_CHIP: Record<Tone, string> = { ok: 'chip-ok', warn: 'chip-warn', bad: 'chip-bad' };
const TONE_ICON = { ok: CircleCheck, warn: CircleAlert, bad: CircleX };

// tinted pill: icon + word carry the meaning, colour only reinforces it
export function ToneChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={`chip chip-code ${TONE_CHIP[tone]}`}>
      <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {children}
    </span>
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
