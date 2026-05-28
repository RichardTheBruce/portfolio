"use client";

// Experiment 11 (rewritten): Anchored cube lattice with cursor disturbance.
//
// 64 nodes (4×4×4) sitting at fixed lattice points. Each node is a CPU
// Verlet particle anchored to its lattice position. Anchor spring + damping
// hold the cube together. The cursor projects a 3D ray through the scene;
// any node within CURSOR_REPEL_RADIUS of that ray gets pushed perpendicular
// to it. Move cursor away → nodes spring back to lattice. No cursor
// activity = no motion. The cube is the stable rest state.
//
// We dropped Rapier here. Anchored lattice physics is exactly what CPU
// Verlet does well (we proved it in Experiments 01-05 in 2D). 3D is the
// same math with one more axis. Rapier was the wrong tool for this shape
// of problem — its force model fought our deadbands and the gravity
// network kept drifting. This is rock solid.
//
// Stack:
//   - R3F orthographic-ish perspective Canvas
//   - InstancedMesh for the 64 spheres (one draw call)
//   - LineSegments for the lattice edges (visual structure)
//   - OrbitControls to look around
//   - N8AO + Bloom post-FX
//   - CPU Verlet in useFrame

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const LATTICE_DIM = 4;
const NODE_COUNT = LATTICE_DIM * LATTICE_DIM * LATTICE_DIM;
const LATTICE_SPACING = 0.7;

const ANCHOR_K = 0.09;             // spring back to lattice point
const DAMPING = 0.88;               // friction (CPU Verlet style — multiplier per frame)
const CURSOR_REPEL_RADIUS = 1.2;    // world-unit radius of cursor influence
const CURSOR_REPEL_STRENGTH = 0.25; // how hard the cursor pushes nodes away

const NODE_RADIUS = 0.11;
const NODE_COLOR = "#1E96E6";
const EDGE_COLOR = "#1E96E6";
const BG_COLOR = "#0A0A0B";

type LatticeData = {
  positions: Float32Array;
  prevPositions: Float32Array;
  anchors: Float32Array;
  edges: [number, number][];
};

function buildLattice(): LatticeData {
  const N = NODE_COUNT;
  const positions = new Float32Array(N * 3);
  const prevPositions = new Float32Array(N * 3);
  const anchors = new Float32Array(N * 3);
  const half = ((LATTICE_DIM - 1) / 2) * LATTICE_SPACING;

  for (let z = 0; z < LATTICE_DIM; z++) {
    for (let y = 0; y < LATTICE_DIM; y++) {
      for (let x = 0; x < LATTICE_DIM; x++) {
        const idx =
          z * LATTICE_DIM * LATTICE_DIM + y * LATTICE_DIM + x;
        const wx = x * LATTICE_SPACING - half;
        const wy = y * LATTICE_SPACING - half;
        const wz = z * LATTICE_SPACING - half;
        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = wy;
        positions[idx * 3 + 2] = wz;
        prevPositions[idx * 3] = wx;
        prevPositions[idx * 3 + 1] = wy;
        prevPositions[idx * 3 + 2] = wz;
        anchors[idx * 3] = wx;
        anchors[idx * 3 + 1] = wy;
        anchors[idx * 3 + 2] = wz;
      }
    }
  }

  // Edges between adjacent lattice points (in +x, +y, +z directions only —
  // avoids duplicate edges).
  const edges: [number, number][] = [];
  for (let z = 0; z < LATTICE_DIM; z++) {
    for (let y = 0; y < LATTICE_DIM; y++) {
      for (let x = 0; x < LATTICE_DIM; x++) {
        const idx =
          z * LATTICE_DIM * LATTICE_DIM + y * LATTICE_DIM + x;
        if (x < LATTICE_DIM - 1) edges.push([idx, idx + 1]);
        if (y < LATTICE_DIM - 1) edges.push([idx, idx + LATTICE_DIM]);
        if (z < LATTICE_DIM - 1)
          edges.push([idx, idx + LATTICE_DIM * LATTICE_DIM]);
      }
    }
  }

  return { positions, prevPositions, anchors, edges };
}

function LatticeField() {
  const data = useMemo(buildLattice, []);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const linePositions = useMemo(
    () => new Float32Array(data.edges.length * 2 * 3),
    [data.edges],
  );
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  // Cursor ray: origin + direction in world space. When cursor leaves the
  // canvas, we shove the origin far away so no nodes are in range.
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
    const N = NODE_COUNT;
    const radSq = CURSOR_REPEL_RADIUS * CURSOR_REPEL_RADIUS;
    const ox = cursorOriginRef.current.x;
    const oy = cursorOriginRef.current.y;
    const oz = cursorOriginRef.current.z;
    const dx = cursorDirRef.current.x;
    const dy = cursorDirRef.current.y;
    const dz = cursorDirRef.current.z;

    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      const px = data.positions[ix];
      const py = data.positions[ix + 1];
      const pz = data.positions[ix + 2];
      const ax = data.anchors[ix];
      const ay = data.anchors[ix + 1];
      const az = data.anchors[ix + 2];
      const ppx = data.prevPositions[ix];
      const ppy = data.prevPositions[ix + 1];
      const ppz = data.prevPositions[ix + 2];

      // Anchor spring. Pulls node back to lattice point.
      let fx = (ax - px) * ANCHOR_K;
      let fy = (ay - py) * ANCHOR_K;
      let fz = (az - pz) * ANCHOR_K;

      // Cursor ray distance. Project node onto cursor ray, get closest
      // point on the ray, then the perpendicular distance.
      const tx = px - ox;
      const ty = py - oy;
      const tz = pz - oz;
      const projLen = tx * dx + ty * dy + tz * dz;
      // Only push if the node is "in front of" the cursor (projLen > 0).
      // Otherwise we're behind the camera plane and shouldn't push.
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

      // Verlet integration.
      const vx = (px - ppx) * DAMPING;
      const vy = (py - ppy) * DAMPING;
      const vz = (pz - ppz) * DAMPING;
      data.prevPositions[ix] = px;
      data.prevPositions[ix + 1] = py;
      data.prevPositions[ix + 2] = pz;
      data.positions[ix] = px + vx + fx;
      data.positions[ix + 1] = py + vy + fy;
      data.positions[ix + 2] = pz + vz + fz;
    }

    // Update InstancedMesh matrices from current positions.
    const mesh = meshRef.current;
    if (mesh) {
      for (let i = 0; i < N; i++) {
        tempObject.position.set(
          data.positions[i * 3],
          data.positions[i * 3 + 1],
          data.positions[i * 3 + 2],
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
      for (let i = 0; i < data.edges.length; i++) {
        const [a, b] = data.edges[i];
        arr[i * 6 + 0] = data.positions[a * 3];
        arr[i * 6 + 1] = data.positions[a * 3 + 1];
        arr[i * 6 + 2] = data.positions[a * 3 + 2];
        arr[i * 6 + 3] = data.positions[b * 3];
        arr[i * 6 + 4] = data.positions[b * 3 + 1];
        arr[i * 6 + 5] = data.positions[b * 3 + 2];
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

      <instancedMesh ref={meshRef} args={[undefined, undefined, NODE_COUNT]}>
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

export function LatticeCube({
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
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <LatticeField />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={2.5}
          maxDistance={9}
        />
        <EffectComposer>
          <N8AO halfRes intensity={3.0} aoRadius={0.7} distanceFalloff={1.0} />
          <Bloom
            intensity={0.6}
            luminanceThreshold={0.4}
            luminanceSmoothing={0.5}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
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
