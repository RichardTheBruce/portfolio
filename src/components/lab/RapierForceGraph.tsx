"use client";

// Experiment 11: 3D Rapier force graph.
//
// 25 nodes, ~40 edges, full 3D. Each node is a Rapier dynamic rigid body.
// Edges aren't joints (Rapier doesn't ship spring joints) — instead, every
// physics step we walk the edge list and apply Hooke's-law spring impulses
// at both endpoints. A weak center attractor keeps the graph from drifting
// off to infinity. Drag any sphere to perturb it; release and the spring
// network settles back. Orbit the camera with empty-space drag.
//
// This is the candidate to replace the d3-force-based Brain and WorkGraph
// sections from the old portfolio. Rapier handles the integration + drag,
// we just describe forces. Much cleaner than CPU-side Verlet for 3D.
//
// Stack:
//   - @react-three/rapier <Physics gravity={[0,0,0]}>
//   - <RigidBody> per node, <BallCollider> for shape
//   - useBeforePhysicsStep for spring + center forces
//   - Drei <OrbitControls> for camera
//   - N8AO + Bloom post-FX

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO } from "@react-three/postprocessing";
import {
  BallCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const NODE_COUNT = 25;
const NODE_RADIUS = 0.28;
const NODE_DENSITY = 5;        // explicit density → mass ≈ 0.46 kg
const SPRING_K = 0.9;          // soft springs
const REST_LENGTH = 0.9;       // ideal edge length
const STRETCH_DEADBAND = 0.08; // springs within this of rest contribute zero force
const STRETCH_CLAMP = 0.6;     // cap stretch contribution
const CENTER_K = 1.6;          // heavy gravity well
const CENTER_DEADBAND = 0.06;  // center force skips bodies near origin
const LINEAR_DAMPING = 12.0;   // very heavy damping
const GRAB_PULL_K = 8;         // gentle grab
const MAX_FORCE_MAG = 2.5;     // force ceiling
const MAX_VELOCITY = 4;        // velocity ceiling

// Breathing cycle. After a SETTLE_DURATION_S grace period (where gravity
// eases in so the graph forms without snap), the gravity coefficient
// oscillates with a smooth sin wave. Springs hold topology; only the
// radial force breathes. Per-step center force is hard-clamped to
// MAX_CENTER_FORCE so distance can't run away the force calculation, and
// there's a CAGE_RADIUS safety wall as a last resort.
const SETTLE_DURATION_S = 5;
const CYCLE_PERIOD_S = 12;     // longer period → slower, more deliberate breath
const GRAVITY_PEAK = 2.0;       // peak attraction multiplier (down from 4 — was too strong)
const REPULSION_PEAK = -0.3;    // peak repulsion. Tiny — repulsion explodes faster than attraction collapses
const MAX_CENTER_FORCE = 2.5;   // hard cap on the center force magnitude per body
const CAGE_RADIUS = 3.5;        // any body beyond this radius gets pulled back hard
const CAGE_K = 6;               // cage spring stiffness

const NODE_COLOR = "#1E96E6";
const EDGE_COLOR = new THREE.Color("#1E96E6");
const BG_COLOR = "#0A0A0B";

type Edge = [number, number];
type GraphData = {
  positions: [number, number, number][];
  edges: Edge[];
};

// Build a connected graph: spanning tree first (so everything is reachable),
// then add extra cross-edges for richer topology.
function buildGraph(nodeCount: number): GraphData {
  const positions: [number, number, number][] = [];
  for (let i = 0; i < nodeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    // Tight initial cluster so springs aren't blown out at startup. The
    // network then EXPANDS to its equilibrium under spring forces, which is
    // numerically stable (small forces growing) rather than collapsing
    // (huge forces shrinking) which can overshoot.
    const r = 0.3 + Math.random() * 0.6;
    positions.push([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ]);
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  const key = (a: number, b: number) =>
    a < b ? `${a}-${b}` : `${b}-${a}`;

  // Tree edges: each node (except 0) connects to a random earlier node.
  // Guarantees the graph is connected.
  for (let i = 1; i < nodeCount; i++) {
    const j = Math.floor(Math.random() * i);
    edges.push([j, i]);
    seen.add(key(j, i));
  }

  // Extra cross-edges for richer connectivity.
  const extras = Math.floor(nodeCount * 0.6);
  for (let i = 0; i < extras; i++) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const a = Math.floor(Math.random() * nodeCount);
      const b = Math.floor(Math.random() * nodeCount);
      if (a === b) continue;
      const k = key(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([a, b]);
      break;
    }
  }

  return { positions, edges };
}

// Springs + center attractor + grab pull, applied as impulses each physics
// step. Forces compose linearly so order doesn't matter.
function GraphPhysics({
  bodyRefs,
  edges,
  grabbedIdxRef,
  grabTargetRef,
  elapsedRef,
  gravityMultRef,
}: {
  bodyRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  edges: Edge[];
  grabbedIdxRef: React.MutableRefObject<number | null>;
  grabTargetRef: React.MutableRefObject<THREE.Vector3>;
  elapsedRef: React.MutableRefObject<number>;
  gravityMultRef: React.MutableRefObject<number>;
}) {
  useBeforePhysicsStep(() => {
    const dt = 1 / 120;
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    // Gravity oscillation. During the settle phase, gravity ramps from low
    // to baseline so the network forms without a snap. After settle, sin
    // wave between REPULSION_PEAK and GRAVITY_PEAK with period CYCLE_PERIOD_S.
    let gravityMult: number;
    if (t < SETTLE_DURATION_S) {
      gravityMult = 0.3 + (t / SETTLE_DURATION_S) * 0.7; // 0.3 → 1.0
    } else {
      const cycleT = (t - SETTLE_DURATION_S) % CYCLE_PERIOD_S;
      const phase = (cycleT / CYCLE_PERIOD_S) * 2 * Math.PI;
      const sinVal = Math.sin(phase); // -1 → 1
      const mid = (GRAVITY_PEAK + REPULSION_PEAK) / 2;
      const amp = (GRAVITY_PEAK - REPULSION_PEAK) / 2;
      gravityMult = mid + amp * sinVal;
    }
    gravityMultRef.current = gravityMult;
    // Spring forces along edges. F = k * clamp(currentLength - restLength).
    // Deadband: if a spring is close enough to rest length, we apply ZERO
    // force. Without a deadband, residual stretches at equilibrium produce
    // residual forces and bodies vibrate forever. With it, the system has
    // a tolerance zone in which it considers itself at rest.
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const bodyA = bodyRefs.current[a];
      const bodyB = bodyRefs.current[b];
      if (!bodyA || !bodyB) continue;
      const pa = bodyA.translation();
      const pb = bodyB.translation();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dz = pb.z - pa.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.001) continue;
      const rawStretch = dist - REST_LENGTH;
      // Deadband check
      if (Math.abs(rawStretch) < STRETCH_DEADBAND) continue;
      const stretch =
        rawStretch > STRETCH_CLAMP
          ? STRETCH_CLAMP
          : rawStretch < -STRETCH_CLAMP
            ? -STRETCH_CLAMP
            : rawStretch;
      let f = stretch * SPRING_K;
      if (f > MAX_FORCE_MAG) f = MAX_FORCE_MAG;
      else if (f < -MAX_FORCE_MAG) f = -MAX_FORCE_MAG;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      const fz = (dz / dist) * f;
      bodyA.addForce({ x: fx, y: fy, z: fz }, true);
      bodyB.addForce({ x: -fx, y: -fy, z: -fz }, true);
    }

    // Center attractor (oscillating gravity). Two safety mechanisms layered:
    //   1. Force magnitude clamped to MAX_CENTER_FORCE — distance can't run
    //      away the calculation.
    //   2. A CAGE_RADIUS sphere: any body that escapes beyond this radius
    //      gets pulled back with a strong inward force. Hard ceiling on
    //      how far the breath can throw a node.
    for (let i = 0; i < bodyRefs.current.length; i++) {
      const body = bodyRefs.current[i];
      if (!body) continue;
      const p = body.translation();
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (r < CENTER_DEADBAND) continue;

      // Cage check first. If outside, the cage force REPLACES the gravity
      // oscillation for this body — get back inside, then resume breathing.
      if (r > CAGE_RADIUS) {
        const excess = r - CAGE_RADIUS;
        const cageForce = excess * CAGE_K;
        body.addForce(
          {
            x: (-p.x / r) * cageForce,
            y: (-p.y / r) * cageForce,
            z: (-p.z / r) * cageForce,
          },
          true,
        );
        continue;
      }

      // Oscillating gravity. Force = -p * CENTER_K * gravityMult, clamped.
      let fx = -p.x * CENTER_K * gravityMult;
      let fy = -p.y * CENTER_K * gravityMult;
      let fz = -p.z * CENTER_K * gravityMult;
      const fmag = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fmag > MAX_CENTER_FORCE) {
        const k = MAX_CENTER_FORCE / fmag;
        fx *= k;
        fy *= k;
        fz *= k;
      }
      body.addForce({ x: fx, y: fy, z: fz }, true);
    }

    // Grab pull: gentle impulse toward the mouse target. Won't whip the
    // network even on fast drags.
    const grabbed = grabbedIdxRef.current;
    if (grabbed !== null) {
      const body = bodyRefs.current[grabbed];
      if (body) {
        const target = grabTargetRef.current;
        const p = body.translation();
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dz = target.z - p.z;
        body.applyImpulse(
          {
            x: dx * GRAB_PULL_K * 0.02,
            y: dy * GRAB_PULL_K * 0.02,
            z: dz * GRAB_PULL_K * 0.02,
          },
          true,
        );
      }
    }

    // Velocity ceiling. Last-resort safety net so no body can ever exceed
    // a sane speed even if forces somehow blow up. Without this, a single
    // bad frame can launch a node off the screen permanently.
    for (let i = 0; i < bodyRefs.current.length; i++) {
      const body = bodyRefs.current[i];
      if (!body) continue;
      const v = body.linvel();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed > MAX_VELOCITY) {
        const k = MAX_VELOCITY / speed;
        body.setLinvel(
          { x: v.x * k, y: v.y * k, z: v.z * k },
          true,
        );
      }
    }
  });

  return null;
}

function Edges({
  bodyRefs,
  edges,
}: {
  bodyRefs: React.MutableRefObject<(RapierRigidBody | null)[]>;
  edges: Edge[];
}) {
  const positions = useMemo(
    () => new Float32Array(edges.length * 2 * 3),
    [edges],
  );
  const linesRef = useRef<THREE.LineSegments>(null);

  useFrame(() => {
    const lines = linesRef.current;
    if (!lines) return;
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const bodyA = bodyRefs.current[a];
      const bodyB = bodyRefs.current[b];
      if (!bodyA || !bodyB) continue;
      const pa = bodyA.translation();
      const pb = bodyB.translation();
      positions[i * 6 + 0] = pa.x;
      positions[i * 6 + 1] = pa.y;
      positions[i * 6 + 2] = pa.z;
      positions[i * 6 + 3] = pb.x;
      positions[i * 6 + 4] = pb.y;
      positions[i * 6 + 5] = pb.z;
    }
    const attr = lines.geometry.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.55} />
    </lineSegments>
  );
}

function GraphScene({ data }: { data: GraphData }) {
  const bodyRefs = useRef<(RapierRigidBody | null)[]>(
    Array(data.positions.length).fill(null),
  );
  const grabbedIdxRef = useRef<number | null>(null);
  const grabTargetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const elapsedRef = useRef(0);
  const gravityMultRef = useRef(0.3); // initial value matches settle start
  const [isGrabbing, setIsGrabbing] = useState(false);

  const { camera, raycaster, gl } = useThree();
  const grabPlaneRef = useRef<THREE.Plane>(new THREE.Plane());
  const tempVecRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const ndcRef = useRef<THREE.Vector2>(new THREE.Vector2());

  // While grabbing, projecting the screen cursor onto a plane that faces
  // the camera and passes through the grabbed node's depth gives natural-
  // feeling 3D drag.
  useEffect(() => {
    const canvas = gl.domElement;
    function onMove(e: PointerEvent) {
      if (grabbedIdxRef.current === null) return;
      const rect = canvas.getBoundingClientRect();
      ndcRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndcRef.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndcRef.current, camera);
      // Plane facing the camera, anchored at the grabbed body's z.
      const body = bodyRefs.current[grabbedIdxRef.current];
      if (!body) return;
      const bz = body.translation().z;
      const camDir = camera.getWorldDirection(tempVecRef.current).clone();
      grabPlaneRef.current.setFromNormalAndCoplanarPoint(
        camDir,
        new THREE.Vector3(0, 0, bz),
      );
      const intersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(grabPlaneRef.current, intersect)) {
        grabTargetRef.current.copy(intersect);
      }
    }
    function onUp() {
      grabbedIdxRef.current = null;
      setIsGrabbing(false);
    }
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, raycaster, gl]);

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

      {data.positions.map((p, idx) => (
        <RigidBody
          key={idx}
          position={p}
          colliders={false}
          linearDamping={LINEAR_DAMPING}
          angularDamping={2.0}
          ref={(r) => {
            bodyRefs.current[idx] = r;
          }}
        >
          {/* Sensor collider: provides body mass but does NOT physically
              collide with other nodes. Density set explicitly so we know
              the body has real mass (~0.46 kg given radius 0.28 and
              density 5) — important because forces against tiny mass
              produce huge accelerations. */}
          <BallCollider args={[NODE_RADIUS]} sensor density={NODE_DENSITY} />
          <mesh
            onPointerDown={(e) => {
              e.stopPropagation();
              grabbedIdxRef.current = idx;
              setIsGrabbing(true);
              const body = bodyRefs.current[idx];
              if (body) {
                const t = body.translation();
                grabTargetRef.current.set(t.x, t.y, t.z);
              }
            }}
          >
            <sphereGeometry args={[NODE_RADIUS, 20, 20]} />
            <meshStandardMaterial
              color={NODE_COLOR}
              metalness={0.55}
              roughness={0.35}
              emissive={NODE_COLOR}
              emissiveIntensity={0.1}
            />
          </mesh>
        </RigidBody>
      ))}

      <Edges bodyRefs={bodyRefs} edges={data.edges} />
      <GraphPhysics
        bodyRefs={bodyRefs}
        edges={data.edges}
        grabbedIdxRef={grabbedIdxRef}
        grabTargetRef={grabTargetRef}
        elapsedRef={elapsedRef}
        gravityMultRef={gravityMultRef}
      />

      <OrbitControls
        makeDefault
        enabled={!isGrabbing}
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={14}
      />
    </>
  );
}

export function RapierForceGraph({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  // Graph topology is generated once at mount. Refresh page for a new layout.
  const data = useMemo(() => buildGraph(NODE_COUNT), []);

  return (
    <section className="relative h-screen w-full overflow-hidden border-b border-bone/5 bg-ink">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <Physics gravity={[0, 0, 0]} timeStep={1 / 120}>
          <GraphScene data={data} />
        </Physics>
        <EffectComposer>
          <N8AO halfRes intensity={3.0} aoRadius={1.0} distanceFalloff={1.0} />
          <Bloom
            intensity={0.7}
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
        drag a sphere · drag empty space to orbit
      </p>
    </section>
  );
}
