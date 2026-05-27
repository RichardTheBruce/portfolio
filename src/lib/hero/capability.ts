// Capability tier detection. Read at mount, never at module top-level (SSR safe).
//
// Returns a discrete tier so the hero variants can clamp particle counts and
// disable expensive passes (e.g. Variant C's neighbor-line draw) on weaker hardware.
//
// Source authority: SKILL "Accessibility Floor" + portfolio SPEC.md performance budget
// (5000 particles on a 2021 MacBook Pro, scale down to 2000 on devices with
// navigator.hardwareConcurrency < 6).

export type CapabilityTier = "premium" | "standard" | "minimal";

export interface CapabilitySignals {
  tier: CapabilityTier;
  reducedMotion: boolean;
  cores: number;
  // True when the canvas should freeze to a static rest-position frame.
  // Honors prefers-reduced-motion (hard rule 8) at all tiers.
  staticFrame: boolean;
}

const COURTESY_CORES_PREMIUM = 8;
const COURTESY_CORES_STANDARD = 6;

export function detectCapability(): CapabilitySignals {
  if (typeof window === "undefined") {
    // SSR safe default. Server emits the standard tier. The client effect re-detects.
    return { tier: "standard", reducedMotion: false, cores: 6, staticFrame: false };
  }

  const cores = navigator.hardwareConcurrency ?? 4;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let tier: CapabilityTier = "standard";
  if (cores >= COURTESY_CORES_PREMIUM) tier = "premium";
  else if (cores < COURTESY_CORES_STANDARD) tier = "minimal";

  return { tier, reducedMotion, cores, staticFrame: reducedMotion };
}

// Resolve a particle-count target for a variant given (tier, requested premium count).
// Variants pass their requested max; this clamps to the tier's safe ceiling.
export function clampParticleCount(requested: number, tier: CapabilityTier): number {
  switch (tier) {
    case "premium":
      return requested;
    case "standard":
      return Math.min(requested, Math.round(requested * 0.7));
    case "minimal":
      return Math.min(requested, Math.round(requested * 0.4));
  }
}
