export type Tone = 'ok' | 'warn' | 'bad';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-fg',
  warn: 'text-warn-fg',
  bad: 'text-bad-fg',
};

export function toneColour(tone?: Tone): string {
  return tone ? TONE_TEXT[tone] : 'text-ink';
}

type ScoreTier = 'good' | 'ok' | 'poor';

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) {
    return 'good';
  }
  if (score >= 50) {
    return 'ok';
  }
  return 'poor';
}

const TIER_TONE: Record<ScoreTier, Tone> = { good: 'ok', ok: 'warn', poor: 'bad' };

// canvas and inline SVG can't read CSS tokens
export const TIER_HEX: Record<ScoreTier, string> = {
  good: '#1fb26b',
  ok: '#f0a400',
  poor: '#e5294f',
};

export const BROKEN_HEX = '#e5484d';
export const INK_HEX = '#171717';
export const LINE_STRONG_HEX = '#d4d4d4';

// the tier colours read too dark on the ink tooltip
export const TOOLTIP_TEXT: Record<ScoreTier, string> = {
  good: 'text-[#6be3a8]',
  ok: 'text-[#ffcf5c]',
  poor: 'text-[#ff8da3]',
};
export const NO_SCORE_HEX = '#b7b9c2';

const TIER_LABEL: Record<ScoreTier, string> = { good: 'Good', ok: 'Needs work', poor: 'Poor' };
export function scoreTierBadge(score: number): { label: string; tone: Tone } {
  const t = scoreTier(score);
  return { label: TIER_LABEL[t], tone: TIER_TONE[t] };
}

export function scoreTextColour(score: number | null): string {
  if (score === null) {
    return 'text-ink-3';
  }
  return toneColour(TIER_TONE[scoreTier(score)]);
}

// apart in hue and lightness so 10px dots stay tellable
export const SECTION_HEX = [
  '#7c5cff',
  '#14b8a6',
  '#f59e0b',
  '#ec4899',
  '#1e3a8a',
  '#84cc16',
  '#9a3412',
  '#38bdf8',
];
export const OTHER_SECTION_HEX = '#9a9ca6';

export function sectionColourMap(ranked: string[]): (section: string) => string {
  const byName = new Map(ranked.map((name, i) => [name, SECTION_HEX[i] ?? OTHER_SECTION_HEX]));
  return (section) => byName.get(section) ?? OTHER_SECTION_HEX;
}

export function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
