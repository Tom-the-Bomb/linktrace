import { useEffect, useRef, useState } from 'react';

import { Search } from 'lucide-react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphNode } from '../api';
import { NodeTooltip } from './ui/NodeTooltip';

// mutable shape the force-graph lib owns (x/y/vx/vy per node)
interface FgNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}
interface FgLink {
  source: string;
  target: string;
}

// node colour: emerald healthy, amber mid, rose rotten
function nodeColour(n: GraphNode): string {
  if (!n.is_alive) return '#fb7185'; // rose-400
  if (n.seo_score === null) return '#3a425e'; // ink-300
  if (n.seo_score >= 80) return '#34d399'; // emerald-400
  if (n.seo_score >= 50) return '#f5b042'; // accent
  return '#fb7185';
}

// cap zoom-to-fit so a sparse graph doesn't fill the viewport with one dot
const MAX_ZOOM = 2.5;

// node size scales with depth, homepage is biggest, leaves smallest
function nodeRadius(depth: number): number {
  if (depth === 0) return 4.5; // root, kept a touch larger than other top-level nodes
  return Math.max(1.8, 3.5 - depth * 0.35);
}

interface Props {
  data: GraphData;
  onSelect: (url: string) => void;
}

// Force graph: page = node, internal link = edge. react-force-graph-2d (canvas/d3).
// Click a node for its audit.
export function GraphView({ data, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState('');
  const tooltipRef = useRef<HTMLDivElement>(null);

  // case-insensitive URL substring match; empty query = no highlight
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  function matchesQuery(n: FgNode): boolean {
    return n.url.toLowerCase().includes(normalizedQuery);
  }

  // manual hit-testing; lib's onNodeClick/Hover are unreliable with a custom painter.
  // tooltip position writes to the DOM so it tracks without re-render.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const pickNode = (clientX: number, clientY: number): FgNode | null => {
      const fg = fgRef.current;
      if (!fg) return null;
      const rect = el.getBoundingClientRect();
      const { x: gx, y: gy } = fg.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
      let best: FgNode | null = null;
      let bestDist = Infinity;
      for (const n of graphRef.current.nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        const dx = n.x - gx;
        const dy = n.y - gy;
        const d2 = dx * dx + dy * dy;
        // generous hit radius: visible radius + 6 graph units
        const hit = nodeRadius(n.depth) + 6;
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
      el.style.cursor = node ? 'pointer' : 'default';
    };
    const onLeave = () => {
      setHovered(null);
      el.style.cursor = 'default';
    };
    const onClick = (e: MouseEvent) => {
      const node = pickNode(e.clientX, e.clientY);
      if (node) onSelect(node.url);
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
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height: Math.max(420, height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // new wrapper object each poll so ForceGraph2D rebuilds; mutating a stable ref made it
  // skip large updates (final nodes on completion). inner node objects are reused so the
  // simulation x/y/vx/vy survive and the layout doesn't reset.
  const [graph, setGraph] = useState<{ nodes: FgNode[]; links: FgLink[] }>({
    nodes: [],
    links: [],
  });
  // mirror of graph for sync reads in the hit-test handler
  const graphRef = useRef(graph);

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

      // return a new wrapper so ForceGraph2D rebuilds. even with no structural change,
      // publish so field updates (status, seo_score) reach the painter next frame.
      const next = nodesChanged || linksChanged ? { nodes, links } : { ...prev };
      graphRef.current = next;
      return next;
    });
  }, [data]);

  // fit once after layout settles, never again (would yank the view mid-crawl)
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || graphRef.current.nodes.length === 0) return;
    const id = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      fg.zoomToFit(400, 40);
      // zoomToFit has no max-zoom, so clamp a tiny graph once the fit animation lands
      setTimeout(() => {
        if (fgRef.current && fgRef.current.zoom() > MAX_ZOOM) {
          fgRef.current.zoom(MAX_ZOOM, 200);
        }
      }, 450);
      fittedRef.current = true;
    }, 800);
    return () => clearTimeout(id);
  }, [data]);

  return (
    <section className="border border-ink-500/70 bg-ink-700/30">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-500/70 px-6 py-4">
        <div>
          <div className="eyebrow">site graph</div>
          <p className="mt-1 text-xs italic text-ink-300">
            Drag to pan · scroll to zoom · click a node for its audit.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full max-w-xs sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search endpoint"
              className="w-full border border-ink-500/70 bg-ink-800 py-1.5 pl-9 pr-3 font-mono text-xs text-paper placeholder:text-ink-400 focus:border-accent focus:outline-none"
            />
          </div>
          <Legend />
        </div>
      </header>

      <div ref={containerRef} className="relative h-[70vh] min-h-[460px] w-full bg-ink-900/40">
        <ForceGraph2D
          ref={fgRef}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={1}
          // fade links during search so matches pop
          linkColor={() => (hasQuery ? 'rgba(245,239,228,0.04)' : 'rgba(245,239,228,0.12)')}
          linkDirectionalParticles={0}
          linkWidth={0.5}
          cooldownTicks={120}
          // paint nodes ourselves so radius matches nodeRadius(depth) and the hit-testing.
          // during search, non-matches dim; that's enough contrast, no ring on matches.
          nodeCanvasObject={(node, ctx) => {
            const n = node as FgNode;
            if (n.x === undefined || n.y === undefined) return;
            const r = nodeRadius(n.depth);
            const colour = nodeColour(n);
            const dimmed = hasQuery && !matchesQuery(n);

            ctx.globalAlpha = dimmed ? 0.15 : 1;

            // root (depth 0) gets a hollow halo so the seed page reads as the entry point
            if (n.depth === 0) {
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = colour;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
              ctx.fillStyle = colour;
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
              ctx.fillStyle = colour;
              ctx.fill();
            }

            ctx.globalAlpha = 1;
          }}
        />
        <NodeTooltip
          ref={tooltipRef}
          visible={!!hovered}
          path={hovered ? pathOnly(hovered.url) : ''}
          detail={hovered ? tooltipDetail(hovered) : ''}
          detailClass={hovered ? scoreColour(hovered) : ''}
        />
      </div>
    </section>
  );
}

function Legend() {
  const items = [
    { c: 'bg-emerald-400', label: 'seo ≥80' },
    { c: 'bg-accent', label: 'seo ≥50' },
    { c: 'bg-rose-400', label: 'rotten / poor' },
    { c: 'bg-ink-300', label: 'no score' },
  ];
  return (
    <div className="hidden gap-4 font-mono text-[10px] uppercase tracking-widest text-ink-300 sm:flex">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 ${it.c}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// tooltip value colour by liveness + SEO score
function scoreColour(n: GraphNode): string {
  if (!n.is_alive) return 'text-rose-300';
  if (n.seo_score === null) return 'text-ink-300';
  if (n.seo_score >= 80) return 'text-teal';
  if (n.seo_score >= 50) return 'text-accent';
  return 'text-rose-300';
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
  if (n.seo_score !== null) return String(n.seo_score);
  if (!n.is_alive) return n.error_type || (n.status_code ? `http_${n.status_code}` : 'dead');
  return '—';
}
