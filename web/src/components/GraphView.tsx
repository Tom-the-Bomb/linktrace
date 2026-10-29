import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Maximize, Search, ZoomIn, ZoomOut } from 'lucide-react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import type { GraphData, GraphNode } from '../api';
import {
  BROKEN_HEX,
  INK_HEX,
  NO_SCORE_HEX,
  OTHER_SECTION_HEX,
  TIER_HEX,
  TOOLTIP_TEXT,
  scoreTier,
} from '../lib/colours';
import { type SiteTree, nodeNote, pathFromRoot } from '../lib/graph';
import { pageStatusLabel } from '../lib/status';
import { pathOf, sectionOf } from '../lib/url';
import { NodeTooltip } from './ui/NodeTooltip';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Kbd } from './ui/kbd';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

// the lib mutates these in place; fx/fy pin a dragged node
interface FgNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}
// the lib swaps source/target ids for node objects after the first render
interface FgLink {
  source: string | FgNode;
  target: string | FgNode;
}

type ColourMode = 'health' | 'section';

const idOf = (v: string | FgNode) => (typeof v === 'object' ? v.id : v);
const linkKey = (source: string, target: string) => `${source}\n${target}`;

type HealthKey = keyof typeof HEALTH_HEX;
const HEALTH_HEX = { ...TIER_HEX, none: NO_SCORE_HEX, broken: BROKEN_HEX };
const TOOLTIP_CLASS: Record<HealthKey, string> = {
  ...TOOLTIP_TEXT,
  none: 'text-white/60',
  broken: TOOLTIP_TEXT.poor,
};
const HEALTH_LEGEND: { key: HealthKey; label: string }[] = [
  { key: 'good', label: 'SEO 80+' },
  { key: 'ok', label: 'SEO 50 to 79' },
  { key: 'poor', label: 'SEO under 50' },
  { key: 'none', label: 'No score' },
  { key: 'broken', label: 'broken' },
];

function healthKey(n: GraphNode): HealthKey {
  if (!n.is_alive) {
    return 'broken';
  }
  return n.seo_score === null ? 'none' : scoreTier(n.seo_score);
}

// don't trap page scrolling: one finger or a plain wheel scrolls the page; two fingers,
// Ctrl/⌘ + wheel or a pinch move the graph. Typed as MouseEvent, but d3-zoom passes the raw
// touch/wheel event. The canvas's touch-pan-y overrides d3-drag's inline touch-action: none.
const panFilter = (ev: MouseEvent & { touches?: TouchList }) =>
  !ev.touches || ev.touches.length > 1;
const zoomFilter = (ev: MouseEvent) => ev.ctrlKey || ev.metaKey;

const MAX_ZOOM = 2.5;
const LEGEND_SECTIONS = 8;

function nodeRadius(depth: number): number {
  if (depth === 0) {
    return 5;
  }
  return Math.max(2, 3.8 - depth * 0.35);
}

// floored in screen pixels so a whole-site fit reads as dots, not specks
function drawRadius(depth: number, scale: number): number {
  return Math.max(nodeRadius(depth), (depth === 0 ? 6 : 3.2) / scale);
}

interface Props {
  data: GraphData;
  tree: SiteTree;
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  colourFor: (section: string) => string;
  // largest first; the legend shows only the top few
  sections: string[];
}

export const GraphView = memo(function GraphView({
  data,
  tree,
  selectedUrl,
  onSelect,
  colourFor,
  sections,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FgNode> | undefined>(undefined);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // last hovered page, so the tooltip keeps its text while fading out
  const [tipId, setTipId] = useState<string | null>(null);
  const [jumpId, setJumpId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ColourMode>('section');
  // on touch, a swipe starting on a page should scroll, not drag it
  const [coarsePointer] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [brokenOnly, setBrokenOnly] = useState(false);

  const legendList = useMemo(() => sections.slice(0, LEGEND_SECTIONS), [sections]);
  const legendSections = useMemo(() => new Set(legendList), [legendList]);

  // written straight to the DOM to avoid re-renders
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const tip = tooltipRef.current;
      if (!tip) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = Math.min(e.clientX - rect.left + 14, rect.width - 260);
      tip.style.transform = `translate3d(${x}px, ${e.clientY - rect.top + 14}px, 0)`;
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, []);

  // the lib doesn't auto-fit its container
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

  // paused offscreen so a big graph doesn't stall the rest of the report
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const obs = new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? fgRef.current?.resumeAnimation() : fgRef.current?.pauseAnimation(),
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // nodes are reused across polls so positions and velocities survive
  const [graph, setGraph] = useState<{ nodes: FgNode[]; links: FgLink[] }>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    setGraph((prev) => {
      const byId = new Map<string, FgNode>(prev.nodes.map((n) => [n.id, n]));
      let nodesChanged = false;
      const nodes = prev.nodes.slice();
      for (const incoming of data.nodes) {
        const existing = byId.get(incoming.id);
        if (existing) {
          existing.is_alive = incoming.is_alive;
          existing.status_code = incoming.status_code;
          existing.error_type = incoming.error_type;
          existing.seo_score = incoming.seo_score;
        } else {
          const n: FgNode = { ...incoming };
          // starts beside the page it was found on, so a short reheat settles it
          const parent = byId.get(tree.parent.get(n.id) ?? '');
          if (parent?.x !== undefined && parent.y !== undefined) {
            n.x = parent.x + Math.random() * 10 - 5;
            n.y = parent.y + Math.random() * 10 - 5;
          }
          nodes.push(n);
          byId.set(n.id, n);
          nodesChanged = true;
        }
      }

      const edgeKeys = new Set(prev.links.map((l) => linkKey(idOf(l.source), idOf(l.target))));
      let linksChanged = false;
      const links = prev.links.slice();
      for (const e of data.edges) {
        const k = linkKey(e.source, e.target);
        if (!edgeKeys.has(k)) {
          links.push({ source: e.source, target: e.target });
          edgeKeys.add(k);
          linksChanged = true;
        }
      }

      // a new object restarts the layout; updated fields are read off the nodes
      return nodesChanged || linksChanged ? { nodes, links } : prev;
    });
  }, [data, tree]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  // parsed once per update, not per node per frame
  const sectionById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, sectionOf(n.url)])),
    [graph],
  );

  const focusId =
    hoveredId ?? jumpId ?? (selectedUrl && nodeById.has(selectedUrl) ? selectedUrl : null);
  const lit = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<string>();
    const addPath = (id: string) => {
      const chain = pathFromRoot(tree, id);
      chain.forEach((u, i) => {
        nodes.add(u);
        if (i > 0) {
          links.add(linkKey(chain[i - 1], u));
        }
      });
    };
    if (focusId) {
      addPath(focusId);
      for (const child of tree.children.get(focusId) ?? []) {
        nodes.add(child);
        links.add(linkKey(focusId, child));
      }
    } else if (brokenOnly) {
      for (const n of graph.nodes) {
        if (!n.is_alive) {
          addPath(n.id);
        }
      }
    }
    return { nodes, links, active: !!focusId || brokenOnly };
  }, [focusId, brokenOnly, tree, graph]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const matches = useMemo(
    () =>
      hasQuery ? graph.nodes.filter((n) => n.url.toLowerCase().includes(normalizedQuery)) : [],
    [graph, hasQuery, normalizedQuery],
  );
  const matchIds = useMemo(() => new Set(matches.map((n) => n.id)), [matches]);
  const brokenCount = useMemo(() => graph.nodes.filter((n) => !n.is_alive).length, [graph]);

  // zoomToFit has no max zoom, so clamp once it lands
  const fitTo = (ms: number, padding: number, only?: Set<string>) => {
    const fg = fgRef.current;
    if (!fg || graph.nodes.length === 0) {
      return;
    }
    fg.zoomToFit(ms, padding, only && ((node) => only.has((node as FgNode).id)));
    setTimeout(() => {
      if (fgRef.current && fgRef.current.zoom() > MAX_ZOOM) {
        fgRef.current.zoom(MAX_ZOOM, 200);
      }
    }, ms + 50);
  };
  const fitView = () => fitTo(400, 20);
  // after the first fit, additions get a short reheat so slow devices don't stall
  const [settled, setSettled] = useState(false);
  const fitOnce = () => {
    if (!settled) {
      setSettled(true);
      fitView();
    }
  };
  const zoomBy = (factor: number) => {
    const fg = fgRef.current;
    if (fg) {
      fg.zoom(fg.zoom() * factor, 250);
    }
  };

  // each Enter frames the next match, wrapping around
  const jumpIdx = matches.findIndex((n) => n.id === jumpId);
  const jumpToMatch = () => {
    const n = matches[(jumpIdx + 1) % matches.length];
    if (!n || n.x === undefined || n.y === undefined) {
      return;
    }
    fitTo(600, 60, new Set([...pathFromRoot(tree, n.id), ...(tree.children.get(n.id) ?? [])]));
    setJumpId(n.id);
  };

  function switchMode(m: ColourMode) {
    setMode(m);
    setHidden(new Set());
  }
  function toggleKey(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const sectionFor = (n: GraphNode) => sectionById.get(n.id) ?? '/';
  const fillFor = (n: GraphNode) =>
    mode === 'health' ? HEALTH_HEX[healthKey(n)] : colourFor(sectionFor(n));
  const keyFor = (n: GraphNode) => {
    if (mode === 'health') {
      return healthKey(n);
    }
    const s = sectionFor(n);
    return legendSections.has(s) ? s : 'other';
  };
  const isHidden = (n: GraphNode) => hidden.size > 0 && hidden.has(keyFor(n));
  const isLitLink = (link: object) => {
    if (lit.links.size === 0) {
      return false;
    }
    const l = link as FgLink;
    return lit.links.has(linkKey(idOf(l.source), idOf(l.target)));
  };
  const tip = tipId ? nodeById.get(tipId) : undefined;
  const tipParent = tip && tree.parent.get(tip.id);

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && switchMode(v as ColourMode)}
            aria-label="Colour pages by"
          >
            <ToggleGroupItem value="section">Section</ToggleGroupItem>
            <ToggleGroupItem value="health">Health</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant={brokenOnly ? 'default' : 'secondary'}
            aria-pressed={brokenOnly}
            onClick={() => setBrokenOnly((b) => !b)}
            disabled={brokenCount === 0}
            className="text-label h-8.5"
          >
            <span className="ring-bad-dot size-2.5 rounded-full ring-[1.5px] ring-offset-1 ring-offset-transparent forced-color-adjust-none" />
            Trace broken pages
            <span className={`text-code font-mono ${brokenOnly ? 'text-white/70' : 'text-ink-3'}`}>
              {brokenCount}
            </span>
          </Button>
        </div>
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Find a page in the graph"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setJumpId(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && jumpToMatch()}
            placeholder="Find a page"
          />
          {hasQuery && (
            <InputGroupAddon align="inline-end" className="text-code font-mono" aria-live="polite">
              {jumpIdx >= 0 ? `${jumpIdx + 1} of ${matches.length}` : `${matches.length} found`}
              {matches.length > 0 && (
                <Kbd aria-hidden="true" className="hidden sm:inline-flex">
                  ↵
                </Kbd>
              )}
            </InputGroupAddon>
          )}
        </InputGroup>
      </header>

      <div
        ref={containerRef}
        className="bg-sunken/60 relative h-[68vh] min-h-110 [&_canvas]:touch-pan-y!"
        style={{
          backgroundImage: 'radial-gradient(var(--color-line-strong) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
        onPointerLeave={() => setHoveredId(null)}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graph}
          width={size.width}
          height={size.height}
          nodeRelSize={1}
          cooldownTicks={settled ? 40 : 120}
          onEngineStop={fitOnce}
          enablePanInteraction={panFilter}
          enableZoomInteraction={zoomFilter}
          enableNodeDrag={!coarsePointer}
          linkColor={(link) => {
            if (isLitLink(link)) {
              return 'rgba(23,23,23,0.7)';
            }
            return lit.active || hasQuery ? 'rgba(23,23,23,0.05)' : 'rgba(23,23,23,0.14)';
          }}
          linkWidth={(link) => (isLitLink(link) ? 1.6 : 0.6)}
          onNodeHover={(node) => {
            setHoveredId(node ? (node as FgNode).id : null);
            if (node) {
              setTipId((node as FgNode).id);
              setJumpId(null);
            }
          }}
          onNodeClick={(node) => onSelect((node as FgNode).url)}
          onNodeDragEnd={(node) => {
            const n = node as FgNode;
            n.fx = n.x;
            n.fy = n.y;
          }}
          nodePointerAreaPaint={(node, colour, ctx, scale) => {
            const n = node as FgNode;
            if (n.x === undefined || n.y === undefined || isHidden(n)) {
              return;
            }
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(n.x, n.y, drawRadius(n.depth, scale) + 4 / scale, 0, Math.PI * 2);
            ctx.fill();
          }}
          nodeCanvasObject={(node, ctx, scale) => {
            const n = node as FgNode;
            if (n.x === undefined || n.y === undefined) {
              return;
            }
            const r = drawRadius(n.depth, scale);
            // a trace beats the search filter so a traced path is never half-dimmed
            let alpha = 1;
            if (isHidden(n)) {
              alpha = 0.06;
            } else if (lit.active) {
              alpha = lit.nodes.has(n.id) ? 1 : 0.15;
            } else if (hasQuery && !matchIds.has(n.id)) {
              alpha = 0.12;
            }
            ctx.globalAlpha = alpha;

            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = n.depth === 0 ? INK_HEX : fillFor(n);
            ctx.fill();
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            if (!n.is_alive) {
              ctx.lineWidth = 1.8 / scale;
              ctx.strokeStyle = BROKEN_HEX;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + 3 / scale, 0, Math.PI * 2);
              ctx.stroke();
            }

            if (n.id === focusId || n.id === selectedUrl) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = INK_HEX;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + (n.is_alive ? 3.5 : 6.5) / scale, 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.globalAlpha = 1;
          }}
        />
        <NodeTooltip
          ref={tooltipRef}
          visible={hoveredId !== null}
          path={tip ? pathOf(tip.url) : ''}
          detail={tip ? tooltipDetail(tip) : ''}
          detailClass={tip ? TOOLTIP_CLASS[healthKey(tip)] : ''}
          note={
            tip
              ? nodeNote(
                  tip.depth,
                  tipParent && pathOf(tipParent),
                  tree.children.get(tip.id)?.length ?? 0,
                )
              : undefined
          }
        />

        <div className="rounded-control bg-panel shadow-control absolute right-3 bottom-3 flex flex-col overflow-hidden">
          <ZoomButton label="Zoom in" onClick={() => zoomBy(1.6)}>
            <ZoomIn className="size-4" />
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / 1.6)}>
            <ZoomOut className="size-4" />
          </ZoomButton>
          <ZoomButton label="Fit the whole site" onClick={fitView}>
            <Maximize className="size-4" />
          </ZoomButton>
        </div>
      </div>

      <footer className="gutter flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t py-3">
        <Legend
          mode={mode}
          colourFor={colourFor}
          shown={legendList}
          hasOther={sections.length > legendList.length}
          hidden={hidden}
          onToggle={toggleKey}
          onShowAll={() => setHidden(new Set())}
        />
        <span className="text-ink-3 text-label pointer-fine:hidden">
          Use two fingers to move or zoom.
        </span>
        <span className="text-ink-3 text-label hidden pointer-fine:inline">
          Pinch or <Kbd>Ctrl</Kbd> + scroll to zoom.
        </span>
      </footer>
    </section>
  );
});

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-ink-2 hover:bg-sunken hover:text-ink flex size-8 items-center justify-center border-b transition last:border-0 focus-visible:-outline-offset-2"
    >
      {children}
    </button>
  );
}

function Legend({
  mode,
  colourFor,
  shown,
  hasOther,
  hidden,
  onToggle,
  onShowAll,
}: {
  mode: ColourMode;
  colourFor: (s: string) => string;
  shown: string[];
  hasOther: boolean;
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
}) {
  const items =
    mode === 'health'
      ? HEALTH_LEGEND.map(({ key, label }) => ({ key, c: HEALTH_HEX[key], label }))
      : [
          ...shown.map((s) => ({ key: s, c: colourFor(s), label: s })),
          ...(hasOther ? [{ key: 'other', c: OTHER_SECTION_HEX, label: 'other' }] : []),
        ];
  return (
    <ul
      className="text-ink-2 text-code flex flex-wrap items-center gap-x-1 gap-y-1 font-mono"
      aria-label="Show or hide pages"
    >
      {items.map((it) => {
        const off = hidden.has(it.key);
        return (
          <li key={it.key}>
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(it.key)}
              title={off ? `Show ${it.label}` : `Hide ${it.label}`}
              className={`hover:bg-sunken flex items-center gap-1.5 rounded-full px-2 py-1 transition ${
                off ? 'text-ink-3 line-through' : ''
              }`}
            >
              <span
                className="size-2.5 rounded-full forced-color-adjust-none"
                style={{
                  background: off ? 'transparent' : it.c,
                  boxShadow: `inset 0 0 0 1.5px ${it.c}`,
                }}
              />
              {it.label}
            </button>
          </li>
        );
      })}
      {mode === 'section' && (
        <li className="flex items-center gap-1.5 px-2 py-1">
          <span className="ring-bad-dot size-2.5 rounded-full ring-[1.5px] ring-offset-1 forced-color-adjust-none" />
          broken
        </li>
      )}
      {hidden.size > 0 && (
        <li>
          <button
            type="button"
            onClick={onShowAll}
            className="text-link-600 text-caption px-2 py-1 font-sans hover:underline"
          >
            Show all
          </button>
        </li>
      )}
    </ul>
  );
}

function tooltipDetail(n: GraphNode): string {
  if (!n.is_alive) {
    return pageStatusLabel(false, n.status_code, n.error_type);
  }
  return n.seo_score !== null ? `SEO ${n.seo_score}` : 'No score';
}
