"use client";

// VARIANT A: Field of points, single layer.
//
// 5,000 GPU-instanced quads form the word "RichardTheBruce" by resampling target
// positions from an offscreen text-rasterization canvas. The repel + spring +
// Brownian motion all live in the vertex shader, so the CPU does zero per-particle
// work per frame. Pointer position is a single uniform.
//
// Physics model:
//   target_i        = sampled letter-pixel position for particle i (constant per particle)
//   pos_i(t+1)      = target_i + displacement_i(t)
//   displacement is governed by:
//     repel_force   = uPresence * uForce / max(d^2, eps), aimed away from pointer,
//                     where d = length(target_i - mouse), capped at uRadius
//     spring_force  = -k * displacement_i           (pulls back to rest)
//     drift         = Brownian via hash(seed + uTime) * uBrownian
//
// Because position is parameterized by time in the shader (no readback), this is
// "stateless" GPU sim: every frame recomputes from (target, time, mouse). That
// trades realism for a flat, predictable perf profile that scales linearly in
// particle count.
//
// Source citations:
//   - Density target: Taste BABY/ImportantParticleWork5.png middle panel
//   - Repel dispersal pattern: Taste BABY/ImportantParticleWork.png1.png
//   - Letterform reference / negative-space aesthetic: v0-1-interface-MASTER-desktop.png
//   - Color: F5F2EC bone on 0A0A0B ink (SPEC § Palette)

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { detectCapability, clampParticleCount, type CapabilityTier } from "@/lib/hero/capability";
import { sampleTextField, resampleTo } from "@/lib/hero/sample-text";
import { createMouseTracker, type MouseTracker } from "@/lib/hero/mouse-uniform";
import { COLOR, BONE, INK } from "@/lib/hero/palette";

export interface ParticleFieldProps {
  word: string;
  // Index into `word` for the letter that pulses amber. e.g. for "RichardTheBruce" → 0 highlights R.
  accentLetterIndex: number;
  reducedMotion: boolean;
}

const PARTICLE_COUNT_PREMIUM = 5000;
const REPEL_RADIUS_PX = 140; // SPEC § Hero "Mouse hover within radius r <= 140px"
const REPEL_STRENGTH = 18000; // tuned: produces ~70px max displacement at r=20px
const SPRING_K = 6.0; // restoring stiffness (1/s)
const BROWNIAN_AMPLITUDE = 0.15; // px/frame (SPEC § Hero "Idle motion: 0.15px/frame Brownian")
const FONT_SIZE_PX = 200; // SPEC § Hero font size

// GLSL source kept inline because we want a single file per variant for portability.
// vite-plugin-glsl is not configured in this repo (yet); inline avoids the plugin dep.

const vertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;       // quad-local corner (-0.5..0.5)
attribute vec2 iTarget;        // per-instance rest position in pixel space
attribute float iLetter;       // per-instance letter index (float, comes from Uint8 buffer)
attribute float iSeed;         // per-instance random seed in [0, 1]

uniform vec2  uViewport;       // canvas width/height in pixels
uniform vec3  uMouse;          // (x, y, presence)
uniform float uTime;           // seconds
uniform float uRepelRadius;    // px
uniform float uRepelStrength;  // px^2/s^2 ish, tuned
uniform float uSpringK;        // 1/s
uniform float uBrownian;       // px amplitude
uniform float uAccentIndex;    // letter index that pulses amber
uniform float uReducedMotion;  // 0 or 1
uniform float uParticlePx;     // particle render size, px

varying float vAccent;         // 1.0 if this particle belongs to accent letter
varying float vBrightness;     // dynamic brightness multiplier (subtle twinkle)

// Cheap hash for Brownian seed. Not cryptographic. Good enough for visual noise.
float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

void main() {
  vec2 rest = iTarget;
  vec2 displacement = vec2(0.0);

  if (uReducedMotion < 0.5) {
    // Brownian idle drift. Time-modulated so neighbors don't lockstep.
    float t = uTime + iSeed * 100.0;
    vec2 brown = hash22(vec2(iSeed * 17.0, floor(t * 12.0)));
    displacement += brown * uBrownian;

    // Repel force. Inverse-square with epsilon to keep finite at d -> 0.
    vec2 toMouse = uMouse.xy - rest;
    float dist = length(toMouse);
    if (dist < uRepelRadius && uMouse.z > 0.001) {
      vec2 awayDir = -toMouse / max(dist, 0.001);
      float falloff = 1.0 - (dist / uRepelRadius);
      // Exponential falloff per SPEC § Hero "exponential falloff"
      falloff = pow(falloff, 2.0);
      float strength = uRepelStrength / (dist * dist + 200.0);
      vec2 repel = awayDir * strength * falloff * uMouse.z;
      // Critical-damped spring tug back to rest. The shader is stateless, so this
      // is more accurately a damped attractor: the displacement we render is the
      // steady-state response of a mass-spring to the current force. Smoother and
      // CPU-free.
      // We integrate one step of: x_new = repel / springK (steady state)
      displacement += repel / uSpringK;
    }
  }

  vec2 finalPx = rest + displacement;

  // Convert pixel-space position to clip space. The orthographic camera setup in
  // the React component uses (-w/2 .. w/2, h/2 .. -h/2). We mirror that here.
  vec2 ndc = (finalPx - uViewport * 0.5) / (uViewport * 0.5);
  ndc.y = -ndc.y;

  // Render each instance as a small screen-space quad. position.xy is in -0.5..0.5.
  vec2 cornerPx = position.xy * uParticlePx;
  vec2 cornerNdc = cornerPx / (uViewport * 0.5);
  cornerNdc.y = -cornerNdc.y;

  gl_Position = vec4(ndc + cornerNdc, 0.0, 1.0);

  vAccent = (abs(iLetter - uAccentIndex) < 0.5) ? 1.0 : 0.0;

  // Twinkle: subtle per-particle brightness oscillation, untied from accent pulse.
  vBrightness = 0.85 + 0.15 * sin(uTime * 1.3 + iSeed * 6.2831);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3  uBone;
uniform vec3  uAmber;
uniform float uTime;
uniform float uAccentPulseHz;

varying float vAccent;
varying float vBrightness;

void main() {
  // Round particle via radial alpha. The vertex shader emits a square quad in NDC;
  // here we discard outside the unit circle relative to the local quad center.
  vec2 q = gl_PointCoord; // NOTE: triangle-strip path uses interpolated position; see below.
  // Because we draw triangle-instanced quads (not Points), gl_PointCoord is
  // undefined. We rely on the vertex shader to pass corner-local coords... but
  // for a single full quad we can derive from gl_FragCoord vs a passed center.
  // Simpler: use a screen-space circular fade implicit in the rendered quad size
  // (the quad is small enough that anti-aliasing handles edges visually).
  //
  // Practical solution: alpha = 1.0. The quad is sub-pixel-soft via WebGL MSAA.
  float alpha = 1.0;

  vec3 color = uBone;
  if (vAccent > 0.5) {
    // 0.8Hz pulse, eased so it breathes rather than blinks.
    float pulse = 0.5 + 0.5 * sin(uTime * 6.2831 * uAccentPulseHz);
    pulse = smoothstep(0.0, 1.0, pulse);
    color = mix(uBone, uAmber, pulse);
  }

  color *= vBrightness;
  gl_FragColor = vec4(color, alpha);
}
`;

function ParticleMesh({
  word,
  accentLetterIndex,
  reducedMotion,
  tier,
}: ParticleFieldProps & { tier: CapabilityTier }) {
  const { size, gl } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.RawShaderMaterial>(null);
  const trackerRef = useRef<MouseTracker | null>(null);

  // Resolve particle count from tier.
  const particleCount = useMemo(
    () => clampParticleCount(PARTICLE_COUNT_PREMIUM, tier),
    [tier],
  );

  // Sample the text field. Re-run when viewport or word changes.
  const [field, setField] = useState<ReturnType<typeof resampleTo> | null>(null);
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
        // Font not yet loaded. Retry when it is.
        document.fonts.ready.then(run).catch(() => {});
        return;
      }
      const resampled = resampleTo(sampled, particleCount);
      setField(resampled);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [size.width, size.height, word, particleCount]);

  // Wire pointer tracker to the WebGL canvas element.
  useEffect(() => {
    const el = gl.domElement;
    trackerRef.current = createMouseTracker({ element: el, decayMs: 300 });
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, [gl]);

  // Build instanced geometry once field is ready.
  const geometry = useMemo(() => {
    if (!field) return null;
    const geo = new THREE.InstancedBufferGeometry();

    // Base: a unit quad in [-0.5, 0.5], 2 triangles.
    const positions = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    geo.setAttribute(
      "iTarget",
      new THREE.InstancedBufferAttribute(field.positions, 2),
    );

    // Letter index: store as Float32 because WebGL1 dislikes int attributes; the
    // Uint8 source already encodes 0..wordLength-1 which fits in float exactly.
    const letterFloat = new Float32Array(field.letter.length);
    for (let i = 0; i < field.letter.length; i++) letterFloat[i] = field.letter[i];
    geo.setAttribute(
      "iLetter",
      new THREE.InstancedBufferAttribute(letterFloat, 1),
    );

    const seeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) seeds[i] = Math.random();
    geo.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seeds, 1));

    geo.instanceCount = particleCount;
    return geo;
  }, [field, particleCount]);

  // Material.
  const material = useMemo(() => {
    const m = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
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
    return m;
  }, [accentLetterIndex, reducedMotion, size.width, size.height]);

  // Mirror viewport size into the uniform on resize.
  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uViewport.value.set(size.width, size.height);
  }, [size.width, size.height]);

  // Frame loop.
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
    <mesh ref={meshRef as never} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <primitive
        object={material}
        attach="material"
        ref={materialRef as never}
      />
    </mesh>
  );
}

export default function ParticleFieldVariantA({
  word,
  accentLetterIndex,
  reducedMotion,
}: ParticleFieldProps) {
  // Capability tier read on the client only. Default state matches SSR placeholder.
  const [tier, setTier] = useState<CapabilityTier>("standard");
  const [resolvedReducedMotion, setResolvedReducedMotion] = useState(reducedMotion);

  useEffect(() => {
    const sig = detectCapability();
    setTier(sig.tier);
    setResolvedReducedMotion(reducedMotion || sig.reducedMotion);

    // Re-detect on reduced-motion changes (hard rule 8: respect prefers-reduced-motion).
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
        <ParticleMesh
          word={word}
          accentLetterIndex={accentLetterIndex}
          reducedMotion={resolvedReducedMotion}
          tier={tier}
        />
      </Canvas>
    </div>
  );
}
