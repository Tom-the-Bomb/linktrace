import type { CSSProperties, Ref } from 'react';

interface Props {
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  visible: boolean;
  path: string;
  detail: string;
  detailClass?: string;
  note?: string[];
}

// callers position it via style, or via the ref to skip a re-render per pointer move
export function NodeTooltip({ ref, style, visible, path, detail, detailClass = '', note }: Props) {
  return (
    <div
      ref={ref}
      style={style}
      aria-hidden="true"
      className={`bg-ink shadow-lift text-code pointer-events-none absolute top-0 left-0 z-30 w-max max-w-65 rounded-lg px-2.5 py-1.5 font-mono text-white transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="truncate">{path}</span>
        <span className={`shrink-0 font-medium ${detailClass}`}>{detail}</span>
      </div>
      {note && note.length > 0 && (
        <div className="mt-0.5 font-sans leading-snug text-white/60">
          {note.map((seg) => (
            <div key={seg}>{seg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
