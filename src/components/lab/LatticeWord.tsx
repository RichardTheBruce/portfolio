"use client";

// Experiment 12: 3D anchored "RichardTheBruce" with cursor disturbance.
//
// Same CPU Verlet architecture as LatticeCube. The only difference is the
// anchor layout — instead of a regular 4×4×4 grid, the anchors are sampled
// from the inked pixels of "RichardTheBruce" rendered in Cormorant Garamond.
// Slight z-jitter gives the text a subtle 3D thickness when the camera
// orbits past 90°.
//
// Identical mechanics from here:
//   - Anchor spring + Verlet damping
//   - Cursor projects a 3D ray; particles within radius of that ray get
//     pushed perpendicular to it
//   - InstancedMesh for the dots
//   - OrbitControls + Bloom
//   - Cube is the rest state — letters here are the rest state — same idea.

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const WORD = "RichardTheBruce";
const FONT_SIZE_PX = 180;
const PARTICLE_TARGET = 650;       // ~46 spheres per letter — sparse, clearly discrete
const WORLD_SCALE = 0.0048;        // slightly bigger text so spheres don't crowd
const Z_JITTER = 0.07;             // much shallower depth so the word stays flat and legible

const ANCHOR_K = 0.09;
const DAMPING = 0.88;
const CURSOR_REPEL_RADIUS = 0.65;
const CURSOR_REPEL_STRENGTH = 0.20;

const NODE_RADIUS = 0.062;         // smaller so individual spheres read clearly
const NODE_COLOR = "#1E96E6";
const EDGE_COLOR = "#1E96E6";
const BG_COLOR = "#0A0A0B";

// One edge per particle is enough at this density. Cap edge length to
// strictly within-letter so the word doesn't get bridged across gaps.
const EDGES_PER_PARTICLE = 1;
const MAX_EDGE_LEN = 0.28;

function sampleWordAnchors3D(
  word: string,
  fontPx: number,
  target: number,
  worldScale: number,
  zJitter: number,
): Float32Array {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return new Float32Array(0);
  const font = `700 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
  probe.font = font;
  const wordWidth = probe.measureText(word).width;
  const w = Math.ceil(wordWidth + 100);
  const h = Math.ceil(fontPx * 1.4 + 80);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return new Float32Array(0);
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "center";
  octx.font = font;
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
        out.push((x - w / 2) * worldScale);
        out.push(-(y - h / 2) * worldScale);
        out.push((Math.random() * 2 - 1) * zJitter);
      }
    }
  }
  return new Float32Array(out);
}

// Build K-nearest-neighbor edges from anchor positions, but filter out any
// edge longer than maxLen. The max-length filter is what keeps the word
// readable — without it, KNN connects distant particles across letter gaps
// and the text looks tangled.
function buildKnnEdges(
  anchors: Float32Array,
  k: number,
  maxLen: number,
): [number, number][] {
  const N = anchors.length / 3;
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const maxLenSq = maxLen * maxLen;

  for (let i = 0; i < N; i++) {
    const ax = anchors[i * 3];
    const ay = anchors[i * 3 + 1];
    const az = anchors[i * 3 + 2];
    const candidates: { j: number; d2: number }[] = [];
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const dx = anchors[j * 3] - ax;
      const dy = anchors[j * 3 + 1] - ay;
      const dz = anchors[j * 3 + 2] - az;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxLenSq) continue;
      candidates.push({ j, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    for (let n = 0; n < Math.min(k, candidates.length); n++) {
      const j = candidates[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([Math.min(i, j), Math.max(i, j)]);
    }
  }
  return edges;
}

function LatticeWordField({ anchors }: { anchors: Float32Array }) {
  const N = anchors.length / 3;
  const positions = useMemo(() => new Float32Array(anchors), [anchors]);
  const prevPositions = useMemo(
    () => new Float32Array(anchors),
    [anchors],
  );
  const edges = useMemo(
    () => buildKnnEdges(anchors, EDGES_PER_PARTICLE, MAX_EDGE_LEN),
    [anchors],
  );
  const linePositions = useMemo(
    () => new Float32Array(edges.length * 2 * 3),
    [edges],
  );

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  const cursorOriginRef = useRef(new THREE.Vector3(9999, 9999, 9999));
  const cursorDirRef = useRef(new THREE.Vector3(0, 0, -1));

  const { camera, gl, raycaster } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const ndc = new THREE.Vector2();

    function onMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      cursorOriginRef.current.copy(raycaster.ray.origin);
      cursorDirRef.current.copy(raycaster.ray.direction);
    }
    function onLeave() {
      cursorOriginRef.current.set(9999, 9999, 9999);
    }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [camera, gl, raycaster]);

  useFrame(() => {
    const radSq = CURSOR_REPEL_RADIUS * CURSOR_REPEL_RADIUS;
    const ox = cursorOriginRef.current.x;
    const oy = cursorOriginRef.current.y;
    const oz = cursorOriginRef.current.z;
    const dx = cursorDirRef.current.x;
    const dy = cursorDirRef.current.y;
    const dz = cursorDirRef.current.z;

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const px = positions[ix];
      const py = positions[ix + 1];
      const pz = positions[ix + 2];
      const ax = anchors[ix];
      const ay = anchors[ix + 1];
      const az = anchors[ix + 2];
      const ppx = prevPositions[ix];
      const ppy = prevPositions[ix + 1];
      const ppz = prevPositions[ix + 2];

      let fx = (ax - px) * ANCHOR_K;
      let fy = (ay - py) * ANCHOR_K;
      let fz = (az - pz) * ANCHOR_K;

      const tx = px - ox;
      const ty = py - oy;
      const tz = pz - oz;
      const projLen = tx * dx + ty * dy + tz * dz;
      if (projLen > 0) {
        const cx = ox + dx * projLen;
        const cy = oy + dy * projLen;
        const cz = oz + dz * projLen;
        const rx = px - cx;
        const ry = py - cy;
        const rz = pz - cz;
        const d2 = rx * rx + ry * ry + rz * rz;
        if (d2 < radSq && d2 > 0.0001) {
          const dist = Math.sqrt(d2);
          const falloff = 1 - dist / CURSOR_REPEL_RADIUS;
          const mag = CURSOR_REPEL_STRENGTH * falloff * falloff;
          fx += (rx / dist) * mag;
          fy += (ry / dist) * mag;
          fz += (rz / dist) * mag;
        }
      }

      const vx = (px - ppx) * DAMPING;
      const vy = (py - ppy) * DAMPING;
      const vz = (pz - ppz) * DAMPING;
      prevPositions[ix] = px;
      prevPositions[ix + 1] = py;
      prevPositions[ix + 2] = pz;
      positions[ix] = px + vx + fx;
      positions[ix + 1] = py + vy + fy;
      positions[ix + 2] = pz + vz + fz;
    }

    const mesh = meshRef.current;
    if (mesh) {
      for (let i = 0; i < N; i++) {
        tempObject.position.set(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2],
        );
        tempObject.updateMatrix();
        mesh.setMatrixAt(i, tempObject.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Update line geometry from current positions.
    const lines = linesRef.current;
    if (lines) {
      const arr = linePositions;
      for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i];
        arr[i * 6 + 0] = positions[a * 3];
        arr[i * 6 + 1] = positions[a * 3 + 1];
        arr[i * 6 + 2] = positions[a * 3 + 2];
        arr[i * 6 + 3] = positions[b * 3];
        arr[i * 6 + 4] = positions[b * 3 + 1];
        arr[i * 6 + 5] = positions[b * 3 + 2];
      }
      const attr = lines.geometry.attributes.position as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 6, 4]} intensity={2.0} color="#FFF8EC" />
      <directionalLight
        position={[-4, -3, -2]}
        intensity={0.55}
        color="#3DA9FC"
      />
      <directionalLight
        position={[0, 2, -5]}
        intensity={0.7}
        color="#C97D3E"
      />

      <instancedMesh ref={meshRef} args={[undefined, undefined, N]}>
        <sphereGeometry args={[NODE_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color={NODE_COLOR}
          metalness={0.6}
          roughness={0.3}
          emissive={NODE_COLOR}
          emissiveIntensity={0.18}
        />
      </instancedMesh>

      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.45} />
      </lineSegments>
    </>
  );
}

export function LatticeWord({
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
      setAnchors(
        sampleWordAnchors3D(
          WORD,
          FONT_SIZE_PX,
          PARTICLE_TARGET,
          WORLD_SCALE,
          Z_JITTER,
        ),
      );
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
          camera={{ position: [0, 0, 5], fov: 50 }}
          style={{ position: "absolute", inset: 0 }}
          gl={{ alpha: false, antialias: true }}
        >
          <color attach="background" args={[BG_COLOR]} />
          <LatticeWordField anchors={anchors} />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={2.5}
            maxDistance={10}
          />
          <EffectComposer>
            <N8AO halfRes intensity={3.0} aoRadius={0.4} distanceFalloff={1.0} />
            <Bloom
              intensity={0.6}
              luminanceThreshold={0.4}
              luminanceSmoothing={0.5}
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
      <p className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
        hover to disturb · drag empty space to orbit
      </p>
    </section>
  );
}
