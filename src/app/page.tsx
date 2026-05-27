import { Hero } from "@/components/sections/Hero";
import { Arc } from "@/components/sections/Arc";
import { WorkGraph } from "@/components/work/WorkGraph";
import { ScalarField } from "@/components/math/ScalarField";
import { Brain } from "@/components/brain/Brain";
import { Reach } from "@/components/sections/Reach";
import { GlobalStrings } from "@/components/strings/GlobalStrings";
import { ProbabilityEasterEgg } from "@/components/easter/Probability";

export default function Page() {
  return (
    <main className="relative min-h-screen w-full">
      <GlobalStrings />
      <div className="relative z-10">
        <Hero />
        <Arc />
        <WorkGraph />
        <ScalarField />
        <Brain />
        <Reach />
      </div>
      <ProbabilityEasterEgg />
    </main>
  );
}
