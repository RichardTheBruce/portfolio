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
const BALL_RADIUS_PX = 28;

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

    let rx = 0;
    let ry = 0;
    let x = 0;
    let y = 0;
    let px = 0;
    let py = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseInside = false;

    function resize() {
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      rx = (w / 2) * dpr;
      ry = (h / 2) * dpr;
      x = rx;
      y = ry;
      px = rx;
      py = ry;
    }
    resize();

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

      // Anchor spring toward (rx, ry).
      let fx = (rx - x) * ANCHOR_SPRING_K;
      let fy = (ry - y) * ANCHOR_SPRING_K;

      // Mouse contact repulsion.
      if (mouseInside) {
        const dxm = x - mouseX;
        const dym = y - mouseY;
        const distSq = dxm * dxm + dym * dym;
        const radPx = REPEL_RADIUS_PX * dpr;
        const radSq = radPx * radPx;
        if (distSq < radSq && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - dist / radPx;
          const f = REPEL_STRENGTH * falloff * falloff;
          fx += (dxm / dist) * f * radPx * 0.02;
          fy += (dym / dist) * f * radPx * 0.02;
        }
      }

      // Verlet integration with damping. The (x - px) carries momentum forward
      // so the ball overshoots its anchor on the way home and oscillates.
      const vx = (x - px) * DAMPING;
      const vy = (y - py) * DAMPING;
      px = x;
      py = y;
      x += vx + fx;
      y += vy + fy;

      // Render the ball: ink core, cyan rim ring, soft outer halo.
      const baseR = BALL_RADIUS_PX * dpr;
      const haloR = baseR * 2.6;
      const grad = ctx.createRadialGradient(x, y, baseR * 0.3, x, y, haloR);
      grad.addColorStop(0, "rgba(61, 169, 252, 0.95)");
      grad.addColorStop(0.4, "rgba(30, 150, 230, 0.35)");
      grad.addColorStop(1, "rgba(10, 10, 11, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(10, 10, 11, 1)";
      ctx.beginPath();
      ctx.arc(x, y, baseR * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(61, 169, 252, 1)";
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Tiny tick mark at the anchor point so you can see where it's pulling to.
      ctx.fillStyle = "rgba(245, 242, 236, 0.25)";
      ctx.beginPath();
      ctx.arc(rx, ry, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();

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
        <p className="font-serif text-2xl text-bone/80">Anchored ball, contact repulsion</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">
          K_anchor=0.045 · damping=0.92 · repel_r=140px · strength=0.9
        </p>
      </div>
      <div className="absolute bottom-6 left-6">
        <Link href="/" className="mono-caps text-[10px] text-bone/40 hover:text-amber">
          ← home
        </Link>
      </div>
      <div className="pointer-events-none absolute bottom-6 right-6">
        <p className="mono-caps text-[10px] text-bone/30">
          Move the cursor near the ball to push it. Release the cursor and the
          anchor spring carries it home with one or two visible oscillations.
        </p>
      </div>
    </main>
  );
}
