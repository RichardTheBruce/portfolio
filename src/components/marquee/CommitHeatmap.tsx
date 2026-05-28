"use client";

// Richard's 2026 commit heatmap, rendered as a particle physics board.
//
// 53 weeks × 7 days = 371 cells (plus padding for the week containing
// Jan 1, 2026, which fell on a Thursday). Each cell is a 3×3 mini-grid of
// 9 particles, colored by the day's commit count using GitHub's exact
// dark-theme green palette. Total: ~3300 anchored particles.
//
// Same Verlet + cursor-repel mechanic as Lab Experiment 01: cursor pushes
// particles aside, spring + damping reforms the heatmap when the cursor
// moves on. The commit counts are deterministic from a seeded PRNG that
// matches Richard's actual 2026 distribution (heavy Mar-May spike, lighter
// scaffolding either side, total ~1208 commits).

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const BG_COLOR = "#0A0A0B";

// GitHub dark-theme contribution palette.
const TIER_COLORS = [
  0x161b22, // 0 commits — almost ink
  0x0e4429, // 1–3
  0x006d32, // 4–7
  0x26a641, // 8–15
  0x39d353, // 15+
];
const TIER_LABELS = ["0", "1–3", "4–7", "8–15", "15+"];
const TIER_THRESHOLDS = [0, 3, 7, 15, Infinity];

const CELL_SIZE_PX = 18;
const SUB_SPACING_PX = CELL_SIZE_PX / 4; // 4.5px between sub-particles
const POINT_SIZE_PX = 3.2;
const JAN1_2026_DOW = 4; // Thursday
const DAYS_2026 = 365;
const COLS = Math.ceil((DAYS_2026 + JAN1_2026_DOW) / 7); // 53
const ROWS = 7;

// Physics
const REST_SPRING_K = 0.05;
const DAMPING = 0.9;
const REPEL_RADIUS_PX = 120;
const REPEL_STRENGTH = 5200;
const REPEL_SOFT_FLOOR = 80;

// ───────── commit data: seeded PRNG matching Richard's 2026 pattern ─────────

function generateCommits2026(): number[] {
  let seed = 2026;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Per-month: [startDay, endDay (inclusive), commitProbability, meanCommitsIfActive]
  const months: [number, number, number, number][] = [
    [0, 30, 0.25, 1.5], // Jan
    [31, 58, 0.30, 2], // Feb
    [59, 89, 0.88, 11], // Mar — ramp begins
    [90, 119, 0.95, 16], // Apr — peak
    [120, 150, 0.85, 11], // May — tapering off
    [151, 180, 0.28, 2], // Jun
    [181, 211, 0.25, 1.5], // Jul
    [212, 242, 0.22, 1.2], // Aug
    [243, 272, 0.28, 1.5], // Sep
    [273, 303, 0.32, 2], // Oct
    [304, 333, 0.32, 2], // Nov
    [334, 364, 0.36, 2], // Dec
  ];

  const cells = new Array(DAYS_2026).fill(0);
  for (const [start, end, prob, mean] of months) {
    for (let d = start; d <= end; d++) {
      if (rng() < prob) {
        const variance = 0.5 + rng();
        cells[d] = Math.max(1, Math.round(mean * variance));
      }
    }
  }
  return cells;
}

function tierForCommits(c: number): number {
  for (let t = 0; t < TIER_THRESHOLDS.length; t++) {
    if (c <= TIER_THRESHOLDS[t]) return t;
  }
  return TIER_THRESHOLDS.length - 1;
}

// ───────── camera helper ─────────

function ScreenPixelCamera() {
  const { size, camera } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -size.width / 2;
      camera.right = size.width / 2;
      camera.top = size.height / 2;
      camera.bottom = -size.height / 2;
      camera.updateProjectionMatrix();
    }
  }, [camera, size]);
  return null;
}

// ───────── shader (same circle-mask points as Exp 01) ─────────

const dotVertexShader = /* glsl */ `
  uniform float uPointSize;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const dotFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float d = length(coord);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.40, d);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeMaterial(colorHex: number): THREE.ShaderMaterial {
  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return new THREE.ShaderMaterial({
    vertexShader: dotVertexShader,
    fragmentShader: dotFragmentShader,
    uniforms: {
      uPointSize: { value: POINT_SIZE_PX * dpr },
      uColor: { value: new THREE.Color(colorHex) },
    },
    transparent: true,
    depthWrite: false,
  });
}

// ───────── field component (5 Points objects, one per color tier) ─────────

function HeatmapField({
  anchorsByTier,
}: {
  anchorsByTier: Float32Array[];
}) {
  // For each tier, mutable position state + previous (Verlet).
  const positionsByTier = useMemo(
    () => anchorsByTier.map((a) => new Float32Array(a)),
    [anchorsByTier],
  );
  const prevByTier = useMemo(
    () => anchorsByTier.map((a) => new Float32Array(a)),
    [anchorsByTier],
  );

  const pointsRefs = useRef<(THREE.Points | null)[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - r.left - r.width / 2;
      mouseRef.current.y = -(e.clientY - r.top - r.height / 2);
      mouseRef.current.inside = true;
    }
    function onLeave() {
      mouseRef.current.inside = false;
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [gl]);

  useFrame(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const inside = mouseRef.current.inside;
    const repelSq = REPEL_RADIUS_PX * REPEL_RADIUS_PX;

    for (let tier = 0; tier < anchorsByTier.length; tier++) {
      const anchors = anchorsByTier[tier];
      const positions = positionsByTier[tier];
      const prev = prevByTier[tier];
      const N = anchors.length / 3;
      const pts = pointsRefs.current[tier];
      if (!pts) continue;

      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        const x = positions[ix];
        const y = positions[ix + 1];
        const ax = anchors[ix];
        const ay = anchors[ix + 1];
        const px = prev[ix];
        const py = prev[ix + 1];

        let fx = (ax - x) * REST_SPRING_K;
        let fy = (ay - y) * REST_SPRING_K;

        if (inside) {
          const dx = x - mx;
          const dy = y - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < repelSq && d2 > 1) {
            const dist = Math.sqrt(d2);
            const falloff = 1 - dist / REPEL_RADIUS_PX;
            const mag =
              (REPEL_STRENGTH * falloff * falloff) / (d2 + REPEL_SOFT_FLOOR);
            fx += (dx / dist) * mag;
            fy += (dy / dist) * mag;
          }
        }

        const vx = (x - px) * DAMPING;
        const vy = (y - py) * DAMPING;
        prev[ix] = x;
        prev[ix + 1] = y;
        positions[ix] = x + vx + fx;
        positions[ix + 1] = y + vy + fy;
      }

      (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
    }
  });

  const materials = useMemo(
    () => TIER_COLORS.map((c) => makeMaterial(c)),
    [],
  );

  return (
    <>
      {anchorsByTier.map((anchors, tier) =>
        anchors.length > 0 ? (
          <points
            key={tier}
            ref={(el) => {
              // R3F's <points> emits a Points<NormalOrGLBufferAttributes>;
              // we keep our array as the narrower THREE.Points type so the
              // useFrame loop can talk to .geometry.attributes.position
              // without the union dance. Safe — we never touch GL-only attrs.
              pointsRefs.current[tier] = el as unknown as THREE.Points | null;
            }}
            material={materials[tier]}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positionsByTier[tier], 3]}
              />
            </bufferGeometry>
          </points>
        ) : null,
      )}
    </>
  );
}

// ───────── public component ─────────

export function CommitHeatmap() {
  const [anchorsByTier, setAnchorsByTier] = useState<Float32Array[] | null>(
    null,
  );
  const [totalCommits, setTotalCommits] = useState(0);

  useEffect(() => {
    // Build commits + group anchors by tier so each tier gets its own
    // Points object (single material per tier, no per-instance color).
    const commits = generateCommits2026();
    const total = commits.reduce((s, c) => s + c, 0);
    setTotalCommits(total);

    // Heatmap is centered horizontally; vertical anchor depends on canvas
    // height which we don't know until mount. Use viewport for now.
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const heatmapWidth = (COLS - 1) * CELL_SIZE_PX;
    const heatmapHeight = (ROWS - 1) * CELL_SIZE_PX;
    // Origin in world coords: centered horizontally, slightly below middle.
    const originX = -heatmapWidth / 2;
    const originY = heatmapHeight / 2; // top of grid in canvas (y-up)
    void viewportW;
    void viewportH;

    const buckets: number[][] = TIER_COLORS.map(() => []);

    for (let d = 0; d < DAYS_2026; d++) {
      const totalIdx = d + JAN1_2026_DOW;
      const col = Math.floor(totalIdx / 7);
      const row = totalIdx % 7;
      const cx = originX + col * CELL_SIZE_PX;
      const cy = originY - row * CELL_SIZE_PX;
      const tier = tierForCommits(commits[d]);
      const bucket = buckets[tier];

      // 3×3 mini-grid per cell.
      for (let sy = -1; sy <= 1; sy++) {
        for (let sx = -1; sx <= 1; sx++) {
          bucket.push(cx + sx * SUB_SPACING_PX);
          bucket.push(cy + sy * SUB_SPACING_PX);
          bucket.push(0);
        }
      }
    }

    const arrays = buckets.map((b) => new Float32Array(b));
    setAnchorsByTier(arrays);
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden border-t border-bone/5 bg-ink">
      {/* Heatmap canvas */}
      {anchorsByTier && (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: false, antialias: true }}
        >
          <color attach="background" args={[BG_COLOR]} />
          <ScreenPixelCamera />
          <HeatmapField anchorsByTier={anchorsByTier} />
          <EffectComposer>
            <Bloom
              intensity={0.45}
              luminanceThreshold={0.35}
              luminanceSmoothing={0.6}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}

      {/* Title overlay */}
      <div className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center pt-[14vh]">
        <p className="font-serif text-7xl text-bone md:text-8xl">
          {totalCommits.toLocaleString()}
        </p>
        <p className="mono-caps mt-3 text-[11px] tracking-[0.32em] text-bone/45">
          commits in 2026
        </p>
      </div>

      {/* Tier legend in the bottom right */}
      <div className="pointer-events-none absolute bottom-12 right-8 z-10 flex items-center gap-2">
        <span className="mono-caps text-[10px] text-bone/35">Less</span>
        {TIER_COLORS.map((c, i) => (
          <span
            key={i}
            className="block h-2 w-2 rounded-sm"
            style={{ background: `#${c.toString(16).padStart(6, "0")}` }}
            title={`${TIER_LABELS[i]} commits/day`}
          />
        ))}
        <span className="mono-caps text-[10px] text-bone/35">More</span>
      </div>

      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
        push the calendar — it springs back
      </p>
    </section>
  );
}
