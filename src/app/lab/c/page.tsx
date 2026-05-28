// Isolation route for visual testing of Caustics (Lab Experiment 14).
// /lab/c renders just the one section so we can verify the shader
// renders. Keep around or delete once Caustics is locked.

import { Caustics } from "@/components/lab/Caustics";

export default function CausticsTestPage() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <Caustics
        index="Experiment 14"
        title="Underwater caustic light field"
        meta="isolation test route — render-verification only"
      />
    </main>
  );
}
