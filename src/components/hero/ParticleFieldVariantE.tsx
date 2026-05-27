"use client";

// VARIANT E: Force-graph equilibrium with cyan rim-lit nodes.
//
// Same letterform sampling as Variant D, but the motion model is
// equilibrium-seeking rather than rest-locked. Three forces act on every node:
//   1. Soft rest spring pulls it toward its sampled-letter position
//   2. Edge springs maintain letterform connectivity (Hooke between neighbors)
//   3. Self-repulsion pushes nearby non-connected nodes apart (bucket-graded)
//
// The combination keeps the system always slightly out of equilibrium, which
// produces perceptible drift over time — particles wobble at ~2-4px amplitude
// because the three forces are continuously balancing against each other and
// never perfectly resolving. That motion is the cosmology operational:
// "particles are the emergent mechanisms of probability."
//
// The render treatment mirrors Richard's Nuro Sub-Agents Dashboard
// (OneDrive/Desktop/Taste BABY/Focus/Important13.jpg): each node is an INK
// disk surrounded by a CYAN rim and a soft outer halo. Edges are thin and
// translucent. The accent letter swaps cyan for amber.
//
// Drag and release: identical to Variant D. Pointer grabs the closest node,
// drags follow cursor; on release the verlet picks up the drag velocity and
// the spring system carries the node back through soft overshoot.

import { useEffect, useRef } from "react";

export interface ParticleFieldProps {
  word: string;
  accentLetterIndex: number;
  reducedMotion: boolean;
}

type GraphNode = {
  x: number;
  y: number;
  px: number;
  py: number;
  rx: number;
  ry: number;
  letter: number;
};

type Edge = [number, number, number];

const K_REST_BASE = 0.020;
const K_EDGE = 0.045;
const REPEL_RADIUS_PX = 16;
const REPEL_STRENGTH = 0.6;
const DAMPING = 0.945;
const HIT_RADIUS_PX = 18;
const MAX_NEIGHBORS_PER_NODE = 2;
const SAMPLE_STRIDE_PX = 16;
const FONT_SIZE_FRACTION = 0.13;
const MAX_FONT_SIZE_PX = 230;

export default function ParticleFieldVariantE({
  word,
  accentLetterIndex,
  reducedMotion,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: GraphNode[] = [];
    let edges: Edge[] = [];
    let grabbedIdx: number | null = null;
    let hoverIdx: number | null = null;
    let mouseX = -9999;
    let mouseY = -9999;
    let raf = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }

    function buildField() {
      if (!canvas) return;
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d");
      if (!octx) return;

      const sizePx = Math.min(window.innerWidth * FONT_SIZE_FRACTION, MAX_FONT_SIZE_PX) * dpr;
      octx.fillStyle = "#fff";
      octx.textBaseline = "middle";
      octx.textAlign = "left";
      octx.font = `700 ${sizePx}px "Cormorant Garamond", Georgia, serif`;

      const totalWidth = octx.measureText(word).width;
      const startX = off.width / 2 - totalWidth / 2;
      const letterRanges: Array<{ start: number; end: number; letter: number }> = [];
      let cursor = startX;
      for (let i = 0; i < word.length; i++) {
        const w = octx.measureText(word[i]).width;
        letterRanges.push({ start: cursor, end: cursor + w, letter: i });
        cursor += w;
      }
      octx.fillText(word, startX, off.height / 2);
      const img = octx.getImageData(0, 0, off.width, off.height);
      const stride = Math.max(8, Math.floor(SAMPLE_STRIDE_PX * dpr));

      const sampled: GraphNode[] = [];
      for (let y = 0; y < off.height; y += stride) {
        for (let x = 0; x < off.width; x += stride) {
          const idx = (y * off.width + x) * 4;
          if (img.data[idx + 3] > 128) {
            let letter = 0;
            for (const r of letterRanges) {
              if (x >= r.start && x < r.end) {
                letter = r.letter;
                break;
              }
            }
            sampled.push({ x, y, px: x, py: y, rx: x, ry: y, letter });
          }
        }
      }
      nodes = sampled;
      edges = [];
      if (nodes.length === 0) return;

      const cellSize = stride * 2;
      const buckets = new Map<string, number[]>();
      const bkey = (gx: number, gy: number) => `${gx}:${gy}`;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const k = bkey(Math.floor(n.rx / cellSize), Math.floor(n.ry / cellSize));
        const b = buckets.get(k);
        if (b) b.push(i);
        else buckets.set(k, [i]);
      }
      const neighborCount = new Uint8Array(nodes.length);
      const seenPair = new Set<string>();

      for (let i = 0; i < nodes.length; i++) {
        if (neighborCount[i] >= MAX_NEIGHBORS_PER_NODE) continue;
        const n = nodes[i];
        const gx = Math.floor(n.rx / cellSize);
        const gy = Math.floor(n.ry / cellSize);
        const candidates: Array<{ j: number; d2: number }> = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const b = buckets.get(bkey(gx + dx, gy + dy));
            if (!b) continue;
            for (const j of b) {
              if (j === i) continue;
              if (nodes[j].letter !== n.letter) continue;
              if (neighborCount[j] >= MAX_NEIGHBORS_PER_NODE) continue;
              const ddx = nodes[j].rx - n.rx;
              const ddy = nodes[j].ry - n.ry;
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 > 1) candidates.push({ j, d2 });
            }
          }
        }
        candidates.sort((a, b) => a.d2 - b.d2);
        for (const c of candidates) {
          if (neighborCount[i] >= MAX_NEIGHBORS_PER_NODE) break;
          if (neighborCount[c.j] >= MAX_NEIGHBORS_PER_NODE) continue;
          const a = i;
          const b = c.j;
          const pkey = a < b ? `${a}:${b}` : `${b}:${a}`;
          if (seenPair.has(pkey)) continue;
          seenPair.add(pkey);
          edges.push([a, b, Math.sqrt(c.d2)]);
          neighborCount[a]++;
          neighborCount[b]++;
        }
      }
    }

    function pickNode(px: number, py: number): number {
      const r2 = (HIT_RADIUS_PX * dpr) * (HIT_RADIUS_PX * dpr);
      let best = -1;
      let bestD2 = r2;
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i].x - px;
        const dy = nodes[i].y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return best;
    }

    function onPointerDown(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (e.clientY - rect.top) * dpr;
      const i = pickNode(mouseX, mouseY);
      if (i >= 0) {
        grabbedIdx = i;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
    function onPointerMove(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (e.clientY - rect.top) * dpr;
      if (grabbedIdx === null) {
        const i = pickNode(mouseX, mouseY);
        hoverIdx = i >= 0 ? i : null;
        canvas.style.cursor = hoverIdx !== null ? "grab" : "default";
      }
    }
    function onPointerUp(e: PointerEvent) {
      grabbedIdx = null;
      if (canvas) {
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        canvas.style.cursor = hoverIdx !== null ? "grab" : "default";
      }
    }
    function onPointerLeave() {
      if (grabbedIdx === null) {
        hoverIdx = null;
        if (canvas) canvas.style.cursor = "default";
      }
      mouseX = -9999;
      mouseY = -9999;
    }

    function step() {
      if (!canvas || !ctx) return;
      ctx.fillStyle = "rgba(10, 10, 11, 1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (nodes.length === 0) { raf = requestAnimationFrame(step); return; }

      if (!reducedMotion) {
        const fx = new Float32Array(nodes.length);
        const fy = new Float32Array(nodes.length);

        // Rest spring.
        for (let i = 0; i < nodes.length; i++) {
          if (i === grabbedIdx) continue;
          fx[i] += (nodes[i].rx - nodes[i].x) * K_REST_BASE;
          fy[i] += (nodes[i].ry - nodes[i].y) * K_REST_BASE;
        }

        // Edge springs.
        for (let e = 0; e < edges.length; e++) {
          const [a, b, restLen] = edges[e];
          const dx = nodes[b].x - nodes[a].x;
          const dy = nodes[b].y - nodes[a].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const force = (dist - restLen) * K_EDGE;
          const fxc = (dx / dist) * force;
          const fyc = (dy / dist) * force;
          if (a !== grabbedIdx) { fx[a] += fxc; fy[a] += fyc; }
          if (b !== grabbedIdx) { fx[b] -= fxc; fy[b] -= fyc; }
        }

        // Self-repulsion in spatial bucket. Pushes near unconnected particles
        // apart so the system never fully relaxes — produces equilibrium drift.
        const cellSize = REPEL_RADIUS_PX * dpr;
        const buckets = new Map<string, number[]>();
        const bk = (gx: number, gy: number) => `${gx}:${gy}`;
        for (let i = 0; i < nodes.length; i++) {
          const k = bk(Math.floor(nodes[i].x / cellSize), Math.floor(nodes[i].y / cellSize));
          const b = buckets.get(k);
          if (b) b.push(i); else buckets.set(k, [i]);
        }
        const radSq = (REPEL_RADIUS_PX * dpr) * (REPEL_RADIUS_PX * dpr);
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const gx = Math.floor(n.x / cellSize);
          const gy = Math.floor(n.y / cellSize);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const b = buckets.get(bk(gx + dx, gy + dy));
              if (!b) continue;
              for (const j of b) {
                if (j <= i) continue;
                const ddx = nodes[j].x - n.x;
                const ddy = nodes[j].y - n.y;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < radSq && d2 > 1) {
                  const dist = Math.sqrt(d2);
                  const falloff = 1 - dist / (REPEL_RADIUS_PX * dpr);
                  const f = REPEL_STRENGTH * falloff;
                  const fxc = (ddx / dist) * f;
                  const fyc = (ddy / dist) * f;
                  if (i !== grabbedIdx) { fx[i] -= fxc; fy[i] -= fyc; }
                  if (j !== grabbedIdx) { fx[j] += fxc; fy[j] += fyc; }
                }
              }
            }
          }
        }

        // Verlet integration.
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (i === grabbedIdx) {
            n.px = n.x; n.py = n.y;
            n.x = mouseX; n.y = mouseY;
            continue;
          }
          const vx = (n.x - n.px) * DAMPING;
          const vy = (n.y - n.py) * DAMPING;
          n.px = n.x;
          n.py = n.y;
          n.x += vx + fx[i];
          n.y += vy + fy[i];
        }
      }

      // Edges first.
      ctx.lineWidth = 0.7 * dpr;
      ctx.strokeStyle = "rgba(30, 150, 230, 0.35)";
      ctx.beginPath();
      for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
      }
      ctx.stroke();

      // Cyan rim-lit nodes (Sub-Agents Dashboard treatment).
      const activeIdx = grabbedIdx ?? hoverIdx;
      const tNow = performance.now() * 0.001;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isAccent = n.letter === accentLetterIndex;
        const isActive = i === activeIdx;
        const baseR = (isActive ? 5 : isAccent ? 3.2 : 2.6) * dpr;

        const accentColor = isAccent
          ? `rgba(201, 125, 62, ${0.85 + 0.15 * Math.sin(tNow * 5)})`
          : "rgba(61, 169, 252, 0.92)";

        // Soft outer halo.
        const haloR = baseR * 3.2;
        const grad = ctx.createRadialGradient(n.x, n.y, baseR * 0.4, n.x, n.y, haloR);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(0.4, isAccent ? "rgba(201, 125, 62, 0.25)" : "rgba(30, 150, 230, 0.28)");
        grad.addColorStop(1, "rgba(10, 10, 11, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Inner ink core to give the rim-light effect.
        ctx.fillStyle = "rgba(10, 10, 11, 1)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseR * 0.65, 0, Math.PI * 2);
        ctx.fill();

        // Bright rim ring.
        ctx.strokeStyle = isAccent
          ? (isActive ? "rgba(201, 125, 62, 1)" : "rgba(201, 125, 62, 0.9)")
          : (isActive ? "rgba(61, 169, 252, 1)" : "rgba(61, 169, 252, 0.85)");
        ctx.lineWidth = (isActive ? 1.6 : 1.1) * dpr;
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", () => { resize(); buildField(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(buildField);
    } else {
      buildField();
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [word, accentLetterIndex, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
      aria-hidden
    />
  );
}
