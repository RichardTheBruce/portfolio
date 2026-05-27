import { Hero } from "@/components/hero/Hero";
import { Arc } from "@/components/sections/Arc";
import { WorkGraph } from "@/components/work/WorkGraph";
import { ScalarField } from "@/components/math/ScalarField";
import { Framework } from "@/components/framework/Framework";
import { Brain } from "@/components/brain/Brain";
import { Reach } from "@/components/sections/Reach";
import { SiteStrings } from "@/components/strings/SiteStrings";
import { ProbabilityEasterEgg } from "@/components/easter/Probability";

export default function Page() {
  return (
    <main className="relative min-h-screen w-full">
      <SiteStrings />
      <div className="relative z-10">
        <Hero />
        <Arc />
        <WorkGraph />
        <ScalarField />
        <Framework />
        <Brain />
        <Reach />
      </div>
      <ProbabilityEasterEgg />
    </main>
  );
}
