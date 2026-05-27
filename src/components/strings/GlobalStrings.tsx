"use client";

import { useEffect, useRef } from "react";

const STRING_COUNT = 14;

type Vec = { x: number; y: number };

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function GlobalStrings() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stringsRef = useRef<Array<{ a: Vec; b: Vec; speed: number; phase: number }>>([]);
  const scrollYRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    resize();
    window.addEventListener("resize", resize);

    stringsRef.current = Array.from({ length: STRING_COUNT }, () => ({
      a: { x: rand(0, 1), y: rand(0, 1) },
      b: { x: rand(0, 1), y: rand(0, 1) },
      speed: rand(0.00005, 0.00015),
      phase: rand(0, Math.PI * 2),
    }));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let running = true;
    function tick() {
      if (!running || !canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const reduced =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t = reduced ? 0 : frame;

      for (const s of stringsRef.current) {
        const ax = s.a.x * w + Math.sin(t * s.speed + s.phase) * 60 * dpr;
        const ay = s.a.y * h + Math.cos(t * s.speed + s.phase) * 60 * dpr - scrollYRef.current * 0.1 * dpr;
        const bx = s.b.x * w + Math.cos(t * s.speed + s.phase) * 80 * dpr;
        const by = s.b.y * h + Math.sin(t * s.speed + s.phase) * 80 * dpr - scrollYRef.current * 0.15 * dpr;
        ctx.strokeStyle = "rgba(30, 150, 230, 0.08)";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      frame++;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function onScroll() {
      scrollYRef.current = window.scrollY;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      running = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
