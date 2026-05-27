"use client";

// Interactive exploration of W(t) = f(M, E, S, f, λ, P, R).
//
// The seven sliders are the variables from Richard's consciousness paper §III
// (Table 1, Properties of Conscious Mass Bodies). Adjusting them updates a
// central rim-lit node whose properties (size, intensity, rotation, pulse)
// respond to the inputs, and surfaces an approximate stellar-class match per
// the classification system in §V.
//
// IMPORTANT: the math here is a CONCEPTUAL EXPLORER, not the formalism.
// Richard's rigorous vector equation lives on his Ubuntu m.2 drives. This UI
// is for visceral exploration of the framework's variables, not a substitute
// for the real W(t). The class-mapping heuristic is intentionally rough.
//
// Source citations:
//   - Variables and their conscious-mass equivalents: Wayne (2025) §III
//   - Classification labels: Wayne (2025) §V
//   - Central node treatment: OneDrive/Desktop/Taste BABY/Focus/Important13.jpg
//   - Vector star backdrop: OneDrive/Desktop/Taste BABY/Focus/Important1.jpg

import { useEffect, useMemo, useRef, useState } from "react";

type Variable = {
  key: string;
  symbol: string;
  label: string;
  paperLabel: string;
  proxy: string;
};

const VARIABLES: Variable[] = [
  { key: "M", symbol: "M", label: "Mass", paperLabel: "Accumulated influence", proxy: "Network size, resource base, dependents" },
  { key: "E", symbol: "E", label: "Energy Output", paperLabel: "Production per unit time", proxy: "Decisions, capital, works produced" },
  { key: "S", symbol: "S", label: "Spin Vector", paperLabel: "Directional commitment", proxy: "Behavioral consistency under pressure" },
  { key: "f", symbol: "ƒ", label: "Decay Frequency", paperLabel: "Operational tempo", proxy: "Decision velocity, rate of pivots" },
  { key: "lambda", symbol: "λ", label: "Wavelength Character", paperLabel: "Qualitative output", proxy: "Whether actors gain or lose capacity in your orbit" },
  { key: "P", symbol: "P", label: "Probability Space", paperLabel: "Range of trajectories", proxy: "Opportunity set density" },
  { key: "R", symbol: "R", label: "Resonance Coupling", paperLabel: "Compatibility attractor", proxy: "Rate at which compatible actors find you" },
];

type ClassLabel = {
  code: string;
  name: string;
  exemplar: string;
  character: string;
};

const CLASSES: ClassLabel[] = [
  { code: "O", name: "Supergiant", exemplar: "Alexander", character: "Maximum mass, maximum energy, shortest lifecycle. Explosive, total, brief." },
  { code: "B", name: "Blue Giant", exemplar: "Tesla", character: "Very high energy, generational influence, intense and directional." },
  { code: "A", name: "White Star", exemplar: "Musk", character: "High and sustained output, multiple simultaneous ventures." },
  { code: "F", name: "Yellow-White", exemplar: "Buffett", character: "High mass, moderate energy, long stable phase." },
  { code: "G", name: "Yellow Star", exemplar: "Community Builder", character: "Moderate mass and energy, long productive lifecycle." },
  { code: "K", name: "Orange Dwarf", exemplar: "Deep Local Actor", character: "Lower output directed inward, depth not breadth." },
  { code: "M", name: "Red Dwarf", exemplar: "Sustainer", character: "Minimal external influence, foundation of local systems." },
  { code: "BD", name: "Brown Dwarf", exemplar: "Almost-Star", character: "System-generator character without ignition." },
  { code: "WD", name: "White Dwarf", exemplar: "Mandela (late)", character: "Post-collapse elder. Density without velocity." },
  { code: "NS", name: "Neutron Star", exemplar: "Dostoevsky", character: "Survived supercritical collapse. Pulsed and precise." },
  { code: "BH", name: "Black Hole", exemplar: "Invisible Organizer", character: "Mass so collapsed that direct output is invisible." },
  { code: "C", name: "Comet", exemplar: "Rasputin", character: "Highly eccentric orbit. Brief, intense, permanent in effect." },
];

function classify(s: Record<string, number>): ClassLabel {
  const M = s.M, E = s.E, Spin = s.S, freq = s.f, lam = s.lambda, P = s.P, R = s.R;
  if (M > 0.8 && E > 0.85 && freq > 0.7) return CLASSES[0]; // O
  if (M > 0.6 && E > 0.75 && Spin > 0.7) return CLASSES[1]; // B
  if (M > 0.55 && E > 0.65 && freq > 0.55 && Spin > 0.6) return CLASSES[2]; // A
  if (M > 0.7 && E < 0.55 && freq < 0.45) return CLASSES[3]; // F
  if (M > 0.4 && E > 0.4 && E < 0.6 && Spin > 0.5) return CLASSES[4]; // G
  if (M < 0.45 && E < 0.45 && R > 0.6) return CLASSES[5]; // K
  if (M < 0.35 && E < 0.35 && R > 0.5) return CLASSES[6]; // M
  if (M > 0.45 && E < 0.4 && Spin < 0.4) return CLASSES[7]; // BD
  if (M > 0.6 && E < 0.3 && freq < 0.3) return CLASSES[8]; // WD
  if (M > 0.7 && freq > 0.8 && lam > 0.6) return CLASSES[9]; // NS
  if (M > 0.85 && E < 0.15) return CLASSES[10]; // BH
  if (P < 0.2 && freq > 0.7 && Spin < 0.4) return CLASSES[11]; // Comet
  return CLASSES[4]; // default G
}

export function Framework() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vals, setVals] = useState<Record<string, number>>({
    M: 0.62, E: 0.72, S: 0.78, f: 0.68, lambda: 0.7, P: 0.55, R: 0.6,
  });
  const cls = useMemo(() => classify(vals), [vals]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;

    function draw() {
      if (!canvas || !ctx || !running) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const t = performance.now() * 0.001;

      // ============================================================
      // CONSCIOUS-MASS TENSOR
      // Built per Richard's Reality_Tensors catalog
      // (OneDrive/Desktop/Taste BABY/Focus/Important3.jpg, Important7.jpg)
      // and the Holographic_Dimensional_Computer (Important9.jpg, Important20.png).
      //
      // The seven W(t) sliders compose the tensor's structure:
      //   M (mass)        → number of perimeter vertices (8 → 32) + chord density
      //   E (output)      → brightness of all lines + ray length past perimeter
      //   S (spin)        → rotation rate of the inner tensor assembly
      //   f (freq)        → pulse frequency on nucleus + tightness of inner shell
      //   λ (wavelength)  → color blend from string-blue toward amber for the rim
      //   P (probability) → outer probability halo radius
      //   R (resonance)   → number + brightness of concentric outer rings
      // ============================================================

      const M = vals.M;
      const E = vals.E;
      const spin = (vals.S - 0.5) * 0.6;
      const fHz = 0.4 + vals.f * 3.2;
      const lam = vals.lambda;
      const P = vals.P;
      const R = vals.R;

      const perimVerts = Math.max(6, Math.round(8 + M * 24));
      const perimR = (44 + M * 78) * dpr;
      const haloR = perimR * (1.5 + P * 1.4);
      const nucleusR = (6 + M * 14) * dpr;
      const rayLen = perimR * (1.1 + E * 0.7);
      const innerShellR = perimR * (0.42 + 0.08 * Math.sin(t * fHz * Math.PI * 2));
      const chordCount = Math.max(0, Math.round(M * 10));

      const lamRgb = lerpColor("#3DA9FC", "#C97D3E", lam);
      const bluRgb = lerpColor("#1E96E6", "#3DA9FC", E);
      const energy = 0.45 + E * 0.55;

      // 1. Probability halo (outermost soft gradient).
      const haloGrad = ctx.createRadialGradient(cx, cy, perimR * 0.6, cx, cy, haloR);
      haloGrad.addColorStop(0, "rgba(10, 10, 11, 0)");
      haloGrad.addColorStop(0.5, `rgba(${bluRgb}, ${0.06 + P * 0.12})`);
      haloGrad.addColorStop(1, "rgba(10, 10, 11, 0)");
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // 2. Resonance concentric rings (R) — count and brightness scale with R.
      const ringCount = Math.max(1, Math.round(2 + R * 5));
      for (let i = 0; i < ringCount; i++) {
        const ringR_i = perimR * (1.12 + i * 0.08 * (1 + P));
        const a = 0.35 - i * 0.05;
        ctx.strokeStyle = `rgba(${bluRgb}, ${Math.max(0.05, a * (0.4 + R * 0.6))})`;
        ctx.lineWidth = (0.5 + (R > 0.5 ? 0.3 : 0)) * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR_i, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Save context, apply spin rotation to the inner tensor assembly.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * spin);

      // 3. Outgoing rays beyond the perimeter (Important9 Holographic Dimensional
      // Computer beams). One per perimeter vertex, length scales with E.
      ctx.strokeStyle = `rgba(${bluRgb}, ${0.25 + E * 0.45})`;
      ctx.lineWidth = 0.7 * dpr;
      ctx.beginPath();
      for (let i = 0; i < perimVerts; i++) {
        const a = (i / perimVerts) * Math.PI * 2;
        const x1 = Math.cos(a) * perimR;
        const y1 = Math.sin(a) * perimR;
        const x2 = Math.cos(a) * rayLen;
        const y2 = Math.sin(a) * rayLen;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // 4. Radial spokes from perimeter to center (the tensor's internal axes).
      ctx.strokeStyle = `rgba(${bluRgb}, ${0.42 * energy})`;
      ctx.lineWidth = 0.6 * dpr;
      ctx.beginPath();
      for (let i = 0; i < perimVerts; i++) {
        const a = (i / perimVerts) * Math.PI * 2;
        const x = Math.cos(a) * perimR;
        const y = Math.sin(a) * perimR;
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 5. Cross-chords through the center (the tensor's wave function).
      // Each chord connects vertex i to vertex (i + stride) % N. Stride varies
      // so the chord set looks like an inscribed-star pattern.
      ctx.strokeStyle = `rgba(${bluRgb}, ${0.55 * energy})`;
      ctx.lineWidth = 0.6 * dpr;
      ctx.beginPath();
      for (let c = 0; c < chordCount; c++) {
        const stride = Math.max(2, Math.floor(perimVerts * 0.4) - c);
        for (let i = 0; i < perimVerts; i++) {
          const a1 = (i / perimVerts) * Math.PI * 2;
          const a2 = ((i + stride) / perimVerts) * Math.PI * 2;
          const x1 = Math.cos(a1) * perimR;
          const y1 = Math.sin(a1) * perimR;
          const x2 = Math.cos(a2) * perimR;
          const y2 = Math.sin(a2) * perimR;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();

      // 6. Inner shell (oscillates with f — the decay frequency).
      ctx.strokeStyle = `rgba(${lamRgb}, ${0.5 + 0.3 * Math.sin(t * fHz * Math.PI * 2)})`;
      ctx.lineWidth = 0.9 * dpr;
      ctx.beginPath();
      for (let i = 0; i < perimVerts; i++) {
        const a = (i / perimVerts) * Math.PI * 2;
        const x = Math.cos(a) * innerShellR;
        const y = Math.sin(a) * innerShellR;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // 7. Perimeter vertex nodes — rim-lit, scaled by M.
      const vertR = (1.8 + M * 2.5) * dpr;
      for (let i = 0; i < perimVerts; i++) {
        const a = (i / perimVerts) * Math.PI * 2;
        const x = Math.cos(a) * perimR;
        const y = Math.sin(a) * perimR;
        ctx.fillStyle = `rgba(${bluRgb}, ${0.85 * energy})`;
        ctx.beginPath();
        ctx.arc(x, y, vertR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // 8. Central nucleus (rim-lit, color = λ).
      const nucPulse = 0.7 + 0.3 * Math.sin(t * fHz * Math.PI * 2);
      const nucleusHalo = nucleusR * (2.6 + E * 1.8);
      const nucGrad = ctx.createRadialGradient(cx, cy, nucleusR * 0.3, cx, cy, nucleusHalo);
      nucGrad.addColorStop(0, `rgba(${lamRgb}, ${0.95 * nucPulse})`);
      nucGrad.addColorStop(0.4, `rgba(${lamRgb}, ${0.35 * nucPulse})`);
      nucGrad.addColorStop(1, "rgba(10, 10, 11, 0)");
      ctx.fillStyle = nucGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusHalo, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(10, 10, 11, 1)";
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgb(${lamRgb})`;
      ctx.lineWidth = (1.4 + 0.4 * nucPulse) * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, nucleusR, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [vals]);

  return (
    <section className="relative flex w-full flex-col items-center bg-ink px-6 py-32 md:px-16">
      <div className="mb-12 max-w-4xl text-center">
        <p className="mono-caps mb-4 text-xs text-bone/40">The framework</p>
        <h2 className="serif-display text-5xl text-bone md:text-7xl">
          <span className="amber-glow">W(t)</span> = f(M, E, S, ƒ, λ, P, R)
        </h2>
        <p className="mt-6 max-w-2xl mx-auto font-sans text-base text-bone/60">
          Seven variables. One conscious mass body. Drag the sliders. The shape on the right is your
          current decay vector. The label tells you which stellar class you currently approximate.
        </p>
        <p className="mt-3 max-w-2xl mx-auto mono-caps text-[10px] text-bone/30">
          Conceptual explorer. Real formalization lives in the source paper.{" "}
          <a href="/papers/consciousness_mass_framework.pdf" className="text-amber hover:underline">
            Read it →
          </a>
        </p>
      </div>

      <div className="grid w-full max-w-6xl gap-8 md:grid-cols-2">
        <div className="space-y-4">
          {VARIABLES.map((v) => (
            <div key={v.key}>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-2xl text-bone">
                  <span className="amber-glow">{v.symbol}</span>{" "}
                  <span className="text-bone/80">{v.label}</span>
                </span>
                <span className="mono-caps text-[10px] text-bone/40">
                  {Math.round(vals[v.key] * 100)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(vals[v.key] * 100)}
                onChange={(e) => setVals((s) => ({ ...s, [v.key]: Number(e.target.value) / 100 }))}
                className="mt-1 h-1 w-full appearance-none rounded-full bg-bone/15 accent-amber"
              />
              <p className="mono-caps mt-1 text-[9px] text-bone/40">
                {v.paperLabel} · {v.proxy}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-start">
          <canvas
            ref={canvasRef}
            className="aspect-square w-full max-w-[460px] rounded-sm border border-bone/10"
            style={{ background: "var(--ink, #0A0A0B)" }}
          />
          <div className="mt-6 w-full max-w-[460px] rounded-sm border-l-2 border-amber bg-ink/80 p-4">
            <p className="mono-caps text-[10px] text-amber">Class {cls.code}</p>
            <p className="mt-1 font-serif text-2xl text-bone">{cls.name}</p>
            <p className="mono-caps mt-1 text-[10px] text-bone/40">{cls.exemplar}</p>
            <p className="mt-3 font-sans text-sm text-bone/70">{cls.character}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Linear interpolation between two hex colors. Returns "r, g, b" so the caller
// can wrap with `rgb(...)` or `rgba(..., alpha)` as needed.
function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `${r}, ${g}, ${bl}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
