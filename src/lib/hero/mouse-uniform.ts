// Pointer-position uniform manager. Shared by all three hero variants.
//
// Responsibilities:
//   - Track pointer x/y in canvas-local coordinates (origin at top-left).
//   - Provide a "presence" channel: 1.0 when inside the canvas, decays to 0
//     over ~300ms after leave (the spec's "Brownian settle" window).
//   - Expose a stable THREE.Vector3 uniform target: (x, y, presence).
//
// The variants all write this to a THREE.ShaderMaterial uniform every frame.

import * as THREE from "three";

export interface MouseTrackerOptions {
  element: HTMLElement;
  // Half-life of the "presence" decay after pointer leaves. ms.
  // 300ms matches the spec's "Mouse leaves the canvas -> particles drift through
  // 300ms Brownian settle before locking back."
  decayMs?: number;
}

export interface MouseTracker {
  uniform: THREE.Uniform<THREE.Vector3>;
  // Call once per frame (in useFrame). Returns the current presence value.
  tick(deltaSeconds: number): number;
  // Tear down listeners. MUST be invoked from the component's cleanup (hard rule 3).
  dispose(): void;
}

export function createMouseTracker(opts: MouseTrackerOptions): MouseTracker {
  const { element, decayMs = 300 } = opts;
  // value.x = pointer.x in pixels (0..width)
  // value.y = pointer.y in pixels (0..height)
  // value.z = presence in [0, 1], 1 when inside, fades over decayMs after leave
  const uniform = new THREE.Uniform(new THREE.Vector3(-1e6, -1e6, 0));

  let targetPresence = 0;
  let lastClientX = -1e6;
  let lastClientY = -1e6;

  const handleMove = (e: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    lastClientX = e.clientX - rect.left;
    lastClientY = e.clientY - rect.top;
    targetPresence = 1;
    uniform.value.x = lastClientX;
    uniform.value.y = lastClientY;
  };

  const handleLeave = () => {
    targetPresence = 0;
  };

  const handleEnter = () => {
    targetPresence = 1;
  };

  element.addEventListener("pointermove", handleMove, { passive: true });
  element.addEventListener("pointerleave", handleLeave, { passive: true });
  element.addEventListener("pointerenter", handleEnter, { passive: true });

  // Half-life math. After `decayMs`, value reaches ~3% of initial (e^(-3.5)).
  const tau = decayMs / 1000 / 3.5;

  const tick = (deltaSeconds: number): number => {
    // Exponential approach to targetPresence with time constant tau.
    const k = 1 - Math.exp(-deltaSeconds / tau);
    uniform.value.z += (targetPresence - uniform.value.z) * k;
    return uniform.value.z;
  };

  const dispose = () => {
    element.removeEventListener("pointermove", handleMove);
    element.removeEventListener("pointerleave", handleLeave);
    element.removeEventListener("pointerenter", handleEnter);
  };

  return { uniform, tick, dispose };
}
