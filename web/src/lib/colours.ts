// shared colour mappings so SEO score thresholds (>=80 good, >=50 ok, else poor) and the
// ok/bad tone live in one place.

export type Tone = 'ok' | 'bad';

// toneColour maps a neutral/ok/bad tone to a text colour class.
export function toneColour(tone?: Tone): string {
  if (tone === 'ok') return 'text-emerald-300';
  if (tone === 'bad') return 'text-rose-300';
  return 'text-paper';
}

export type ScoreTier = 'good' | 'ok' | 'poor';

// scoreTier is the single source of truth for the SEO score thresholds; both the text
// and stroke colour maps key off it.
export function scoreTier(score: number | null): ScoreTier {
  if (score === null) return 'poor'; // null has no text/stroke colour of its own; callers handle null first
  if (score >= 80) return 'good';
  if (score >= 50) return 'ok';
  return 'poor';
}

const SCORE_TEXT: Record<ScoreTier, string> = {
  good: 'text-emerald-300',
  ok: 'text-accent',
  poor: 'text-rose-300',
};

const SCORE_STROKE: Record<ScoreTier, string> = {
  good: 'stroke-emerald-400',
  ok: 'stroke-accent',
  poor: 'stroke-rose-400',
};

// scoreTextColour maps an SEO score to its text colour class (null = no score).
export function scoreTextColour(score: number | null): string {
  if (score === null) return 'text-ink-300';
  return SCORE_TEXT[scoreTier(score)];
}

// scoreStrokeColour is the SVG stroke equivalent of scoreTextColour, for the gauge ring.
export function scoreStrokeColour(score: number): string {
  return SCORE_STROKE[scoreTier(score)];
}

// chipTone returns the repeated "soft chip" recipe (subtle border + tinted fill + bright
// text) for a given colour family. Used by status/category/placement chips.
export function chipTone(tone: 'emerald' | 'rose' | 'amber' | 'accent'): string {
  const map: Record<typeof tone, string> = {
    emerald: 'border-emerald-400/40 bg-emerald-500/5 text-emerald-300',
    rose: 'border-rose-400/40 bg-rose-500/5 text-rose-300',
    amber: 'border-amber-400/40 bg-amber-500/5 text-amber-300',
    accent: 'border-accent/40 bg-accent/5 text-accent',
  };
  return map[tone];
}

// pct returns count/total as a rounded percentage, guarding divide-by-zero.
export function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
