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

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Fullscreen-quad trick: plane vertices are at [-1, 1], assign directly
  // to clip space. No matrix multiplies, camera-independent.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uMouse;       // -1..1 NDC space
uniform vec2 uResolution;

// Classic Julia-turbulence caustic. Iteratively warp a coordinate by
// sinusoids of itself; the resulting interference pattern produces the
// bright filamentary lines you see at the bottom of a pool. Powering
// the output sharpens the lines.
float caustic(vec2 uv, float t) {
  vec2 p = uv;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    p.x += 0.55 / fi * sin(fi * p.y * 2.0 + t * 0.45 + 0.3 * fi);
    p.y += 0.55 / fi * cos(fi * p.x * 2.0 + t * 0.45 + 0.4 * fi);
  }
  float v = sin(p.x * 2.2 + p.y * 1.8) * 0.5 + 0.5;
  return pow(v, 5.0);
}

void main() {
  // Aspect-corrected world UV in [-1, 1] for the shorter axis.
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  // Mouse pulls the field toward it.
  vec2 p = uv * 2.4 + uMouse * 0.8;

  float c = caustic(p, uTime);

  // 3-stop palette: deep navy → amber → bone.
  vec3 colDeep  = vec3(0.030, 0.055, 0.090);
  vec3 colAmber = vec3(0.788, 0.490, 0.243);
  vec3 colBone  = vec3(0.961, 0.949, 0.925);

  // Base water tint (gentle gradient over the field) then bright filaments.
  float baseTint = caustic(p * 0.45, uTime * 0.6);
  vec3 col = mix(colDeep, colAmber * 0.55, baseTint);
  col = mix(col, colAmber, smoothstep(0.10, 0.55, c));
  col = mix(col, colBone,  smoothstep(0.55, 0.95, c));

  // Subtle radial vignette so the edges don't pop.
  float vig = smoothstep(1.5, 0.4, length(uv));
  col *= mix(0.78, 1.0, vig);

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
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: false }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <CausticPlane />
        <EffectComposer>
          <Bloom
            intensity={0.4}
            luminanceThreshold={0.7}
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
