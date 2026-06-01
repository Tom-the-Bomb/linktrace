import { useEffect, useRef, useState } from 'react';

import { NodeTooltip } from './ui/NodeTooltip';

type NodeTone = 'live' | 'rot' | 'mid';

interface BgNode {
  ax: number; // anchor the node springs back to
  ay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  tone: NodeTone;
  path: string;
  score: number;
  glow: number;
}

const SCORE_RANGE: Record<NodeTone, [number, number]> = {
  live: [78, 96],
  mid: [54, 72],
  rot: [12, 42],
};

const ANCHORS: { x: number; y: number; r: number; tone: NodeTone; path: string }[] = [
  { x: 600, y: 380, r: 9, tone: 'live', path: '/' },
  { x: 340, y: 220, r: 6, tone: 'live', path: '/about' },
  { x: 860, y: 220, r: 6, tone: 'live', path: '/work' },
  { x: 240, y: 460, r: 6, tone: 'live', path: '/blog' },
  { x: 940, y: 480, r: 6, tone: 'live', path: '/projects' },
  { x: 500, y: 580, r: 6, tone: 'mid', path: '/photos' },
  { x: 760, y: 600, r: 6, tone: 'live', path: '/contact' },
  { x: 160, y: 120, r: 4, tone: 'live', path: '/about/bio' },
  { x: 420, y: 100, r: 4, tone: 'mid', path: '/about/press' },
  { x: 760, y: 100, r: 4, tone: 'live', path: '/work/clients' },
  { x: 1000, y: 120, r: 4, tone: 'rot', path: '/work/archive' },
  { x: 100, y: 360, r: 4, tone: 'live', path: '/blog/notes' },
  { x: 120, y: 580, r: 4, tone: 'live', path: '/blog/talks' },
  { x: 360, y: 660, r: 4, tone: 'mid', path: '/photos/film' },
  { x: 640, y: 720, r: 4, tone: 'live', path: '/photos/travel' },
  { x: 880, y: 720, r: 4, tone: 'rot', path: '/contact/legacy' },
  { x: 1080, y: 600, r: 4, tone: 'live', path: '/projects/open' },
  { x: 1100, y: 360, r: 4, tone: 'live', path: '/projects/cli' },
];

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [1, 7],
  [1, 8],
  [2, 9],
  [2, 10],
  [3, 11],
  [3, 12],
  [5, 13],
  [5, 14],
  [6, 15],
  [4, 16],
  [4, 17],
];

const TONE_COLOUR: Record<NodeTone, string> = {
  live: '#4fb3a9',
  mid: '#f5b042',
  rot: '#fb7185',
};

// node tone -> tooltip score text colour
function tooltipToneClass(tone: NodeTone): string {
  if (tone === 'live') return 'text-teal';
  if (tone === 'mid') return 'text-accent';
  return 'text-rose-300';
}

// stable pseudo-random score within the tone's range, from a seed
function scoreFor(tone: NodeTone, seed: number) {
  const [lo, hi] = SCORE_RANGE[tone];
  return lo + ((seed * 7919) % (hi - lo + 1));
}

// decorative node-graph canvas behind the hero: spring-anchored nodes wobble, drag, tooltip on hover
export function CrawlGraphBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<BgNode[]>(
    ANCHORS.map((a, i) => ({
      ax: a.x,
      ay: a.y,
      x: a.x,
      y: a.y,
      vx: 0,
      vy: 0,
      r: a.r,
      tone: a.tone,
      phase: Math.random() * Math.PI * 2,
      path: a.path,
      score: scoreFor(a.tone, i + 1),
      glow: 0,
    })),
  );
  const dragRef = useRef<{ idx: number; lx: number; ly: number } | null>(null);
  const hoverRef = useRef<number | null>(null);

  const [tooltipContent, setTooltipContent] = useState<{
    path: string;
    score: number;
    tone: NodeTone;
  } | null>(null);
  const tooltipElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;
    let scale = 1;
    let offX = 0;
    let offY = 0;

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      width = clientWidth;
      height = clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = Math.max(width / 1200, height / 800);
      offX = (width - 1200 * scale) / 2;
      offY = (height - 800 * scale) / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toLogical = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - offX) / scale,
        y: (clientY - rect.top - offY) / scale,
      };
    };

    const pickNode = (lx: number, ly: number): number | null => {
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = n.x - lx;
        const dy = n.y - ly;
        if (dx * dx + dy * dy <= (n.r + 14) * (n.r + 14)) return i;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      const { x, y } = toLogical(e.clientX, e.clientY);
      const idx = pickNode(x, y);
      if (idx === null) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      dragRef.current = { idx, lx: x, ly: y };
      canvas.style.cursor = 'grabbing';
      const n = nodesRef.current[idx];
      setTooltipContent({ path: n.path, score: n.score, tone: n.tone });
    };
    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = toLogical(e.clientX, e.clientY);
      if (dragRef.current) {
        dragRef.current.lx = x;
        dragRef.current.ly = y;
        return;
      }
      const idx = pickNode(x, y);
      if (idx !== hoverRef.current) {
        hoverRef.current = idx;
        canvas.style.cursor = idx !== null ? 'grab' : 'default';
        if (idx === null) setTooltipContent(null);
        else {
          const n = nodesRef.current[idx];
          setTooltipContent({ path: n.path, score: n.score, tone: n.tone });
        }
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragRef.current) return;
      canvas.releasePointerCapture(e.pointerId);
      dragRef.current = null;
      canvas.style.cursor = hoverRef.current !== null ? 'grab' : 'default';
    };
    const onPointerLeave = () => {
      hoverRef.current = null;
      canvas.style.cursor = 'default';
      setTooltipContent(null);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let raf = 0;
    let last = performance.now();
    const start = last;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const elapsed = (now - start) / 1000;

      const nodes = nodesRef.current;
      const drag = dragRef.current;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        if (drag && drag.idx === i) {
          n.x = drag.lx;
          n.y = drag.ly;
          n.vx = 0;
          n.vy = 0;
          continue;
        }

        const wobbleX = reduceMotion ? 0 : Math.sin(elapsed * 0.7 + n.phase) * 18;
        const wobbleY = reduceMotion ? 0 : Math.cos(elapsed * 0.55 + n.phase * 1.3) * 14;
        const targetX = n.ax + wobbleX;
        const targetY = n.ay + wobbleY;

        const k = 6;
        const damp = 3;
        n.vx += (targetX - n.x) * k * dt - n.vx * damp * dt;
        n.vy += (targetY - n.y) * k * dt - n.vy * damp * dt;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }

      const activeIdx = drag?.idx ?? hoverRef.current;
      const tipEl = tooltipElRef.current;
      if (tipEl && activeIdx !== null && activeIdx !== undefined) {
        const n = nodes[activeIdx];
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + offX + n.x * scale + 14;
        const sy = rect.top + offY + n.y * scale + 14;
        tipEl.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);

      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(245,239,228,0.06)';
      ctx.beginPath();
      for (const [a, b] of EDGES) {
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
      }
      ctx.stroke();

      const hover = hoverRef.current;
      const dragIdx = drag?.idx ?? null;
      const lerp = 1 - Math.exp(-dt * 8);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const active = i === hover || i === dragIdx;
        n.glow += ((active ? 1 : 0) - n.glow) * lerp;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = TONE_COLOUR[n.tone];
        ctx.globalAlpha = 0.14 + n.glow * 0.31;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const gradient = ctx.createLinearGradient(0, 400, 0, 800);
      gradient.addColorStop(0, 'rgba(6,8,15,0)');
      gradient.addColorStop(1, 'rgba(6,8,15,1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 400, 1200, 400);

      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <NodeTooltip
        ref={tooltipElRef}
        visible={!!tooltipContent}
        path={tooltipContent?.path ?? ''}
        detail={tooltipContent ? String(tooltipContent.score) : ''}
        detailClass={tooltipContent ? tooltipToneClass(tooltipContent.tone) : ''}
        position="fixed"
      />
    </>
  );
}
