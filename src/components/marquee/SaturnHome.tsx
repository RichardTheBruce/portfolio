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
const REPEL_RADIUS_PX = 130;
const REPEL_STRENGTH = 5400;
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

// ────────── shared cursor (window-level) ──────────

// Both canvases read this. Updated by a single window pointermove listener
// mounted at the SaturnHome level.
const sharedCursor = {
  // Page-space client coords (px). -1 means "not over the section".
  pageX: -10000,
  pageY: -10000,
  inside: false,
  // Section-relative coords (px from section top-left)
  sectionX: -10000,
  sectionY: -10000,
};

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
  const { gl } = useThree();
  const sectionMouse = useRef({ x: 0, y: 0, inside: false });

  // Translate window cursor to canvas-pixel coords (origin centered, y-up).
  useFrame(() => {
    const canvas = gl.domElement;
    const r = canvas.getBoundingClientRect();
    if (
      sharedCursor.pageX >= r.left &&
      sharedCursor.pageX <= r.right &&
      sharedCursor.pageY >= r.top &&
      sharedCursor.pageY <= r.bottom
    ) {
      sectionMouse.current.x = sharedCursor.pageX - r.left - r.width / 2;
      sectionMouse.current.y = -(sharedCursor.pageY - r.top - r.height / 2);
      sectionMouse.current.inside = true;
    } else {
      sectionMouse.current.inside = false;
    }

    const pts = pointsRef.current;
    if (!pts) return;

    const mx = sectionMouse.current.x;
    const my = sectionMouse.current.y;
    const inside = sectionMouse.current.inside;
    const repelSq = REPEL_RADIUS_PX * REPEL_RADIUS_PX;

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

      {/* "He who Creates" subheader, positioned below the particle text. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: "calc(50% + 95px)" }}
      >
        <p className="font-serif text-2xl italic text-bone/45 md:text-3xl">
          He who Creates
        </p>
      </div>

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
