"use client";

import { useEffect, useRef } from "react";

type Props = {
  word: string;
  accentLetterIndex: number;
};

type Particle = {
  rx: number;
  ry: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

// Placeholder ParticleField. Council variants (A, B, C) are produced in parallel and
// will replace this implementation. This stub samples the target word onto a hidden
// offscreen canvas, then renders particles that spring to their target positions and
// repel from the mouse within a 140px radius.
//
// Source citations for the placeholder pattern:
//   Taste BABY/ImportantParticleWork5.png (target density)
//   Taste BABY/ImportantParticleWork.png1.png (dispersal pattern under repel)
//   v0-1-interface-MASTER-desktop.png (negative space, monochrome canvas)

export function ParticleField({ word, accentLetterIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    resize();

    const off = document.createElement("canvas");
    off.width = canvas.width;
    off.height = canvas.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    function sampleTargets(): Array<{ x: number; y: number; accent: boolean }> {
      if (!offCtx || !canvas) return [];
      offCtx.clearRect(0, 0, off.width, off.height);
      const sizePx = Math.min(window.innerWidth * 0.12, 220) * dpr;
      offCtx.fillStyle = "#fff";
      offCtx.textBaseline = "middle";
      offCtx.textAlign = "center";
      offCtx.font = `700 ${sizePx}px "Cormorant Garamond", Georgia, serif`;
      offCtx.fillText(word, off.width / 2, off.height / 2);
      const img = offCtx.getImageData(0, 0, off.width, off.height);
      const step = Math.max(4, Math.floor(8 * dpr));
      const points: Array<{ x: number; y: number; accent: boolean }> = [];
      const totalChars = word.length;
      const wordWidth = offCtx.measureText(word).width;
      const startX = off.width / 2 - wordWidth / 2;
      const accentX1 = startX + (wordWidth / totalChars) * accentLetterIndex;
      const accentX2 = startX + (wordWidth / totalChars) * (accentLetterIndex + 1);
      for (let y = 0; y < off.height; y += step) {
        for (let x = 0; x < off.width; x += step) {
          const idx = (y * off.width + x) * 4;
          if (img.data[idx + 3] > 128) {
            points.push({ x, y, accent: x >= accentX1 && x <= accentX2 });
          }
        }
      }
      return points;
    }

    const targets = sampleTargets();
    const targetCount = Math.min(
      targets.length,
      (navigator.hardwareConcurrency ?? 4) < 6 ? 1800 : 3000
    );
    const indices = Array.from({ length: targets.length }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, targetCount);

    const particles: Particle[] = indices.map((idx) => {
      const t = targets[idx];
      return {
        rx: t.x,
        ry: t.y,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: 0,
        vy: 0,
      };
    });
    const isAccent = indices.map((idx) => targets[idx].accent);

    const mouse = { x: -9999, y: -9999, active: false };
    function onMove(e: MouseEvent) {
      mouse.x = e.clientX * dpr;
      mouse.y = e.clientY * dpr;
      mouse.active = true;
    }
    function onLeave() {
      mouse.active = false;
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const repelRadius = 140 * dpr;
    const repelStrength = 1200;
    const spring = 0.045;
    const damping = 0.82;

    function tick() {
      if (!canvas || !ctx) return;
      ctx.fillStyle = "rgba(10, 10, 11, 0.35)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (reduced) {
          p.x = p.rx;
          p.y = p.ry;
        } else {
          const dx = p.rx - p.x;
          const dy = p.ry - p.y;
          p.vx += dx * spring;
          p.vy += dy * spring;
          if (mouse.active) {
            const mdx = p.x - mouse.x;
            const mdy = p.y - mouse.y;
            const distSq = mdx * mdx + mdy * mdy;
            const radSq = repelRadius * repelRadius;
            if (distSq < radSq && distSq > 0.5) {
              const dist = Math.sqrt(distSq);
              const force = (repelStrength * (1 - dist / repelRadius)) / dist;
              p.vx += mdx * force * 0.0003;
              p.vy += mdy * force * 0.0003;
            }
          }
          p.vx *= damping;
          p.vy *= damping;
          p.x += p.vx;
          p.y += p.vy;
        }
        if (isAccent[i]) {
          const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.005);
          ctx.fillStyle = `rgba(201, 125, 62, ${pulse})`;
          ctx.fillRect(p.x - 1.2 * dpr, p.y - 1.2 * dpr, 2.4 * dpr, 2.4 * dpr);
        } else {
          ctx.fillStyle = "rgba(245, 242, 236, 0.85)";
          ctx.fillRect(p.x - dpr, p.y - dpr, 2 * dpr, 2 * dpr);
        }
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, [word, accentLetterIndex]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
