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

      // Burst lines (Important1 / Important6 vector star aesthetic).
      // Number and length scale with M and E.
      const burstCount = Math.round(8 + vals.M * 14);
      const burstLen = (60 + vals.E * 120) * dpr;
      ctx.strokeStyle = `rgba(30, 150, 230, ${0.18 + vals.lambda * 0.25})`;
      ctx.lineWidth = 0.7 * dpr;
      const spinRate = (vals.S - 0.5) * 0.4;
      ctx.beginPath();
      for (let i = 0; i < burstCount; i++) {
        const a = (i / burstCount) * Math.PI * 2 + t * spinRate;
        const x1 = cx + Math.cos(a) * (12 * dpr);
        const y1 = cy + Math.sin(a) * (12 * dpr);
        const x2 = cx + Math.cos(a) * burstLen;
        const y2 = cy + Math.sin(a) * burstLen;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // Probability-space ring.
      const ringR = (40 + vals.P * 80) * dpr;
      ctx.strokeStyle = "rgba(245, 242, 236, 0.15)";
      ctx.lineWidth = 0.8 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Resonance ring (R) — pulses at frequency f.
      const pulse = 0.5 + 0.5 * Math.sin(t * (1 + vals.f * 4) * Math.PI);
      const rRingR = ringR * (0.65 + 0.1 * pulse);
      ctx.strokeStyle = `rgba(61, 169, 252, ${0.2 + vals.R * 0.5})`;
      ctx.lineWidth = (0.8 + vals.R * 1.2) * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, rRingR, 0, Math.PI * 2);
      ctx.stroke();

      // Central conscious-mass body.
      const baseR = (10 + vals.M * 30) * dpr;
      const halo = baseR * (2.4 + vals.E * 1.6);
      const grad = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, halo);
      const lamHue = lerpColor("#3DA9FC", "#C97D3E", vals.lambda);
      grad.addColorStop(0, `${lamHue}`);
      grad.addColorStop(0.3, `${lamHue}80`);
      grad.addColorStop(1, "rgba(10,10,11,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, halo, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(10, 10, 11, 1)";
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = lamHue;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
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

// Linear interpolation between two hex colors.
function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
