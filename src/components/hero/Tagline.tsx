"use client";

// Cycling tagline line below the name. Single line, JetBrains Mono caps,
// transitions one phrase at a time with a 4s dwell + 600ms crossfade.
// SPEC § Hero § "Below the name" lists the four phrases.

import { useEffect, useState } from "react";
import { TAGLINE_PHRASES } from "@/lib/hero/palette";

const DWELL_MS = 4000;
const FADE_MS = 600;

export function Tagline({ reducedMotion }: { reducedMotion: boolean }) {
  const [index, setIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (reducedMotion) return;
    let timeout: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setOpacity(0);
      timeout = setTimeout(() => {
        setIndex((i) => (i + 1) % TAGLINE_PHRASES.length);
        setOpacity(1);
        timeout = setTimeout(cycle, DWELL_MS);
      }, FADE_MS);
    };
    timeout = setTimeout(cycle, DWELL_MS);
    return () => clearTimeout(timeout);
  }, [reducedMotion]);

  return (
    <p
      className="text-center text-[10px] tracking-[0.3em] uppercase"
      style={{
        fontFamily: "var(--font-jetbrains-mono), 'JetBrains Mono', monospace",
        color: "var(--bone, #F5F2EC)",
        opacity,
        transition: reducedMotion ? "none" : `opacity ${FADE_MS}ms ease`,
        letterSpacing: "0.3em",
      }}
    >
      {TAGLINE_PHRASES[index]}
    </p>
  );
}
