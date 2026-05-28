// Home page composition.
//   Section 1 (SaturnHome):
//     - "RichardTheBruce" rendered as ~8000 anchored particles
//       (lifted from Lab Experiment 01, MSDF dissolution mechanic).
//       Saturn body + 5 moons act as repellers, they all push text
//       particles aside as they drift across the word.
//     - "He Who Creates" subheader with cursor-magnet word physics
//       (Lab Exp 15 mechanic, single phrase).
//     - Saturn body + tilted ring + 5 moons orbiting the cursor with
//       Kepler-correct angular velocity. Saturn IS the cursor.
//     - Rainbow comet that lands on the particle house and scatters it.
//       House rebuilds via Verlet spring after every impact.
//     - GitHub link in the top right.
//   Section 2 (CommitHeatmap):
//     - 2026 GitHub contribution graph rendered as ~3300 particles in
//       a 53-week x 7-day grid. Tiered greens by commit count.
//       Pulls real data from the GitHub GraphQL API when the
//       GITHUB_TOKEN env var is configured; falls back to a seeded
//       synthetic distribution otherwise so the page never breaks.

import { CommitHeatmap } from "@/components/marquee/CommitHeatmap";
import { SaturnHome } from "@/components/marquee/SaturnHome";
import { fetchCommits } from "@/lib/github-commits";

// Pre-render this page on the server. The fetchCommits call is cached
// at the fetch layer (revalidate: 3600) so we hit GitHub at most hourly.
export default async function Page() {
  const realCommits = await fetchCommits();
  return (
    <main className="relative w-full bg-ink text-bone">
      <SaturnHome />
      <CommitHeatmap realCommits={realCommits} />
    </main>
  );
}
