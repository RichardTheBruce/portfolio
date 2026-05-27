"use client";

// VARIANT C: Hybrid mass + strings.
//
// 3,000 GPU-instanced quads (same physics as Variant A) PLUS a second pass that,
// every 8th frame, draws blue vector lines between the 1,500 nearest neighbor
// pairs that are within 60px of each other in CURRENT displaced position. The
// neighbor lines are not static: they emerge from particle dynamics. When the
// cursor pushes particles apart, the local neighbor links break and the field
// briefly thins out where the cursor is; when particles settle back, the links
// re-form. This produces the IMPORTANT_WAVE_OSCILLATION.jpg signature *emerging*
// from particle physics rather than being pre-baked.
//
// Performance: this variant pays for two things Variants A and B don't:
//   (1) reading back current particle positions for the neighbor search, OR
//   (2) running the neighbor search in the same shader space.
//
// We do option (2): the neighbor lines are rebuilt CPU-side every 8th frame.
// That's 3000 particles * O(grid bucket size) = ~24K candidate-pair checks per
// rebuild, which at 7.5 rebuilds/s (60fps / 8) is well under 200K ops/sec. CPU
// budget per second: a few ms total. Acceptable.
//
// The displaced positions used for neighbor search are the SHADER's idea of
// position. We replicate the shader's displacement formula CPU-side in
// `computeDisplacedPositions` so the neighbor search sees what the user sees.
// This is the source-of-truth shape; the alternative (reading GPU positions via
// pixel-readback or transform feedback) is more accurate but much slower.
//
// Source citations:
//   - Particle density target: Taste BABY/ImportantParticleWork5.png middle panel
//   - Emergent string signature: Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg
//   - Visual hybrid intent: SPEC.md § Council brief Variant C
//     "the site signature emerges from the particle dynamics. Highest compute, best art."

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { detectCapability, clampParticleCount, type CapabilityTier } from "@/lib/hero/capability";
import { sampleTextField, resampleTo } from "@/lib/hero/sample-text";
import { createMouseTracker, type MouseTracker } from "@/lib/hero/mouse-uniform";
import { COLOR, INK } from "@/lib/hero/palette";

export interface ParticleFieldProps {
  word: string;
  accentLetterIndex: number;
  reducedMotion: boolean;
}

const PARTICLE_COUNT_PREMIUM = 3000;
const MAX_NEIGHBOR_LINES_PREMIUM = 1500;
const NEIGHBOR_RADIUS_PX = 60;
const NEIGHBOR_RECOMPUTE_FRAMES = 8;
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 18000;
const SPRING_K = 6.0;
const BROWNIAN_AMPLITUDE = 0.15;
const FONT_SIZE_PX = 200;

// ---------- Particle (mass) pass ----------
// Reuses Variant A's vertex / fragment program. Inlined for self-contained file.

const particleVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec2 iTarget;
attribute float iLetter;
attribute float iSeed;

uniform vec2  uViewport;
uniform vec3  uMouse;
uniform float uTime;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uSpringK;
uniform float uBrownian;
uniform float uAccentIndex;
uniform float uReducedMotion;
uniform float uParticlePx;

varying float vAccent;
varying float vBrightness;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

void main() {
  vec2 rest = iTarget;
  vec2 displacement = vec2(0.0);

  if (uReducedMotion < 0.5) {
    vec2 brown = hash22(vec2(iSeed * 17.0, floor((uTime + iSeed * 100.0) * 12.0)));
    displacement += brown * uBrownian;

    vec2 toMouse = uMouse.xy - rest;
    float dist = length(toMouse);
    if (dist < uRepelRadius && uMouse.z > 0.001) {
      vec2 awayDir = -toMouse / max(dist, 0.001);
      float falloff = 1.0 - (dist / uRepelRadius);
      falloff = pow(falloff, 2.0);
      float strength = uRepelStrength / (dist * dist + 200.0);
      displacement += awayDir * strength * falloff * uMouse.z / uSpringK;
    }
  }

  vec2 finalPx = rest + displacement;
  vec2 ndc = (finalPx - uViewport * 0.5) / (uViewport * 0.5);
  ndc.y = -ndc.y;
  vec2 cornerPx = position.xy * uParticlePx;
  vec2 cornerNdc = cornerPx / (uViewport * 0.5);
  cornerNdc.y = -cornerNdc.y;
  gl_Position = vec4(ndc + cornerNdc, 0.0, 1.0);
  vAccent = (abs(iLetter - uAccentIndex) < 0.5) ? 1.0 : 0.0;
  vBrightness = 0.85 + 0.15 * sin(uTime * 1.3 + iSeed * 6.2831);
}
`;

const particleFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uBone;
uniform vec3 uAmber;
uniform float uTime;
uniform float uAccentPulseHz;
varying float vAccent;
varying float vBrightness;
void main() {
  vec3 color = uBone;
  if (vAccent > 0.5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 6.2831 * uAccentPulseHz);
    pulse = smoothstep(0.0, 1.0, pulse);
    color = mix(uBone, uAmber, pulse);
  }
  color *= vBrightness;
  gl_FragColor = vec4(color, 1.0);
}
`;

// ---------- Neighbor-line (string) pass ----------
// Lines are drawn in DEVICE pixel space using a fixed transform. We rebuild the
// LineSegments geometry every NEIGHBOR_RECOMPUTE_FRAMES on the CPU and upload.

const lineVertexShader = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform vec2 uViewport;
void main() {
  vec2 ndc = (position.xy - uViewport * 0.5) / (uViewport * 0.5);
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const lineFragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uString;
uniform vec3 uStringBright;
uniform float uTime;
uniform float uPulseHz;
void main() {
  // Subtle pulse so the line field breathes, syncing loosely with the accent pulse.
  float pulse = 0.45 + 0.15 * sin(uTime * 6.2831 * uPulseHz);
  vec3 color = mix(uString, uStringBright, pulse * 0.4);
  gl_FragColor = vec4(color, 0.42);
}
`;

// ---------- Component ----------

function HybridField({
  word,
  accentLetterIndex,
  reducedMotion,
  tier,
}: ParticleFieldProps & { tier: CapabilityTier }) {
  const { size, gl } = useThree();
  const particleMaterialRef = useRef<THREE.RawShaderMaterial>(null);
  const lineMaterialRef = useRef<THREE.RawShaderMaterial>(null);
  const lineGeometryRef = useRef<THREE.BufferGeometry>(null);
  const trackerRef = useRef<MouseTracker | null>(null);
  const frameCounter = useRef(0);

  const particleCount = useMemo(
    () => clampParticleCount(PARTICLE_COUNT_PREMIUM, tier),
    [tier],
  );
  const maxNeighborLines = useMemo(
    () => clampParticleCount(MAX_NEIGHBOR_LINES_PREMIUM, tier),
    [tier],
  );

  // Sample text + build target positions + seeds (same as Variant A).
  const [field, setField] = useState<ReturnType<typeof resampleTo> | null>(null);
  const seedsRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    let cancelled = false;
    const run = () => {
      const sampled = sampleTextField({
        width: size.width,
        height: size.height,
        word,
        fontSize: FONT_SIZE_PX,
        stride: 2,
      });
      if (cancelled) return;
      if (sampled.points.length === 0) {
        document.fonts.ready.then(run).catch(() => {});
        return;
      }
      const resampled = resampleTo(sampled, particleCount);
      const seeds = new Float32Array(particleCount);
      for (let i = 0; i < particleCount; i++) seeds[i] = Math.random();
      seedsRef.current = seeds;
      setField(resampled);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [size.width, size.height, word, particleCount]);

  useEffect(() => {
    const el = gl.domElement;
    trackerRef.current = createMouseTracker({ element: el, decayMs: 300 });
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, [gl]);

  // Particle geometry (instanced quads).
  const particleGeometry = useMemo(() => {
    if (!field || !seedsRef.current) return null;
    const geo = new THREE.InstancedBufferGeometry();
    const positions = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("iTarget", new THREE.InstancedBufferAttribute(field.positions, 2));

    const letterFloat = new Float32Array(field.letter.length);
    for (let i = 0; i < field.letter.length; i++) letterFloat[i] = field.letter[i];
    geo.setAttribute("iLetter", new THREE.InstancedBufferAttribute(letterFloat, 1));
    geo.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seedsRef.current, 1));
    geo.instanceCount = particleCount;
    return geo;
  }, [field, particleCount]);

  // Line geometry (rebuilt in tick). Allocate buffer once for max size.
  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxNeighborLines * 2 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxNeighborLines]);

  useEffect(() => {
    lineGeometryRef.current = lineGeometry;
  }, [lineGeometry]);

  // Materials.
  const particleMaterial = useMemo(() => {
    return new THREE.RawShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uViewport: { value: new THREE.Vector2(size.width, size.height) },
        uMouse: { value: new THREE.Vector3(-1e6, -1e6, 0) },
        uTime: { value: 0 },
        uRepelRadius: { value: REPEL_RADIUS_PX },
        uRepelStrength: { value: REPEL_STRENGTH },
        uSpringK: { value: SPRING_K },
        uBrownian: { value: BROWNIAN_AMPLITUDE },
        uAccentIndex: { value: accentLetterIndex },
        uReducedMotion: { value: reducedMotion ? 1 : 0 },
        uParticlePx: { value: 2.0 },
        uBone: { value: COLOR.bone },
        uAmber: { value: COLOR.amber },
        uAccentPulseHz: { value: 0.8 },
      },
    });
  }, [accentLetterIndex, reducedMotion, size.width, size.height]);

  const lineMaterial = useMemo(() => {
    return new THREE.RawShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uViewport: { value: new THREE.Vector2(size.width, size.height) },
        uString: { value: COLOR.string },
        uStringBright: { value: COLOR.stringBright },
        uTime: { value: 0 },
        uPulseHz: { value: 0.6 },
      },
    });
  }, [size.width, size.height]);

  // Replicate the shader's displacement formula on CPU so neighbor search uses
  // the same positions the user sees. Approximation: ignores Brownian time-jitter
  // (cosmetic) but includes repel under cursor.
  const computeDisplacedPositions = (
    targets: Float32Array,
    mouse: THREE.Vector3,
  ): Float32Array => {
    const out = new Float32Array(targets.length);
    const mx = mouse.x;
    const my = mouse.y;
    const presence = mouse.z;
    for (let i = 0; i < targets.length / 2; i++) {
      const rx = targets[i * 2];
      const ry = targets[i * 2 + 1];
      let dx = 0;
      let dy = 0;
      if (presence > 0.001) {
        const toMx = mx - rx;
        const toMy = my - ry;
        const dist = Math.sqrt(toMx * toMx + toMy * toMy);
        if (dist < REPEL_RADIUS_PX && dist > 0.001) {
          const awayX = -toMx / dist;
          const awayY = -toMy / dist;
          let falloff = 1 - dist / REPEL_RADIUS_PX;
          falloff = falloff * falloff;
          const strength = REPEL_STRENGTH / (dist * dist + 200);
          dx += (awayX * strength * falloff * presence) / SPRING_K;
          dy += (awayY * strength * falloff * presence) / SPRING_K;
        }
      }
      out[i * 2] = rx + dx;
      out[i * 2 + 1] = ry + dy;
    }
    return out;
  };

  // Spatial-bucketed neighbor pair search. Returns at most `maxPairs` edges,
  // each shorter than NEIGHBOR_RADIUS_PX. Each particle contributes at most ~2
  // edges so the line field doesn't bloom from a single dense cluster.
  const findNeighborPairs = (
    positions: Float32Array,
    maxPairs: number,
  ): { aIdx: number; bIdx: number }[] => {
    const cellSize = NEIGHBOR_RADIUS_PX;
    const buckets = new Map<string, number[]>();
    const n = positions.length / 2;
    const keyOf = (gx: number, gy: number) => `${gx}:${gy}`;
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(positions[i * 2] / cellSize);
      const gy = Math.floor(positions[i * 2 + 1] / cellSize);
      const k = keyOf(gx, gy);
      const b = buckets.get(k);
      if (b) b.push(i);
      else buckets.set(k, [i]);
    }

    const pairs: { aIdx: number; bIdx: number }[] = [];
    const usedCount = new Uint8Array(n);
    const MAX_PER_PARTICLE = 2;

    for (let i = 0; i < n && pairs.length < maxPairs; i++) {
      if (usedCount[i] >= MAX_PER_PARTICLE) continue;
      const ax = positions[i * 2];
      const ay = positions[i * 2 + 1];
      const gx = Math.floor(ax / cellSize);
      const gy = Math.floor(ay / cellSize);

      // Walk 3x3 buckets around (gx, gy).
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = keyOf(gx + dx, gy + dy);
          const b = buckets.get(k);
          if (!b) continue;
          for (let bi = 0; bi < b.length; bi++) {
            const j = b[bi];
            if (j <= i) continue; // each pair only once
            if (usedCount[j] >= MAX_PER_PARTICLE) continue;
            const bxp = positions[j * 2];
            const byp = positions[j * 2 + 1];
            const ddx = bxp - ax;
            const ddy = byp - ay;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < NEIGHBOR_RADIUS_PX * NEIGHBOR_RADIUS_PX && d2 > 4) {
              pairs.push({ aIdx: i, bIdx: j });
              usedCount[i]++;
              usedCount[j]++;
              if (usedCount[i] >= MAX_PER_PARTICLE) break;
              if (pairs.length >= maxPairs) break;
            }
          }
          if (usedCount[i] >= MAX_PER_PARTICLE) break;
          if (pairs.length >= maxPairs) break;
        }
        if (usedCount[i] >= MAX_PER_PARTICLE) break;
        if (pairs.length >= maxPairs) break;
      }
    }
    return pairs;
  };

  useEffect(() => {
    if (!particleMaterialRef.current) return;
    particleMaterialRef.current.uniforms.uViewport.value.set(size.width, size.height);
    if (lineMaterialRef.current) {
      lineMaterialRef.current.uniforms.uViewport.value.set(size.width, size.height);
    }
  }, [size.width, size.height]);

  useFrame((state, delta) => {
    if (!particleMaterialRef.current) return;
    const u = particleMaterialRef.current.uniforms;
    if (trackerRef.current) {
      trackerRef.current.tick(delta);
      u.uMouse.value.copy(trackerRef.current.uniform.value);
    }
    u.uTime.value = state.clock.elapsedTime;
    if (lineMaterialRef.current) {
      lineMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }

    // Rebuild neighbor lines every NEIGHBOR_RECOMPUTE_FRAMES frames. Skip if
    // reduced motion (lines stay static at rest positions, computed once).
    frameCounter.current = (frameCounter.current + 1) % NEIGHBOR_RECOMPUTE_FRAMES;
    if (frameCounter.current !== 0) return;
    if (reducedMotion) return;
    if (!field || !lineGeometryRef.current) return;

    const displaced = computeDisplacedPositions(
      field.positions,
      u.uMouse.value as THREE.Vector3,
    );
    const pairs = findNeighborPairs(displaced, maxNeighborLines);

    const linePos = lineGeometryRef.current.getAttribute("position") as THREE.BufferAttribute;
    const arr = linePos.array as Float32Array;
    for (let i = 0; i < pairs.length; i++) {
      const { aIdx, bIdx } = pairs[i];
      arr[i * 6 + 0] = displaced[aIdx * 2];
      arr[i * 6 + 1] = displaced[aIdx * 2 + 1];
      arr[i * 6 + 2] = 0;
      arr[i * 6 + 3] = displaced[bIdx * 2];
      arr[i * 6 + 4] = displaced[bIdx * 2 + 1];
      arr[i * 6 + 5] = 0;
    }
    linePos.needsUpdate = true;
    lineGeometryRef.current.setDrawRange(0, pairs.length * 2);
  });

  // Static line field for reduced-motion mode.
  useEffect(() => {
    if (!reducedMotion) return;
    if (!field || !lineGeometryRef.current) return;
    const pairs = findNeighborPairs(field.positions, maxNeighborLines);
    const linePos = lineGeometryRef.current.getAttribute("position") as THREE.BufferAttribute;
    const arr = linePos.array as Float32Array;
    for (let i = 0; i < pairs.length; i++) {
      const { aIdx, bIdx } = pairs[i];
      arr[i * 6 + 0] = field.positions[aIdx * 2];
      arr[i * 6 + 1] = field.positions[aIdx * 2 + 1];
      arr[i * 6 + 2] = 0;
      arr[i * 6 + 3] = field.positions[bIdx * 2];
      arr[i * 6 + 4] = field.positions[bIdx * 2 + 1];
      arr[i * 6 + 5] = 0;
    }
    linePos.needsUpdate = true;
    lineGeometryRef.current.setDrawRange(0, pairs.length * 2);
  }, [reducedMotion, field, maxNeighborLines]);

  if (!particleGeometry) return null;

  return (
    <>
      {/* Line field (behind particles) */}
      <lineSegments frustumCulled={false} renderOrder={0}>
        <primitive object={lineGeometry} attach="geometry" />
        <primitive object={lineMaterial} attach="material" ref={lineMaterialRef as never} />
      </lineSegments>
      {/* Particle field (in front) */}
      <mesh frustumCulled={false} renderOrder={1}>
        <primitive object={particleGeometry} attach="geometry" />
        <primitive object={particleMaterial} attach="material" ref={particleMaterialRef as never} />
      </mesh>
    </>
  );
}

export default function ParticleFieldVariantC({
  word,
  accentLetterIndex,
  reducedMotion,
}: ParticleFieldProps) {
  const [tier, setTier] = useState<CapabilityTier>("standard");
  const [resolvedReducedMotion, setResolvedReducedMotion] = useState(reducedMotion);

  useEffect(() => {
    const sig = detectCapability();
    setTier(sig.tier);
    setResolvedReducedMotion(reducedMotion || sig.reducedMotion);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      setResolvedReducedMotion(reducedMotion || e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [reducedMotion]);

  return (
    <div
      className="relative h-full w-full"
      style={{ background: INK }}
      aria-hidden
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: 1, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[INK]} />
        <HybridField
          word={word}
          accentLetterIndex={accentLetterIndex}
          reducedMotion={resolvedReducedMotion}
          tier={tier}
        />
      </Canvas>
    </div>
  );
}
