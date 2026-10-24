import { useEffect, useState } from 'react';

import { LoaderCircle } from 'lucide-react';

import { SECTION_HEX } from '../lib/colours';
import { ScoreScale } from './OverallReport';
import { StatusChip } from './ui/StatusChip';

// illustrative crawl of example.com; every cell is labelled as sample in the UI
const ROWS = [
  { path: '/blog/launch-day', alive: false, code: 200, error: 'soft_404', at: 0.3 },
  { path: '/docs/v1/install', alive: false, code: 404, error: 'http_4xx', at: 0.45 },
  { path: '/pricing', alive: false, code: 301, error: 'redirect_loop', at: 0.6 },
  { path: '/about', alive: true, code: 200, error: '', at: 0.75 },
  { path: '/blog', alive: true, code: 200, error: '', at: 0.9 },
];

// s = section index (-1 = homepage), d = link depth from the homepage
const NODES: { x: number; y: number; s: number; d: number; broken?: boolean }[] = [
  { x: 200, y: 150, s: -1, d: 0 },
  { x: 110, y: 85, s: 0, d: 1 },
  { x: 58, y: 42, s: 0, d: 2 },
  { x: 42, y: 112, s: 0, d: 2 },
  { x: 104, y: 24, s: 0, d: 2, broken: true },
  { x: 295, y: 80, s: 1, d: 1 },
  { x: 345, y: 38, s: 1, d: 2, broken: true },
  { x: 360, y: 108, s: 1, d: 2 },
  { x: 302, y: 22, s: 1, d: 2 },
  { x: 300, y: 228, s: 2, d: 1 },
  { x: 360, y: 262, s: 2, d: 2, broken: true },
  { x: 258, y: 276, s: 2, d: 2 },
  { x: 102, y: 222, s: 3, d: 1 },
  { x: 46, y: 250, s: 3, d: 2 },
  { x: 120, y: 280, s: 3, d: 2 },
  { x: 176, y: 262, s: 3, d: 2 },
];
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [0, 5],
  [5, 6],
  [5, 7],
  [5, 8],
  [0, 9],
  [9, 10],
  [9, 11],
  [0, 12],
  [12, 13],
  [12, 14],
  [12, 15],
];
const SECTIONS = ['/blog', '/docs', '/pricing', '/about'];

// when each depth appears, as a fraction of the replay
const DEPTH_AT = [0, 0.18, 0.42];
const RING_AT = 0.86;
const SCORE = 64;
const DURATION_MS = 2600;
const DELAY_MS = 500;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// 0 -> 1 over one replay; reduced motion starts at the end state
function useReplay(): number {
  const [p, setP] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0,
  );
  useEffect(() => {
    if (p >= 1) {
      return;
    }
    let raf = 0;
    const start = performance.now() + DELAY_MS;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      setP(t);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // runs once; p only gates the reduced-motion case
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

// the landing's three-cell demonstration: broken links | site graph | average SEO score
export function SampleCrawl() {
  const p = useReplay();
  const checked = Math.round(easeOut(p) * 240);
  const broken = ROWS.filter((r) => !r.alive && p >= r.at).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3">
      <section className="cell lg:border-r" aria-label="Sample checked links">
        <CellHead title="Links checked" />
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {ROWS.map((r) => (
            <li
              key={r.path}
              className="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6"
            >
              <span className="truncate font-mono text-[13px]">{r.path}</span>
              {p >= r.at ? (
                <span className="inline-flex animate-tick">
                  <StatusChip alive={r.alive} code={r.code} error={r.error} />
                </span>
              ) : (
                <span className="chip chip-neutral">
                  <LoaderCircle className="spin size-3" strokeWidth={2.5} aria-hidden="true" />
                  checking
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="num px-5 py-4 text-[13px] text-ink-3 sm:px-6">
          {broken} broken of {checked} checked
        </p>
      </section>

      <section className="cell border-t lg:border-r lg:border-t-0" aria-label="Sample site graph">
        <CellHead title="Site graph" />
        <SampleGraph p={p} />
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pb-4 font-mono text-[11px] text-ink-3 sm:px-6">
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: SECTION_HEX[i] }} />
              {s}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full ring-[1.5px] ring-bad-dot ring-offset-1" />
            broken
          </li>
        </ul>
      </section>

      <section className="cell border-t lg:border-t-0" aria-label="Sample average SEO score">
        <CellHead title="Average SEO score" />
        <div className="px-5 pb-5 pt-4 sm:px-6">
          <p className="flex items-baseline gap-1.5">
            <span className="num text-[72px] font-semibold leading-none tracking-display">
              {Math.round(easeOut(p) * SCORE)}
            </span>
            <span className="text-lg text-ink-3">/100</span>
          </p>
          <ScoreScale score={Math.round(easeOut(p) * SCORE)} />
          <dl className="num mt-6 divide-y divide-line border-y border-line text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-ink-3">Pages checked</dt>
              <dd className="font-mono text-[13px]">{checked}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-ink-3">Broken</dt>
              <dd className="font-mono text-[13px] text-bad-fg">{broken}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function CellHead({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
      <h3 className="text-sm font-medium">{title}</h3>
      <span className="chip chip-neutral">Sample</span>
    </div>
  );
}

function SampleGraph({ p }: { p: number }) {
  const shown = (d: number) => p >= DEPTH_AT[d];
  return (
    <svg
      viewBox="0 0 400 300"
      className="mx-auto block h-auto w-full max-w-[420px] px-3"
      role="img"
      aria-label="Sample site graph: four sections, three broken pages"
    >
      <g stroke="#d4d4d4" strokeWidth="1">
        {LINKS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            style={{ opacity: shown(NODES[b].d) ? 1 : 0, transition: 'opacity 300ms ease-out' }}
          />
        ))}
      </g>
      {NODES.map((n, i) => {
        const r = n.d === 0 ? 7 : n.d === 1 ? 5 : 3.6;
        const on = shown(n.d);
        return (
          <g
            key={i}
            style={{
              opacity: on ? 1 : 0,
              transform: on ? 'scale(1)' : 'scale(0.4)',
              transformOrigin: `${n.x}px ${n.y}px`,
              transition: 'opacity 260ms ease-out, transform 420ms cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {n.broken && (
              <circle
                cx={n.x}
                cy={n.y}
                r={r + 4}
                fill="none"
                stroke="#e5484d"
                strokeWidth="1.6"
                style={{ opacity: p >= RING_AT ? 1 : 0, transition: 'opacity 300ms ease-out' }}
              />
            )}
            <circle cx={n.x} cy={n.y} r={r} fill={n.s < 0 ? '#171717' : SECTION_HEX[n.s]} />
          </g>
        );
      })}
    </svg>
  );
}
