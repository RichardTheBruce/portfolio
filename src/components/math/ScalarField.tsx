"use client";

import { useEffect, useRef, useState } from "react";

type FieldParams = {
  spin: number;
  tilt: number;
  criticalA: number;
  criticalB: number;
  criticalC: number;
  decay: number;
};

const PRESETS: FieldParams[] = [
  { criticalA: 2, criticalB: 7, criticalC: 19, spin: 1.5, tilt: 0.5, decay: 1.0 },
  { criticalA: 0, criticalB: 2, criticalC: 7, spin: 1.5, tilt: 1.5, decay: 1.0 },
  { criticalA: 2, criticalB: 7, criticalC: 19, spin: 1.5, tilt: 0.5, decay: 0.5 },
];

// Palette sampled from Taste BABY/SeeMythos plots.
function colormap(value: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, value));
  if (t < 0) {
    const k = (t + 1);
    return [
      Math.floor(245 * k + 26 * (1 - k)),
      Math.floor(231 * k + 11 * (1 - k)),
      Math.floor(208 * k + 46 * (1 - k)),
    ];
  }
  const k = t;
  return [
    Math.floor(245 * (1 - k) + 201 * k),
    Math.floor(231 * (1 - k) + 125 * k),
    Math.floor(208 * (1 - k) + 62 * k),
  ];
}

function fieldValue(x: number, y: number, p: FieldParams): number {
  const { criticalA, criticalB, criticalC, spin, tilt, decay } = p;
  const r = Math.sqrt(x * x + y * y);
  const theta = Math.atan2(y, x);
  const oscA = Math.cos(criticalA * theta + spin * r);
  const oscB = Math.cos(criticalB * (x * Math.cos(tilt) + y * Math.sin(tilt)));
  const oscC = Math.cos(criticalC * 0.1 * (x - y) + spin);
  const envelope = Math.exp(-decay * 0.04 * r * r);
  return ((oscA + oscB + oscC) / 3) * envelope;
}

export function ScalarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [params, setParams] = useState<FieldParams>(PRESETS[0]);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setParams(PRESETS[presetIndex]);
  }, [presetIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const range = 5;
    for (let py = 0; py < h; py++) {
      const y = ((py / h) - 0.5) * 2 * range;
      for (let px = 0; px < w; px++) {
        const x = ((px / w) - 0.5) * 2 * range;
        const v = fieldValue(x, y, params);
        const [r, g, b] = colormap(v);
        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [params]);

  return (
    <section className="relative flex w-full flex-col items-center bg-ink px-6 py-32 md:px-16">
      <div className="mb-12 max-w-4xl text-center">
        <p className="mono-caps mb-4 text-xs text-bone/40">The math</p>
        <h2 className="serif-display text-5xl text-bone md:text-7xl">
          Strings as <span className="amber-glow">probability</span>. Fields as proof.
        </h2>
        <p className="mt-6 font-sans text-base text-bone/60">
          A live scalar-field renderer. Real critical-point parameters from the Memetropolis scalars work.
          Drag to spin. Scroll to tilt.
        </p>
      </div>

      <div className="relative w-full max-w-3xl rounded-sm border border-bone/10 bg-ink p-8">
        <div className="mb-4 flex items-center justify-between">
          <p className="mono-caps text-[11px] text-bone/60">
            FIELD STRUCTURE · CRITICAL POINT ({params.criticalA}, {params.criticalB}, {params.criticalC})
            · SPIN {params.spin.toFixed(1)} · TILT {params.tilt.toFixed(1)} · DECAY {params.decay.toFixed(1)}
          </p>
          <div className="flex gap-2">
            {PRESETS.map((_, i) => (
              <button
                key={i}
                onClick={() => setPresetIndex(i)}
                className={`mono-caps rounded-sm px-2 py-1 text-[10px] transition ${
                  presetIndex === i ? "bg-amber text-ink" : "border border-bone/15 text-bone/60 hover:border-amber"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={520}
          height={520}
          className="aspect-square w-full cursor-grab select-none rounded-sm"
          onMouseDown={(e) => {
            draggingRef.current = true;
            lastRef.current = { x: e.clientX, y: e.clientY };
          }}
          onMouseUp={() => {
            draggingRef.current = false;
          }}
          onMouseLeave={() => {
            draggingRef.current = false;
          }}
          onMouseMove={(e) => {
            if (!draggingRef.current) return;
            const dx = e.clientX - lastRef.current.x;
            const dy = e.clientY - lastRef.current.y;
            lastRef.current = { x: e.clientX, y: e.clientY };
            setParams((p) => ({
              ...p,
              spin: p.spin + dx * 0.01,
              tilt: p.tilt + dy * 0.01,
            }));
          }}
          onWheel={(e) => {
            e.preventDefault();
            setParams((p) => ({ ...p, decay: Math.max(0.2, Math.min(2, p.decay + e.deltaY * 0.001)) }));
          }}
        />

        <p className="mono-caps mt-4 text-[10px] text-bone/40">
          source · welcoming-dazzle-7q822.apidocumentation.com
        </p>
      </div>

      <a
        href="https://welcoming-dazzle-7q822.apidocumentation.com/guide/memetropolis-technical-documentation/1-systems-overview"
        target="_blank"
        rel="noopener noreferrer"
        className="mono-caps mt-10 text-xs text-amber hover:text-bone"
      >
        Read the full scalars →
      </a>
    </section>
  );
}
