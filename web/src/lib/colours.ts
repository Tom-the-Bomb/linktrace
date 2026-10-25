// SEO score thresholds (>=80 good, >=50 ok, else poor), status tones and the section palette

export type Tone = 'ok' | 'warn' | 'bad';

// maps a tone to a text colour class; undefined = default ink.
export function toneColour(tone?: Tone): string {
  if (tone === 'ok') {
    return 'text-ok-fg';
  }
  if (tone === 'warn') {
    return 'text-warn-fg';
  }
  if (tone === 'bad') {
    return 'text-bad-fg';
  }
  return 'text-ink';
}

type ScoreTier = 'good' | 'ok' | 'poor';

// SEO score thresholds; the colour maps key off this.
export function scoreTier(score: number | null): ScoreTier {
  if (score === null) {
    return 'poor'; // null has no colour of its own; callers handle null first
  }
  if (score >= 80) {
    return 'good';
  }
  if (score >= 50) {
    return 'ok';
  }
  return 'poor';
}

const TIER_TONE: Record<ScoreTier, Tone> = { good: 'ok', ok: 'warn', poor: 'bad' };

// canvas hex per tier, for the graph painter and inline SVG
export const TIER_HEX: Record<ScoreTier, string> = {
  good: '#1fb26b',
  ok: '#f0a400',
  poor: '#e5294f',
};

export const BROKEN_HEX = '#e5484d';

// value colours on the dark ink tooltip, where the tier colours above read too dark
export const TOOLTIP_TEXT: Record<ScoreTier, string> = {
  good: 'text-[#6be3a8]',
  ok: 'text-[#ffcf5c]',
  poor: 'text-[#ff8da3]',
};
export const NO_SCORE_HEX = '#b7b9c2';

const TIER_LABEL: Record<ScoreTier, string> = { good: 'Good', ok: 'Needs work', poor: 'Poor' };
// tier word + tone for a score, shown as a badge beside big score numbers
export function scoreTierBadge(score: number): { label: string; tone: Tone } {
  const t = scoreTier(score);
  return { label: TIER_LABEL[t], tone: TIER_TONE[t] };
}

// maps an SEO score to its text colour class (null = no score).
export function scoreTextColour(score: number | null): string {
  if (score === null) {
    return 'text-ink-3';
  }
  return toneColour(TIER_TONE[scoreTier(score)]);
}

// section hues, largest section first, kept apart in hue and lightness so 10px dots stay tellable
export const SECTION_HEX = [
  '#7c5cff', // violet
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
  '#1e3a8a', // navy
  '#84cc16', // lime
  '#9a3412', // rust
  '#38bdf8', // sky
];
export const OTHER_SECTION_HEX = '#9a9ca6';

// section -> colour by rank (sections largest first); those past the palette share a neutral
export function sectionColourMap(ranked: string[]): (section: string) => string {
  const byName = new Map(ranked.map((name, i) => [name, SECTION_HEX[i] ?? OTHER_SECTION_HEX]));
  return (section) => byName.get(section) ?? OTHER_SECTION_HEX;
}

// returns count/total as a rounded percentage, guarding divide-by-zero.
export function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
