"use client";

import { useEffect, useRef } from "react";

export function Arc() {
  const stringsRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!stringsRef.current) return;
    const lines = stringsRef.current.querySelectorAll<SVGLineElement>("line");
    lines.forEach((line, i) => {
      const totalLen = line.getTotalLength();
      line.style.strokeDasharray = String(totalLen);
      line.style.strokeDashoffset = String(totalLen);
      line.animate(
        [{ strokeDashoffset: totalLen }, { strokeDashoffset: 0 }],
        { duration: 1800, delay: i * 90, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
      );
    });
  }, []);

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-ink px-6 py-32 md:px-16">
      <svg
        ref={stringsRef}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
        preserveAspectRatio="none"
        viewBox="0 0 1000 1000"
      >
        <line x1="50" y1="500" x2="950" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="80" y1="200" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="80" y1="800" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="920" y1="200" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="920" y1="800" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="200" y1="120" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="200" y1="880" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="800" y1="120" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="800" y1="880" x2="500" y2="500" stroke="#1E96E6" strokeWidth="1" />
        <line x1="350" y1="100" x2="650" y2="900" stroke="#1E96E6" strokeWidth="1" />
        <line x1="650" y1="100" x2="350" y2="900" stroke="#1E96E6" strokeWidth="1" />
        <line x1="100" y1="350" x2="900" y2="650" stroke="#1E96E6" strokeWidth="1" />
      </svg>

      <div className="relative z-10 max-w-4xl">
        <p className="mono-caps mb-12 text-xs text-bone/40">The arc</p>
        <p className="serif-display text-4xl text-bone md:text-6xl lg:text-7xl">
          DevOps. Then designer. Then systems architect. Then founder. Now building{" "}
          <span className="amber-glow">n</span>eural nets for everything.
        </p>
        <p className="mt-12 max-w-2xl font-sans text-base leading-relaxed text-bone/60 md:text-lg">
          The work has always been the same. Find the linear paths. Find the oscillatory ones. Find the
          intercession points where probability collapses into the thing that has to ship.
        </p>
      </div>
    </section>
  );
}
