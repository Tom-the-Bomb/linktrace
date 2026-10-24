import { useEffect, useRef, useState } from 'react';

import { Search } from 'lucide-react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphNode } from '../api';
import {
  BROKEN_HEX,
  NO_SCORE_HEX,
  OTHER_SECTION_HEX,
  TIER_HEX,
  scoreTier,
  sectionOf,
} from '../lib/colours';
import { pageStatusLabel } from '../lib/status';
import { NodeTooltip } from './ui/NodeTooltip';
import { SegButton } from './ui/SegButton';

// mutable shape the force-graph lib owns (x/y per node)
interface FgNode extends GraphNode {
  x?: number;
  y?: number;
}
interface FgLink {
  source: string;
  target: string;
}

type ColourMode = 'health' | 'section';

// node fill by liveness + SEO score
function healthColour(n: GraphNode): string {
  if (!n.is_alive) {
    return BROKEN_HEX;
  }
  if (n.seo_score === null) {
    return NO_SCORE_HEX;
  }
  return TIER_HEX[scoreTier(n.seo_score)];
}

// cap zoom-to-fit so a sparse graph doesn't fill the viewport with one dot
const MAX_ZOOM = 2.5;

// node size shrinks with depth; homepage biggest, leaves smallest
function nodeRadius(depth: number): number {
  if (depth === 0) {
    return 5;
  }
  return Math.max(2, 3.8 - depth * 0.35);
}

// drawn radius in graph units: never smaller on screen than 3.2px (6px for the homepage),
// so a whole-site fit still reads as shape instead of specks
function drawRadius(depth: number, scale: number): number {
  return Math.max(nodeRadius(depth), (depth === 0 ? 6 : 3.2) / scale);
}

interface Props {
  data: GraphData;
  onSelect: (url: string) => void;
  colourFor: (section: string) => string;
  // largest sections first, for the section legend
  sections: string[];
}

// Force graph: page = node, internal link = edge; click a node for its audit
export function GraphView({ data, onSelect, colourFor, sections }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ColourMode>('section');
  const tooltipRef = useRef<HTMLDivElement>(null);

  // case-insensitive URL substring match; empty query = no highlight
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  function matchesQuery(n: FgNode): boolean {
    return n.url.toLowerCase().includes(normalizedQuery);
  }

  // manual hit-testing; lib's onNodeClick/Hover are unreliable with a custom painter
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const pickNode = (clientX: number, clientY: number): FgNode | null => {
      const fg = fgRef.current;
      if (!fg) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      const { x: gx, y: gy } = fg.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
      let best: FgNode | null = null;
      let bestDist = Infinity;
      for (const n of graphRef.current.nodes) {
        if (n.x === undefined || n.y === undefined) {
          continue;
        }
        const dx = n.x - gx;
        const dy = n.y - gy;
        const d2 = dx * dx + dy * dy;
        const hit = drawRadius(n.depth, fg.zoom()) + 6 / fg.zoom(); // generous hit radius
        if (d2 <= hit * hit && d2 < bestDist) {
          bestDist = d2;
          best = n;
        }
      }
      return best;
    };

    const onMove = (e: PointerEvent) => {
      const tip = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      if (tip) {
        tip.style.transform = `translate3d(${e.clientX - rect.left + 14}px, ${e.clientY - rect.top + 14}px, 0)`;
      }
      const node = pickNode(e.clientX, e.clientY);
      setHovered((prev) => (prev === node ? prev : node));
      el.style.cursor = node ? 'pointer' : 'grab';
    };
    const onLeave = () => {
      setHovered(null);
      el.style.cursor = 'grab';
    };
    const onClick = (e: MouseEvent) => {
      const node = pickNode(e.clientX, e.clientY);
      if (node) {
        onSelect(node.url);
      }
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('click', onClick);
    };
  }, [onSelect]);

  // resize the canvas to the container (lib doesn't auto-fit)
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height: Math.max(420, height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // new wrapper each poll so ForceGraph2D rebuilds; inner nodes reused so layout/velocities survive
  const [graph, setGraph] = useState<{ nodes: FgNode[]; links: FgLink[] }>({
    nodes: [],
    links: [],
  });
  const graphRef = useRef(graph); // sync mirror for the hit-test handler

  useEffect(() => {
    setGraph((prev) => {
      const byId = new Map(prev.nodes.map((n) => [n.id, n]));
      let nodesChanged = false;
      const nodes = prev.nodes.slice();
      for (const incoming of data.nodes ?? []) {
        const existing = byId.get(incoming.id);
        if (existing) {
          existing.is_alive = incoming.is_alive;
          existing.status_code = incoming.status_code;
          existing.error_type = incoming.error_type;
          existing.seo_score = incoming.seo_score;
        } else {
          const n = { ...incoming };
          nodes.push(n);
          byId.set(n.id, n);
          nodesChanged = true;
        }
      }

      const edgeKeys = new Set(prev.links.map((l) => `${l.source}->${l.target}`));
      let linksChanged = false;
      const links = prev.links.slice();
      for (const e of data.edges ?? []) {
        const k = `${e.source}->${e.target}`;
        if (!edgeKeys.has(k)) {
          links.push({ source: e.source, target: e.target });
          edgeKeys.add(k);
          linksChanged = true;
        }
      }

      // new wrapper even with no structural change, so field updates reach the painter
      return nodesChanged || linksChanged ? { nodes, links } : { ...prev };
    });
  }, [data]);

  // mirrored outside the updater: updaters must stay pure (StrictMode runs them twice in dev)
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  // fit once, when the first layout settles; never again (would yank the view mid-crawl)
  const fittedRef = useRef(false);
  const fitOnce = () => {
    const fg = fgRef.current;
    if (fittedRef.current || !fg || graphRef.current.nodes.length === 0) {
      return;
    }
    fittedRef.current = true;
    fg.zoomToFit(400, 20);
    // zoomToFit has no max-zoom; clamp a tiny graph after the fit lands
    setTimeout(() => {
      if (fgRef.current && fgRef.current.zoom() > MAX_ZOOM) {
        fgRef.current.zoom(MAX_ZOOM, 200);
      }
    }, 450);
  };

  const fillFor = (n: GraphNode) =>
    mode === 'health' ? healthColour(n) : colourFor(sectionOf(n.url));

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="seg" role="group" aria-label="Colour nodes by">
          <SegButton active={mode === 'section'} onClick={() => setMode('section')}>
            Section
          </SegButton>
          <SegButton active={mode === 'health'} onClick={() => setMode('health')}>
            Health
          </SegButton>
        </div>
        <label className="field flex h-9 w-full items-center gap-2 px-2.5 sm:w-64">
          <span className="sr-only">Find a page in the graph</span>
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a page"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </label>
      </header>

      <div
        ref={containerRef}
        className="relative h-[68vh] min-h-[440px] w-full cursor-grab bg-sunken/60"
        style={{
          backgroundImage: 'radial-gradient(#d3d6de 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={1}
          // fade links during search so matches pop
          linkColor={() => (hasQuery ? 'rgba(22,22,29,0.04)' : 'rgba(22,22,29,0.13)')}
          linkDirectionalParticles={0}
          linkWidth={0.6}
          cooldownTicks={120}
          onEngineStop={fitOnce}
          // paint nodes ourselves so radius matches nodeRadius(depth) and the hit-testing
          nodeCanvasObject={(node, ctx, scale) => {
            const n = node as FgNode;
            if (n.x === undefined || n.y === undefined) {
              return;
            }
            const r = drawRadius(n.depth, scale);
            const dimmed = hasQuery && !matchesQuery(n);
            ctx.globalAlpha = dimmed ? 0.12 : 1;

            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = n.depth === 0 ? '#171717' : fillFor(n);
            ctx.fill();
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // broken pages get a ring in both modes, sized in screen pixels so it reads at any zoom
            if (!n.is_alive) {
              ctx.lineWidth = 1.8 / scale;
              ctx.strokeStyle = BROKEN_HEX;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + 3 / scale, 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.globalAlpha = 1;
          }}
        />
        <NodeTooltip
          ref={tooltipRef}
          visible={!!hovered}
          path={hovered ? pathOnly(hovered.url) : ''}
          detail={hovered ? tooltipDetail(hovered) : ''}
          detailClass={hovered ? tooltipColour(hovered) : ''}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-5 py-3 sm:px-8">
        <Legend mode={mode} colourFor={colourFor} sections={sections} />
        <span className="hidden text-[13px] text-ink-3 lg:inline">
          Drag to pan · scroll to zoom · click a page for its audit
        </span>
      </footer>
    </section>
  );
}

function Legend({
  mode,
  colourFor,
  sections,
}: {
  mode: ColourMode;
  colourFor: (s: string) => string;
  sections: string[];
}) {
  const shown = sections.slice(0, 8);
  const items =
    mode === 'health'
      ? [
          { c: TIER_HEX.good, label: 'SEO 80+' },
          { c: TIER_HEX.ok, label: 'SEO 50–79' },
          { c: TIER_HEX.poor, label: 'SEO under 50' },
          { c: NO_SCORE_HEX, label: 'No score' },
        ]
      : [
          ...shown.map((s) => ({ c: colourFor(s), label: s })),
          ...(sections.length > shown.length ? [{ c: OTHER_SECTION_HEX, label: 'other' }] : []),
        ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: it.c }} />
          {it.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full ring-[1.5px] ring-bad-dot ring-offset-1" />
        broken
      </li>
    </ul>
  );
}

// tooltip sits on dark ink, so its value colours are the light variants
const TOOLTIP_COLOUR: Record<'good' | 'ok' | 'poor', string> = {
  good: 'text-[#6be3a8]',
  ok: 'text-[#ffcf5c]',
  poor: 'text-[#ff8da3]',
};

function tooltipColour(n: GraphNode): string {
  if (!n.is_alive) {
    return TOOLTIP_COLOUR.poor;
  }
  if (n.seo_score === null) {
    return 'text-white/60';
  }
  return TOOLTIP_COLOUR[scoreTier(n.seo_score)];
}

// strip protocol + host so the tooltip shows just the path
function pathOnly(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash || '/';
  } catch {
    return url;
  }
}

// right value: SEO score, else the failure reason
function tooltipDetail(n: GraphNode): string {
  if (n.seo_score !== null) {
    return `SEO ${n.seo_score}`;
  }
  if (!n.is_alive) {
    return pageStatusLabel(false, n.status_code, n.error_type);
  }
  return '—';
}
