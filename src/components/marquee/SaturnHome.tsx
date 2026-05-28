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

// Tail = chunky overlapping points so Bloom catches the streak. A pure 1px
// LineBasicMaterial is too thin for the post-fx to grab.
const COMET_TAIL_LENGTH = 48;
const COMET_TAIL_HEAD_SIZE_PX = 14;
const COMET_TAIL_END_SIZE_PX = 2;
const COMET_FLIGHT_DURATION_S = 1.6;
const COMET_INTERVAL_MIN_S = 7;
const COMET_INTERVAL_MAX_S = 14;
const COMET_FIRST_DELAY_S = 1.4;
const COMET_HEAD_SIZE_PX = 18;
const COMET_OFF_SCREEN = -99999;

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

  const tailRef = useRef<THREE.Points>(null);
  const headRef = useRef<THREE.Points>(null);

  // Flight state. ?comet=freeze pins a comet at mid-flight for screenshot
  // verification; ?comet=loop fires comets every 2s back-to-back.
  const debugMode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("comet")
      : null;
  const flight = useRef({
    activeStart: -1, // sentinel = no active flight
    nextSpawnAt:
      debugMode === "loop" || debugMode === "freeze"
        ? 0.2
        : COMET_FIRST_DELAY_S,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });

  // Park everything off-screen on mount so we don't render a stale
  // origin-point before the first flight.
  useEffect(() => {
    for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
      tailPositions[i * 3 + 0] = COMET_OFF_SCREEN;
      tailPositions[i * 3 + 1] = COMET_OFF_SCREEN;
    }
    headPosition[0] = COMET_OFF_SCREEN;
    headPosition[1] = COMET_OFF_SCREEN;
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
  }, [tailPositions, headPosition]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const f = flight.current;

    // Need to spawn?
    if (f.activeStart < 0 && now >= f.nextSpawnAt) {
      f.activeStart = now;
      // Path: enters from off-screen left, exits off-screen right.
      // Y in the band that crosses RichardTheBruce (which sits roughly
      // y=-110..+40 in pixel coords with TEXT_VERTICAL_OFFSET_PX=-40).
      // Add a downward slope so it feels like a falling star.
      const margin = 140;
      const halfW = size.width / 2;
      const yBand = (Math.random() - 0.5) * 160; // -80..+80 — over the text
      f.startX = -halfW - margin;
      f.startY = yBand + (Math.random() * 80 + 30); // upper entry
      f.endX = halfW + margin;
      f.endY = yBand - (Math.random() * 100 + 40); // lower exit
      // Reset tail to the start point so the line doesn't "snap" from old data
      for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
        tailPositions[i * 3 + 0] = f.startX;
        tailPositions[i * 3 + 1] = f.startY;
      }
    }

    // Active flight?
    if (f.activeStart >= 0) {
      const rawFlightT = (now - f.activeStart) / COMET_FLIGHT_DURATION_S;
      const flightT = debugMode === "freeze" ? 0.5 : rawFlightT;

      if (flightT >= 1) {
        // Done. Park, schedule next.
        f.activeStart = -1;
        f.nextSpawnAt =
          debugMode === "loop"
            ? now + 0.05
            : now +
              COMET_INTERVAL_MIN_S +
              Math.random() * (COMET_INTERVAL_MAX_S - COMET_INTERVAL_MIN_S);
        for (let i = 0; i < COMET_TAIL_LENGTH; i++) {
          tailPositions[i * 3 + 0] = COMET_OFF_SCREEN;
          tailPositions[i * 3 + 1] = COMET_OFF_SCREEN;
        }
        headPosition[0] = COMET_OFF_SCREEN;
        headPosition[1] = COMET_OFF_SCREEN;
      } else {
        // Eased path so the comet decelerates slightly at the right edge.
        const eased = flightT * (2 - flightT); // ease-out quadratic
        const headX = f.startX + (f.endX - f.startX) * eased;
        const headY = f.startY + (f.endY - f.startY) * eased;

        // Shift tail history (newest goes to slot 0).
        for (let i = COMET_TAIL_LENGTH - 1; i > 0; i--) {
          tailPositions[i * 3 + 0] = tailPositions[(i - 1) * 3 + 0];
          tailPositions[i * 3 + 1] = tailPositions[(i - 1) * 3 + 1];
        }
        tailPositions[0] = headX;
        tailPositions[1] = headY;

        headPosition[0] = headX;
        headPosition[1] = headY;
      }
    }

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
