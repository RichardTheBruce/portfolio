"use client";

// Experiment 03: Word morph (v2 — cursor-enter trigger).
//
// Same particle field as Experiments 01 and 02. Each phrase is pre-sampled
// at startup to EXACTLY PARTICLE_COUNT anchors so particle[i]'s identity is
// consistent across phrases.
//
// Morph trigger: cursor entering the canvas advances to the next phrase.
// While the cursor is inside, no new morph triggers; the user has to leave
// and re-enter to advance again. This makes the page feel like it's
// responding to YOU rather than running on a clock.
//
// Morph mechanics: each particle's anchor itself slowly interpolates from
// the old phrase shape to the new one over MORPH_DURATION_MS using a
// smoothstep ease. The spring + damping physics tracks the moving target,
// so the visual is a smooth, slow drift between letter shapes. Cursor
// repel still applies on top. Re-entering mid-morph snapshots the current
// interpolated state as the new "from" and continues smoothly.

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
const MORPH_DURATION_MS = 4000;

const PARTICLE_COUNT = 4500;
const FONT_SIZE_PX = 220;

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
  const padX = 80;
  const padY = 60;
  const w = Math.ceil(wordWidth + padX * 2);
  const h = Math.ceil(fontPx * 1.4 + padY * 2);

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

function smoothstep01(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
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

function MorphField({ phraseAnchors }: { phraseAnchors: Float32Array[] }) {
  const N = PARTICLE_COUNT;
  const positions = useMemo(
    () => new Float32Array(phraseAnchors[0]),
    [phraseAnchors],
  );
  const prevPositions = useMemo(
    () => new Float32Array(phraseAnchors[0]),
    [phraseAnchors],
  );

  // Morph state. fromAnchors is the "from" snapshot, mutated whenever we
  // trigger a new morph mid-flight. toAnchorsRef points at the next phrase.
  // morphT runs 0 -> 1 over MORPH_DURATION_MS. Starts at 1 (no morph) so
  // the field just sits at phrase 0 until the user enters.
  const fromAnchors = useMemo(
    () => new Float32Array(phraseAnchors[0]),
    [phraseAnchors],
  );
  const toAnchorsRef = useRef<Float32Array>(phraseAnchors[0]);
  const morphTRef = useRef(1);
  const currentIdxRef = useRef(0);

  const pointsRef = useRef<THREE.Points>(null);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const cursorWasInsideRef = useRef(false);
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - r.left - r.width / 2;
      mouseRef.current.y = -(e.clientY - r.top - r.height / 2);
      mouseRef.current.inside = true;
    }
    function onEnter() {
      if (cursorWasInsideRef.current) return;
      cursorWasInsideRef.current = true;
      // Snapshot the current interpolated state so chained triggers stay
      // smooth (if user re-enters mid-morph, we start a fresh morph from
      // wherever the particles are RIGHT NOW).
      const t = smoothstep01(morphTRef.current);
      const from = fromAnchors;
      const to = toAnchorsRef.current;
      for (let i = 0; i < from.length; i++) {
        from[i] = from[i] * (1 - t) + to[i] * t;
      }
      const nextIdx = (currentIdxRef.current + 1) % phraseAnchors.length;
      toAnchorsRef.current = phraseAnchors[nextIdx];
      currentIdxRef.current = nextIdx;
      morphTRef.current = 0;
    }
    function onLeave() {
      mouseRef.current.inside = false;
      cursorWasInsideRef.current = false;
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseenter", onEnter);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseenter", onEnter);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [gl, fromAnchors, phraseAnchors]);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;

    if (morphTRef.current < 1) {
      morphTRef.current = Math.min(
        1,
        morphTRef.current + (delta * 1000) / MORPH_DURATION_MS,
      );
    }
    const t = smoothstep01(morphTRef.current);
    const from = fromAnchors;
    const to = toAnchorsRef.current;

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

export function WordMorph({
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
          <MorphField phraseAnchors={phraseAnchors} />
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
