// Home page composition.
//   Section 1 (SaturnHome):
//     - "RichardTheBruce" rendered as ~8000 anchored particles
//       (lifted from Lab Experiment 01 — MSDF dissolution mechanic).
//       Saturn body + 5 moons act as repellers — they all push text
//       particles aside as they drift across the word.
//     - "He Who Creates" subheader with cursor-magnet word physics
//       (Lab Exp 15 mechanic, single phrase).
//     - Saturn body + tilted ring + 5 moons orbiting the cursor with
//       Kepler-correct angular velocity. Saturn IS the cursor.
//   Section 2 (CommitHeatmap):
//     - 2026 GitHub contribution graph rendered as ~3300 particles
//       in a 53-week × 7-day grid. Tiered greens by commit count.
//       Cursor repel + Verlet spring-back. Title counts the total.

import { CommitHeatmap } from "@/components/marquee/CommitHeatmap";
import { SaturnHome } from "@/components/marquee/SaturnHome";

export default function Page() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <SaturnHome />
      <CommitHeatmap />
    </main>
  );
}
