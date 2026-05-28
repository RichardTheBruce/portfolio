"use client";

// Experiment 09: Post-FX showcase — N8AO + Bloom + Chromatic Aberration.
//
// A simple 3D scene built specifically so all three post-processing passes
// have something to do. The previous experiments are all 2D particle fields
// at z=0, which means N8AO has no depth to compute occlusion against. This
// one fixes that: a rotating metallic torus knot, lit from two directions,
// with deep self-occlusion in the knot's twists.
//
// The post stack runs in order:
//   1. N8AO darkens crevices and contact shadows on the knot
//   2. Bloom adds glow to the bright metal highlights
//   3. Chromatic Aberration adds subtle color fringing at edges
//
// Together they turn "a blue donut" into something that reads as "actually
// rendered." This is the lift you keep hearing me mention — the canonical
// post-FX baseline every Awwwards-tier site ships.

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  N8AO,
} from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const BG_COLOR = "#0A0A0B";

function RotatingKnot() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.28;
    meshRef.current.rotation.x += delta * 0.14;
  });

  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1.4, 0.45, 256, 32]} />
      <meshStandardMaterial
        color="#1E96E6"
        metalness={0.85}
        roughness={0.18}
      />
    </mesh>
  );
}

function PostFXScene() {
  return (
    <>
      <ambientLight intensity={0.12} />
      {/* Key light: warm white from upper-right, strong */}
      <directionalLight position={[5, 6, 4]} intensity={2.4} color="#FFF8EC" />
      {/* Fill light: cool blue from lower-left, subtle */}
      <directionalLight position={[-4, -3, -2]} intensity={0.55} color="#3DA9FC" />
      {/* Rim light: amber from behind, hits the back curves */}
      <directionalLight position={[0, 2, -5]} intensity={0.9} color="#C97D3E" />
      <RotatingKnot />
    </>
  );
}

export function PostFXShowcase({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  // Use Vector2 instance for ChromaticAberration's offset (the typed prop is
  // strict in @react-three/postprocessing). Memoized so we don't allocate
  // per render.
  const caOffset = useMemo(() => new THREE.Vector2(0.0018, 0.0012), []);

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      <Canvas
        camera={{ position: [0, 0, 5.6], fov: 48 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <PostFXScene />
        <EffectComposer>
          <N8AO
            halfRes
            intensity={3.5}
            aoRadius={1.2}
            distanceFalloff={1.0}
          />
          <Bloom
            intensity={0.85}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.5}
            mipmapBlur
          />
          <ChromaticAberration
            offset={caOffset}
            radialModulation={false}
            modulationOffset={0}
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
