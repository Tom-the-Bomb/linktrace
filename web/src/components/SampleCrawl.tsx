import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { BROKEN_HEX, INK_HEX, LINE_STRONG_HEX, SECTION_HEX, TOOLTIP_TEXT } from '../lib/colours';
import { buildTree, nodeNote, pathFromRoot } from '../lib/graph';
import { NodeTooltip } from './ui/NodeTooltip';
import { ScoreScale } from './ui/ScoreScale';
import { StatusChip } from './ui/StatusChip';
import { Badge } from './ui/badge';
import { Spinner } from './ui/spinner';

// illustrative crawl of example.com; every cell is labelled as sample in the UI
const ROWS = [
  { path: '/blog/launch-day', alive: false, code: 200, error: 'soft_404', at: 0.3 },
  { path: '/docs/v1/install', alive: false, code: 404, error: 'http_4xx', at: 0.45 },
  { path: '/pricing/teams', alive: false, code: 301, error: 'redirect_loop', at: 0.6 },
  { path: '/about', alive: true, code: 200, error: '', at: 0.75 },
  { path: '/blog', alive: true, code: 200, error: '', at: 0.9 },
];

// s = section index (-1 = homepage), d = link depth from the homepage; `fail` matches a ROWS entry
const NODES: { x: number; y: number; s: number; d: number; path: string; fail?: string }[] = [
  { x: 200, y: 150, s: -1, d: 0, path: '/' },
  { x: 110, y: 85, s: 0, d: 1, path: '/blog' },
  { x: 58, y: 42, s: 0, d: 2, path: '/blog/notes' },
  { x: 42, y: 112, s: 0, d: 2, path: '/blog/release-2' },
  { x: 104, y: 24, s: 0, d: 2, path: '/blog/launch-day', fail: 'Soft 404' },
  { x: 295, y: 80, s: 1, d: 1, path: '/docs' },
  { x: 345, y: 38, s: 1, d: 2, path: '/docs/v1/install', fail: '404' },
  { x: 360, y: 108, s: 1, d: 2, path: '/docs/api' },
  { x: 302, y: 22, s: 1, d: 2, path: '/docs/guides' },
  { x: 300, y: 228, s: 2, d: 1, path: '/pricing' },
  { x: 360, y: 262, s: 2, d: 2, path: '/pricing/teams', fail: 'Redirect loop' },
  { x: 258, y: 276, s: 2, d: 2, path: '/pricing/faq' },
  { x: 102, y: 222, s: 3, d: 1, path: '/about' },
  { x: 46, y: 250, s: 3, d: 2, path: '/about/team' },
  { x: 120, y: 280, s: 3, d: 2, path: '/about/contact' },
  { x: 176, y: 262, s: 3, d: 2, path: '/about/press' },
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
const TREE = buildTree(LINKS.map(([a, b]) => ({ source: NODES[a].path, target: NODES[b].path })));

// when each depth appears, as a fraction of the replay
const DEPTH_AT = [0, 0.18, 0.42];
const RING_AT = 0.86;
const SCORE = 64;
const DURATION_MS = 2600;
const DELAY_MS = 500;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// 0 -> 1 over one replay; reduced motion starts at the end state
function useReplay(): number {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
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
  }, [reduced]);
  return p;
}

// the landing's three-cell demonstration: broken links | site graph | average SEO score
export function SampleCrawl() {
  const p = useReplay();
  const checked = Math.round(easeOut(p) * 240);
  const broken = ROWS.filter((r) => !r.alive && p >= r.at).length;
  const score = Math.round(easeOut(p) * SCORE);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3">
      <section className="relative lg:border-r" aria-label="Sample checked links">
        <CellHead title="Links checked" />
        <ul className="mt-3 divide-y border-y">
          {ROWS.map((r) => (
            <li
              key={r.path}
              className="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6"
            >
              <span className="text-label truncate font-mono">{r.path}</span>
              {p >= r.at ? (
                <span className="animate-tick inline-flex">
                  <StatusChip alive={r.alive} code={r.code} error={r.error} />
                </span>
              ) : (
                <Badge>
                  <Spinner className="size-3" aria-hidden="true" />
                  checking
                </Badge>
              )}
            </li>
          ))}
        </ul>
        <p className="num text-ink-3 text-label px-5 py-4 sm:px-6">
          {broken} broken of {checked} checked
        </p>
      </section>

      <section
        className="relative border-t lg:border-t-0 lg:border-r"
        aria-label="Sample site graph"
      >
        <CellHead title="Site graph" />
        <SampleGraph p={p} />
        <ul className="text-ink-3 text-code flex flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pt-2 pb-4 font-mono forced-color-adjust-none sm:px-6">
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: SECTION_HEX[i] }} />
              {s}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="ring-bad-dot size-2 rounded-full ring-[1.5px] ring-offset-1" />
            broken
          </li>
        </ul>
      </section>

      <section className="relative border-t lg:border-t-0" aria-label="Sample average SEO score">
        <CellHead title="Average SEO score" />
        <div className="px-5 pt-4 pb-5 sm:px-6">
          <p className="flex items-baseline gap-1.5">
            <span className="num tracking-display text-7xl font-semibold">{score}</span>
            <span className="text-ink-3 text-xl font-semibold">/100</span>
          </p>
          <ScoreScale score={score} />
          <dl className="num mt-6 divide-y border-y text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-ink-3">Pages checked</dt>
              <dd className="text-label font-mono">{checked}</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-ink-3">Broken</dt>
              <dd className="text-bad-fg text-label font-mono">{broken}</dd>
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
      <h2 className="text-sm font-medium">{title}</h2>
      <Badge>Sample</Badge>
    </div>
  );
}

const dotRadius = (d: number) => (d === 0 ? 7 : d === 1 ? 5 : 3.6);
// the hover ring sits outside the broken ring when there is one
const hoverRingRadius = (i: number) => dotRadius(NODES[i].d) + (NODES[i].fail ? 7.5 : 4);

// the report graph's tooltip, opening away from the centre so it never covers the traced path
function SampleGraph({ p }: { p: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  // last page hovered, so the tooltip keeps its text while it fades out
  const [tip, setTip] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const onHover = (i: number | null) => {
    setHovered(i);
    if (i !== null) {
      setTip(i);
    }
  };

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const el = tipRef.current;
    const ctm = svg?.getScreenCTM();
    if (hovered === null || !svg?.parentElement || !el || !ctm) {
      return;
    }
    const n = NODES[hovered];
    const at = new DOMPoint(n.x, n.y).matrixTransform(ctm);
    const box = svg.parentElement.getBoundingClientRect();
    const gap = hoverRingRadius(hovered) * ctm.a + 6;
    const dx = n.x < 150 ? '-14px' : n.x > 250 ? 'calc(-100% + 14px)' : '-50%';
    const dy = n.y <= 150 ? `calc(-100% - ${gap}px)` : `${gap}px`;
    el.style.transform = `translate3d(${at.x - box.left}px, ${at.y - box.top}px, 0) translate(${dx}, ${dy})`;
  }, [hovered]);

  const shown = (d: number) => p >= DEPTH_AT[d];
  // the hovered page's path from the homepage stays lit; everything else steps back
  const lit = hovered === null ? null : new Set(pathFromRoot(TREE, NODES[hovered].path));
  // every link is a parent -> child edge, so a lit child means its incoming link is on the path
  const linkLit = (child: number) => !!lit?.has(NODES[child].path);
  const tipNode = NODES[tip];
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox="0 0 400 300"
        className="mx-auto block h-auto w-full max-w-105 px-3 forced-color-adjust-none"
        aria-label="Sample site graph: four sections, three broken pages"
        onMouseLeave={() => onHover(null)}
      >
        <g strokeWidth="1">
          {LINKS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              stroke={linkLit(b) ? INK_HEX : LINE_STRONG_HEX}
              strokeWidth={linkLit(b) ? 1.6 : 1}
              style={{
                opacity: !shown(NODES[b].d) ? 0 : lit && !linkLit(b) ? 0.4 : 1,
                transition: 'opacity 300ms ease-out, stroke 150ms ease-out',
              }}
            />
          ))}
        </g>
        {NODES.map((n, i) => {
          const r = dotRadius(n.d);
          const parent = TREE.parent.get(n.path);
          const on = shown(n.d);
          const dim = lit && !lit.has(n.path);
          return (
            <g
              key={i}
              role="img"
              aria-label={`${n.path}, ${n.fail ?? '200 OK'}, ${
                parent === undefined ? 'the homepage' : `first found on ${parent}`
              }`}
              onMouseEnter={() => onHover(i)}
              className="cursor-pointer"
              style={{
                opacity: !on ? 0 : dim ? 0.3 : 1,
                transform: on ? 'scale(1)' : 'scale(0.4)',
                transformOrigin: `${n.x}px ${n.y}px`,
                transition: 'opacity 260ms ease-out, transform 420ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              {/* generous invisible hit area around small dots */}
              <circle cx={n.x} cy={n.y} r={r + 9} fill="transparent" />
              {n.fail && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 4}
                  fill="none"
                  stroke={BROKEN_HEX}
                  strokeWidth="1.6"
                  style={{ opacity: p >= RING_AT ? 1 : 0, transition: 'opacity 300ms ease-out' }}
                />
              )}
              {hovered === i && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={hoverRingRadius(i)}
                  fill="none"
                  stroke={INK_HEX}
                  strokeWidth="1.6"
                />
              )}
              <circle cx={n.x} cy={n.y} r={r} fill={n.s < 0 ? INK_HEX : SECTION_HEX[n.s]} />
            </g>
          );
        })}
      </svg>
      <NodeTooltip
        ref={tipRef}
        visible={hovered !== null}
        path={tipNode.path}
        detail={tipNode.fail ?? '200 OK'}
        detailClass={tipNode.fail ? TOOLTIP_TEXT.poor : TOOLTIP_TEXT.good}
        note={nodeNote(
          tipNode.d,
          TREE.parent.get(tipNode.path),
          TREE.children.get(tipNode.path)?.length ?? 0,
        )}
      />
    </div>
  );
}
