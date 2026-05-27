"use client";

// Experiment 01: single ball with center of gravity, anchor position, contact
// repulsion. No lines.
//
// Physics:
//   - Ball has a fixed anchor (rx, ry). Position (x, y) is verlet-integrated.
//   - Center of gravity comes from inertia: the ball carries velocity across
//     frames (the verlet (x - px) term) so it overshoots its anchor on the
//     way back and oscillates before settling. The DAMPING constant controls
//     how heavy that feel is.
//   - Mouse-repel within REPEL_RADIUS_PX. Force falls off linearly with
//     distance. Outside the radius the ball only feels the anchor spring.
//   - On release the ball flies back to anchor via spring force; under-damped
//     so it overshoots once or twice before settling.

import { useEffect, useRef } from "react";
import Link from "next/link";

const ANCHOR_SPRING_K = 0.045;
const DAMPING = 0.92;
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 0.9;
const BALL_RADIUS_PX = 4;
const GRID_DIM = 10; // 10 x 10 = 100 dots
const GRID_SPACING_PX = 22;
const R_DOT_COUNT = 100;
const R_FONT_PX = 320;

export default function ExperimentOne() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let raf = 0;
    let running = true;

    type Dot = { x: number; y: number; px: number; py: number; rx: number; ry: number };
    const dots: Dot[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseInside = false;

    function sampleRDots(centerX: number, centerY: number): Dot[] {
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

      // First-pass count of alpha-positive cells, then stride to land ~100 dots.
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
            const ax = centerX + (x - sz / 2);
            const ay = centerY + (y - sz / 2);
            sampled.push({ x: ax, y: ay, px: ax, py: ay, rx: ax, ry: ay });
          }
        }
      }
      return sampled;
    }

    function build() {
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = (w / 2) * dpr;
      const cy = (h / 2) * dpr;

      dots.length = 0;

      // Layer 1: the 10x10 grid square (underneath).
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

      // Layer 2: capital R sampled from Cormorant Garamond Black, 100 dots,
      // overlaid on top of the grid.
      dots.push(...sampleRDots(cx, cy));
    }

    function resize() {
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      build();
    }
    resize();
    // Re-sample once fonts have actually loaded (Cormorant Garamond Black
    // doesn't ship system-side, so first paint can fall back to Georgia).
    if (document.fonts && document.fonts.ready) {
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

        // Anchor spring toward (rx, ry).
        let fx = (d.rx - d.x) * ANCHOR_SPRING_K;
        let fy = (d.ry - d.y) * ANCHOR_SPRING_K;

        // Mouse contact repulsion.
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

        // Verlet integration with damping.
        const vx = (d.x - d.px) * DAMPING;
        const vy = (d.y - d.py) * DAMPING;
        d.px = d.x;
        d.py = d.y;
        d.x += vx + fx;
        d.y += vy + fy;
      }

      // Render: 100 solid blue dots, no lines.
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
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      <div className="pointer-events-none absolute top-6 left-6">
        <p className="mono-caps text-[10px] text-bone/40">Experiment 01</p>
        <p className="font-serif text-2xl text-bone/80">100-dot square + 100-dot R, contact repulsion</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">
          200 dots · grid 10×10 underneath · R sampled from Cormorant Black, 320px
        </p>
      </div>
      <div className="absolute bottom-6 left-6">
        <Link href="/" className="mono-caps text-[10px] text-bone/40 hover:text-amber">
          ← home
        </Link>
      </div>
      <div className="pointer-events-none absolute bottom-6 right-6">
        <p className="mono-caps text-[10px] text-bone/30">
          Move the cursor across the grid. Dots within 140px scatter, then
          spring back to their anchor positions with center-of-gravity overshoot.
        </p>
      </div>
    </main>
  );
}
