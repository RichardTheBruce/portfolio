"use client";

// VARIANT B: Field of strings, micro-segments.
//
// 1,200 short line segments (each ~4px) form the word "RichardTheBruce" by anchoring
// each segment's two endpoints to two nearby points sampled from the same offscreen-
// canvas text field as Variant A. The result is a micro-scale version of Richard's
// blue-vector-intercession-star reference (IMPORTANT_WAVE_OSCILLATION.jpg): thin
// linear strokes, sharp endpoints, dark canvas.
//
// Endpoints move under the same repel + spring physics as Variant A's particles.
// They live in a single THREE.LineSegments draw call (one draw, 2400 vertices), so
// even though we have "two particles per visible segment," the GPU cost is one
// vertex shader invocation per endpoint and one fragment shader pass for the line
// rasterization. Total perf: comparable to Variant A's 5000-particle case but with
// fewer endpoints (2400) at the cost of LineSegments being a slightly less
// efficient primitive than instanced quads on some GPUs.
//
// Physics: per-endpoint repel + spring identical to Variant A. The segments don't
// stretch independently; each endpoint relaxes to its own rest, so the segment
// stretches and compresses as the field deforms. This is the desired behavior:
// you see the strings stretch toward the cursor like Richard's wave-oscillation.
//
// Color choice: bone (--bone) for the segments so they read as "RichardTheBruce"
// in the same monochrome register as Variant A. When the pointer is within repel
// radius, the displaced segments tint toward --string (#1E96E6) to invoke the
// blue-vector signature without making the entire field blue at rest.
//
// Source citations:
//   - Visual signature: Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg (the blue vector
//     intercession stars at full scale; this variant is the same idea at micro scale)
//   - Letterform sampling: same as Variant A — Cormorant Garamond Bold 200px
//   - Dispersal under force: Taste BABY/ImportantParticleWork.png1.png

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

const SEGMENT_COUNT_PREMIUM = 1200;
const SEGMENT_TARGET_LENGTH_PX = 4; // visible segment length at rest
const SEGMENT_LENGTH_TOLERANCE_PX = 6; // tolerate larger spans during search
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 16000;
const SPRING_K = 6.0;
const BROWNIAN_AMPLITUDE = 0.12; // slightly less than A — strings read cleaner when calmer
const FONT_SIZE_PX = 200;

const vertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;       // (x, y, endpointTag) — endpointTag is 0 for A-end, 1 for B-end
attribute vec2 aRestA;         // segment A-end rest position (pixel space)
attribute vec2 aRestB;         // segment B-end rest position (pixel space)
attribute float aSeed;
attribute float aLetter;       // letter index of midpoint, used for accent tinting

uniform vec2  uViewport;
uniform vec3  uMouse;
uniform float uTime;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uSpringK;
uniform float uBrownian;
uniform float uReducedMotion;
uniform float uAccentIndex;

varying float vAccent;
varying float vRepelStrength; // 0..1, how much this endpoint is being pushed

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

vec2 displaceEndpoint(vec2 rest, float seed) {
  vec2 displacement = vec2(0.0);
  if (uReducedMotion > 0.5) return displacement;

  vec2 brown = hash22(vec2(seed * 17.0, floor((uTime + seed * 100.0) * 10.0)));
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
  return displacement;
}

void main() {
  float endpointTag = position.z;
  vec2 rest = (endpointTag < 0.5) ? aRestA : aRestB;
  // Use a slightly different seed per endpoint so they don't share Brownian drift.
  float endpointSeed = aSeed + endpointTag * 0.37;
  vec2 displacement = displaceEndpoint(rest, endpointSeed);
  vec2 finalPx = rest + displacement;

  vec2 ndc = (finalPx - uViewport * 0.5) / (uViewport * 0.5);
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  vAccent = (abs(aLetter - uAccentIndex) < 0.5) ? 1.0 : 0.0;
  vRepelStrength = clamp(length(displacement) / 50.0, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3  uBone;
uniform vec3  uString;        // blue, --string
uniform vec3  uStringBright;  // bright blue, --string-bright
uniform vec3  uAmber;
uniform float uTime;
uniform float uAccentPulseHz;

varying float vAccent;
varying float vRepelStrength;

void main() {
  // Default: thin bone-colored line.
  vec3 color = uBone;

  // Where the field is actively repelling, lerp into blue. This is what calls
  // back the IMPORTANT_WAVE_OSCILLATION.jpg signature: strings appear blue exactly
  // where they're under tension.
  color = mix(color, uString, vRepelStrength);
  color = mix(color, uStringBright, vRepelStrength * vRepelStrength * 0.7);

  if (vAccent > 0.5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 6.2831 * uAccentPulseHz);
    pulse = smoothstep(0.0, 1.0, pulse);
    color = mix(color, uAmber, pulse * 0.65);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

interface SegmentField {
  endpointsA: Float32Array; // per-segment endpoint A (x, y)
  endpointsB: Float32Array; // per-segment endpoint B (x, y)
  letterIndex: Uint8Array; // letter index of the segment midpoint
  count: number;
}

// Pair sampled points into segments. We use a grid-bucketed nearest-neighbor
// search bounded to SEGMENT_LENGTH_TOLERANCE_PX so the segments stay short.
function buildSegments(
  field: ReturnType<typeof resampleTo>,
  letter: Uint8Array,
  count: number,
): SegmentField {
  const n = field.positions.length / 2;
  const cellSize = SEGMENT_LENGTH_TOLERANCE_PX;
  // Grid bucket lookup.
  const buckets = new Map<string, number[]>();
  const keyOf = (gx: number, gy: number) => `${gx}:${gy}`;
  for (let i = 0; i < n; i++) {
    const x = field.positions[i * 2];
    const y = field.positions[i * 2 + 1];
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    const k = keyOf(gx, gy);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }

  const endpointsA = new Float32Array(count * 2);
  const endpointsB = new Float32Array(count * 2);
  const letterOut = new Uint8Array(count);
  let written = 0;
  let cursor = 0;
  while (written < count && cursor < n * 4) {
    const i = Math.floor(Math.random() * n);
    const ax = field.positions[i * 2];
    const ay = field.positions[i * 2 + 1];
    const gx = Math.floor(ax / cellSize);
    const gy = Math.floor(ay / cellSize);

    let best = -1;
    let bestDist = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = keyOf(gx + dx, gy + dy);
        const b = buckets.get(k);
        if (!b) continue;
        for (let j = 0; j < b.length; j++) {
          const cand = b[j];
          if (cand === i) continue;
          const cx = field.positions[cand * 2];
          const cy = field.positions[cand * 2 + 1];
          const ddx = cx - ax;
          const ddy = cy - ay;
          const d2 = ddx * ddx + ddy * ddy;
          const d = Math.sqrt(d2);
          // Pick a candidate that's near the target segment length.
          const err = Math.abs(d - SEGMENT_TARGET_LENGTH_PX);
          if (err < bestDist && d > 1.0) {
            bestDist = err;
            best = cand;
          }
        }
      }
    }

    cursor++;
    if (best < 0) continue;

    endpointsA[written * 2] = ax;
    endpointsA[written * 2 + 1] = ay;
    endpointsB[written * 2] = field.positions[best * 2];
    endpointsB[written * 2 + 1] = field.positions[best * 2 + 1];
    letterOut[written] = letter[i];
    written++;
  }

  return {
    endpointsA,
    endpointsB,
    letterIndex: letterOut,
    count: written,
  };
}

function SegmentField({
  word,
  accentLetterIndex,
  reducedMotion,
  tier,
}: ParticleFieldProps & { tier: CapabilityTier }) {
  const { size, gl } = useThree();
  const materialRef = useRef<THREE.RawShaderMaterial>(null);
  const trackerRef = useRef<MouseTracker | null>(null);

  const segmentCount = useMemo(
    () => clampParticleCount(SEGMENT_COUNT_PREMIUM, tier),
    [tier],
  );

  const [segments, setSegments] = useState<SegmentField | null>(null);

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
      // Resample to a richer pool so segment pairing has options.
      const pool = resampleTo(sampled, segmentCount * 6);
      const built = buildSegments(pool, pool.letter, segmentCount);
      setSegments(built);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [size.width, size.height, word, segmentCount]);

  useEffect(() => {
    const el = gl.domElement;
    trackerRef.current = createMouseTracker({ element: el, decayMs: 300 });
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, [gl]);

  const geometry = useMemo(() => {
    if (!segments) return null;
    const n = segments.count;
    const geo = new THREE.BufferGeometry();

    // For LineSegments we need 2 vertices per visible line.
    const positions = new Float32Array(n * 2 * 3);
    const restA = new Float32Array(n * 2 * 2);
    const restB = new Float32Array(n * 2 * 2);
    const seeds = new Float32Array(n * 2);
    const letters = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      const seed = Math.random();
      const letter = segments.letterIndex[i];
      // Vertex 0: endpointTag = 0 → reads aRestA
      positions[i * 6 + 0] = 0;
      positions[i * 6 + 1] = 0;
      positions[i * 6 + 2] = 0; // tag = 0 (A-end)
      // Vertex 1: endpointTag = 1 → reads aRestB
      positions[i * 6 + 3] = 0;
      positions[i * 6 + 4] = 0;
      positions[i * 6 + 5] = 1; // tag = 1 (B-end)

      const ax = segments.endpointsA[i * 2];
      const ay = segments.endpointsA[i * 2 + 1];
      const bx = segments.endpointsB[i * 2];
      const by = segments.endpointsB[i * 2 + 1];

      // Both endpoints share aRestA and aRestB; vertex shader selects via tag.
      restA[i * 4 + 0] = ax;
      restA[i * 4 + 1] = ay;
      restA[i * 4 + 2] = ax;
      restA[i * 4 + 3] = ay;

      restB[i * 4 + 0] = bx;
      restB[i * 4 + 1] = by;
      restB[i * 4 + 2] = bx;
      restB[i * 4 + 3] = by;

      seeds[i * 2 + 0] = seed;
      seeds[i * 2 + 1] = seed;
      letters[i * 2 + 0] = letter;
      letters[i * 2 + 1] = letter;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRestA", new THREE.BufferAttribute(restA, 2));
    geo.setAttribute("aRestB", new THREE.BufferAttribute(restB, 2));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aLetter", new THREE.BufferAttribute(letters, 1));
    return geo;
  }, [segments]);

  const material = useMemo(() => {
    return new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
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
        uBone: { value: COLOR.bone },
        uString: { value: COLOR.string },
        uStringBright: { value: COLOR.stringBright },
        uAmber: { value: COLOR.amber },
        uAccentPulseHz: { value: 0.8 },
      },
    });
  }, [accentLetterIndex, reducedMotion, size.width, size.height]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uViewport.value.set(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    const u = materialRef.current.uniforms;
    if (trackerRef.current) {
      trackerRef.current.tick(delta);
      u.uMouse.value.copy(trackerRef.current.uniform.value);
    }
    u.uTime.value = state.clock.elapsedTime;
  });

  if (!geometry) return null;

  return (
    <lineSegments frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" ref={materialRef as never} />
    </lineSegments>
  );
}

export default function ParticleFieldVariantB({
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
        <SegmentField
          word={word}
          accentLetterIndex={accentLetterIndex}
          reducedMotion={resolvedReducedMotion}
          tier={tier}
        />
      </Canvas>
    </div>
  );
}
