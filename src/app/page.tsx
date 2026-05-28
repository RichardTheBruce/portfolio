// Home page. The Saturn cursor marquee is the signature interaction:
// particle wall at load → first cursor move shatters into "RichardTheBruce"
// text + Saturn body + tilted ring + 5 orbiting moons. Saturn becomes the
// cursor. See SaturnMarquee.tsx for the architecture.
//
// Subsequent home-page sections will lift winners from /lab as Richard
// designs the assembly.

import { SaturnMarquee } from "@/components/marquee/SaturnMarquee";

export default function Page() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <SaturnMarquee />
    </main>
  );
}
