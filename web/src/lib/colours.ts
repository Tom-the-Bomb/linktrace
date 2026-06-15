// shared colour mappings so SEO score thresholds (>=80 good, >=50 ok, else poor) and the
// ok/bad tone live in one place.

export type Tone = 'ok' | 'bad';

// maps a neutral/ok/bad tone to a text colour class.
export function toneColour(tone?: Tone): string {
  if (tone === 'ok') return 'text-emerald-300';
  if (tone === 'bad') return 'text-rose-300';
  return 'text-paper';
}

export type ScoreTier = 'good' | 'ok' | 'poor';

// SEO score thresholds; the text and stroke colour maps key off this.
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

// maps an SEO score to its text colour class (null = no score).
export function scoreTextColour(score: number | null): string {
  if (score === null) return 'text-ink-300';
  return SCORE_TEXT[scoreTier(score)];
}

// gauge-ring stroke variant of scoreTextColour.
export function scoreStrokeColour(score: number): string {
  return SCORE_STROKE[scoreTier(score)];
}

// returns count/total as a rounded percentage, guarding divide-by-zero.
export function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
