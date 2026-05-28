// Home page composition.
//   1. "RichardTheBruce" rendered as ~6500 anchored particles
//      (lifted from Lab Experiment 01 — MSDF dissolution mechanic).
//      Cursor repels with quadratic falloff, particles spring back.
//   2. "He who Creates" subheader (HTML).
//   3. Saturn body + tilted ring + 5 moons orbiting the cursor with
//      Kepler-correct angular velocity. Saturn IS the cursor.

import { SaturnHome } from "@/components/marquee/SaturnHome";

export default function Page() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <SaturnHome />
    </main>
  );
}
