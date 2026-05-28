"use client";

// Experiment 07: Galaxy spiral.
//
// ~12,000 stars distributed along two logarithmic spiral arms with a bright
// inner bulge. Inner stars rotate faster than outer stars (Keplerian-ish
// rotation, the same reason real galaxies have arms that wind tighter
// toward the center). Per-star brightness drives point size + alpha, so
// some stars read as bright cores and some as faint dust. Depth jitter
// gives small-scale parallax for 3D feel. Additive blending + Bloom.
//
// All math is computed once at mount (seeding) plus a vertex-shader
// rotation per frame. No CPU loop, no state. Stateless and cheap.
//
// Stack: same as CurlNoiseField. ShaderMaterial + Bloom + orthographic
// Canvas + 1-unit-per-CSS-pixel camera.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const STAR_COUNT = 12000;
const N_ARMS = 2;
const MAX_RADIUS = 720;
const ARM_TWIST_PER_PX = 0.0055; // radians of spiral twist per pixel of radius
const RADIAL_JITTER_PX = 40;      // thickness of each arm
const ANGULAR_JITTER = 0.35;       // spread of stars around arm centerline
const DENSITY_EXPONENT = 1.3;      // r = u^1.3 → concentrates stars toward center
const DEPTH_RANGE = 35;            // z-axis jitter for parallax

const ROTATION_BASE_SPEED = 0.55; // bigger = faster overall galaxy rotation
const POINT_SIZE_PX = 1.6;
const POINT_ALPHA = 0.7;
const BG_COLOR = "#0A0A0B";

// Bone (warm white) at the bulge fading to a faint blue tint at the rim.
// Two endpoints; vertex shader picks one based on radius.
const COLOR_BULGE = new THREE.Color("#F5F2EC");
const COLOR_RIM = new THREE.Color("#9EB8DC");

const vertexShader = /* glsl */ `
  uniform float uPointSize;
  uniform float uAlpha;
  uniform float uTime;
  uniform float uRotationSpeed;
  uniform float uMaxRadius;
  uniform vec3 uColorBulge;
  uniform vec3 uColorRim;

  attribute float iBrightness;

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    // Per-star rotation around origin. Speed scales as 1/sqrt(r) so inner
    // stars whip around faster than outer stars (Keplerian intuition).
    float r = length(position.xy);
    float rotSpeed = uRotationSpeed / sqrt(max(r, 30.0));
    float angle = uTime * rotSpeed * 0.3;
    float c = cos(angle);
    float s = sin(angle);
    vec2 rotated = vec2(
      position.x * c - position.y * s,
      position.x * s + position.y * c
    );

    // Depth parallax: stars closer to camera (positive z) render slightly
    // larger. Subtle 3D feel without real depth sorting.
    float depthMult = 1.0 + position.z / 80.0;
    gl_PointSize = uPointSize * depthMult * (0.5 + iBrightness * 1.4);

    // Color tint from bulge (warm) to rim (cool) by normalized radius.
    float rNorm = clamp(r / uMaxRadius, 0.0, 1.0);
    vColor = mix(uColorBulge, uColorRim, smoothstep(0.2, 1.0, rNorm));
    vAlpha = uAlpha * iBrightness;

    vec4 mvPosition = modelViewMatrix * vec4(rotated, position.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float d = length(coord);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.38, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

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

// Cheap gaussian approximation: sum of 4 uniforms minus the mean. Gives a
// soft bell curve without the cost of Box-Muller.
function pseudoGaussian(): number {
  return Math.random() + Math.random() + Math.random() + Math.random() - 2;
}

function GalaxyField() {
  // Seed positions and per-star brightness once. Everything else (rotation,
  // depth scaling, color tint) is computed in the vertex shader per frame.
  const { positions, brightness } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const brightness = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Logarithmic spiral. Radius is u^DENSITY_EXPONENT (smaller exponent
      // = more uniform; larger = more bulge concentration).
      const u = Math.random();
      const r = Math.pow(u, DENSITY_EXPONENT) * MAX_RADIUS;

      // Assign to one of N_ARMS, then add a twist that grows with radius
      // (this is what makes the arms wind outward).
      const armIdx = i % N_ARMS;
      const baseArmAngle = (armIdx / N_ARMS) * Math.PI * 2;
      const twist = r * ARM_TWIST_PER_PX;

      // Jitter for arm thickness. Angular jitter shrinks with r so inner
      // arms look tight and outer arms look diffuse.
      const radialJitter = pseudoGaussian() * RADIAL_JITTER_PX;
      const angularJitter =
        (pseudoGaussian() * ANGULAR_JITTER) / Math.max(r / 100, 1);

      const finalR = r + radialJitter;
      const finalAngle = baseArmAngle + twist + angularJitter;

      positions[i * 3] = Math.cos(finalAngle) * finalR;
      positions[i * 3 + 1] = Math.sin(finalAngle) * finalR;
      positions[i * 3 + 2] = pseudoGaussian() * (DEPTH_RANGE / 2);

      // Brightness: bulge stars are brighter. Add some randomness so it
      // doesn't look like a strict gradient.
      brightness[i] =
        Math.max(0.3, 1 - r / MAX_RADIUS * 0.7) * (0.6 + Math.random() * 0.5);
    }
    return { positions, brightness };
  }, []);

  const material = useMemo(() => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPointSize: { value: POINT_SIZE_PX * dpr },
        uAlpha: { value: POINT_ALPHA },
        uTime: { value: 0 },
        uRotationSpeed: { value: ROTATION_BASE_SPEED },
        uMaxRadius: { value: MAX_RADIUS },
        uColorBulge: { value: COLOR_BULGE },
        uColorRim: { value: COLOR_RIM },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <points ref={pointsRef} material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-iBrightness" args={[brightness, 1]} />
      </bufferGeometry>
    </points>
  );
}

export function GalaxySpiral({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <ScreenPixelCamera />
        <GalaxyField />
        <EffectComposer>
          <Bloom
            intensity={1.6}
            luminanceThreshold={0.08}
            luminanceSmoothing={0.65}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">{meta}</p>
      </div>
    </section>
  );
}
