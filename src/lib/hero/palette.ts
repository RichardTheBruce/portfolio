// Locked palette tokens, mirrored from portfolio SPEC.md § Palette.
// Imported by the variant components and exposed as THREE.Color objects so the
// shader uniforms can read them without per-frame string parsing.

import * as THREE from "three";

export const INK = "#0A0A0B";
export const BONE = "#F5F2EC";
export const STRING = "#1E96E6";
export const STRING_BRIGHT = "#3DA9FC";
export const AMBER = "#C97D3E";

export const COLOR = {
  ink: new THREE.Color(INK),
  bone: new THREE.Color(BONE),
  string: new THREE.Color(STRING),
  stringBright: new THREE.Color(STRING_BRIGHT),
  amber: new THREE.Color(AMBER),
};

// Cycling tagline phrases for the line under the name (SPEC § Hero).
export const TAGLINE_PHRASES = [
  "FOUNDER · NURO FINANCE",
  "MASTER SCALAR PHYSICIST",
  "STRINGS · PARTICLES · KEYS TO HEAVEN",
  "HE WHO CREATES",
] as const;

// 0.8Hz pulse (SPEC § Hero accent letter).
export const ACCENT_PULSE_HZ = 0.8;
