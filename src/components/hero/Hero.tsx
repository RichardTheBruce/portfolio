"use client";

// The hero section composer. Owns layout (canvas behind, name text and tagline
// overlay in front). The particle field itself is dynamically imported so that
// only the chosen variant ships in the route bundle.
//
// The particle field renders BEHIND the name text. Because the field samples the
// word's letterforms as resting positions, the bone-colored particle cloud
// physically traces "RichardTheBruce" on the canvas. The overlaid <h1> is
// transparent text used only for screen readers and SEO (the visual word is the
// particle cloud itself). aria-hidden is set on the canvas; the readable name
// lives in the <h1>.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Tagline } from "./Tagline";

type Variant = "A" | "B" | "C" | "D" | "E";

// We dynamically import all four so the build can tree-shake the unselected ones.
// The host page imports Hero with a `variant` prop; the variants live in separate
// chunks so the unused ones don't ship.
const ParticleFieldA = dynamic(() => import("./ParticleFieldVariantA"), {
  ssr: false,
  loading: () => null,
});
const ParticleFieldB = dynamic(() => import("./ParticleFieldVariantB"), {
  ssr: false,
  loading: () => null,
});
const ParticleFieldC = dynamic(() => import("./ParticleFieldVariantC"), {
  ssr: false,
  loading: () => null,
});
const ParticleFieldD = dynamic(() => import("./ParticleFieldVariantD"), {
  ssr: false,
  loading: () => null,
});
const ParticleFieldE = dynamic(() => import("./ParticleFieldVariantE"), {
  ssr: false,
  loading: () => null,
});

const WORD = "RichardTheBruce";
const ACCENT_INDEX = 0; // R per SPEC § Hero "amber R in Richard"

export interface HeroProps {
  variant?: Variant;
}

export function Hero({ variant = "E" }: HeroProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const Field =
    variant === "A" ? ParticleFieldA :
    variant === "B" ? ParticleFieldB :
    variant === "C" ? ParticleFieldC :
    variant === "D" ? ParticleFieldD :
    ParticleFieldE;

  return (
    <section
      className="relative h-screen w-full overflow-hidden"
      style={{ background: "var(--ink, #0A0A0B)" }}
    >
      {/* Particle canvas (decorative, the visual word) */}
      <div className="absolute inset-0">
        <Field word={WORD} accentLetterIndex={ACCENT_INDEX} reducedMotion={reducedMotion} />
      </div>

      {/* Accessible / SEO name in flow, visually hidden but not display:none */}
      <h1
        className="sr-only"
        aria-label={WORD}
      >
        {WORD}
      </h1>

      {/* Tagline pinned to lower-third */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
        style={{ top: "calc(50% + 140px)" }}
      >
        <Tagline reducedMotion={reducedMotion} />
      </div>
    </section>
  );
}

export default Hero;
