import { type Tone, toneColour } from '../../lib/colours';

interface Props {
  label: string;
  value: string | number;
  tone?: Tone;
  hint?: string;
  // bordered tile (CrawlStatsPanel) vs borderless big stat (OverallReport)
  bordered?: boolean;
}

// labelled metric: bordered tile or plain big stat
export function StatTile({ label, value, tone, hint, bordered }: Props) {
  if (bordered) {
    return (
      <div className="border border-ink-500/60 bg-ink-700/30 p-4">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">{label}</div>
        <div className={`display mt-2 text-2xl font-medium tabular-nums ${toneColour(tone)}`}>
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 font-mono text-[10px] tracking-wide text-ink-400">{hint}</div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="eyebrow text-ink-300">{label}</div>
      <div className={`display mt-2 text-4xl font-light tabular-nums ${toneColour(tone)}`}>
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">{hint}</div>
      )}
    </div>
  );
}
