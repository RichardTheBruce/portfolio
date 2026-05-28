"use client";

// Experiment 04: Word swipe — cursor activity drives the morph.
//
// Same particle field as Experiments 01–03. The morph mechanic here is the
// one Richard described: "if you're still, we're still; if you're fast, we
// change; if you move right, we go forward; if you move left, we go back."
//
// Implementation:
//   - phraseFloatRef is a continuous index in [0, N) where N = phrase count.
//     The integer part is the "current" phrase, the fractional part is how
//     far along the morph toward the next phrase. Wraps at N.
//   - Every mousemove inside the word's bounding region adds dx to
//     phraseFloat. Positive dx (rightward cursor) advances, negative
//     (leftward) rewinds. SWIPE_PX_PER_PHRASE controls how much travel
//     it takes to go from one phrase to the next.
//   - When the cursor is OUTSIDE the word's bounding region, mousemove
//     doesn't touch phraseFloat. Cursor still = still. Cursor off-word = still.
//   - Each frame, per-particle target = lerp(phrases[floor(f)], phrases[ceil(f)], frac(f)).
//     Spring + damping carries each particle toward the moving target.
//   - Cursor repel still applies as a force on top.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const PHRASES = [
  "Richard",
  "Founder",
  "Builder",
  "Scalar physicist",
  "Particle architect",
];

const PARTICLE_COUNT = 4500;
const FONT_SIZE_PX = 220;
const SWIPE_PX_PER_PHRASE = 220; // how much rightward cursor travel = 1 phrase advance
const HIT_MARGIN_PX = 50; // forgiving margin around the word's bounding box

const REST_SPRING_K = 0.04;
const DAMPING = 0.92;
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 6000;
const REPEL_SOFT_FLOOR = 100;

const POINT_SIZE_PX = 2.8;
const POINT_COLOR = 0xf5f2ec;
const BG_COLOR = "#0A0A0B";

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

function samplePhraseToExactly(
  phrase: string,
  fontPx: number,
  count: number,
): Float32Array {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return new Float32Array(count * 3);
  const font = `700 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
  probe.font = font;
  const wordWidth = probe.measureText(phrase).width;
  const w = Math.ceil(wordWidth + 160);
  const h = Math.ceil(fontPx * 1.4 + 120);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return new Float32Array(count * 3);
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "center";
  octx.font = font;
  octx.fillText(phrase, w / 2, h / 2);
  const img = octx.getImageData(0, 0, w, h).data;

  const candidates: number[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (img[(y * w + x) * 4 + 3] > 128) {
        candidates.push(x - w / 2);
        candidates.push(-(y - h / 2));
      }
    }
  }
  const candCount = candidates.length / 2;
  const out = new Float32Array(count * 3);
  if (candCount === 0) return out;

  if (candCount >= count) {
    const stride = candCount / count;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(i * stride);
      out[i * 3] = candidates[idx * 2];
      out[i * 3 + 1] = candidates[idx * 2 + 1];
      out[i * 3 + 2] = 0;
    }
  } else {
    for (let i = 0; i < count; i++) {
      const idx = i % candCount;
      out[i * 3] = candidates[idx * 2];
      out[i * 3 + 1] = candidates[idx * 2 + 1];
      out[i * 3 + 2] = 0;
    }
  }
  return out;
}

function computeBounds(anchors: Float32Array): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < anchors.length; i += 3) {
    const x = anchors[i];
    const y = anchors[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

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

function SwipeField({ phraseAnchors }: { phraseAnchors: Float32Array[] }) {
  const N = PARTICLE_COUNT;
  const NP = phraseAnchors.length;
  const positions = useMemo(
    () => new Float32Array(phraseAnchors[0]),
    [phraseAnchors],
  );
  const prevPositions = useMemo(
    () => new Float32Array(phraseAnchors[0]),
    [phraseAnchors],
  );

  // Bounding box per phrase, used to gate the swipe to "cursor is over the word".
  const phraseBounds = useMemo(
    () => phraseAnchors.map(computeBounds),
    [phraseAnchors],
  );

  const phraseFloatRef = useRef(0);
  const lastXRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const pointsRef = useRef<THREE.Points>(null);
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      const xLocal = e.clientX - r.left - r.width / 2;
      const yLocal = -(e.clientY - r.top - r.height / 2);
      mouseRef.current.x = xLocal;
      mouseRef.current.y = yLocal;
      mouseRef.current.inside = true;

      if (lastXRef.current === null) {
        lastXRef.current = xLocal;
        return;
      }
      const dx = xLocal - lastXRef.current;
      lastXRef.current = xLocal;

      // Check: cursor must be inside the bounding box of the CURRENT phrase
      // for the swipe to register. Off-word, no advance.
      const idx = Math.floor(phraseFloatRef.current) % NP;
      const b = phraseBounds[idx];
      const overWord =
        xLocal >= b.minX - HIT_MARGIN_PX &&
        xLocal <= b.maxX + HIT_MARGIN_PX &&
        yLocal >= b.minY - HIT_MARGIN_PX &&
        yLocal <= b.maxY + HIT_MARGIN_PX;
      if (!overWord) return;

      phraseFloatRef.current += dx / SWIPE_PX_PER_PHRASE;
      // Wrap into [0, NP)
      phraseFloatRef.current = ((phraseFloatRef.current % NP) + NP) % NP;
    }
    function onLeave() {
      mouseRef.current.inside = false;
      lastXRef.current = null;
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [gl, NP, phraseBounds]);

  useFrame(() => {
    const pts = pointsRef.current;
    if (!pts) return;

    const f = phraseFloatRef.current;
    const idx = Math.floor(f);
    const t = f - idx;
    const from = phraseAnchors[idx];
    const to = phraseAnchors[(idx + 1) % NP];

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const inside = mouseRef.current.inside;
    const repelSq = REPEL_RADIUS_PX * REPEL_RADIUS_PX;

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const x = positions[ix];
      const y = positions[ix + 1];
      const px = prevPositions[ix];
      const py = prevPositions[ix + 1];

      const ax = from[ix] * (1 - t) + to[ix] * t;
      const ay = from[ix + 1] * (1 - t) + to[ix + 1] * t;

      let fx = (ax - x) * REST_SPRING_K;
      let fy = (ay - y) * REST_SPRING_K;

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

export function WordSwipe({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  const [phraseAnchors, setPhraseAnchors] = useState<Float32Array[] | null>(null);

  useEffect(() => {
    function build() {
      const all = PHRASES.map((p) => samplePhraseToExactly(p, FONT_SIZE_PX, PARTICLE_COUNT));
      setPhraseAnchors(all);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    } else {
      build();
    }
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      {phraseAnchors && (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: false, antialias: true }}
        >
          <color attach="background" args={[BG_COLOR]} />
          <ScreenPixelCamera />
          <SwipeField phraseAnchors={phraseAnchors} />
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
