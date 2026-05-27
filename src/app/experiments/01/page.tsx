"use client";

// Experiments page. Each experiment is its own viewport-height block with its
// own self-contained physics canvas, stacked vertically. Adding a new
// experiment means appending a new <ExperimentBlock> below the previous ones.
// No experiment is overlaid on another.

import { useEffect, useRef } from "react";
import Link from "next/link";

const ANCHOR_SPRING_K = 0.045;
const DAMPING = 0.92;
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 0.9;
const BALL_RADIUS_PX = 4;

type Dot = { x: number; y: number; px: number; py: number; rx: number; ry: number };

// Builder receives the canvas's centered (cx, cy) in device-pixel coords and
// the device-pixel ratio, returns an anchored Dot list.
type DotBuilder = (cx: number, cy: number, dpr: number) => Dot[];

function buildSquareGrid(cx: number, cy: number, dpr: number): Dot[] {
  const GRID_DIM = 10;
  const GRID_SPACING_PX = 22;
  const dots: Dot[] = [];
  const spacing = GRID_SPACING_PX * dpr;
  const totalSpan = spacing * (GRID_DIM - 1);
  const startX = cx - totalSpan / 2;
  const startY = cy - totalSpan / 2;
  for (let row = 0; row < GRID_DIM; row++) {
    for (let col = 0; col < GRID_DIM; col++) {
      const rxA = startX + col * spacing;
      const ryA = startY + row * spacing;
      dots.push({ x: rxA, y: ryA, px: rxA, py: ryA, rx: rxA, ry: ryA });
    }
  }
  return dots;
}

function buildCapitalR(cx: number, cy: number, dpr: number): Dot[] {
  const R_DOT_COUNT = 100;
  const R_FONT_PX = 320;
  const off = document.createElement("canvas");
  const sz = Math.ceil(R_FONT_PX * dpr * 1.3);
  off.width = sz;
  off.height = sz;
  const octx = off.getContext("2d");
  if (!octx) return [];
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "center";
  octx.font = `900 ${R_FONT_PX * dpr}px "Cormorant Garamond", Georgia, serif`;
  octx.fillText("R", sz / 2, sz / 2);
  const img = octx.getImageData(0, 0, sz, sz);

  let alphaCount = 0;
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      if (img.data[(y * sz + x) * 4 + 3] > 128) alphaCount++;
    }
  }
  if (alphaCount === 0) return [];
  const stride = Math.max(1, Math.floor(Math.sqrt(alphaCount / R_DOT_COUNT)));

  const sampled: Dot[] = [];
  for (let y = 0; y < sz && sampled.length < R_DOT_COUNT; y += stride) {
    for (let x = 0; x < sz && sampled.length < R_DOT_COUNT; x += stride) {
      if (img.data[(y * sz + x) * 4 + 3] > 128) {
        const ax = cx + (x - sz / 2);
        const ay = cy + (y - sz / 2);
        sampled.push({ x: ax, y: ay, px: ax, py: ay, rx: ax, ry: ay });
      }
    }
  }
  return sampled;
}

function ExperimentBlock({
  index,
  title,
  meta,
  buildDots,
  waitForFonts = false,
}: {
  index: string;
  title: string;
  meta: string;
  buildDots: DotBuilder;
  waitForFonts?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let raf = 0;
    let running = true;
    let dots: Dot[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseInside = false;

    function build() {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      dots = buildDots((w / 2) * dpr, (h / 2) * dpr, dpr);
    }

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      build();
    }
    resize();

    if (waitForFonts && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    }

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (e.clientY - rect.top) * dpr;
      mouseInside = true;
    }
    function onLeave() {
      mouseInside = false;
      mouseX = -9999;
      mouseY = -9999;
    }

    function step() {
      if (!canvas || !ctx || !running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const radPx = REPEL_RADIUS_PX * dpr;
      const radSq = radPx * radPx;

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        let fx = (d.rx - d.x) * ANCHOR_SPRING_K;
        let fy = (d.ry - d.y) * ANCHOR_SPRING_K;

        if (mouseInside) {
          const dxm = d.x - mouseX;
          const dym = d.y - mouseY;
          const distSq = dxm * dxm + dym * dym;
          if (distSq < radSq && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const falloff = 1 - dist / radPx;
            const f = REPEL_STRENGTH * falloff * falloff;
            fx += (dxm / dist) * f * radPx * 0.02;
            fy += (dym / dist) * f * radPx * 0.02;
          }
        }

        const vx = (d.x - d.px) * DAMPING;
        const vy = (d.y - d.py) * DAMPING;
        d.px = d.x;
        d.py = d.y;
        d.x += vx + fx;
        d.y += vy + fy;
      }

      ctx.fillStyle = "#1E96E6";
      const dotR = BALL_RADIUS_PX * dpr;
      for (let i = 0; i < dots.length; i++) {
        ctx.beginPath();
        ctx.arc(dots[i].x, dots[i].y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(step);
    }

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [buildDots, waitForFonts]);

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      <div className="pointer-events-none absolute left-6 top-6">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">{meta}</p>
      </div>
    </section>
  );
}

export default function Experiments() {
  return (
    <main className="relative w-full bg-ink">
      <ExperimentBlock
        index="Experiment 01"
        title="100-dot square, contact repulsion"
        meta="10×10 grid · spacing=22px · K_anchor=0.045 · damping=0.92 · repel_r=140px · strength=0.9"
        buildDots={buildSquareGrid}
      />
      <ExperimentBlock
        index="Experiment 02"
        title="100-dot capital R, contact repulsion"
        meta="100 dots sampled from Cormorant Black, 320px · same per-dot physics"
        buildDots={buildCapitalR}
        waitForFonts
      />
      <div className="fixed bottom-6 left-6 z-10">
        <Link href="/" className="mono-caps text-[10px] text-bone/40 hover:text-amber">
          ← home
        </Link>
      </div>
    </main>
  );
}
