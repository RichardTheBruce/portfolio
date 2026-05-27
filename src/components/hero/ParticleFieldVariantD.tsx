"use client";

// VARIANT D: Draggable string-letter graph.
//
// The word "RichardTheBruce" is rendered as an explicit graph of blue nodes
// connected by blue string-vectors. Each node has:
//   - a rest position (a sampled pixel of the letterform)
//   - a current position (verlet-integrated)
//   - a previous position (for verlet velocity)
//   - membership in one letter (so edges only connect intra-letter)
//
// Each node has up to 3 edges to nearest intra-letter neighbors at sample-bake
// time. Edges are Hooke springs with a rest length equal to their initial
// distance. Each node also has a soft rest-position spring pulling it home.
//
// Interaction model:
//   - hover a node within 18px → node enlarges
//   - left-click + hold → node is grabbed and follows the cursor
//   - release → node carries the velocity it had at release moment, then springs
//     back to its rest position with intentional under-damping so it overshoots
//     and oscillates briefly. This is "buoyancy".
//   - while a node is grabbed, all its edge-neighbors get pulled along by the
//     edge spring force, so dragging propagates tension through the letterform.
//
// Source citations:
//   - Visual signature: OneDrive/Desktop/Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg
//     (blue vector lines forming letterforms, sharp endpoints)
//   - Playful drag-and-release physics: SPEC § Hero "playful, buoyant"
//   - Letter-form sampling pattern reused from Variant A approach (offscreen 2D)

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

type Edge = [number, number, number]; // [aIdx, bIdx, restLength]

// Physics constants.
const K_REST = 0.022; // rest-position pull (gentle)
const K_EDGE = 0.06; // edge spring (firmer, holds letterform)
const DAMPING = 0.94; // velocity damping per frame (under-damped → buoyant overshoot)
const HIT_RADIUS_PX = 18;
const MAX_NEIGHBORS_PER_NODE = 3;

// Sampling.
const SAMPLE_STRIDE_PX = 14;
const FONT_SIZE_FRACTION = 0.13; // of viewport width
const MAX_FONT_SIZE_PX = 230;

export default function ParticleFieldVariantD({
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

      // Build per-letter x-ranges via cumulative measureText. This handles
      // kerning approximately and gives us a letter index for every sampled pixel.
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

      const sampledRaw: GraphNode[] = [];
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
            sampledRaw.push({
              x, y, px: x, py: y, rx: x, ry: y, letter,
            });
          }
        }
      }

      nodes = sampledRaw;
      edges = [];

      if (nodes.length === 0) return;

      // Spatial bucket for nearest-neighbor lookup.
      const cellSize = stride * 2;
      const buckets = new Map<string, number[]>();
      const bkey = (gx: number, gy: number) => `${gx}:${gy}`;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const gx = Math.floor(n.rx / cellSize);
        const gy = Math.floor(n.ry / cellSize);
        const k = bkey(gx, gy);
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
            const k = bkey(gx + dx, gy + dy);
            const b = buckets.get(k);
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
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
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

      if (nodes.length === 0) {
        raf = requestAnimationFrame(step);
        return;
      }

      if (!reducedMotion) {
        const fx = new Float32Array(nodes.length);
        const fy = new Float32Array(nodes.length);

        // Rest-position spring.
        for (let i = 0; i < nodes.length; i++) {
          if (i === grabbedIdx) continue;
          fx[i] += (nodes[i].rx - nodes[i].x) * K_REST;
          fy[i] += (nodes[i].ry - nodes[i].y) * K_REST;
        }

        // Edge springs (Hooke).
        for (let e = 0; e < edges.length; e++) {
          const [a, b, restLen] = edges[e];
          const dx = nodes[b].x - nodes[a].x;
          const dy = nodes[b].y - nodes[a].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const force = (dist - restLen) * K_EDGE;
          const fxc = (dx / dist) * force;
          const fyc = (dy / dist) * force;
          if (a !== grabbedIdx) {
            fx[a] += fxc;
            fy[a] += fyc;
          }
          if (b !== grabbedIdx) {
            fx[b] -= fxc;
            fy[b] -= fyc;
          }
        }

        // Verlet integration with damping. Velocity preserved on release.
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (i === grabbedIdx) {
            // Save current as previous so released velocity = drag velocity.
            n.px = n.x;
            n.py = n.y;
            n.x = mouseX;
            n.y = mouseY;
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

      // Render edges first.
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = "rgba(30, 150, 230, 0.55)";
      ctx.beginPath();
      for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
      }
      ctx.stroke();

      // Highlight edges incident to the hovered/grabbed node.
      const activeIdx = grabbedIdx ?? hoverIdx;
      if (activeIdx !== null) {
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeStyle = "rgba(61, 169, 252, 0.95)";
        ctx.beginPath();
        for (let e = 0; e < edges.length; e++) {
          const [a, b] = edges[e];
          if (a === activeIdx || b === activeIdx) {
            ctx.moveTo(nodes[a].x, nodes[a].y);
            ctx.lineTo(nodes[b].x, nodes[b].y);
          }
        }
        ctx.stroke();
      }

      // Render nodes.
      const t = performance.now() * 0.001;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isAccent = n.letter === accentLetterIndex;
        const isActive = i === grabbedIdx || i === hoverIdx;
        let r: number;
        let color: string;
        if (isActive) {
          r = 5 * dpr;
          color = "rgba(61, 169, 252, 1)";
        } else if (isAccent) {
          const pulse = 0.7 + 0.3 * Math.sin(t * 5.0);
          r = 3 * dpr;
          color = `rgba(201, 125, 62, ${pulse})`;
        } else {
          r = 2.4 * dpr;
          color = "rgba(30, 150, 230, 0.92)";
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", () => {
      resize();
      buildField();
    });

    // Wait for the serif to be ready so the letterforms sample correctly.
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
