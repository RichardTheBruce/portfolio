// /lab — animation R&D playground. Each experiment is a viewport-height
// section stacked vertically. When an experiment earns a place on the home
// page, we lift it into the page.tsx template Richard designs.
//
// Build order (subject to change):
//   01. MSDF text dissolution (this file)
//   02. Letterform particles + emergent strings
//   03. Word morph
//   04. GPU curl-noise flow field (TSL)
//   05. Galaxy spiral
//   06. 3D Rapier force graph
//   07. GPU scalar field shader (TSL fragment)
//   08. Lenis pin-and-scrub
//   09. Bloom + N8AO + chromatic aberration combo
//   10. Glitch / scan-line burst

import { Caustics } from "@/components/lab/Caustics";
import { CurlNoiseField } from "@/components/lab/CurlNoiseField";
import { CursorMagnet } from "@/components/lab/CursorMagnet";
import { GalaxySpiral } from "@/components/lab/GalaxySpiral";
import { GlitchBurst } from "@/components/lab/GlitchBurst";
import { LatticeCube } from "@/components/lab/LatticeCube";
import { LatticeWord } from "@/components/lab/LatticeWord";
import { LetterformStrings } from "@/components/lab/LetterformStrings";
import { MsdfDissolution } from "@/components/lab/MsdfDissolution";
import { PathDraw } from "@/components/lab/PathDraw";
import { PostFXShowcase } from "@/components/lab/PostFXShowcase";
import { ScalarFieldShader } from "@/components/lab/ScalarFieldShader";
import { WordMorph } from "@/components/lab/WordMorph";
import { WordSwipe } from "@/components/lab/WordSwipe";
import { WordWheel } from "@/components/lab/WordWheel";

export default function LabPage() {
  return (
    <main className="relative w-full bg-ink text-bone">
      <MsdfDissolution
        index="Experiment 01"
        title="Particle letterforms — cursor dissolves them"
        meta='word "Richard" rendered as ~5000 anchored particles · cursor repels with quadratic falloff (radius=140px, peak=6000) · spring-back via Verlet (K=0.04, damping=0.92) · classic ShaderMaterial with circle-mask point shader · Bloom (intensity=1.1, threshold=0.2)'
      />
      <LetterformStrings
        index="Experiment 02"
        title="Letterforms + emergent strings"
        meta="same particle physics as 01 · second pass every 8 frames runs a spatial-bucket neighbor search and rebuilds ~1500 line segments connecting particles within 50px · additive-blended blue strings, capped at 2 edges per particle so dense clusters don't bloom · the net breaks under the cursor and re-forms when particles settle"
      />
      <WordMorph
        index="Experiment 03"
        title="Word morph — cursor enter triggers next phrase"
        meta="5 phrases pre-sampled to 4500 anchors each · phrase advances every time the cursor enters the canvas (leave + re-enter to advance again) · 4s smoothstep ease on the per-particle anchor lerp · re-trigger mid-morph snapshots the current state and continues smoothly · cursor repel still works mid-morph"
      />
      <WordSwipe
        index="Experiment 04"
        title="Word swipe — cursor activity drives the morph"
        meta="continuous float phraseIdx in [0, 5) · cursor movement OVER the word advances the float by dx/220px · positive dx = forward, negative = backward · cursor still or off-the-word = morph paused · per-particle anchor lerps between phrase[floor] and phrase[ceil] of the float · spring + damping tracks the moving target"
      />
      <WordWheel
        index="Experiment 05"
        title="Word wheel — scroll triggers the morph"
        meta="scroll wheel up = previous phrase, down = next phrase · same 4s smoothstep + snapshot-mid-morph mechanic as exp 03 · 800ms throttle between wheel triggers · preventDefault on canvas wheel so scrolling here drives the morph instead of the page (scroll outside the canvas to navigate away)"
      />
      <CurlNoiseField
        index="Experiment 06"
        title="GPU curl-noise flow field"
        meta="15,000 stateless bone points · vertex shader does Stefan Gustavson's snoise2d, gradient → 90° rotation = divergence-free 2D curl · drift = curl(seed*0.0028 + time*0.14) × 220px · additive blending so overlapping particles brighten · Bloom (intensity=1.4, threshold=0.1) on the bright eddies · no CPU loop, no physics state"
      />
      <GalaxySpiral
        index="Experiment 07"
        title="Galaxy spiral — two arms, Keplerian rotation"
        meta="12,000 stars · logarithmic two-arm spiral with center bulge (r = u^1.3 × 720px concentration) · per-star brightness from radius + noise · inner stars rotate faster (speed ∝ 1/√r) so arms wind tight · color mixes bone (bulge) → faint blue (rim) by radius · z-jitter scales point size for parallax · additive blending + Bloom"
      />
      <ScalarFieldShader
        index="Experiment 08"
        title="GPU scalar field — domain-warped FBM"
        meta="no particles · fullscreen quad evaluated per-pixel · Inigo Quilez domain warping: f(uv) = fbm(uv + 4*fbm(uv + 4*fbm(uv) + mouse))  · 5-octave FBM on Gustavson simplex noise · 3-stop gradient: dark navy (troughs) → amber-deep (midtones) → bone (peaks) · mouse perturbs the second warp so the field flows under your cursor"
      />
      <PostFXShowcase
        index="Experiment 09"
        title="Post-FX showcase — N8AO + Bloom + Chromatic Aberration"
        meta="rotating metallic torus knot (PBR, metalness=0.85, roughness=0.18) · 3-light rig: warm key from upper-right + cool fill from lower-left + amber rim from behind · post stack runs N8AO (halfRes, intensity=3.5, aoRadius=1.2) → Bloom (intensity=0.85, threshold=0.55) → ChromaticAberration (offset=0.0018,0.0012) · this is the canonical baseline every Awwwards-tier site ships"
      />
      <GlitchBurst
        index="Experiment 10"
        title="Glitch burst — click to tear the image"
        meta='SDF text "RichardTheBruce" · idle state: subtle CA + film grain · click anywhere: 500ms burst of CONSTANT_WILD glitch + heavy CA + amplified noise · pattern for accent moments (section crossings, button taps, scroll boundaries) · holding glitch continuously reads broken; pulsing it for half a second reads intentional'
      />
      <LatticeCube
        index="Experiment 11"
        title="Anchored cube lattice — disturb the rest state"
        meta="64 nodes in a 4×4×4 cube · each node is a CPU Verlet particle anchored to its lattice point (K=0.09, damping=0.88) · cursor projects a 3D ray; nodes within 1.2 units of the ray get pushed perpendicular to it (falloff² · strength=0.25) · away from cursor, anchor spring snaps each node back · the cube IS the rest state · no Rapier, no oscillating gravity, no drift"
      />
      <LatticeWord
        index="Experiment 12"
        title='3D "RichardTheBruce" — anchored, cursor-disturbed'
        meta="same lattice versioning as exp 11 · 3500 anchors sampled from Cormorant Garamond letterforms of 'RichardTheBruce' at 180px · z-jitter ±0.18 for 3D thickness when you orbit · cursor ray repel within 0.4 world units, strength 0.16 · text IS the rest state · hover any letter to dent it, the word reforms when cursor leaves"
      />
      <PathDraw
        index="Experiment 13"
        title="Scroll-driven path draw — vector traversal"
        meta="section is 300vh tall · sticky-pinned SVG curve · GSAP ScrollTrigger drives stroke-dashoffset (path draws as you scroll) AND MotionPathPlugin (a glowing dot rides the path) · trail dot lags at scrub=1.6 for a streak · scrub values are tuned through Lenis-smoothed scroll so the whole choreography feels glassy"
      />
      <Caustics
        index="Experiment 14"
        title="Underwater caustic light field"
        meta="fullscreen fragment shader · two-octave moving Gustavson snoise (drifts at 0.10 + 0.13 units/s, opposite directions for shear) · gradient ∇f estimated via central differences (ε=0.012) · caustic = 1/(1+|∇f|²·1.8)^2.4 · 3-stop palette: deep navy → amber → bone · cursor warps sample coords toward it (0.5x) so the light source migrates with you · vignette + Bloom for the underwater bias"
      />
      <CursorMagnet
        index="Experiment 15"
        title="Cursor magnet text — DOM constellation"
        meta="9 phrases scattered in a viewport-relative grid · each tracks the cursor: within 220px the phrase translates toward the cursor with linear-falloff strength (0.35 peak) · per-phrase Verlet (K=0.22, damping=0.72) smooths the response so the words lean rather than snap · first DOM-based experiment in the lab — same physics pattern as the 3D rigs applied to CSS transforms"
      />
    </main>
  );
}
