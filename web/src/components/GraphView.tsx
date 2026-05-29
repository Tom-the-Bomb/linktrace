import { useEffect, useRef, useState } from 'react';

import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphNode } from '../api';
import { NodeTooltip } from './ui/NodeTooltip';

// Mutable shape the force-graph library owns (it stores x/y/vx/vy on each node).
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

// node colouring keyed to the theme: emerald healthy, amber (accent) middling, rose rotten
function nodeColour(n: GraphNode): string {
  if (!n.is_alive) return '#fb7185'; // rose-400
  if (n.seo_score === null) return '#3a425e'; // ink-300
  if (n.seo_score >= 80) return '#34d399'; // emerald-400
  if (n.seo_score >= 50) return '#f5b042'; // accent
  return '#fb7185';
}

// cap on zoom-to-fit so sparse graphs (a single node, a tiny crawl) don't blow up to fill
// the whole viewport with one dot.
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

// Force-directed graph of the site: each page is a node, each internal link an edge.
// Uses react-force-graph-2d (canvas, d3-force physics). Click a node to open the SEO drawer.
export function GraphView({ data, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Manual pointer handling: the library's onNodeClick/onNodeHover don't fire reliably
  // when we override the canvas painter, so we do hit-testing ourselves against the
  // simulation positions via `screen2GraphCoords`. Tooltip position is written direct
  // to the DOM so it tracks at 60fps without re-rendering React on every mousemove.
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

  // observe the container so the canvas can fill it on resize (the lib doesn't auto-fit)
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height: Math.max(420, height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Single mutable graph the library owns across renders. We merge incoming `data` into it:
  // existing nodes keep their object identity (and the x/y/vx/vy the simulation wrote on them),
  // so the layout doesn't reset every poll tick.
  const graphRef = useRef<{ nodes: FgNode[]; links: FgLink[] }>({ nodes: [], links: [] });
  const [, forceRender] = useState(0);

  useEffect(() => {
    const g = graphRef.current;
    const byId = new Map(g.nodes.map((n) => [n.id, n]));

    // add new nodes; update mutable status fields on existing ones
    for (const incoming of data.nodes ?? []) {
      const existing = byId.get(incoming.id);
      if (existing) {
        existing.is_alive = incoming.is_alive;
        existing.status_code = incoming.status_code;
        existing.error_type = incoming.error_type;
        existing.seo_score = incoming.seo_score;
      } else {
        g.nodes.push({ ...incoming });
      }
    }

    // de-dupe edges by (source, target); only push truly new ones
    const edgeKeys = new Set(g.links.map((l) => `${l.source}->${l.target}`));
    for (const e of data.edges ?? []) {
      const k = `${e.source}->${e.target}`;
      if (!edgeKeys.has(k)) {
        g.links.push({ source: e.source, target: e.target });
        edgeKeys.add(k);
      }
    }

    forceRender((n) => n + 1);
  }, [data]);

  // zoom-to-fit after the initial layout settles, then never again (would yank the view mid-crawl)
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || graphRef.current.nodes.length === 0) return;
    const id = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      fg.zoomToFit(400, 40);
      // zoomToFit has no max-zoom, so a tiny graph (e.g. a single node) zooms in until the
      // node fills the viewport. Clamp once the fit animation lands, keeping it centered.
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
      <header className="flex items-center justify-between border-b border-ink-500/70 px-6 py-4">
        <div>
          <div className="eyebrow">site graph</div>
          <p className="mt-1 text-xs italic text-ink-300">
            Drag to pan · scroll to zoom · click a node for its audit.
          </p>
        </div>
        <Legend />
      </header>

      <div ref={containerRef} className="relative h-[70vh] min-h-[460px] w-full bg-ink-900/40">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphRef.current}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={1}
          linkColor={() => 'rgba(245,239,228,0.12)'} // paper @ 12%
          linkDirectionalParticles={0}
          linkWidth={0.5}
          cooldownTicks={120}
          // We paint nodes ourselves so the visible radius matches `nodeRadius(depth)`
          // and lines up with the hit-testing we do on the container.
          nodeCanvasObject={(node, ctx) => {
            const n = node as FgNode;
            if (n.x === undefined || n.y === undefined) return;
            const r = nodeRadius(n.depth);
            const colour = nodeColour(n);

            // root (depth 0) gets a hollow halo and a small inner dot so the seed page
            // reads visually as the entry point, not just another link.
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
              return;
            }

            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = colour;
            ctx.fill();
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

// scoreColour maps a node's liveness + SEO score to the tooltip's value text colour.
function scoreColour(n: GraphNode): string {
  if (!n.is_alive) return 'text-rose-300';
  if (n.seo_score === null) return 'text-ink-300';
  if (n.seo_score >= 80) return 'text-teal';
  if (n.seo_score >= 50) return 'text-accent';
  return 'text-rose-300';
}

// Strip protocol + host so the tooltip reads as a clean path like "/about/team",
// matching the landing-page backdrop where nodes are paths to begin with.
function pathOnly(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash || '/';
  } catch {
    return url;
  }
}

// Right-hand value: SEO score if we have one, otherwise the failure reason.
function tooltipDetail(n: GraphNode): string {
  if (n.seo_score !== null) return String(n.seo_score);
  if (!n.is_alive) return n.error_type || (n.status_code ? `http_${n.status_code}` : 'dead');
  return '—';
}
