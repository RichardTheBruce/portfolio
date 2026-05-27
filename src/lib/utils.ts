import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function deviceTierParticleCount(target: number): number {
  if (typeof navigator === "undefined") return target;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores < 4) return Math.floor(target * 0.35);
  if (cores < 6) return Math.floor(target * 0.6);
  return target;
}
