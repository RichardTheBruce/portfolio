"use client";

// SaturnHome — the home page composition.
//
// Three layers stacked in one section:
//   1. Text canvas (orthographic, pixel-space): "RichardTheBruce" rendered
//      as ~6000 anchored particles. Cursor repels with quadratic falloff,
//      particles spring back via Verlet. Mechanic lifted from Experiment 01.
//   2. "He who Creates" subheader (plain HTML, positioned below the text).
//   3. Saturn canvas (perspective, world-space): solid Saturn body + tilted
//      ring + 5 moons orbiting the cursor with Kepler-correct angular
//      velocity. No wall, no shatter, no text — Saturn just follows the
//      mouse from the moment of mount.
//
// Both canvases use window-level pointer events so the layering works even
// though they stack. The text canvas has alpha=true so Saturn shows above
// where they overlap; Saturn's cursor:none hides the OS cursor system-wide.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ─────────── TEXT (Exp 01 mechanic) ───────────

const WORD = "RichardTheBruce";
// Sized so the full word fits within ~1050px on a 1440px desktop with
// comfortable edge margins. 8000 particles in this footprint give roughly
// 35% letterform coverage — dense enough to read crisply.
const FONT_SIZE_PX = 140;
const PARTICLE_TARGET = 8000;
const REST_SPRING_K = 0.04;
const TEXT_DAMPING = 0.92;
const REPEL_SOFT_FLOOR = 100;
const POINT_SIZE_PX = 2.2;
const POINT_COLOR = 0xf5f2ec; // bone
const TEXT_VERTICAL_OFFSET_PX = -40; // nudge text up so subheader fits below

// ─────────── SATURN (marquee mechanic, wall removed) ───────────

const N_BODY = 700;
const N_RING = 420;
const N_MOONS = 5;
const N_PER_MOON = 110;
const N_MOON_TOTAL = N_MOONS * N_PER_MOON;
const N_SATURN_TOTAL = N_BODY + N_RING + N_MOON_TOTAL;

const ANCHOR_K = 0.18;
const SATURN_DAMPING = 0.86;
const CURSOR_LAG = 0.20;

const CAM_Z = 5;
const CAM_FOV_DEG = 50;
const SATURN_BODY_R = 0.135;
const RING_INNER_R = 0.18;
const RING_OUTER_R = 0.38;
const RING_TILT_DEG = 22;
const MOON_RADII = [
  SATURN_BODY_R * 3.0,
  SATURN_BODY_R * 4.0,
  SATURN_BODY_R * 5.5,
  SATURN_BODY_R * 7.0,
  SATURN_BODY_R * 9.0,
];
const MOON_BODY_R = 0.045;

const RADIUS_BODY = 0.026;
const RADIUS_RING = 0.014;
const RADIUS_MOON = 0.022;

const COLOR_BODY = "#F0A256";
const COLOR_RING = "#E2B071";
const COLOR_MOON = "#3DA9FC";

// Smash
const IMPULSE_RADIUS = 1.0;
const IMPULSE_STRENGTH = 0.16;
const IMPULSE_DURATION_S = 0.32;

const TYPE_BODY = 1;
const TYPE_RING = 2;
const TYPE_MOON = 3;

const RANGE_BODY_START = 0;
const RANGE_RING_START = RANGE_BODY_START + N_BODY;
const RANGE_MOON_START = RANGE_RING_START + N_RING;

// ────────── shared state (window-level) ──────────

// A repelling body that pushes text particles aside. Position is in TEXT-CANVAS
// pixel coordinates (origin centered, y-up — matching the text canvas).
interface RepelBody {
  x: number;
  y: number;
  radius: number;   // px
  strength: number; // peak force at center
}

// Cursor + saturn-body positions feed across both canvases. The SaturnField
// computes saturn + moon centers in world space every frame, projects them
// into text-canvas pixel coordinates, and writes them here. The TextField
// reads `bodies` and pushes letterform particles aside as Saturn and its
// moons drift across the page.
const sharedCursor = {
  pageX: -10000,
  pageY: -10000,
  inside: false,
  bodies: [] as RepelBody[],
};

// Repel tuning for each body type
const SATURN_BODY_REPEL_RADIUS_PX = 110;
const SATURN_BODY_REPEL_STRENGTH = 6500;
const MOON_REPEL_RADIUS_PX = 58;
const MOON_REPEL_STRENGTH = 2400;

// ────────── particle house ──────────
//
// A tiny house in the bottom-right of the hero, built out of the same
// chunky particles as the moons so it reads as part of the cosmic scene
// rather than a UI element pasted on top. Each part (body, roof, chimney,
// door, windows, plinth) is its own InstancedMesh with a single material —
// same architecture as the Saturn body/ring/moons.

const HOUSE_CENTER_X = 2.9;        // world units, tucked in the right corner
const HOUSE_CENTER_Y = -1.55;      // lower band
// Smaller footprint with much smaller particles so the silhouette reads as
// a crisp little house rather than a chunky blob. Each particle is ~25%
// the diameter of a moon particle, which gives us many more dots tracing
// the cube and prism edges — like a fine pen-drawn house with cosmic dust.
const HOUSE_BODY_W = 0.32;
const HOUSE_BODY_H = 0.24;
const HOUSE_BODY_D = 0.20;
const HOUSE_ROOF_W = 0.40;         // slight overhang past the body
const HOUSE_ROOF_H = 0.14;
const HOUSE_ROOF_D = 0.22;
const HOUSE_CHIMNEY_W = 0.04;
const HOUSE_CHIMNEY_H = 0.08;
const HOUSE_CHIMNEY_D = 0.04;
const HOUSE_DOOR_W = 0.055;
const HOUSE_DOOR_H = 0.105;
const HOUSE_DOOR_D = 0.012;
const HOUSE_WINDOW_W = 0.05;
const HOUSE_WINDOW_H = 0.05;
const HOUSE_WINDOW_D = 0.012;
const HOUSE_PLINTH_RX = 0.24;
const HOUSE_PLINTH_RZ = 0.10;

// Body / roof are EDGE-sampled (wireframe along the 12 cube edges / the
// roof's ridges) so the angular geometry reads as a drawn outline. Small
// parts stay solid-filled.
const N_HOUSE_BODY = 220;
const N_HOUSE_ROOF = 160;
const N_HOUSE_CHIMNEY = 28;
const N_HOUSE_DOOR = 28;
const N_HOUSE_WINDOW = 20; // per window
const N_HOUSE_PLINTH = 70;

const HOUSE_PARTICLE_RADIUS = 0.012;

const HOUSE_BODY_COLOR = "#F5F2EC";     // bone walls (matches text)
const HOUSE_ROOF_COLOR = "#C97D3E";     // amber roof (matches saturn)
const HOUSE_CHIMNEY_COLOR = "#9A8C73";  // warm grey
const HOUSE_DOOR_COLOR = "#7A4A2E";     // dark amber
const HOUSE_WINDOW_COLOR = "#3DA9FC";   // string blue (matches moons)
const HOUSE_PLINTH_COLOR = "#3DA9FC";   // glass plinth, same blue family

// ─────────── samplers ───────────

function sampleWordAnchors(
  word: string,
  fontPx: number,
  target: number,
): Float32Array {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return new Float32Array(0);
  probe.font = `700 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
  const wordWidth = probe.measureText(word).width;
  const padX = 60;
  const padY = 60;
  const w = Math.ceil(wordWidth + padX * 2);
  const h = Math.ceil(fontPx * 1.4 + padY * 2);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return new Float32Array(0);
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "center";
  octx.font = `700 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
  octx.fillText(word, w / 2, h / 2);
  const img = octx.getImageData(0, 0, w, h).data;

  // Collect EVERY inked pixel coordinate, then random-subsample to target.
  // The earlier stride+truncate approach iterated rows top-to-bottom and
  // stopped when it hit target — which meant for small fonts (where
  // stride collapsed to 1) the bottom half of the text never got sampled.
  // Random sampling guarantees uniform coverage across the whole letterform.
  const inked: number[] = [];
  for (let y = 0; y < h; y++) {
    const rowBase = y * w * 4 + 3;
    for (let x = 0; x < w; x++) {
      if (img[rowBase + x * 4] > 128) {
        inked.push(x, y);
      }
    }
  }
  if (inked.length === 0) return new Float32Array(0);

  // Fisher-Yates partial shuffle: shuffle just enough to pick `target`
  // distinct anchors uniformly.
  const totalInked = inked.length / 2;
  const N = Math.min(target, totalInked);
  for (let i = 0; i < N; i++) {
    const j = i + Math.floor(Math.random() * (totalInked - i));
    const ax = inked[i * 2];
    const ay = inked[i * 2 + 1];
    inked[i * 2] = inked[j * 2];
    inked[i * 2 + 1] = inked[j * 2 + 1];
    inked[j * 2] = ax;
    inked[j * 2 + 1] = ay;
  }

  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    out[i * 3 + 0] = inked[i * 2] - w / 2;
    out[i * 3 + 1] = -(inked[i * 2 + 1] - h / 2) + TEXT_VERTICAL_OFFSET_PX;
    out[i * 3 + 2] = 0;
  }
  return out;
}

function sampleSolidSphere(N: number, R: number): Float32Array {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let d2 = 2;
    while (d2 > 1) {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      d2 = x * x + y * y + z * z;
    }
    const bias = 0.85 + 0.15 * (1 - d2);
    out[i * 3 + 0] = x * R * bias;
    out[i * 3 + 1] = y * R * bias;
    out[i * 3 + 2] = z * R * bias;
  }
  return out;
}

function sampleBox(N: number, w: number, h: number, d: number): Float32Array {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    out[i * 3 + 0] = (Math.random() - 0.5) * w;
    out[i * 3 + 1] = (Math.random() - 0.5) * h;
    out[i * 3 + 2] = (Math.random() - 0.5) * d;
  }
  return out;
}

// Box WIREFRAME — particles distributed along the 12 edges of the cube,
// weighted by length. Reads as a drawn-outline cube even at low density.
function sampleBoxWireframe(
  N: number,
  w: number,
  h: number,
  d: number,
): Float32Array {
  // 12 edges. Each: start point + axis (0/1/2) + length.
  const edges: { sx: number; sy: number; sz: number; axis: 0 | 1 | 2; len: number }[] = [];
  for (const y of [h / 2, -h / 2]) {
    for (const z of [d / 2, -d / 2]) {
      edges.push({ sx: -w / 2, sy: y, sz: z, axis: 0, len: w });
    }
  }
  for (const x of [w / 2, -w / 2]) {
    for (const z of [d / 2, -d / 2]) {
      edges.push({ sx: x, sy: -h / 2, sz: z, axis: 1, len: h });
    }
  }
  for (const x of [w / 2, -w / 2]) {
    for (const y of [h / 2, -h / 2]) {
      edges.push({ sx: x, sy: y, sz: -d / 2, axis: 2, len: d });
    }
  }
  let total = 0;
  for (const e of edges) total += e.len;

  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r = Math.random() * total;
    let edge = edges[0];
    for (const e of edges) {
      r -= e.len;
      if (r <= 0) {
        edge = e;
        break;
      }
    }
    const t = Math.random();
    let x = edge.sx;
    let y = edge.sy;
    let z = edge.sz;
    if (edge.axis === 0) x += t * edge.len;
    else if (edge.axis === 1) y += t * edge.len;
    else z += t * edge.len;
    // Tiny jitter perpendicular to the edge so it reads as a chunky line
    // rather than a pixel-perfect rod.
    const jit = HOUSE_PARTICLE_RADIUS * 0.6;
    out[i * 3 + 0] = x + (Math.random() - 0.5) * jit;
    out[i * 3 + 1] = y + (Math.random() - 0.5) * jit;
    out[i * 3 + 2] = z + (Math.random() - 0.5) * jit;
  }
  return out;
}

// Roof WIREFRAME — the visible edges of a triangular prism (top ridge +
// 4 slant edges along the gables + 2 base edges along Z). Bottom triangle
// edges (where the roof sits on the body) are omitted.
function sampleRoofWireframe(
  N: number,
  baseW: number,
  height: number,
  depth: number,
): Float32Array {
  const slantLen = Math.sqrt((baseW / 2) * (baseW / 2) + height * height);
  type Edge = {
    sx: number;
    sy: number;
    sz: number;
    ex: number;
    ey: number;
    ez: number;
    len: number;
  };
  const edges: Edge[] = [
    // Top ridge (along Z, at apex)
    { sx: 0, sy: height / 2, sz: -depth / 2, ex: 0, ey: height / 2, ez: depth / 2, len: depth },
    // Bottom-left ridge (along Z, at base-left)
    { sx: -baseW / 2, sy: -height / 2, sz: -depth / 2, ex: -baseW / 2, ey: -height / 2, ez: depth / 2, len: depth },
    // Bottom-right ridge (along Z, at base-right)
    { sx: baseW / 2, sy: -height / 2, sz: -depth / 2, ex: baseW / 2, ey: -height / 2, ez: depth / 2, len: depth },
    // Front gable left slant
    { sx: -baseW / 2, sy: -height / 2, sz: depth / 2, ex: 0, ey: height / 2, ez: depth / 2, len: slantLen },
    // Front gable right slant
    { sx: baseW / 2, sy: -height / 2, sz: depth / 2, ex: 0, ey: height / 2, ez: depth / 2, len: slantLen },
    // Back gable left slant
    { sx: -baseW / 2, sy: -height / 2, sz: -depth / 2, ex: 0, ey: height / 2, ez: -depth / 2, len: slantLen },
    // Back gable right slant
    { sx: baseW / 2, sy: -height / 2, sz: -depth / 2, ex: 0, ey: height / 2, ez: -depth / 2, len: slantLen },
  ];
  let total = 0;
  for (const e of edges) total += e.len;

  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r = Math.random() * total;
    let edge = edges[0];
    for (const e of edges) {
      r -= e.len;
      if (r <= 0) {
        edge = e;
        break;
      }
    }
    const t = Math.random();
    const jit = HOUSE_PARTICLE_RADIUS * 0.6;
    out[i * 3 + 0] =
      edge.sx + (edge.ex - edge.sx) * t + (Math.random() - 0.5) * jit;
    out[i * 3 + 1] =
      edge.sy + (edge.ey - edge.sy) * t + (Math.random() - 0.5) * jit;
    out[i * 3 + 2] =
      edge.sz + (edge.ez - edge.sz) * t + (Math.random() - 0.5) * jit;
  }
  return out;
}

// Box SHELL — particles only on the 6 surface faces, weighted by area.
// Used for house walls so the cube silhouette reads through the particle
// chunkiness instead of blobbing into a sphere.
function sampleBoxShell(
  N: number,
  w: number,
  h: number,
  d: number,
): Float32Array {
  const out = new Float32Array(N * 3);
  const areas = [w * h, w * h, d * h, d * h, w * d, w * d]; // F, B, L, R, T, Bot
  const total = areas[0] + areas[1] + areas[2] + areas[3] + areas[4] + areas[5];
  for (let i = 0; i < N; i++) {
    let r = Math.random() * total;
    let face = 0;
    for (let f = 0; f < 6; f++) {
      r -= areas[f];
      if (r <= 0) {
        face = f;
        break;
      }
    }
    const u = Math.random() - 0.5;
    const v = Math.random() - 0.5;
    let x = 0;
    let y = 0;
    let z = 0;
    if (face === 0) {
      x = u * w;
      y = v * h;
      z = d / 2;
    } else if (face === 1) {
      x = u * w;
      y = v * h;
      z = -d / 2;
    } else if (face === 2) {
      x = -w / 2;
      y = u * h;
      z = v * d;
    } else if (face === 3) {
      x = w / 2;
      y = u * h;
      z = v * d;
    } else if (face === 4) {
      x = u * w;
      y = h / 2;
      z = v * d;
    } else {
      x = u * w;
      y = -h / 2;
      z = v * d;
    }
    out[i * 3 + 0] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

// Triangular prism SHELL — particles on the two slanted top faces + the
// two triangular gables. The bottom face is omitted because it sits on
// the body. Used for the roof.
function sampleRoofShell(
  N: number,
  baseW: number,
  height: number,
  depth: number,
): Float32Array {
  const slantLen = Math.sqrt((baseW / 2) * (baseW / 2) + height * height);
  const slantArea = slantLen * depth;
  const gableArea = 0.5 * baseW * height;
  const areas = [slantArea, slantArea, gableArea, gableArea]; // L slant, R slant, F gable, B gable
  const total = areas[0] + areas[1] + areas[2] + areas[3];

  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r = Math.random() * total;
    let face = 0;
    for (let f = 0; f < 4; f++) {
      r -= areas[f];
      if (r <= 0) {
        face = f;
        break;
      }
    }

    if (face === 0 || face === 1) {
      // Slanted face: parameterize along slant (t: 0 at base, 1 at ridge)
      // and along Z.
      const t = Math.random();
      const z = (Math.random() - 0.5) * depth;
      const yLocal = t * height - height / 2;
      const xSign = face === 0 ? -1 : 1;
      const xWidth = ((1 - t) * baseW) / 2;
      out[i * 3 + 0] = xSign * xWidth;
      out[i * 3 + 1] = yLocal;
      out[i * 3 + 2] = z;
    } else {
      // Triangular gable: uniform inside the triangle via the half-square
      // fold trick (if u+v > 1, flip both).
      let u = Math.random();
      let v = Math.random();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      out[i * 3 + 0] = (u - v) * (baseW / 2);
      out[i * 3 + 1] = (u + v) * height - height / 2;
      out[i * 3 + 2] = face === 2 ? depth / 2 : -depth / 2;
    }
  }
  return out;
}

// A thin oval pad (flat disk-ish) — for the glass plinth under the house.
function sampleFlatEllipse(
  N: number,
  rx: number,
  rz: number,
): Float32Array {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // Rejection-sample inside the unit disk
    let x = 0;
    let z = 0;
    let d2 = 2;
    while (d2 > 1) {
      x = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      d2 = x * x + z * z;
    }
    out[i * 3 + 0] = x * rx;
    out[i * 3 + 1] = (Math.random() - 0.5) * 0.012; // very thin
    out[i * 3 + 2] = z * rz;
  }
  return out;
}

function sampleRingLocal(
  N: number,
  innerR: number,
  outerR: number,
): Float32Array {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.sqrt(Math.random()) * (outerR - innerR);
    out[i * 3 + 0] = Math.cos(angle) * r;
    out[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    out[i * 3 + 2] = Math.sin(angle) * r;
  }
  return out;
}

// ─────────── TEXT canvas ───────────

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
    float alpha = smoothstep(0.5, 0.42, d);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeDotMaterial(): THREE.ShaderMaterial {
  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return new THREE.ShaderMaterial({
    vertexShader: dotVertexShader,
    fragmentShader: dotFragmentShader,
    uniforms: {
      uPointSize: { value: POINT_SIZE_PX * dpr },
      uColor: { value: new THREE.Color(POINT_COLOR) },
    },
    transparent: true,
    depthWrite: false,
  });
}

function TextField({ anchors }: { anchors: Float32Array }) {
  const N = anchors.length / 3;
  const positions = useMemo(() => new Float32Array(anchors), [anchors]);
  const prevPositions = useMemo(() => new Float32Array(anchors), [anchors]);

  const pointsRef = useRef<THREE.Points>(null);

  // Repel comes from the saturn body + moons (sharedCursor.bodies),
  // populated each frame by SaturnField. No direct cursor tracking here.
  useFrame(() => {
    const pts = pointsRef.current;
    if (!pts) return;

    // Repel from Saturn + each moon (positions in text-pixel coords),
    // not from the bare cursor. Saturn already follows the cursor with
    // lag, so this still feels cursor-driven — plus the moons drag their
    // own disturbance trails through the word as they orbit.
    const bodies = sharedCursor.bodies;
    const nb = bodies.length;

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const x = positions[ix];
      const y = positions[ix + 1];
      const ax = anchors[ix];
      const ay = anchors[ix + 1];
      const px = prevPositions[ix];
      const py = prevPositions[ix + 1];

      let fx = (ax - x) * REST_SPRING_K;
      let fy = (ay - y) * REST_SPRING_K;

      for (let b = 0; b < nb; b++) {
        const body = bodies[b];
        const dx = x - body.x;
        const dy = y - body.y;
        const d2 = dx * dx + dy * dy;
        const rSq = body.radius * body.radius;
        if (d2 < rSq && d2 > 1) {
          const dist = Math.sqrt(d2);
          const falloff = 1 - dist / body.radius;
          const mag =
            (body.strength * falloff * falloff) / (d2 + REPEL_SOFT_FLOOR);
          fx += (dx / dist) * mag;
          fy += (dy / dist) * mag;
        }
      }

      const vx = (x - px) * TEXT_DAMPING;
      const vy = (y - py) * TEXT_DAMPING;
      prevPositions[ix] = x;
      prevPositions[ix + 1] = y;
      positions[ix] = x + vx + fx;
      positions[ix + 1] = y + vy + fy;
    }

    (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
  });

  const material = useMemo(makeDotMaterial, []);

  return (
    <points ref={pointsRef} material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
    </points>
  );
}

// ─────────── particle house (static InstancedMeshes) ───────────
//
// A tiny house assembled from the same chunky overlapping particles as the
// moons. Static — no Verlet, no useFrame — just six InstancedMeshes whose
// matrices are written once on mount. Lives in the Saturn canvas's
// perspective world space, anchored at (HOUSE_CENTER_X, HOUSE_CENTER_Y).
//
// Layout (relative to center):
//   plinth   y = -0.10  (translucent oval underneath)
//   body     y =  0.00  (the walls)
//   door     y = -0.04  on the front face (z = +body.d/2)
//   windows  y = +0.02  on the front face, flanking the door
//   roof     y = +0.135 (triangular prism on top)
//   chimney  y = +0.165 (small box poking out of the roof, offset right)

function HouseParticles() {
  // Build all part anchor sets once. Body + roof use SHELL sampling (just
  // the outer surfaces) so the cube and prism silhouettes survive at this
  // particle density. Small parts (door, windows, chimney) use solid
  // sampling — they're small enough to read as solid panels anyway.
  const parts = useMemo(() => {
    return {
      body: sampleBoxWireframe(
        N_HOUSE_BODY,
        HOUSE_BODY_W,
        HOUSE_BODY_H,
        HOUSE_BODY_D,
      ),
      roof: sampleRoofWireframe(
        N_HOUSE_ROOF,
        HOUSE_ROOF_W,
        HOUSE_ROOF_H,
        HOUSE_ROOF_D,
      ),
      chimney: sampleBoxWireframe(
        N_HOUSE_CHIMNEY,
        HOUSE_CHIMNEY_W,
        HOUSE_CHIMNEY_H,
        HOUSE_CHIMNEY_D,
      ),
      door: sampleBox(
        N_HOUSE_DOOR,
        HOUSE_DOOR_W,
        HOUSE_DOOR_H,
        HOUSE_DOOR_D,
      ),
      windowLeft: sampleBox(
        N_HOUSE_WINDOW,
        HOUSE_WINDOW_W,
        HOUSE_WINDOW_H,
        HOUSE_WINDOW_D,
      ),
      windowRight: sampleBox(
        N_HOUSE_WINDOW,
        HOUSE_WINDOW_W,
        HOUSE_WINDOW_H,
        HOUSE_WINDOW_D,
      ),
      plinth: sampleFlatEllipse(
        N_HOUSE_PLINTH,
        HOUSE_PLINTH_RX,
        HOUSE_PLINTH_RZ,
      ),
    };
  }, []);

  // Refs for each mesh
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const chimneyRef = useRef<THREE.InstancedMesh>(null);
  const doorRef = useRef<THREE.InstancedMesh>(null);
  const windowLeftRef = useRef<THREE.InstancedMesh>(null);
  const windowRightRef = useRef<THREE.InstancedMesh>(null);
  const plinthRef = useRef<THREE.InstancedMesh>(null);

  // Write the per-instance matrices once on mount.
  useEffect(() => {
    const tmp = new THREE.Object3D();

    const write = (
      mesh: THREE.InstancedMesh | null,
      anchors: Float32Array,
      offsetX: number,
      offsetY: number,
      offsetZ: number,
    ) => {
      if (!mesh) return;
      const count = anchors.length / 3;
      for (let i = 0; i < count; i++) {
        tmp.position.set(
          HOUSE_CENTER_X + offsetX + anchors[i * 3 + 0],
          HOUSE_CENTER_Y + offsetY + anchors[i * 3 + 1],
          offsetZ + anchors[i * 3 + 2],
        );
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    // Body sits at the center (offsetY 0). Door pokes out toward camera.
    write(bodyRef.current, parts.body, 0, 0, 0);
    write(roofRef.current, parts.roof, 0, HOUSE_BODY_H / 2 + HOUSE_ROOF_H / 2, 0);
    write(
      chimneyRef.current,
      parts.chimney,
      HOUSE_BODY_W * 0.22,
      HOUSE_BODY_H / 2 + HOUSE_ROOF_H * 0.45 + HOUSE_CHIMNEY_H / 2,
      0,
    );
    write(
      doorRef.current,
      parts.door,
      0,
      -HOUSE_BODY_H / 2 + HOUSE_DOOR_H / 2,
      HOUSE_BODY_D / 2 + HOUSE_DOOR_D / 2 - 0.002,
    );
    write(
      windowLeftRef.current,
      parts.windowLeft,
      -HOUSE_BODY_W * 0.28,
      HOUSE_BODY_H * 0.12,
      HOUSE_BODY_D / 2 + HOUSE_WINDOW_D / 2 - 0.002,
    );
    write(
      windowRightRef.current,
      parts.windowRight,
      HOUSE_BODY_W * 0.28,
      HOUSE_BODY_H * 0.12,
      HOUSE_BODY_D / 2 + HOUSE_WINDOW_D / 2 - 0.002,
    );
    write(
      plinthRef.current,
      parts.plinth,
      0,
      -HOUSE_BODY_H / 2 - 0.02,
      0,
    );
  }, [parts]);

  return (
    <>
      <instancedMesh ref={plinthRef} args={[undefined, undefined, N_HOUSE_PLINTH]}>
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS * 0.7, 10, 10]} />
        <meshBasicMaterial
          color={HOUSE_PLINTH_COLOR}
          transparent
          opacity={0.45}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, N_HOUSE_BODY]}>
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS, 10, 10]} />
        <meshBasicMaterial color={HOUSE_BODY_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[undefined, undefined, N_HOUSE_ROOF]}>
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS, 10, 10]} />
        <meshBasicMaterial color={HOUSE_ROOF_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={chimneyRef}
        args={[undefined, undefined, N_HOUSE_CHIMNEY]}
      >
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS * 0.85, 10, 10]} />
        <meshBasicMaterial color={HOUSE_CHIMNEY_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={doorRef} args={[undefined, undefined, N_HOUSE_DOOR]}>
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS * 0.85, 10, 10]} />
        <meshBasicMaterial color={HOUSE_DOOR_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={windowLeftRef}
        args={[undefined, undefined, N_HOUSE_WINDOW]}
      >
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS * 0.85, 10, 10]} />
        <meshBasicMaterial color={HOUSE_WINDOW_COLOR} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={windowRightRef}
        args={[undefined, undefined, N_HOUSE_WINDOW]}
      >
        <sphereGeometry args={[HOUSE_PARTICLE_RADIUS * 0.85, 10, 10]} />
        <meshBasicMaterial color={HOUSE_WINDOW_COLOR} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ─────────── SATURN canvas ───────────

function SaturnField() {
  const { gl, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const fovRad = (CAM_FOV_DEG * Math.PI) / 180;
  const halfH = CAM_Z * Math.tan(fovRad / 2);
  const halfW = halfH * aspect;

  const data = useMemo(() => {
    const body = sampleSolidSphere(N_BODY, SATURN_BODY_R);
    const ring = sampleRingLocal(N_RING, RING_INNER_R, RING_OUTER_R);
    const moonBodies = new Float32Array(N_MOON_TOTAL * 3);
    const moonAssign = new Int8Array(N_MOON_TOTAL);
    for (let m = 0; m < N_MOONS; m++) {
      const moon = sampleSolidSphere(N_PER_MOON, MOON_BODY_R);
      for (let i = 0; i < N_PER_MOON; i++) {
        moonBodies[(m * N_PER_MOON + i) * 3 + 0] = moon[i * 3 + 0];
        moonBodies[(m * N_PER_MOON + i) * 3 + 1] = moon[i * 3 + 1];
        moonBodies[(m * N_PER_MOON + i) * 3 + 2] = moon[i * 3 + 2];
        moonAssign[m * N_PER_MOON + i] = m;
      }
    }

    const types = new Int8Array(N_SATURN_TOTAL);
    const offsets = new Float32Array(N_SATURN_TOTAL * 3);
    const moons = new Int8Array(N_SATURN_TOTAL);
    moons.fill(-1);

    let cur = 0;
    for (let i = 0; i < N_BODY; i++) {
      types[cur] = TYPE_BODY;
      offsets[cur * 3 + 0] = body[i * 3 + 0];
      offsets[cur * 3 + 1] = body[i * 3 + 1];
      offsets[cur * 3 + 2] = body[i * 3 + 2];
      cur++;
    }
    for (let i = 0; i < N_RING; i++) {
      types[cur] = TYPE_RING;
      offsets[cur * 3 + 0] = ring[i * 3 + 0];
      offsets[cur * 3 + 1] = ring[i * 3 + 1];
      offsets[cur * 3 + 2] = ring[i * 3 + 2];
      cur++;
    }
    for (let i = 0; i < N_MOON_TOTAL; i++) {
      types[cur] = TYPE_MOON;
      offsets[cur * 3 + 0] = moonBodies[i * 3 + 0];
      offsets[cur * 3 + 1] = moonBodies[i * 3 + 1];
      offsets[cur * 3 + 2] = moonBodies[i * 3 + 2];
      moons[cur] = moonAssign[i];
      cur++;
    }

    return { types, offsets, moons };
  }, []);

  // Initial positions: scatter near (0,0,0). Particles will spring to live
  // targets immediately (no wall, no shatter).
  const positions = useMemo(() => new Float32Array(N_SATURN_TOTAL * 3), []);
  const prev = useMemo(() => new Float32Array(N_SATURN_TOTAL * 3), []);

  const bodyMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const moonMeshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  const targetCursor = useRef(new THREE.Vector3(0, 0, 0));
  const saturnPos = useRef(new THREE.Vector3(0, 0, 0));

  const impulseOrigin = useRef(new THREE.Vector3(0, 0, 0));
  const impulseRemaining = useRef(0);

  const moonAngles = useRef<Float32Array>(new Float32Array(N_MOONS));
  const moonAngVel = useRef<Float32Array>(new Float32Array(N_MOONS));
  const moonTilt = useRef<{ ct: number; st: number }[]>([]);

  useEffect(() => {
    const KEPLER_K = 0.30;
    for (let m = 0; m < N_MOONS; m++) {
      moonAngles.current[m] =
        (m / N_MOONS) * Math.PI * 2 + Math.random() * 0.6;
      moonAngVel.current[m] = KEPLER_K / Math.pow(MOON_RADII[m], 1.5);
    }
    moonTilt.current = MOON_RADII.map(() => {
      const t = (Math.random() - 0.5) * 0.16;
      return { ct: Math.cos(t), st: Math.sin(t) };
    });
  }, []);

  // Translate the window cursor (sharedCursor.sectionX/Y) into canvas world
  // coords on a z=0 plane.
  useEffect(() => {
    function update() {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      if (sharedCursor.pageX < 0) return;
      const ndcX =
        ((sharedCursor.pageX - rect.left) / rect.width) * 2 - 1;
      const ndcY =
        -(((sharedCursor.pageY - rect.top) / rect.height) * 2 - 1);
      targetCursor.current.set(ndcX * halfW, ndcY * halfH, 0);
    }
    // Snap saturn to first known cursor position so it doesn't drift in
    // from (0,0).
    update();
    saturnPos.current.copy(targetCursor.current);
  }, [gl, halfW, halfH]);

  // Click → smash
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      impulseOrigin.current.set(ndcX * halfW, ndcY * halfH, 0);
      impulseRemaining.current = IMPULSE_DURATION_S;
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [gl, halfW, halfH]);

  useFrame((state, dt) => {
    const dtClamped = Math.min(dt, 0.05);

    // Track window cursor → canvas world coords
    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    if (sharedCursor.pageX >= 0) {
      const ndcX =
        ((sharedCursor.pageX - rect.left) / rect.width) * 2 - 1;
      const ndcY =
        -(((sharedCursor.pageY - rect.top) / rect.height) * 2 - 1);
      targetCursor.current.set(ndcX * halfW, ndcY * halfH, 0);
    }

    saturnPos.current.lerp(targetCursor.current, CURSOR_LAG);

    for (let m = 0; m < N_MOONS; m++) {
      moonAngles.current[m] += moonAngVel.current[m] * dtClamped;
    }

    const ringPhase = state.clock.elapsedTime * 0.18;
    const ringCt = Math.cos(ringPhase);
    const ringSt = Math.sin(ringPhase);
    const ringTiltCt = Math.cos((RING_TILT_DEG * Math.PI) / 180);
    const ringTiltSt = Math.sin((RING_TILT_DEG * Math.PI) / 180);

    const sx = saturnPos.current.x;
    const sy = saturnPos.current.y;
    const sz = saturnPos.current.z;

    const moonCenters = new Float32Array(N_MOONS * 3);
    for (let m = 0; m < N_MOONS; m++) {
      const a = moonAngles.current[m];
      const r = MOON_RADII[m];
      const ox = Math.cos(a) * r;
      const oz = Math.sin(a) * r;
      const tilt = moonTilt.current[m];
      const x2 = ox;
      const y2 = -oz * tilt.st;
      const z2 = oz * tilt.ct;
      moonCenters[m * 3 + 0] = sx + x2;
      moonCenters[m * 3 + 1] = sy + y2;
      moonCenters[m * 3 + 2] = sz + z2;
    }

    // Project saturn + moon centers into TEXT-canvas pixel coordinates so
    // the text particles can repel against them. Both canvases share the
    // viewport, so the conversion is a simple per-axis scale.
    const pxPerWorldX = rect.width / 2 / halfW;
    const pxPerWorldY = rect.height / 2 / halfH;
    const bodies: RepelBody[] = [];
    bodies.push({
      x: sx * pxPerWorldX,
      y: sy * pxPerWorldY,
      radius: SATURN_BODY_REPEL_RADIUS_PX,
      strength: SATURN_BODY_REPEL_STRENGTH,
    });
    for (let m = 0; m < N_MOONS; m++) {
      bodies.push({
        x: moonCenters[m * 3 + 0] * pxPerWorldX,
        y: moonCenters[m * 3 + 1] * pxPerWorldY,
        radius: MOON_REPEL_RADIUS_PX,
        strength: MOON_REPEL_STRENGTH,
      });
    }
    sharedCursor.bodies = bodies;

    if (impulseRemaining.current > 0) {
      impulseRemaining.current -= dtClamped;
    }
    const impulseActive = impulseRemaining.current > 0;
    const impulseProgress = impulseActive
      ? impulseRemaining.current / IMPULSE_DURATION_S
      : 0;
    const impulsePower = impulseActive
      ? IMPULSE_STRENGTH * 4 * impulseProgress * (1 - impulseProgress)
      : 0;
    const imOx = impulseOrigin.current.x;
    const imOy = impulseOrigin.current.y;
    const imR2 = IMPULSE_RADIUS * IMPULSE_RADIUS;

    for (let i = 0; i < N_SATURN_TOTAL; i++) {
      const ix = i * 3;
      const px = positions[ix];
      const py = positions[ix + 1];
      const pz = positions[ix + 2];
      const ppx = prev[ix];
      const ppy = prev[ix + 1];
      const ppz = prev[ix + 2];

      const ox = data.offsets[ix];
      const oy = data.offsets[ix + 1];
      const oz = data.offsets[ix + 2];

      const t = data.types[i];
      let tx: number;
      let ty: number;
      let tz: number;

      if (t === TYPE_BODY) {
        tx = sx + ox;
        ty = sy + oy;
        tz = sz + oz;
      } else if (t === TYPE_RING) {
        const rx = ox * ringCt - oz * ringSt;
        const ry = oy;
        const rz = ox * ringSt + oz * ringCt;
        const ty2 = ry * ringTiltCt - rz * ringTiltSt;
        const tz2 = ry * ringTiltSt + rz * ringTiltCt;
        tx = sx + rx;
        ty = sy + ty2;
        tz = sz + tz2;
      } else {
        const m = data.moons[i];
        tx = moonCenters[m * 3 + 0] + ox;
        ty = moonCenters[m * 3 + 1] + oy;
        tz = moonCenters[m * 3 + 2] + oz;
      }

      let fx = (tx - px) * ANCHOR_K;
      let fy = (ty - py) * ANCHOR_K;
      let fz = (tz - pz) * ANCHOR_K;

      if (impulsePower > 0) {
        const rx = px - imOx;
        const ry = py - imOy;
        const d2 = rx * rx + ry * ry;
        if (d2 < imR2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const falloff = 1 - d / IMPULSE_RADIUS;
          const mag = impulsePower * falloff * falloff;
          fx += (rx / d) * mag;
          fy += (ry / d) * mag;
        }
      }

      const vx = (px - ppx) * SATURN_DAMPING;
      const vy = (py - ppy) * SATURN_DAMPING;
      const vz = (pz - ppz) * SATURN_DAMPING;

      prev[ix] = px;
      prev[ix + 1] = py;
      prev[ix + 2] = pz;
      positions[ix] = px + vx + fx;
      positions[ix + 1] = py + vy + fy;
      positions[ix + 2] = pz + vz + fz;
    }

    const writeRange = (
      mesh: THREE.InstancedMesh | null,
      startIdx: number,
      count: number,
    ) => {
      if (!mesh) return;
      for (let local = 0; local < count; local++) {
        const global = startIdx + local;
        tempObject.position.set(
          positions[global * 3 + 0],
          positions[global * 3 + 1],
          positions[global * 3 + 2],
        );
        tempObject.scale.set(1, 1, 1);
        tempObject.updateMatrix();
        mesh.setMatrixAt(local, tempObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    writeRange(bodyMeshRef.current, RANGE_BODY_START, N_BODY);
    writeRange(ringMeshRef.current, RANGE_RING_START, N_RING);
    writeRange(moonMeshRef.current, RANGE_MOON_START, N_MOON_TOTAL);
  });

  return (
    <>
      <instancedMesh ref={bodyMeshRef} args={[undefined, undefined, N_BODY]}>
        <sphereGeometry args={[RADIUS_BODY, 10, 10]} />
        <meshBasicMaterial color={COLOR_BODY} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={ringMeshRef} args={[undefined, undefined, N_RING]}>
        <sphereGeometry args={[RADIUS_RING, 10, 10]} />
        <meshBasicMaterial color={COLOR_RING} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={moonMeshRef}
        args={[undefined, undefined, N_MOON_TOTAL]}
      >
        <sphereGeometry args={[RADIUS_MOON, 10, 10]} />
        <meshBasicMaterial color={COLOR_MOON} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ─────────── shooting star comet ───────────
//
// A bright head + a fading line-strip tail that streaks left → right
// across the viewport, passing over the RichardTheBruce text. The tail
// is a 32-vertex polyline whose positions get shifted each frame (slot
// 0 = current head, slot N = oldest). Per-vertex color fades from
// near-white at the head to pure black at the tail end, so against the
// ink background the streak naturally dissolves.
//
// A separate single-vertex Points object sits at the head with a much
// bigger gl_PointSize so the bloom pass blooms it into a glowing comet
// nucleus. Between flights the head parks off-screen so nothing renders.
// Next flight is scheduled 7–14s later (randomized).

// Tail = densely overlapping points so Bloom + Additive blend the
// circles into a continuous streak. Key numbers:
//   - K_INTERP: at each animation frame we insert this many interpolated
//     trail positions between the previous head position and the new one,
//     so the dots don't space out when the comet moves fast (was 1 → reads
//     as a string of beads).
//   - Sizes are large enough that successive dots overlap by 30%+ even at
//     the tail end, so there are no visible gaps.
const COMET_TAIL_LENGTH = 84;
const COMET_TAIL_INTERP = 3;
const COMET_TAIL_HEAD_SIZE_PX = 32;
const COMET_TAIL_END_SIZE_PX = 8;
const COMET_FLIGHT_DURATION_S = 2.4;          // longer flight for the bigger arc
const COMET_INTERVAL_MIN_S = 7;
const COMET_INTERVAL_MAX_S = 14;
const COMET_FIRST_DELAY_S = 1.4;
const COMET_HEAD_SIZE_PX = 18;
const COMET_OFF_SCREEN = -99999;
const COMET_ARC_HEIGHT_PX = 540;               // peak of the rainbow above the linear chord
// Comet lands at the END of "RichardTheBruce" — its right edge sits roughly
// 0.66·halfW from screen center at FONT_SIZE_PX=140 on a 1440px viewport.
const COMET_LANDING_X_FRAC = 0.66;
const COMET_LANDING_Y_PX = -100;               // baseline of the letters in canvas y-up
const COMET_START_X_MARGIN = 220;              // how far off-screen left we launch

// Explosion: radial burst at landing point.
const EXPLOSION_PARTICLE_COUNT = 64;
const EXPLOSION_DURATION_S = 1.2;
const EXPLOSION_SPEED_MIN_PX_S = 280;
const EXPLOSION_SPEED_MAX_PX_S = 720;
const EXPLOSION_GRAVITY_PX_S2 = 620;           // pulls fragments back down
const EXPLOSION_UPWARD_BIAS_PX_S = 130;        // pops upward before gravity grabs them
const EXPLOSION_HEAD_SIZE_PX = 18;
const EXPLOSION_TAIL_SIZE_PX = 2;

function CometStreak() {
  const { size } = useThree();

  // Persistent buffers. The Z coordinate of each tail vertex stores its
  // index in the trail (0 = head, COMET_TAIL_LENGTH-1 = tail end) so the
  // shader can derive size and alpha without a separate attribute.
  const tailPositions = useMemo(() => {
    const out = new Float32Array(COMET_TAIL_LENGTH * 3);
    for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
      out[i * 3 + 2] = i; // stash index in z
    }
    return out;
  }, []);

  const headPosition = useMemo(() => new Float32Array([0, 0, 0]), []);

  // Explosion buffers — positions and per-particle velocities. Position.z
  // again carries the index so the shader can vary appearance per-particle.
  const explPositions = useMemo(() => {
    const out = new Float32Array(EXPLOSION_PARTICLE_COUNT * 3);
    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      out[i * 3 + 2] = i;
    }
    return out;
  }, []);
  const explVelocities = useMemo(
    () => new Float32Array(EXPLOSION_PARTICLE_COUNT * 2),
    [],
  );

  const tailRef = useRef<THREE.Points>(null);
  const headRef = useRef<THREE.Points>(null);
  const explRef = useRef<THREE.Points>(null);

  // Flight + explosion state. ?comet=freeze pins a comet at mid-flight for
  // screenshot verification; ?comet=loop fires comets immediately back-to-back.
  const debugMode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("comet")
      : null;
  const flight = useRef({
    // 'idle' = waiting to spawn, 'flight' = comet arcing, 'explode' = burst playing
    phase: "idle" as "idle" | "flight" | "explode",
    phaseStart: 0,
    nextSpawnAt:
      debugMode === "loop" || debugMode === "freeze"
        ? 0.2
        : COMET_FIRST_DELAY_S,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });

  // Park everything off-screen on mount so we don't render stale origin
  // points before the first flight.
  useEffect(() => {
    for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
      tailPositions[i * 3 + 0] = COMET_OFF_SCREEN;
      tailPositions[i * 3 + 1] = COMET_OFF_SCREEN;
    }
    headPosition[0] = COMET_OFF_SCREEN;
    headPosition[1] = COMET_OFF_SCREEN;
    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      explPositions[i * 3 + 0] = COMET_OFF_SCREEN;
      explPositions[i * 3 + 1] = COMET_OFF_SCREEN;
    }
    [tailRef, headRef, explRef].forEach((r) => {
      if (r.current) {
        (
          r.current.geometry.attributes.position as THREE.BufferAttribute
        ).needsUpdate = true;
      }
    });
  }, [tailPositions, headPosition, explPositions]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = state.clock.elapsedTime;
    const f = flight.current;

    // ───── spawn? ─────
    if (f.phase === "idle" && now >= f.nextSpawnAt) {
      const halfW = size.width / 2;
      // Always launch from far off-screen left so the arc spans a long
      // distance, peaks well above the text, then lands at the right end
      // of "RichardTheBruce" with a satisfying burst.
      f.startX = -halfW - COMET_START_X_MARGIN;
      f.startY = COMET_LANDING_Y_PX + (Math.random() - 0.5) * 20; // tiny jitter
      f.endX = halfW * COMET_LANDING_X_FRAC + (Math.random() - 0.5) * 30;
      f.endY = COMET_LANDING_Y_PX + (Math.random() - 0.5) * 20;

      // Prime tail with the start position so the trail doesn't render
      // a line from the previous flight's last frame.
      for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
        tailPositions[i * 3 + 0] = f.startX;
        tailPositions[i * 3 + 1] = f.startY;
      }
      f.phase = "flight";
      f.phaseStart = now;
    }

    // ───── flight (rainbow arc) ─────
    if (f.phase === "flight") {
      const rawT = (now - f.phaseStart) / COMET_FLIGHT_DURATION_S;
      const flightT = debugMode === "freeze" ? 0.5 : rawT;

      if (flightT >= 1) {
        // Land! Spawn explosion at end point, hide the comet trail+head.
        const landX = f.endX;
        const landY = f.endY;

        for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed =
            EXPLOSION_SPEED_MIN_PX_S +
            Math.random() *
              (EXPLOSION_SPEED_MAX_PX_S - EXPLOSION_SPEED_MIN_PX_S);
          explPositions[i * 3 + 0] = landX;
          explPositions[i * 3 + 1] = landY;
          // velocities — radial + a tiny upward kick so the burst
          // arches upward before gravity reclaims it
          explVelocities[i * 2 + 0] = Math.cos(angle) * speed;
          explVelocities[i * 2 + 1] =
            Math.sin(angle) * speed + EXPLOSION_UPWARD_BIAS_PX_S;
        }

        // Hide comet during explosion
        for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
          tailPositions[i * 3 + 0] = COMET_OFF_SCREEN;
          tailPositions[i * 3 + 1] = COMET_OFF_SCREEN;
        }
        headPosition[0] = COMET_OFF_SCREEN;
        headPosition[1] = COMET_OFF_SCREEN;

        f.phase = "explode";
        f.phaseStart = now;
      } else {
        // Parabolic arc: linear chord + 4·h·t·(1-t) lift above the chord.
        // Easing on the chord so the comet decelerates as it climbs and
        // accelerates as it falls (mass-on-a-string feel).
        const eased = flightT * (2 - flightT); // ease-out for the chord
        const chordX = f.startX + (f.endX - f.startX) * eased;
        const chordY = f.startY + (f.endY - f.startY) * eased;
        // Arc lift uses the un-eased t so the peak sits at t=0.5 (mid-flight).
        const arcLift =
          4 * COMET_ARC_HEIGHT_PX * flightT * (1 - flightT);
        const headX = chordX;
        const headY = chordY + arcLift;

        // Read previous head position (slot 0 from last frame) so we can
        // interpolate sub-frame positions and densify the streak.
        const prevHeadX = tailPositions[0];
        const prevHeadY = tailPositions[1];

        // Shift tail history backwards by COMET_TAIL_INTERP slots so we
        // can insert that many interpolated positions between the
        // previous head and the new head.
        for (
          let i = COMET_TAIL_LENGTH - 1;
          i >= COMET_TAIL_INTERP;
          i--
        ) {
          tailPositions[i * 3 + 0] =
            tailPositions[(i - COMET_TAIL_INTERP) * 3 + 0];
          tailPositions[i * 3 + 1] =
            tailPositions[(i - COMET_TAIL_INTERP) * 3 + 1];
        }
        // Slot k in [0..K-1] gets a position fraction (K-k)/K of the way
        // from previous head to current head. Slot 0 = current head; slot
        // K-1 = just past the previous head.
        for (let k = 0; k < COMET_TAIL_INTERP; k++) {
          const frac =
            (COMET_TAIL_INTERP - k) / COMET_TAIL_INTERP;
          tailPositions[k * 3 + 0] =
            prevHeadX + (headX - prevHeadX) * frac;
          tailPositions[k * 3 + 1] =
            prevHeadY + (headY - prevHeadY) * frac;
        }

        headPosition[0] = headX;
        headPosition[1] = headY;
      }
    }

    // ───── explosion ─────
    if (f.phase === "explode") {
      const age = now - f.phaseStart;
      const t = age / EXPLOSION_DURATION_S;

      if (t >= 1) {
        // Burst finished. Park, schedule next comet.
        for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
          explPositions[i * 3 + 0] = COMET_OFF_SCREEN;
          explPositions[i * 3 + 1] = COMET_OFF_SCREEN;
        }
        f.phase = "idle";
        f.nextSpawnAt =
          debugMode === "loop"
            ? now + 0.4
            : now +
              COMET_INTERVAL_MIN_S +
              Math.random() *
                (COMET_INTERVAL_MAX_S - COMET_INTERVAL_MIN_S);
      } else {
        // Integrate each fragment: position += velocity·dt; velocity.y -= g·dt.
        for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
          explPositions[i * 3 + 0] += explVelocities[i * 2 + 0] * dt;
          explPositions[i * 3 + 1] += explVelocities[i * 2 + 1] * dt;
          explVelocities[i * 2 + 1] -= EXPLOSION_GRAVITY_PX_S2 * dt;
        }
        // Pass age to the shader for fade.
        if (explRef.current) {
          const mat = explRef.current
            .material as THREE.ShaderMaterial;
          if (mat.uniforms && mat.uniforms.uAge)
            mat.uniforms.uAge.value = t;
        }
      }
    }

    // ───── flush buffer updates ─────
    if (tailRef.current) {
      (
        tailRef.current.geometry.attributes
          .position as THREE.BufferAttribute
      ).needsUpdate = true;
    }
    if (headRef.current) {
      (
        headRef.current.geometry.attributes
          .position as THREE.BufferAttribute
      ).needsUpdate = true;
    }
    if (explRef.current) {
      (
        explRef.current.geometry.attributes
          .position as THREE.BufferAttribute
      ).needsUpdate = true;
    }
  });

  const tailMaterial = useMemo(() => {
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uTailLength;
        uniform float uHeadSize;
        uniform float uTailEndSize;
        varying float vAlpha;
        void main() {
          // position.z carries the index (0..uTailLength-1). x,y is the
          // animated trail position.
          float idx = position.z;
          float t = idx / max(uTailLength - 1.0, 1.0); // 0 at head, 1 at tail
          vAlpha = pow(1.0 - t, 1.5);
          float size = mix(uHeadSize, uTailEndSize, t);
          gl_PointSize = size;
          // Render at z=0 in clip space — the z value is just a smuggled index.
          vec4 mv = modelViewMatrix * vec4(position.xy, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float radial = smoothstep(0.5, 0.0, d);
          // Warm-white comet light, slightly biased toward the blue end at
          // the head (typical comet spectrum: hot blue dust + ion tail).
          vec3 col = vec3(0.98, 0.96, 0.88);
          gl_FragColor = vec4(col * vAlpha, vAlpha * radial);
        }
      `,
      uniforms: {
        uTailLength: { value: COMET_TAIL_LENGTH },
        uHeadSize: { value: COMET_TAIL_HEAD_SIZE_PX * dpr },
        uTailEndSize: { value: COMET_TAIL_END_SIZE_PX * dpr },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const headMaterial = useMemo(() => {
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uPointSize;
        void main() {
          gl_PointSize = uPointSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          // Hot core + soft halo
          float core = smoothstep(0.5, 0.0, d);
          float halo = smoothstep(0.5, 0.15, d) * 0.6;
          float a = max(core, halo);
          // Cool blue-white core to warm yellow at the very center
          vec3 col = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.95, 0.78), core);
          gl_FragColor = vec4(col, a);
        }
      `,
      uniforms: {
        uPointSize: { value: COMET_HEAD_SIZE_PX * dpr },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const explosionMaterial = useMemo(() => {
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uAge;          // 0 at burst, 1 at end
        uniform float uHeadSize;
        uniform float uTailSize;
        uniform float uCount;
        varying float vAlpha;
        varying float vIdxNorm;
        void main() {
          float idx = position.z;
          vIdxNorm = idx / max(uCount - 1.0, 1.0);
          // Each fragment fades and shrinks with the same age curve.
          // Small per-particle phase offset so they twinkle out unevenly.
          float phase = clamp(uAge + (vIdxNorm - 0.5) * 0.18, 0.0, 1.0);
          vAlpha = pow(1.0 - phase, 1.4);
          float size = mix(uHeadSize, uTailSize, phase);
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vIdxNorm;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float radial = smoothstep(0.5, 0.0, d);
          // Warm sparks: yellow-white core that drifts toward amber as a
          // function of the per-particle index (just a little chromatic
          // variety across the fragments).
          vec3 hot = vec3(1.0, 0.96, 0.82);
          vec3 amber = vec3(1.0, 0.71, 0.34);
          vec3 col = mix(hot, amber, vIdxNorm);
          gl_FragColor = vec4(col * vAlpha, vAlpha * radial);
        }
      `,
      uniforms: {
        uAge: { value: 1.0 }, // start "done" so nothing renders until armed
        uHeadSize: { value: EXPLOSION_HEAD_SIZE_PX * dpr },
        uTailSize: { value: EXPLOSION_TAIL_SIZE_PX * dpr },
        uCount: { value: EXPLOSION_PARTICLE_COUNT },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  return (
    <>
      {/* Streaking tail: a 48-point trail where each point has size + alpha
          driven by its index in the buffer (0 = head, brightest + biggest;
          47 = tail end, dimmest + smallest). Additive blending plus Bloom
          turns the overlapping circles into a continuous glowing streak. */}
      <points ref={tailRef} material={tailMaterial}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[tailPositions, 3]}
          />
        </bufferGeometry>
      </points>

      {/* Bright comet nucleus that picks up the heaviest bloom */}
      <points ref={headRef} material={headMaterial}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[headPosition, 3]}
          />
        </bufferGeometry>
      </points>

      {/* Explosion burst: 48 radial fragments launched when the comet lands.
          Per-particle size shrinks with age via the uAge uniform; per-particle
          random index in position.z gives small color variation. */}
      <points ref={explRef} material={explosionMaterial}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[explPositions, 3]}
          />
        </bufferGeometry>
      </points>
    </>
  );
}

// ─────────── magnet subheader (Exp 15 mechanic) ───────────

const MAGNET_WORDS = ["He", "Who", "Creates"];
const MAGNET_RADIUS_PX = 240;
const MAGNET_STRENGTH = 0.4;
const MAGNET_SPRING_K = 0.22;
const MAGNET_DAMPING = 0.72;

function MagnetSubheader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([]);
  // Per-word current + previous offset (px). 3 words × {x, y}.
  const offsets = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const prev = useRef<number[]>([0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const container = containerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();

        for (let i = 0; i < MAGNET_WORDS.length; i++) {
          const el = wordsRef.current[i];
          if (!el) continue;

          // Use the current rendered position MINUS the current transform
          // offset to get the anchor (resting layout position).
          const wordRect = el.getBoundingClientRect();
          const renderedCx = wordRect.left + wordRect.width / 2;
          const renderedCy = wordRect.top + wordRect.height / 2;
          const ox = offsets.current[i * 2];
          const oy = offsets.current[i * 2 + 1];
          const anchorCx = renderedCx - ox;
          const anchorCy = renderedCy - oy;

          const dx = sharedCursor.pageX - anchorCx;
          const dy = sharedCursor.pageY - anchorCy;
          const d = Math.sqrt(dx * dx + dy * dy);

          let tx = 0;
          let ty = 0;
          if (sharedCursor.pageX >= 0 && d < MAGNET_RADIUS_PX) {
            const falloff = 1 - d / MAGNET_RADIUS_PX;
            const mag = MAGNET_STRENGTH * falloff;
            tx = dx * mag;
            ty = dy * mag;
          }

          const px = prev.current[i * 2];
          const py = prev.current[i * 2 + 1];
          const fx = (tx - ox) * MAGNET_SPRING_K;
          const fy = (ty - oy) * MAGNET_SPRING_K;
          const vx = (ox - px) * MAGNET_DAMPING;
          const vy = (oy - py) * MAGNET_DAMPING;

          prev.current[i * 2] = ox;
          prev.current[i * 2 + 1] = oy;
          offsets.current[i * 2] = ox + vx + fx;
          offsets.current[i * 2 + 1] = oy + vy + fy;

          el.style.transform = `translate(${offsets.current[i * 2].toFixed(
            2,
          )}px, ${offsets.current[i * 2 + 1].toFixed(2)}px)`;
        }

        // silence unused-var lint
        void containerRect;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
      style={{ top: "calc(50% + 95px)" }}
    >
      <p className="flex items-baseline gap-x-[0.35em] font-serif text-2xl italic text-bone/55 md:text-3xl">
        {MAGNET_WORDS.map((word, i) => (
          <span
            key={i}
            ref={(el) => {
              wordsRef.current[i] = el;
            }}
            className="inline-block will-change-transform"
          >
            {word}
          </span>
        ))}
      </p>
    </div>
  );
}

// ─────────── public component ───────────

export function SaturnHome() {
  const [anchors, setAnchors] = useState<Float32Array | null>(null);

  // Mount text anchors after fonts ready (so Cormorant Garamond is used,
  // not the Georgia fallback).
  useEffect(() => {
    function build() {
      setAnchors(sampleWordAnchors(WORD, FONT_SIZE_PX, PARTICLE_TARGET));
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    } else {
      build();
    }
  }, []);

  // One window-level pointer listener feeds both canvases.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      sharedCursor.pageX = e.clientX;
      sharedCursor.pageY = e.clientY;
      sharedCursor.inside = true;
    }
    function onLeave() {
      sharedCursor.pageX = -10000;
      sharedCursor.pageY = -10000;
      sharedCursor.inside = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section
      className="relative h-screen w-full overflow-hidden bg-ink"
      style={{ cursor: "none" }}
    >
      {/* Text canvas: orthographic pixel space, alpha so Saturn shows over */}
      {anchors && (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
          }}
          gl={{ alpha: true, antialias: true }}
        >
          <ScreenPixelCamera />
          <TextField anchors={anchors} />
          <CometStreak />
          <EffectComposer>
            <Bloom
              intensity={1.0}
              luminanceThreshold={0.25}
              luminanceSmoothing={0.55}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}

      {/* "He Who Creates" cursor-magnet subheader, positioned below the
          particle text. Each word leans toward the cursor with spring
          physics (Exp 15 mechanic applied to a single 3-word phrase). */}
      <MagnetSubheader />



{/* Saturn canvas: perspective world space, transparent so text shows
          underneath. */}
      <Canvas
        camera={{ position: [0, 0, CAM_Z], fov: CAM_FOV_DEG }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
        }}
        gl={{ alpha: true, antialias: true }}
      >
        <SaturnField />
        <HouseParticles />
        <EffectComposer>
          <Bloom
            intensity={0.45}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.55}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </section>
  );
}
