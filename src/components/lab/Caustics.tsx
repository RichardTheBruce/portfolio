"use client";

// Experiment 14: Underwater caustic light field.
//
// A fullscreen quad runs a fragment shader that simulates the dancing
// light patterns you see at the bottom of a swimming pool. The core
// trick: sample two octaves of moving simplex noise, take the gradient,
// compute |grad|^2, and band the result through a sharp falloff. That
// gives the bright filamentary lines.
//
// Cursor position is fed as a 2D uniform and warps the noise sampling
// — moving the cursor stretches the caustic field toward it, like a
// light source migrating across the water surface.
//
// Pure shader, no CPU particles, no physics. Reads as "cosmic water"
// on the amber + bone palette.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BG_COLOR = "#050608";

// Stefan Gustavson simplex noise (the same 30-line GLSL we use in the
// curl noise field). Public domain.
const SIMPLEX = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uMouse;       // -1..1 NDC space
uniform vec2 uResolution;

${SIMPLEX}

// Two-octave moving noise. The gradient of this gives the "light beam"
// direction. Caustics are where the gradient is small but the second
// derivative is large — we approximate by taking |grad|^2 and inverting.
float field(vec2 p) {
  float n1 = snoise(p * 1.4 + vec2(uTime * 0.10, uTime * 0.07));
  float n2 = snoise(p * 2.8 - vec2(uTime * 0.13, uTime * 0.09)) * 0.5;
  return n1 + n2;
}

void main() {
  // World UV centered at zero, aspect-corrected.
  vec2 uv = (vUv - 0.5);
  uv.x *= uResolution.x / uResolution.y;

  // Mouse pulls the field toward it: shift sample by mouse position.
  vec2 mouseWarp = uMouse * 0.5;
  vec2 p = uv * 2.0 + mouseWarp;

  // Sample field + tiny offsets to approximate gradient.
  float e = 0.012;
  float f  = field(p);
  float fx = field(p + vec2(e, 0.0));
  float fy = field(p + vec2(0.0, e));
  vec2  g  = vec2(fx - f, fy - f) / e;

  // Caustic strength: sharp falloff around where |grad| is small.
  float mag = length(g);
  float caustic = pow(1.0 / (1.0 + mag * mag * 1.8), 2.4);

  // Color: gradient through the brand palette.
  // Lower energy = deep navy, mid = amber, high = bone.
  vec3 colDeep   = vec3(0.040, 0.060, 0.080);
  vec3 colAmber  = vec3(0.788, 0.490, 0.243);
  vec3 colBone   = vec3(0.961, 0.949, 0.925);

  vec3 col = mix(colDeep, colAmber, smoothstep(0.10, 0.55, caustic));
  col = mix(col, colBone, smoothstep(0.65, 1.05, caustic));

  // Subtle radial vignette so the edges don't pop.
  float vig = smoothstep(1.05, 0.35, length(uv));
  col *= mix(0.85, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

function CausticPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, size } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [size.width, size.height],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      uniforms.uMouse.value.set(ndcX, ndcY);
    }
    const canvas = gl.domElement;
    canvas.addEventListener("pointermove", onMove);
    return () => canvas.removeEventListener("pointermove", onMove);
  }, [gl, uniforms]);

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uResolution.value.set(size.width, size.height);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Caustics({
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
        camera={{ position: [0, 0, 1], zoom: 1 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <CausticPlane />
        <EffectComposer>
          <Bloom
            intensity={0.6}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.5}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 max-w-[680px] text-[10px] text-bone/30">
          {meta}
        </p>
      </div>
      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
        move your mouse — the light bends with you
      </p>
    </section>
  );
}
