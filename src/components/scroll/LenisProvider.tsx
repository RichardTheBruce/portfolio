"use client";

// Lenis is the single source of truth for scroll across the portfolio.
// Wired at the layout level so every page inherits smooth scroll without
// per-section setup.
//
// Lenis is bridged to GSAP's ticker so both share the same RAF clock — this
// prevents phase drift between scroll position and GSAP timelines. Any
// ScrollTrigger-driven animation in a child component will see Lenis-
// smoothed scroll positions automatically because we register
// `lenis.on("scroll", ScrollTrigger.update)`.
//
// Pattern per the 2026 canon: Lenis owns scroll, ScrollTrigger reads from
// Lenis, R3F components read GSAP timelines via refs (never via React
// state in the 60Hz path).

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    function update(time: number) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(update);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
