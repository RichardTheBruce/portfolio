// Isolation route for visually verifying CommitHeatmap. Delete when the
// section is locked.

import { CommitHeatmap } from "@/components/marquee/CommitHeatmap";

export default function HeatmapTestPage() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <CommitHeatmap />
    </main>
  );
}
