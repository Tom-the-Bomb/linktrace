// shared colour mappings so SEO score thresholds (>=80 good, >=50 ok, else poor), status tones and
// the per-section palette live in one place.

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

export type ScoreTier = 'good' | 'ok' | 'poor';

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

export const TIER_TONE: Record<ScoreTier, Tone> = { good: 'ok', ok: 'warn', poor: 'bad' };

// canvas hex per tier, for the graph painter and inline SVG
export const TIER_HEX: Record<ScoreTier, string> = {
  good: '#1fb26b',
  ok: '#f0a400',
  poor: '#e5294f',
};

export const BROKEN_HEX = '#e5294f';
export const NO_SCORE_HEX = '#b7b9c2';

const TIER_LABEL: Record<ScoreTier, string> = { good: 'Good', ok: 'Needs work', poor: 'Poor' };
const TIER_CHIP: Record<ScoreTier, string> = { good: 'chip-ok', ok: 'chip-warn', poor: 'chip-bad' };

// tier chip class + word for a score, shown beside big score numbers
export function scoreTierChip(score: number): { label: string; chip: string } {
  const t = scoreTier(score);
  return { label: TIER_LABEL[t], chip: TIER_CHIP[t] };
}

// maps an SEO score to its text colour class (null = no score).
export function scoreTextColour(score: number | null): string {
  if (score === null) {
    return 'text-ink-3';
  }
  return toneColour(TIER_TONE[scoreTier(score)]);
}

// categorical palette for site sections; order matches the by-section list (largest first).
// eight hues kept apart in both hue and lightness so 10px dots stay tellable
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

// section colour by rank; sections past the palette share a neutral
export function sectionHex(rank: number): string {
  return rank >= 0 && rank < SECTION_HEX.length ? SECTION_HEX[rank] : OTHER_SECTION_HEX;
}

// section -> colour, ranked by page count so the largest section always gets the first hue
export function sectionColourMap(
  categories: { category: string; total_pages: number }[],
): (section: string) => string {
  const ranked = [...categories].sort((a, b) => b.total_pages - a.total_pages);
  const byName = new Map(ranked.map((c, i) => [c.category, sectionHex(i)]));
  return (section) => byName.get(section) ?? OTHER_SECTION_HEX;
}

// first path segment of a URL as "/segment", "/" for the homepage; mirrors the API's categories
export function sectionOf(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? `/${seg}` : '/';
  } catch {
    return '/';
  }
}

// returns count/total as a rounded percentage, guarding divide-by-zero.
export function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
