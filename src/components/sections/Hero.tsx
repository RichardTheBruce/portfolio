"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ParticleField = dynamic(
  () => import("@/components/hero/ParticleField").then((m) => m.ParticleField).catch(() => () => null),
  { ssr: false, loading: () => null }
);

const TYPING_LINES = [
  "FOUNDER · NURO FINANCE",
  "MASTER SCALAR PHYSICIST",
  "STRINGS · PARTICLES · KEYS TO HEAVEN",
  "HE WHO CREATES",
];

export function Hero() {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex((i) => (i + 1) % TYPING_LINES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-ink">
      <div className="absolute inset-0">
        <ParticleField word="RichardTheBruce" accentLetterIndex={0} />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <h1 className="serif-display text-[12vw] leading-none tracking-tight text-bone md:text-[9rem] lg:text-[11rem]">
          <span className="amber-glow animate-amber-pulse">R</span>
          <span>ichard</span>
          <span className="opacity-90">TheBruce</span>
        </h1>
        <p className="mt-10 mono-caps text-xs text-bone/70 md:text-sm">
          <span key={lineIndex} className="inline-block animate-[fadeIn_700ms_ease-out]">
            {TYPING_LINES[lineIndex]}
          </span>
        </p>
        <p className="mt-3 font-serif text-2xl italic text-bone/40">He who creates.</p>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 mono-caps text-[10px] text-bone/40">
        scroll
        <div className="mx-auto mt-2 h-8 w-px bg-bone/30" />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
