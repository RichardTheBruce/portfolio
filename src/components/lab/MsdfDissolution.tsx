"use client";

// Experiment 01: MSDF-style text dissolution.
//
// "MSDF" in the literature means multi-channel signed distance field — a way
// of storing crisp text edges in a texture. We're approximating the same idea
// with a simpler primitive: render the word to an offscreen canvas, sample
// every alpha-positive pixel as a particle anchor. ~5000 particles trace the
// letterforms. Cursor pushes particles apart (the "dissolve"). When the
// cursor leaves, the spring + damping carries each particle back to its
// anchor (the "reform"). Bloom on the bright bone particles.
//
// Stack:
//   - R3F orthographic Canvas (1 world unit = 1 CSS pixel, y-up, origin centered)
//   - PointsNodeMaterial via TSL: circle-masked, brand-bone color
//   - CPU Verlet physics in useFrame (5000 particles is trivial CPU; we'll
//     move to GPGPU compute when we push past 50k)
//   - @react-three/postprocessing Bloom

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const WORD = "Richard";
const FONT_SIZE_PX = 280;
const PARTICLE_TARGET = 5000;

// Physics knobs. We'll tune these once Richard sees them in motion.
const REST_SPRING_K = 0.04;      // spring stiffness back to anchor
const DAMPING = 0.92;             // friction
const REPEL_RADIUS_PX = 140;      // how far cursor influence reaches
const REPEL_STRENGTH = 6000;      // peak repel force at center
const REPEL_SOFT_FLOOR = 100;     // softening so repel doesn't blow up at zero

const POINT_SIZE_PX = 2.8;
const POINT_COLOR = 0xf5f2ec; // bone
const BG_COLOR = "#0A0A0B";   // ink

// Sample the word's letterforms into anchor positions. Origin-centered, y-up
// so the world coords match the orthographic camera below.
function sampleWordAnchors(word: string, fontPx: number, target: number): Float32Array {
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

  let inked = 0;
  for (let i = 3; i < img.length; i += 4) {
    if (img[i] > 128) inked++;
  }
  if (inked === 0) return new Float32Array(0);

  // Choose a stride so we land roughly at `target` particles.
  const stride = Math.max(1, Math.floor(Math.sqrt(inked / target)));
  const out: number[] = [];
  for (let y = 0; y < h && out.length / 3 < target; y += stride) {
    for (let x = 0; x < w && out.length / 3 < target; x += stride) {
      if (img[(y * w + x) * 4 + 3] > 128) {
        out.push(x - w / 2);
        out.push(-(y - h / 2));
        out.push(0);
      }
    }
  }
  return new Float32Array(out);
}

// Orthographic camera that maps 1 world unit to 1 CSS pixel, so all the
// physics constants above (in pixels) work directly. Origin at canvas center.
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

// Classic ShaderMaterial with raw GLSL. Circle-masked points with smoothstep
// anti-aliased edge. We're staying on this (instead of TSL/PointsNodeMaterial)
// because:
//   - Classic WebGLRenderer (what R3F uses by default) only accepts classic
//     materials. NodeMaterials from `three/webgpu` are not GLSL-compilable
//     without the WebGPURenderer's compiler.
//   - @react-three/postprocessing (Bloom etc.) is built against WebGLRenderer.
// When the WebGPU + postprocessing-v8 ecosystem catches up, we'll revisit.
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
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
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

function DotField({ anchors }: { anchors: Float32Array }) {
  const N = anchors.length / 3;
  // Position state. Initialized to the anchors so on first frame everything
  // is already at rest. Mutated in-place each frame.
  const positions = useMemo(() => new Float32Array(anchors), [anchors]);
  const prevPositions = useMemo(() => new Float32Array(anchors), [anchors]);

  const pointsRef = useRef<THREE.Points>(null);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const { gl } = useThree();

  // Track mouse in canvas-pixel space (origin centered, y-up so it matches
  // our anchor space).
  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - r.left - r.width / 2;
      mouseRef.current.y = -(e.clientY - r.top - r.height / 2);
      mouseRef.current.inside = true;
    }
    function onLeave() {
      mouseRef.current.inside = false;
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [gl]);

  useFrame(() => {
    const pts = pointsRef.current;
    if (!pts) return;

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const inside = mouseRef.current.inside;
    const repelSq = REPEL_RADIUS_PX * REPEL_RADIUS_PX;

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const x = positions[ix];
      const y = positions[ix + 1];
      const ax = anchors[ix];
      const ay = anchors[ix + 1];
      const px = prevPositions[ix];
      const py = prevPositions[ix + 1];

      // Spring pull toward anchor.
      let fx = (ax - x) * REST_SPRING_K;
      let fy = (ay - y) * REST_SPRING_K;

      // Cursor repel with quadratic falloff so it's a soft push, not a yank.
      if (inside) {
        const dx = x - mx;
        const dy = y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < repelSq && d2 > 1) {
          const dist = Math.sqrt(d2);
          const falloff = 1 - dist / REPEL_RADIUS_PX;
          const mag = (REPEL_STRENGTH * falloff * falloff) / (d2 + REPEL_SOFT_FLOOR);
          fx += (dx / dist) * mag;
          fy += (dy / dist) * mag;
        }
      }

      // Verlet integration: velocity is encoded as (x - px), damped each
      // frame. New position = current + damped velocity + forces.
      const vx = (x - px) * DAMPING;
      const vy = (y - py) * DAMPING;
      prevPositions[ix] = x;
      prevPositions[ix + 1] = y;
      positions[ix] = x + vx + fx;
      positions[ix + 1] = y + vy + fy;
    }

    (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
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

export function MsdfDissolution({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  const [anchors, setAnchors] = useState<Float32Array | null>(null);

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

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      {anchors && (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: false, antialias: true }}
        >
          <color attach="background" args={[BG_COLOR]} />
          <ScreenPixelCamera />
          <DotField anchors={anchors} />
          <EffectComposer>
            <Bloom
              intensity={1.1}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.55}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}
      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">{meta}</p>
      </div>
    </section>
  );
}
