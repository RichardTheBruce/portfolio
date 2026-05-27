// Home page scaffold. Sections are being rebuilt one at a time, each as a
// focused R&D session using the canonical stack: R3F + TSL + post-FX +
// Lenis + GSAP. As each section ships, it gets imported here.
//
// Section build order (subject to change):
//   1. Hero — MSDF text dissolution + curl-noise particles + Bloom
//   2. ScalarField — pure GPU fragment shader, TSL-authored
//   3. Brain — 3D Rapier-physics floating vault
//   4. WorkGraph — R3F instanced force graph with curl-noise drift
//   5. Arc — 3D wireframe convergence with GSAP ScrollTrigger draw-in
//   6. Framework — TSL tensor with slider classifier
//   7. Reach — portal absorb outro
//   8. Easter egg (Probability) — post-FX upgraded

export default function Page() {
  return (
    <main className="relative min-h-screen w-full bg-ink text-bone">
      <section className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-5xl text-bone/30 sm:text-7xl">
            RichardTheBruce
          </p>
          <p className="mono-caps mt-6 text-[10px] tracking-[0.32em] text-bone/20">
            lab in progress
          </p>
        </div>
      </section>
    </main>
  );
}
