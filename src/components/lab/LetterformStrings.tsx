"use client";

// Experiment 02: Letterform particles + emergent neighbor strings.
//
// Same word + same particle physics as Experiment 01. The new piece is a
// second draw pass: every 8 frames, find near-neighbor pairs and rebuild a
// LineSegments geometry connecting them. The lines emerge from the particle
// dynamics, not a static graph — when the cursor pushes particles apart,
// local edges break; when particles spring back to anchors, the net
// re-forms.
//
// Stack:
//   - Same as Experiment 01 (R3F + classic ShaderMaterial + Bloom)
//   - PLUS a <lineSegments> with its own ShaderMaterial, AdditiveBlending
//   - Spatial-bucket neighbor search on CPU (cheap at 5000 particles)
//   - Each particle contributes to at most 2 edges so the line field doesn't
//     bloom from a single dense cluster.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const WORD = "Richard";
const FONT_SIZE_PX = 280;
const PARTICLE_TARGET = 5000;

const REST_SPRING_K = 0.04;
const DAMPING = 0.92;
const REPEL_RADIUS_PX = 140;
const REPEL_STRENGTH = 6000;
const REPEL_SOFT_FLOOR = 100;

const POINT_SIZE_PX = 2.8;
const POINT_COLOR = 0xf5f2ec; // bone
const BG_COLOR = "#0A0A0B"; // ink

// Line pass
const NEIGHBOR_RADIUS_PX = 50;
const MAX_NEIGHBOR_LINES = 1500;
const NEIGHBOR_RECOMPUTE_FRAMES = 8;
const MAX_EDGES_PER_PARTICLE = 2;
const LINE_COLOR = 0x1e96e6; // string blue
const LINE_ALPHA = 0.42;

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

const lineVertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uAlpha);
  }
`;

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

function makeLineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: lineVertexShader,
    fragmentShader: lineFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(LINE_COLOR) },
      uAlpha: { value: LINE_ALPHA },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Spatial-bucket neighbor pair search. Returns at most `maxPairs` index
// pairs whose particles are within NEIGHBOR_RADIUS_PX of each other. Caps
// the number of edges per particle so the line field doesn't bloom from a
// single dense cluster.
function findNeighborPairs(
  positions: Float32Array,
  maxPairs: number,
): { a: number; b: number }[] {
  const cell = NEIGHBOR_RADIUS_PX;
  const radSq = cell * cell;
  const n = positions.length / 3;
  const buckets = new Map<string, number[]>();
  const key = (gx: number, gy: number) => `${gx}:${gy}`;

  for (let i = 0; i < n; i++) {
    const gx = Math.floor(positions[i * 3] / cell);
    const gy = Math.floor(positions[i * 3 + 1] / cell);
    const k = key(gx, gy);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }

  const pairs: { a: number; b: number }[] = [];
  const used = new Uint8Array(n);

  for (let i = 0; i < n && pairs.length < maxPairs; i++) {
    if (used[i] >= MAX_EDGES_PER_PARTICLE) continue;
    const ax = positions[i * 3];
    const ay = positions[i * 3 + 1];
    const gx = Math.floor(ax / cell);
    const gy = Math.floor(ay / cell);

    let breakOuter = false;
    for (let dy = -1; dy <= 1 && !breakOuter; dy++) {
      for (let dx = -1; dx <= 1 && !breakOuter; dx++) {
        const b = buckets.get(key(gx + dx, gy + dy));
        if (!b) continue;
        for (let bi = 0; bi < b.length; bi++) {
          const j = b[bi];
          if (j <= i) continue;
          if (used[j] >= MAX_EDGES_PER_PARTICLE) continue;
          const ddx = positions[j * 3] - ax;
          const ddy = positions[j * 3 + 1] - ay;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < radSq && d2 > 4) {
            pairs.push({ a: i, b: j });
            used[i]++;
            used[j]++;
            if (used[i] >= MAX_EDGES_PER_PARTICLE) {
              breakOuter = true;
              break;
            }
            if (pairs.length >= maxPairs) {
              breakOuter = true;
              break;
            }
          }
        }
      }
    }
  }
  return pairs;
}

function HybridField({ anchors }: { anchors: Float32Array }) {
  const N = anchors.length / 3;
  const positions = useMemo(() => new Float32Array(anchors), [anchors]);
  const prevPositions = useMemo(() => new Float32Array(anchors), [anchors]);
  const linePositions = useMemo(
    () => new Float32Array(MAX_NEIGHBOR_LINES * 2 * 3),
    [],
  );

  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const mouseRef = useRef({ x: 0, y: 0, inside: false });
  const frameRef = useRef(0);
  const { gl } = useThree();

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

    // Particle physics, every frame.
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

    // Neighbor lines, every Nth frame (cheaper this way; CPU spatial-bucket
    // search at 5000 particles is fast but not free).
    frameRef.current = (frameRef.current + 1) % NEIGHBOR_RECOMPUTE_FRAMES;
    if (frameRef.current !== 0) return;

    const lines = linesRef.current;
    if (!lines) return;
    const linePosAttr = lines.geometry.attributes.position as THREE.BufferAttribute;
    const arr = linePosAttr.array as Float32Array;
    const pairs = findNeighborPairs(positions, MAX_NEIGHBOR_LINES);
    for (let i = 0; i < pairs.length; i++) {
      const { a, b } = pairs[i];
      arr[i * 6 + 0] = positions[a * 3];
      arr[i * 6 + 1] = positions[a * 3 + 1];
      arr[i * 6 + 2] = 0;
      arr[i * 6 + 3] = positions[b * 3];
      arr[i * 6 + 4] = positions[b * 3 + 1];
      arr[i * 6 + 5] = 0;
    }
    linePosAttr.needsUpdate = true;
    lines.geometry.setDrawRange(0, pairs.length * 2);
  });

  const dotMaterial = useMemo(makeDotMaterial, []);
  const lineMaterial = useMemo(makeLineMaterial, []);

  return (
    <>
      <lineSegments ref={linesRef} material={lineMaterial} renderOrder={-1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
      </lineSegments>
      <points ref={pointsRef} material={dotMaterial} renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
      </points>
    </>
  );
}

export function LetterformStrings({
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
          <HybridField anchors={anchors} />
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
