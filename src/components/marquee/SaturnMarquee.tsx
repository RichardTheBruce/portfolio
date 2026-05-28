"use client";

// SaturnMarquee — the home page signature interaction.
//
// At load: a still particle wall fills the viewport.
// First cursor move: the wall flows outward into four concurrent forms:
//   1. "RichardTheBruce" in Cormorant Garamond letterforms (upper third)
//   2. Saturn body (solid sphere of particles) at the cursor position
//   3. Saturn ring (tilted disk around the body)
//   4. Five moons orbiting the body with Keplerian-ish angular velocities
//
// Saturn follows the mouse cursor with a smoothing lag. The default cursor
// is hidden — Saturn IS the cursor.
//
// Architecture:
//   - FOUR InstancedMesh siblings (one per type: text/body/ring/moons), each
//     with its own simple material + color. No per-instance color shader
//     gymnastics. Cleaner, debuggable.
//   - One shared positions buffer indexed globally [0, N_TOTAL). Each mesh's
//     setMatrixAt(localIndex, ...) reads from positions at the offset for
//     its type.
//   - Single CPU Verlet loop runs per frame over all N_TOTAL particles,
//     reading data.types[i] to pick the live target.
//   - target = lerp(wallAnchor, liveTarget, mix) where mix animates 0→1 on
//     first cursor touch.
//   - liveTarget by type:
//       text: fixed world position from letterform sampling
//       body: saturnPos + bodyOffset
//       ring: saturnPos + tilt(rotateY(ringOffset, ringPhase))
//       moon: moonCenter(moonIdx) + moonBodyOffset
//   - moonCenter = saturnPos + tilt(circle(moonAngle, moonRadius))

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ────────── particle counts ──────────
const N_TEXT = 1100;
const N_BODY = 700;
const N_RING = 420;
const N_MOONS = 5;
const N_PER_MOON = 110;
const N_MOON_TOTAL = N_MOONS * N_PER_MOON;
const N_TOTAL = N_TEXT + N_BODY + N_RING + N_MOON_TOTAL;

// Index ranges (contiguous in the global positions buffer)
const RANGE_TEXT_START = 0;
const RANGE_BODY_START = RANGE_TEXT_START + N_TEXT;
const RANGE_RING_START = RANGE_BODY_START + N_BODY;
const RANGE_MOON_START = RANGE_RING_START + N_RING;

// ────────── physics ──────────
const ANCHOR_K = 0.11;
const DAMPING = 0.86;
const CURSOR_LAG = 0.18;
const MIX_RATE = 0.7; // per second; reaches 1 in ~1.4s

// Smash mechanic: click sends a radial impulse outward from cursor.
// The impulse decays over IMPULSE_DURATION_S.
const IMPULSE_RADIUS = 1.6;        // world units of effect
const IMPULSE_STRENGTH = 0.22;     // peak push velocity per frame
const IMPULSE_DURATION_S = 0.32;   // total active time

// ────────── visuals + world ──────────
const CAM_Z = 5;
const CAM_FOV_DEG = 50;
const SATURN_BODY_R = 0.34;
const RING_INNER_R = 0.52;
const RING_OUTER_R = 1.05;
const RING_TILT_DEG = 24;
const MOON_RADII = [1.4, 1.85, 2.35, 2.9, 3.4];
const MOON_BODY_R = 0.13;
const TEXT_FONT_PX = 170;
const TEXT_WORLD_SCALE = 0.0045;
const TEXT_CENTER_Y = 1.35;
const TEXT_Z_JITTER = 0.05;
const WALL_Z_JITTER = 0.25;

// per-mesh sphere geometry radii (baked into the geometry)
const RADIUS_TEXT = 0.032;
const RADIUS_BODY = 0.024;
const RADIUS_RING = 0.020;
const RADIUS_MOON = 0.028;

const COLOR_TEXT = "#C8C3B6"; // muted bone so text doesn't blow out under bloom
const COLOR_BODY = "#F0A256"; // amber saturn
const COLOR_RING = "#E2B071";
const COLOR_MOON = "#3DA9FC"; // string blue moons

// type ids
const TYPE_TEXT = 0;
const TYPE_BODY = 1;
const TYPE_RING = 2;
const TYPE_MOON = 3;

const BG_COLOR = "#0A0A0B";

// ────────── samplers ──────────

function buildWallAnchors(N: number, halfW: number, halfH: number): Float32Array {
  const aspect = halfW / halfH;
  const cols = Math.max(2, Math.round(Math.sqrt(N * aspect)));
  const rows = Math.ceil(N / cols);
  const out = new Float32Array(N * 3);
  const jx = ((halfW * 2) / cols) * 0.18;
  const jy = ((halfH * 2) / rows) * 0.18;
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const u = cols > 1 ? col / (cols - 1) : 0.5;
    const v = rows > 1 ? row / (rows - 1) : 0.5;
    out[i * 3 + 0] = (u * 2 - 1) * halfW + (Math.random() - 0.5) * jx;
    out[i * 3 + 1] = -(v * 2 - 1) * halfH + (Math.random() - 0.5) * jy;
    out[i * 3 + 2] = (Math.random() - 0.5) * WALL_Z_JITTER;
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

function sampleRingLocal(N: number, innerR: number, outerR: number): Float32Array {
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

function sampleTextAnchors(
  word: string,
  fontPx: number,
  target: number,
  worldScale: number,
  centerY: number,
  zJitter: number,
): Float32Array {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return new Float32Array(target * 3);
  const font = `700 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
  probe.font = font;
  const wordWidth = probe.measureText(word).width;
  const w = Math.ceil(wordWidth + 100);
  const h = Math.ceil(fontPx * 1.4 + 80);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return new Float32Array(target * 3);
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "center";
  octx.font = font;
  octx.fillText(word, w / 2, h / 2);
  const img = octx.getImageData(0, 0, w, h).data;

  let inked = 0;
  for (let i = 3; i < img.length; i += 4) {
    if (img[i] > 128) inked++;
  }
  if (inked === 0) return new Float32Array(target * 3);

  const stride = Math.max(1, Math.floor(Math.sqrt(inked / target)));
  const collected: number[] = [];
  for (let y = 0; y < h && collected.length / 3 < target; y += stride) {
    for (let x = 0; x < w && collected.length / 3 < target; x += stride) {
      if (img[(y * w + x) * 4 + 3] > 128) {
        collected.push((x - w / 2) * worldScale);
        collected.push(-(y - h / 2) * worldScale + centerY);
        collected.push((Math.random() * 2 - 1) * zJitter);
      }
    }
  }

  const out = new Float32Array(target * 3);
  for (let i = 0; i < target * 3; i++) {
    out[i] = collected[i % Math.max(collected.length, 3)] ?? 0;
  }
  return out;
}

// ────────── field component ──────────

function MarqueeField() {
  const { gl, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const fovRad = (CAM_FOV_DEG * Math.PI) / 180;
  const halfH = CAM_Z * Math.tan(fovRad / 2);
  const halfW = halfH * aspect;

  const data = useMemo(() => {
    const wall = buildWallAnchors(N_TOTAL, halfW, halfH);
    const text = sampleTextAnchors(
      "RichardTheBruce",
      TEXT_FONT_PX,
      N_TEXT,
      TEXT_WORLD_SCALE,
      TEXT_CENTER_Y,
      TEXT_Z_JITTER,
    );
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

    const types = new Int8Array(N_TOTAL);
    const offsets = new Float32Array(N_TOTAL * 3);
    const moons = new Int8Array(N_TOTAL);
    moons.fill(-1);

    let cur = 0;
    for (let i = 0; i < N_TEXT; i++) {
      types[cur] = TYPE_TEXT;
      offsets[cur * 3 + 0] = text[i * 3 + 0];
      offsets[cur * 3 + 1] = text[i * 3 + 1];
      offsets[cur * 3 + 2] = text[i * 3 + 2];
      cur++;
    }
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

    return { wall, types, offsets, moons };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halfW, halfH]);

  const positions = useMemo(() => new Float32Array(data.wall), [data]);
  const prev = useMemo(() => new Float32Array(data.wall), [data]);

  const textMeshRef = useRef<THREE.InstancedMesh>(null);
  const bodyMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const moonMeshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  const targetCursor = useRef(new THREE.Vector3(0, 0, 0));
  const saturnPos = useRef(new THREE.Vector3(0, 0, 0));
  const mixRef = useRef(0);
  const triggeredRef = useRef(false);

  // Smash impulse state
  const impulseOrigin = useRef(new THREE.Vector3(0, 0, 0));
  const impulseRemaining = useRef(0); // seconds remaining

  const moonAngles = useRef<Float32Array>(new Float32Array(N_MOONS));
  const moonAngVel = useRef<Float32Array>(new Float32Array(N_MOONS));
  const moonTilt = useRef<{ ct: number; st: number }[]>([]);

  useEffect(() => {
    for (let m = 0; m < N_MOONS; m++) {
      moonAngles.current[m] = Math.random() * Math.PI * 2;
      moonAngVel.current[m] = 0.55 / MOON_RADII[m];
      if (Math.random() > 0.5) moonAngVel.current[m] *= -1;
    }
    moonTilt.current = MOON_RADII.map(() => {
      const t = (Math.random() - 0.5) * 0.55;
      return { ct: Math.cos(t), st: Math.sin(t) };
    });
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetCursor.current.set(ndcX * halfW, ndcY * halfH, 0);
      if (!triggeredRef.current) {
        triggeredRef.current = true;
        saturnPos.current.copy(targetCursor.current);
      }
    }
    function onPointerDown(e: PointerEvent) {
      // Smash: arm the radial impulse at the cursor position.
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      impulseOrigin.current.set(ndcX * halfW, ndcY * halfH, 0);
      impulseRemaining.current = IMPULSE_DURATION_S;
      // First click also triggers the shatter if it hasn't fired.
      if (!triggeredRef.current) {
        triggeredRef.current = true;
        targetCursor.current.copy(impulseOrigin.current);
        saturnPos.current.copy(impulseOrigin.current);
      }
    }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    // Demo / capture mode: ?demo=1 auto-triggers the shatter after 800ms.
    // ?demo=2 also fires a smash at 4500ms (mid-impulse caught in a 5500ms
    // wait screenshot).
    const demoTimers: number[] = [];
    if (typeof window !== "undefined") {
      const demoFlag = new URLSearchParams(window.location.search).get("demo");
      if (demoFlag === "1" || demoFlag === "2") {
        demoTimers.push(
          window.setTimeout(() => {
            targetCursor.current.set(halfW * 0.35, halfH * -0.2, 0);
            triggeredRef.current = true;
            saturnPos.current.copy(targetCursor.current);
          }, 800),
        );
      }
      if (demoFlag === "2") {
        demoTimers.push(
          window.setTimeout(() => {
            impulseOrigin.current.set(halfW * 0.35, halfH * -0.2, 0);
            impulseRemaining.current = IMPULSE_DURATION_S;
          }, 4500),
        );
      }
    }

    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      demoTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [gl, halfW, halfH]);

  useFrame((state, dt) => {
    const dtClamped = Math.min(dt, 0.05);

    if (triggeredRef.current) {
      mixRef.current = Math.min(1, mixRef.current + dtClamped * MIX_RATE);
    }
    const mix = mixRef.current;

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

    const wobblePhase = state.clock.elapsedTime;

    // Decay smash impulse
    if (impulseRemaining.current > 0) {
      impulseRemaining.current -= dtClamped;
    }
    const impulseActive = impulseRemaining.current > 0;
    // Eased peak: ramps up then fades. Strongest at half-life.
    const impulseProgress = impulseActive
      ? impulseRemaining.current / IMPULSE_DURATION_S
      : 0;
    const impulsePower = impulseActive
      ? IMPULSE_STRENGTH * 4 * impulseProgress * (1 - impulseProgress)
      : 0;
    const imOx = impulseOrigin.current.x;
    const imOy = impulseOrigin.current.y;
    const imR2 = IMPULSE_RADIUS * IMPULSE_RADIUS;

    for (let i = 0; i < N_TOTAL; i++) {
      const ix = i * 3;
      const px = positions[ix];
      const py = positions[ix + 1];
      const pz = positions[ix + 2];
      const ppx = prev[ix];
      const ppy = prev[ix + 1];
      const ppz = prev[ix + 2];

      const wobX =
        Math.sin(wobblePhase * 0.6 + i * 0.011) * 0.006 * (1 - mix);
      const wobY =
        Math.cos(wobblePhase * 0.5 + i * 0.017) * 0.006 * (1 - mix);
      const wx = data.wall[ix] + wobX;
      const wy = data.wall[ix + 1] + wobY;
      const wz = data.wall[ix + 2];

      const ox = data.offsets[ix];
      const oy = data.offsets[ix + 1];
      const oz = data.offsets[ix + 2];

      const t = data.types[i];
      let lx: number;
      let ly: number;
      let lz: number;

      if (t === TYPE_TEXT) {
        lx = ox;
        ly = oy;
        lz = oz;
      } else if (t === TYPE_BODY) {
        lx = sx + ox;
        ly = sy + oy;
        lz = sz + oz;
      } else if (t === TYPE_RING) {
        const rx = ox * ringCt - oz * ringSt;
        const ry = oy;
        const rz = ox * ringSt + oz * ringCt;
        const ty = ry * ringTiltCt - rz * ringTiltSt;
        const tz = ry * ringTiltSt + rz * ringTiltCt;
        lx = sx + rx;
        ly = sy + ty;
        lz = sz + tz;
      } else {
        const m = data.moons[i];
        lx = moonCenters[m * 3 + 0] + ox;
        ly = moonCenters[m * 3 + 1] + oy;
        lz = moonCenters[m * 3 + 2] + oz;
      }

      const tx = wx + (lx - wx) * mix;
      const ty = wy + (ly - wy) * mix;
      const tz = wz + (lz - wz) * mix;

      let fx = (tx - px) * ANCHOR_K;
      let fy = (ty - py) * ANCHOR_K;
      let fz = (tz - pz) * ANCHOR_K;

      // Smash impulse: radial push from impulse origin (2D in screen plane)
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
      const vx = (px - ppx) * DAMPING;
      const vy = (py - ppy) * DAMPING;
      const vz = (pz - ppz) * DAMPING;

      prev[ix] = px;
      prev[ix + 1] = py;
      prev[ix + 2] = pz;
      positions[ix] = px + vx + fx;
      positions[ix + 1] = py + vy + fy;
      positions[ix + 2] = pz + vz + fz;
    }

    // Push to four separate InstancedMeshes
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

    writeRange(textMeshRef.current, RANGE_TEXT_START, N_TEXT);
    writeRange(bodyMeshRef.current, RANGE_BODY_START, N_BODY);
    writeRange(ringMeshRef.current, RANGE_RING_START, N_RING);
    writeRange(moonMeshRef.current, RANGE_MOON_START, N_MOON_TOTAL);
  });

  return (
    <>
      <instancedMesh ref={textMeshRef} args={[undefined, undefined, N_TEXT]}>
        <sphereGeometry args={[RADIUS_TEXT, 10, 10]} />
        <meshBasicMaterial color={COLOR_TEXT} toneMapped={false} />
      </instancedMesh>

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

export function SaturnMarquee() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function mount() {
      setMounted(true);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(mount);
    } else {
      mount();
    }
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-ink">
      {mounted && (
        <Canvas
          camera={{ position: [0, 0, CAM_Z], fov: CAM_FOV_DEG }}
          style={{
            position: "absolute",
            inset: 0,
            cursor: "none",
          }}
          gl={{ alpha: false, antialias: true }}
        >
          <color attach="background" args={[BG_COLOR]} />
          <MarqueeField />
          <EffectComposer>
            <Bloom
              intensity={0.45}
              luminanceThreshold={0.5}
              luminanceSmoothing={0.6}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}
      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/25">
        move your mouse
      </p>
    </section>
  );
}
