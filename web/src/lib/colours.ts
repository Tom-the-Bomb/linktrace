// shared colour mappings so SEO score thresholds (>=80 good, >=50 ok, else poor) and the
// ok/bad tone live in one place.

export type Tone = 'ok' | 'bad';

// toneColour maps a neutral/ok/bad tone to a text colour class.
export function toneColour(tone?: Tone): string {
  if (tone === 'ok') return 'text-emerald-300';
  if (tone === 'bad') return 'text-rose-300';
  return 'text-paper';
}

// scoreTextColour maps an SEO score to its text colour class (null = no score).
export function scoreTextColour(score: number | null): string {
  if (score === null) return 'text-ink-300';
  if (score >= 80) return 'text-emerald-300';
  if (score >= 50) return 'text-accent';
  return 'text-rose-300';
}

// scoreStrokeColour is the SVG stroke equivalent of scoreTextColour, for the gauge ring.
export function scoreStrokeColour(score: number): string {
  if (score >= 80) return 'stroke-emerald-400';
  if (score >= 50) return 'stroke-accent';
  return 'stroke-rose-400';
}
