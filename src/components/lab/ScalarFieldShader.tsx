"use client";

// Experiment 08: GPU scalar field — domain-warped FBM, mouse-seeded.
//
// No particles. A single full-screen quad. The fragment shader evaluates a
// math function at every pixel and outputs a color based on the value. The
// function: domain-warped fractal Brownian motion (FBM), Inigo Quilez's
// canonical recipe. We sample noise, then sample noise at a position warped
// by the first sample, then sample again at a position warped by THAT.
// The recursion produces fluid, organic, never-repeating patterns. Mouse
// position perturbs the second warp so the field shifts under your cursor.
//
// This is the "GPU does the math" version of the old Canvas 2D ScalarField.
// Every pixel runs the whole shader independently. At 1920×1080 that's ~2M
// pixels × ~15 noise calls × 60fps. Trivial on any modern GPU.
//
// Stack:
//   - Fullscreen plane (planeGeometry 2x2 in clip space)
//   - Custom vertex shader does NO transform (gl_Position = position.xy)
//   - Custom fragment shader does the whole math viz
//   - No postprocessing — the shader IS the visual

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BG_COLOR = "#0A0A0B";

// Three-stop colormap from low to high value. Brand-aligned palette:
// dark navy at the troughs, deep amber in the midtones, bone at the peaks.
const COLOR_A = new THREE.Color("#0F1428");
const COLOR_B = new THREE.Color("#8A5128");
const COLOR_C = new THREE.Color("#F5F2EC");

const vertexShader = /* glsl */ `
  // Skip all transforms. position.xy is already in clip space [-1, 1]
  // because we use a planeGeometry(2, 2). The fragment shader gets to
  // see every pixel of the canvas.
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  // Stefan Gustavson's 2D simplex noise.
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                     + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0),
                            dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractal Brownian Motion: sum N octaves of noise at doubling frequency
  // and halving amplitude. Standard recipe for "richer than plain noise"
  // detail. 5 octaves = good balance between richness and shader cost.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      sum += amp * snoise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return sum;
  }

  void main() {
    // Convert fragment coord to centered, aspect-corrected coordinates in
    // [-aspect, aspect] × [-1, 1].
    vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    // Inigo Quilez domain warping. Sample noise q. Sample noise at a point
    // warped by q to get r. Sample noise at a point warped by r to get the
    // final scalar. Each level of warping adds organic distortion.
    vec2 q = vec2(
      fbm(uv * 0.8 + vec2(uTime * 0.05, 0.0)),
      fbm(uv * 0.8 + vec2(5.2, 1.3) + vec2(uTime * 0.05, 0.0))
    );
    vec2 r = vec2(
      fbm(uv * 0.8 + 4.0 * q + vec2(1.7, 9.2) + uMouse * 0.45),
      fbm(uv * 0.8 + 4.0 * q + vec2(8.3, 2.8) - uMouse * 0.45)
    );
    float f = fbm(uv * 0.8 + 4.0 * r);

    // Map scalar value to color via a 3-stop gradient. Smoothstep avoids
    // hard banding between stops.
    vec3 color = mix(uColorA, uColorB, smoothstep(-0.45, 0.15, f));
    color = mix(color, uColorC, smoothstep(0.1, 0.55, f));

    gl_FragColor = vec4(color, 1.0);
  }
`;

function ScalarQuad() {
  const { size, gl } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 },
        uColorA: { value: COLOR_A },
        uColorB: { value: COLOR_B },
        uColorC: { value: COLOR_C },
      },
      depthWrite: false,
      depthTest: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep uResolution synced with canvas size so the aspect-correction is
  // right after resize.
  useEffect(() => {
    material.uniforms.uResolution.value.set(size.width, size.height);
  }, [size, material]);

  // Track mouse in normalized [-1, 1] coords, y-up so it matches our UV.
  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouseRef.current.y = 1 - ((e.clientY - r.top) / r.height) * 2;
    }
    canvas.addEventListener("mousemove", onMove);
    return () => canvas.removeEventListener("mousemove", onMove);
  }, [gl]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uMouse.value.set(mouseRef.current.x, mouseRef.current.y);
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export function ScalarFieldShader({
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
        <ScalarQuad />
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">{meta}</p>
      </div>
    </section>
  );
}
