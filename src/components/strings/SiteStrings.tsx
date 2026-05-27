"use client";

// Site-wide elastic vector strings. Verlet rope simulation.
//
// Each string is a chain of N point-masses connecting two fixed anchors that
// live in document coordinates (not viewport). The middle nodes are
// soft-anchored to their initial rest positions (the straight line between
// anchors) and Hooke-connected to their two neighbors.
//
// On pointerdown anywhere on the page, the listener (capture phase) hit-tests
// every rope node within HIT_RADIUS. If a hit is found, the closest node is
// pinned to the cursor and the original event is cancelled so it does not
// double-fire into underlying content. On release, the node is freed and the
// rope springs back to rest via the combined edge + rest-position springs,
// under-damped (DAMPING=0.93) so it overshoots and oscillates briefly before
// settling. That overshoot is the "fly back" Richard asked for.
//
// Source citations:
//   - Visual signature: OneDrive/Desktop/Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg
//   - Linear-vector-star aesthetic: OneDrive/Desktop/Taste BABY/Focus/Important1.jpg
//   - "Strings all over the website, draggable, elastic, fly back" — Richard 2026-05-27

import { useEffect, useRef } from "react";

type StringDef = {
  ax: number; // anchor 1 x as fraction of viewport width  (0..1)
  ay: number; // anchor 1 y as fraction of document height (0..1)
  bx: number;
  by: number;
  nodes: number;
};

type RopeNode = {
  x: number; // device-pixel current position in document space
  y: number;
  px: number; // previous position for verlet velocity
  py: number;
  rx: number; // rest position (the straight-line equilibrium)
  ry: number;
  fixed: boolean;
};

type Rope = {
  nodes: RopeNode[];
  restLen: number;
};

const STRINGS: StringDef[] = [
  { ax: 0.08, ay: 0.04, bx: 0.42, by: 0.16, nodes: 14 },
  { ax: 0.58, ay: 0.13, bx: 0.92, by: 0.06, nodes: 12 },
  { ax: 0.05, ay: 0.21, bx: 0.95, by: 0.24, nodes: 18 },
  { ax: 0.22, ay: 0.31, bx: 0.68, by: 0.36, nodes: 14 },
  { ax: 0.52, ay: 0.39, bx: 0.88, by: 0.43, nodes: 12 },
  { ax: 0.08, ay: 0.44, bx: 0.5, by: 0.46, nodes: 13 },
  { ax: 0.3, ay: 0.52, bx: 0.78, by: 0.55, nodes: 14 },
  { ax: 0.05, ay: 0.6, bx: 0.95, by: 0.62, nodes: 16 },
  { ax: 0.4, ay: 0.68, bx: 0.72, by: 0.72, nodes: 12 },
  { ax: 0.15, ay: 0.74, bx: 0.6, by: 0.77, nodes: 14 },
  { ax: 0.7, ay: 0.79, bx: 0.94, by: 0.83, nodes: 11 },
  { ax: 0.22, ay: 0.84, bx: 0.5, by: 0.87, nodes: 12 },
  { ax: 0.5, ay: 0.88, bx: 0.85, by: 0.92, nodes: 13 },
  { ax: 0.05, ay: 0.93, bx: 0.4, by: 0.95, nodes: 12 },
];

// Physics tuned for water-like flow rather than crystalline punctures:
//   - K_EDGE soft so the rope curves naturally instead of snapping back as line segments
//   - DAMPING higher so motion persists longer (ripple-like)
//   - Render uses quadratic bezier through midpoints so the visible line is a continuous
//     smooth curve rather than connected straight segments
const K_REST = 0.008;
const K_EDGE = 0.09;
const DAMPING = 0.965;
const HIT_RADIUS_PX = 22;

export function SiteStrings() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ropesRef = useRef<Rope[]>([]);
  const grabbedRef = useRef<{ rope: number; node: number } | null>(null);
  const hoverRef = useRef<{ rope: number; node: number } | null>(null);
  const mouseDocRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let running = true;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }

    function build() {
      const W = window.innerWidth;
      const docH = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );

      ropesRef.current = STRINGS.map((s) => {
        const ax = s.ax * W * dpr;
        const ay = s.ay * docH * dpr;
        const bx = s.bx * W * dpr;
        const by = s.by * docH * dpr;
        const N = Math.max(3, s.nodes);
        const nodes: RopeNode[] = [];
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          nodes.push({
            x, y, px: x, py: y, rx: x, ry: y,
            fixed: i === 0 || i === N - 1,
          });
        }
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        const restLen = len / (N - 1);
        return { nodes, restLen };
      });
    }

    function pickRope(mouseDocXdp: number, mouseDocYdp: number): { rope: number; node: number } | null {
      const r2 = (HIT_RADIUS_PX * dpr) * (HIT_RADIUS_PX * dpr);
      let bestRope = -1;
      let bestNode = -1;
      let bestD2 = r2;
      const ropes = ropesRef.current;
      for (let ri = 0; ri < ropes.length; ri++) {
        const nodes = ropes[ri].nodes;
        for (let ni = 1; ni < nodes.length - 1; ni++) {
          const n = nodes[ni];
          const dx = n.x - mouseDocXdp;
          const dy = n.y - mouseDocYdp;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestRope = ri;
            bestNode = ni;
          }
        }
      }
      if (bestRope >= 0) return { rope: bestRope, node: bestNode };
      return null;
    }

    function onPointerDown(e: PointerEvent) {
      const docX = e.clientX * dpr;
      const docY = (e.clientY + window.scrollY) * dpr;
      const hit = pickRope(docX, docY);
      if (hit) {
        grabbedRef.current = hit;
        mouseDocRef.current.x = docX;
        mouseDocRef.current.y = docY;
        document.body.style.cursor = "grabbing";
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    function onPointerMove(e: PointerEvent) {
      const docX = e.clientX * dpr;
      const docY = (e.clientY + window.scrollY) * dpr;
      mouseDocRef.current.x = docX;
      mouseDocRef.current.y = docY;
      if (!grabbedRef.current) {
        const hit = pickRope(docX, docY);
        hoverRef.current = hit;
        if (hit) {
          document.body.style.cursor = "grab";
        } else if (document.body.style.cursor === "grab") {
          document.body.style.cursor = "";
        }
      }
    }

    function onPointerUp() {
      if (grabbedRef.current) {
        grabbedRef.current = null;
        document.body.style.cursor = hoverRef.current ? "grab" : "";
      }
    }

    function step() {
      if (!canvas || !ctx || !running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scrollY = window.scrollY * dpr;
      const mx = mouseDocRef.current.x;
      const my = mouseDocRef.current.y;
      const ropes = ropesRef.current;
      const grab = grabbedRef.current;
      const hover = hoverRef.current;

      for (let ri = 0; ri < ropes.length; ri++) {
        const rope = ropes[ri];
        const isGrabbed = grab?.rope === ri;
        const grabIdx = isGrabbed ? grab!.node : -1;
        const nodes = rope.nodes;

        const fx = new Float32Array(nodes.length);
        const fy = new Float32Array(nodes.length);

        for (let i = 1; i < nodes.length - 1; i++) {
          if (i === grabIdx) continue;
          fx[i] += (nodes[i].rx - nodes[i].x) * K_REST;
          fy[i] += (nodes[i].ry - nodes[i].y) * K_REST;
        }

        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i];
          const b = nodes[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const force = (dist - rope.restLen) * K_EDGE;
          const fxc = (dx / dist) * force;
          const fyc = (dy / dist) * force;
          if (!a.fixed && i !== grabIdx) {
            fx[i] += fxc;
            fy[i] += fyc;
          }
          if (!b.fixed && (i + 1) !== grabIdx) {
            fx[i + 1] -= fxc;
            fy[i + 1] -= fyc;
          }
        }

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.fixed) continue;
          if (i === grabIdx) {
            n.px = n.x;
            n.py = n.y;
            n.x = mx;
            n.y = my;
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

      for (let ri = 0; ri < ropes.length; ri++) {
        const rope = ropes[ri];
        const isGrabbed = grab?.rope === ri;
        const isHovered = !isGrabbed && hover?.rope === ri;
        const nodes = rope.nodes;
        ctx.strokeStyle = isGrabbed
          ? "rgba(61, 169, 252, 1)"
          : isHovered
            ? "rgba(61, 169, 252, 0.85)"
            : "rgba(30, 150, 230, 0.65)";
        ctx.lineWidth = isGrabbed ? 1.8 * dpr : isHovered ? 1.4 * dpr : 1.1 * dpr;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Smooth quadratic-bezier rendering through node midpoints.
        // The actual node positions become bezier control points; the curve
        // passes through the midpoints between consecutive nodes. Result: a
        // continuous smooth curve instead of connected line segments.
        if (nodes.length >= 2) {
          ctx.beginPath();
          const firstY = nodes[0].y - scrollY;
          ctx.moveTo(nodes[0].x, firstY);
          for (let i = 1; i < nodes.length - 1; i++) {
            const a = nodes[i];
            const b = nodes[i + 1];
            const ay = a.y - scrollY;
            const by = b.y - scrollY;
            const mx = (a.x + b.x) * 0.5;
            const my = (ay + by) * 0.5;
            ctx.quadraticCurveTo(a.x, ay, mx, my);
          }
          const lastIdx = nodes.length - 1;
          const last = nodes[lastIdx];
          const beforeLast = nodes[lastIdx - 1];
          ctx.quadraticCurveTo(
            beforeLast.x, beforeLast.y - scrollY,
            last.x, last.y - scrollY,
          );
          ctx.stroke();
        }

        ctx.fillStyle = "rgba(30, 150, 230, 0.7)";
        for (let i = 0; i < nodes.length; i++) {
          if (!nodes[i].fixed) continue;
          const cy = nodes[i].y - scrollY;
          if (cy < -10 || cy > canvas.height + 10) continue;
          ctx.beginPath();
          ctx.arc(nodes[i].x, cy, 2 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(step);
    }

    resize();
    build();

    // Re-build after layout settles so strings span the FULL document height,
    // not just the early-paint height. Fonts + dynamic imports can land late.
    const layoutSettleTimers = [
      setTimeout(build, 250),
      setTimeout(build, 1500),
      setTimeout(build, 4000),
    ];

    function onResize() {
      resize();
      build();
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    raf = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      layoutSettleTimers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[20]"
      aria-hidden="true"
    />
  );
}
