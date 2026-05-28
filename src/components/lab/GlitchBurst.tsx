"use client";

// Experiment 10: Glitch / scan-line burst.
//
// Static SDF text "RichardTheBruce" sitting on a black field. By default
// the scene is clean with very subtle chromatic aberration + film grain.
// Click anywhere on the section: a 500ms burst of CONSTANT_WILD glitch
// kicks in — RGB channel tearing, horizontal displacement bands, heavy
// chromatic aberration, amplified noise. Then it auto-clears.
//
// This is the pattern for accent moments on a portfolio: a section-
// boundary cross, a button click, a scroll-into reveal. Held continuously,
// glitch feels broken. Held for half a second, it feels intentional.
//
// Stack:
//   - drei's <Text> (SDF text, crisp edges that show glitch artifacts well)
//   - @react-three/postprocessing: Bloom + ChromaticAberration + Glitch + Noise
//   - State-driven burst trigger via a setTimeout pulse

import { Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Glitch,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction, GlitchMode } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const BURST_DURATION_MS = 500;
const BG_COLOR = "#0A0A0B";

export function GlitchBurst({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  const [isBursting, setIsBursting] = useState(false);
  const burstTimerRef = useRef<number | null>(null);

  // Two CA offset levels: a near-zero "idle" baseline and a heavy "burst"
  // value. Vector2 instances are memoized so we don't allocate per render.
  const caIdle = useMemo(() => new THREE.Vector2(0.0008, 0.0005), []);
  const caBurst = useMemo(() => new THREE.Vector2(0.012, 0.008), []);

  function triggerBurst() {
    setIsBursting(true);
    if (burstTimerRef.current !== null) {
      clearTimeout(burstTimerRef.current);
    }
    burstTimerRef.current = window.setTimeout(() => {
      setIsBursting(false);
      burstTimerRef.current = null;
    }, BURST_DURATION_MS);
  }

  useEffect(() => {
    return () => {
      if (burstTimerRef.current !== null) {
        clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  return (
    <section
      className="relative h-screen w-full cursor-pointer overflow-hidden border-b border-bone/5 bg-ink"
      onClick={triggerBurst}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <ambientLight intensity={1} />
        <Text
          fontSize={0.7}
          color="#F5F2EC"
          anchorX="center"
          anchorY="middle"
          letterSpacing={-0.02}
        >
          RichardTheBruce
        </Text>
        <EffectComposer>
          <Bloom
            intensity={0.7}
            luminanceThreshold={0.3}
            luminanceSmoothing={0.55}
            mipmapBlur
          />
          <ChromaticAberration
            offset={isBursting ? caBurst : caIdle}
            radialModulation={false}
            modulationOffset={0}
          />
          <Glitch
            active={isBursting}
            mode={GlitchMode.CONSTANT_WILD}
            delay={new THREE.Vector2(0.0, 0.0)}
            duration={new THREE.Vector2(0.1, 0.3)}
            strength={new THREE.Vector2(0.4, 0.85)}
            ratio={0.85}
          />
          <Noise
            opacity={isBursting ? 0.2 : 0.025}
            premultiply
            blendFunction={BlendFunction.MULTIPLY}
          />
        </EffectComposer>
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 z-10">
        <p className="mono-caps text-[10px] text-bone/40">{index}</p>
        <p className="font-serif text-2xl text-bone/80">{title}</p>
        <p className="mono-caps mt-2 text-[10px] text-bone/30">{meta}</p>
      </div>
      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
        click anywhere to burst
      </p>
    </section>
  );
}
