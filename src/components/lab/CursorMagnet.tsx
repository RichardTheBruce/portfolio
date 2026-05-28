"use client";

// Experiment 15: Cursor magnet text — DOM-based UI primitive.
//
// A constellation of phrases scattered across the viewport. Each phrase has
// an anchor (its layout position) and a current offset from anchor. Every
// animation frame, the offset springs toward a MAGNET target computed from
// cursor proximity. Within MAGNET_RADIUS px, the phrase is pulled toward
// the cursor with a falloff; beyond, the magnet target is zero (phrase
// returns to anchor).
//
// First DOM-based experiment in the lab. Same Verlet/spring pattern as the
// 3D physics experiments but applied to CSS transforms instead of meshes.
// Useful primitive for hover constellations, hero word reveals, and
// label-magnet UI moments.

import { useEffect, useRef } from "react";

const MAGNET_RADIUS = 220;   // px from cursor before phrase reacts
const MAGNET_STRENGTH = 0.35; // 0..1 — fraction of cursor delta applied as target
const SPRING_K = 0.22;
const DAMPING = 0.72;

interface PhraseSpec {
  text: string;
  // anchor in viewport-relative space (% of container). x: 0..100, y: 0..100
  x: number;
  y: number;
  // visual variant
  size: "xl" | "lg" | "md" | "sm";
  tone: "bone" | "amber" | "blue";
  serif?: boolean;
}

const PHRASES: PhraseSpec[] = [
  { text: "He who creates",     x: 50, y: 18, size: "xl", tone: "bone",  serif: true },
  { text: "for thy seeker",      x: 78, y: 32, size: "md", tone: "amber" },
  { text: "anchored particles",  x: 18, y: 42, size: "sm", tone: "blue" },
  { text: "Cormorant Garamond",  x: 62, y: 50, size: "md", tone: "bone",  serif: true },
  { text: "Verlet",              x: 28, y: 64, size: "lg", tone: "amber", serif: true },
  { text: "smoothstep",          x: 75, y: 70, size: "sm", tone: "bone" },
  { text: "instanced mesh",      x: 14, y: 78, size: "md", tone: "blue" },
  { text: "Bloom",               x: 50, y: 84, size: "xl", tone: "amber", serif: true },
  { text: "neural net",          x: 84, y: 90, size: "sm", tone: "bone" },
];

const SIZE_CLASS: Record<PhraseSpec["size"], string> = {
  xl: "text-5xl md:text-6xl",
  lg: "text-3xl md:text-4xl",
  md: "text-xl md:text-2xl",
  sm: "text-sm md:text-base",
};

const TONE_CLASS: Record<PhraseSpec["tone"], string> = {
  bone: "text-bone/85",
  amber: "text-[#C97D3E]",
  blue: "text-[#3DA9FC]",
};

export function CursorMagnet({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phraseRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Per-phrase live offset (px) + previous (for Verlet damping)
  const offsets = useRef<number[]>(new Array(PHRASES.length * 2).fill(0));
  const prev = useRef<number[]>(new Array(PHRASES.length * 2).fill(0));
  const cursor = useRef({ x: -10000, y: -10000 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      cursor.current.x = e.clientX - rect.left;
      cursor.current.y = e.clientY - rect.top;
    }
    function onLeave() {
      cursor.current.x = -10000;
      cursor.current.y = -10000;
    }
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    let frame = 0;
    const loop = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = cursor.current.x;
      const cy = cursor.current.y;

      for (let i = 0; i < PHRASES.length; i++) {
        const spec = PHRASES[i];
        const ax = (spec.x / 100) * w;
        const ay = (spec.y / 100) * h;
        const dx = cx - ax;
        const dy = cy - ay;
        const d = Math.sqrt(dx * dx + dy * dy);

        let tx = 0;
        let ty = 0;
        if (d < MAGNET_RADIUS) {
          const falloff = 1 - d / MAGNET_RADIUS;
          const mag = MAGNET_STRENGTH * falloff;
          tx = dx * mag;
          ty = dy * mag;
        }

        const ox = offsets.current[i * 2];
        const oy = offsets.current[i * 2 + 1];
        const px = prev.current[i * 2];
        const py = prev.current[i * 2 + 1];

        const fx = (tx - ox) * SPRING_K;
        const fy = (ty - oy) * SPRING_K;
        const vx = (ox - px) * DAMPING;
        const vy = (oy - py) * DAMPING;

        prev.current[i * 2] = ox;
        prev.current[i * 2 + 1] = oy;
        offsets.current[i * 2] = ox + vx + fx;
        offsets.current[i * 2 + 1] = oy + vy + fy;

        const el = phraseRefs.current[i];
        if (el) {
          el.style.transform = `translate(calc(-50% + ${offsets.current[i * 2].toFixed(2)}px), calc(-50% + ${offsets.current[i * 2 + 1].toFixed(2)}px))`;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      <div ref={containerRef} className="absolute inset-0 cursor-none">
        {PHRASES.map((spec, i) => (
          <span
            key={i}
            ref={(el) => {
              phraseRefs.current[i] = el;
            }}
            className={`pointer-events-none absolute select-none whitespace-nowrap will-change-transform ${SIZE_CLASS[spec.size]} ${TONE_CLASS[spec.tone]} ${spec.serif ? "font-serif" : "mono-caps tracking-[0.15em]"}`}
            style={{
              left: `${spec.x}%`,
              top: `${spec.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {spec.text}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 max-w-[680px] text-[10px] text-bone/30">
          {meta}
        </p>
      </div>
      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
        the words lean toward you
      </p>
    </section>
  );
}
