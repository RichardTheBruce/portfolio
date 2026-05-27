# RichardTheBruce.dev Portfolio Spec

Locked 2026-05-27. Every visual decision cites a corpus screenshot by file path per workspace CLAUDE.md rule 3.

## North star

A personal dev portfolio that is unmistakably Richard. Not a generic dev-portfolio template. Theme set by the editorial restraint of INTERFACE (v0 template #1) — minimal monochrome canvas with one accent letter doing the heavy lifting — overlaid with the **blue vector string field** Richard documented in his scalar physics research, plus a real particle physics simulation that responds to the mouse, and an interactive force-directed graph of his actual second brain.

The "strings" are not decoration. They are the metaphor Richard built his cosmology around — the linear/oscillatory probability vectors he described as "keys to heaven." They thread the whole site.

## Theme anchor

Source: `mythos/research/frontend/_corpus/screenshots/richardthebruce-portfolio/v0-1-interface-MASTER-desktop.png`

Lifts:
- Near-black canvas, full bleed
- One display word per moment, oversized serif
- ONE letter recolored to the accent (INTERFACE: orange E; ours: amber R in Richard, amber B in Bruce)
- Tagline in small mono caps below
- Negative space carries the page

## Palette (locked)

| Token | Hex | Source citation | Use |
|---|---|---|---|
| `--ink` | `#0A0A0B` | `v0-1-interface-MASTER-desktop.png` (canvas) | Page background |
| `--bone` | `#F5F2EC` | Lineage palette (cross-brand thread) | Body text |
| `--string` | `#1E96E6` | `OneDrive/Desktop/Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg` (the blue vector lines) | Force-graph edges + string overlay |
| `--string-bright` | `#3DA9FC` | Same source, brighter line cluster | Hover state on strings |
| `--amber` | `#C97D3E` | Lineage accent (cross-brand) + `v0-1-interface-MASTER-desktop.png` (the orange E) | Accent letters, CTAs |
| `--field-peak` | `#1A0B2E` | `Taste BABY/ImportantMythos.png` (deep peak of scalar field) | Section deep-tones |
| `--field-warm` | `#F7E6D0` | `Taste BABY/ImportantMythos.png` (positive lobe of scalar field) | Section warm-tones |
| `--probability-magenta` | `#C72A8E` | `Taste BABY/Important22.png` (your PROBABILITY title) | Easter-egg synthwave moment |
| `--probability-cyan` | `#3FD9FF` | `Taste BABY/Important22.png` (your 14-DIMENSIONAL accent) | Same easter-egg |

The base palette is monochrome + blue strings + amber accent. The synthwave magenta/cyan from your PROBABILITY work shows up in ONE place: a hidden "14-DIMENSIONAL" easter egg section. Not on the main brand surface.

## Typography (locked, cross-brand with Lineage)

- **Display**: Cormorant Garamond, weight 700, tracking -0.02em for the name and section titles
- **Body**: Inter, weight 400 for prose, weight 500 for small UI
- **Mono**: JetBrains Mono, weight 400, used for tags, labels, and the .md brain node names
- Source for cross-brand match: `Richard Wayne/app/tailwind.config.ts` (Lineage)

## Sections

### 1. Hero — "The particle name"
Mass-bound particle field renders the word **RichardTheBruce** in `--bone` particles on `--ink`. Particle count target: ~3,500 to ~5,000 (depends on Council variant).

On mouse hover within radius `r ≤ 140px`, particles are pushed away by an inverse-square repel force, with damping. Outside the radius, particles return to their rest position via spring force.

Mouse leaves the canvas → particles drift through 300ms Brownian settle before locking back.

Accent letter (one of `R`, `B`, the period) glows in `--amber` and pulses at 0.8Hz.

Below the name: a single line in JetBrains Mono caps cycling through:
- `FOUNDER · NURO FINANCE`
- `MASTER SCALAR PHYSICIST`
- `STRINGS · PARTICLES · KEYS TO HEAVEN`
- `HE WHO CREATES`

Source citations:
- Particle word concept: `Taste BABY/ImportantParticleWork5.png` (your own particle-grid rendering of a unit, top + middle panels)
- Mouse-repel motion: `Taste BABY/ImportantParticleWork.png1.png` (particles diffused across a band — the dispersal pattern)
- Density target: `Taste BABY/ImportantParticleWork3.png1.png` (dense particle fog)
- Canvas treatment: `v0-1-interface-MASTER-desktop.png` (negative-space-heavy)
- Particle motion velocity behavior reference: `v0-4-lelo-saas-landing-desktop.png` (LeLo's diagonal particle stream is the slow-drift baseline)

### 2. The arc — "Editorial single statement"
One serif paragraph, INTERFACE-style. Center column. Roughly:

> **DevOps. Then designer. Then systems architect. Then founder.  
> Now building neural nets for everything.**

The letter `n` in "neural" is `--amber`. The rest is `--bone`.

A faint string-vector field is drawn behind, sparse, ~12 lines, low-opacity 8%.

Source: `v0-1-interface-MASTER-desktop.png` (the typography rhythm), `Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg` (the string field skeleton).

### 3. Work — "Force graph of projects"
Five project nodes laid out in a force-directed graph, EXACTLY like Richard's own Obsidian view but curated:
- **Nuro Finance** (large hub node, accent amber)
- **2gather** (mid node)
- **Lineage** (mid node)
- **Memetropolis** (mid node)
- **GBlock** (mid node)

Each node has a thumbnail (project shot or icon). Hovering a node:
1. Brightens its blue strings to `--string-bright`
2. Pulls all 4 other nodes' strings toward it, briefly tensioning the graph
3. Reveals a 1-sentence pull quote in JetBrains Mono caps to the right

Clicking opens a deep card: large project shot, role, dates, tech stack, link to repo or live site.

Source citations:
- Layout: `Taste BABY/Important11.png` and `IMPORTANT12.jpg` (MinFish BTC force graph)
- Node + edge color: `Taste BABY/IMPORTANT_WAVE_OSCILLATION.jpg` (the blue vector intercession lines)
- Brain density: `Taste BABY/Important26.png` (your real Obsidian export with cluster topology)

### 4. Math — "The scalar field viewer"
A literal Matplotlib-style scalar-field renderer running in the browser. Cycles through three captured states from Richard's actual research, with the title in JetBrains Mono caps:

> `FIELD STRUCTURE — CRITICAL POINT (2, 7, 19) — SPIN 1.5 — TILT 0.5`

The viewer is canvas-rendered using a sampled colormap that matches Richard's matplotlib output. Mouse-drag rotates the "spin" axis. Mouse-wheel adjusts "tilt."

Source citations:
- Layout + colorbar style: `Taste BABY/SeeMythos1.png`, `SeeMythos3.png`, `SeeMythos5.png` (your real plots)
- Colormap: `Taste BABY/ImportantMythos.png` (the Optimized Field Structure)
- Link out to the scalars: https://welcoming-dazzle-7q822.apidocumentation.com/guide/memetropolis-technical-documentation/1-systems-overview

### 5. The brain — "Draggable .md neural net"
An embedded force-directed graph rendered from a curated subset of Richard's Mythos vault. Roughly 80-120 nodes, 8-12 cluster colors. Drag any node and watch the rest of the graph spring back into equilibrium. Click a node to see the markdown excerpt in a sidebar.

Nodes are sized by backlink count. Colors map to project (Nuro = amber, 2gather = green, Lineage = blue, Memetropolis = purple, Mythos = bone, scalar research = warm peach).

Source: `Taste BABY/Important26.png` is the literal target visual. We're recreating that exact graph aesthetic in-browser.

### 6. Reach — "The tying off"
Footer where all the strings converge. Single line of links: GBlock, GitHub (RichardTheBruce), LinkedIn (richard-wayne-nuro), Upwork (catalog 2054540114667442621). Each link is a node terminating one of the strings from above.

### Easter egg — "14-DIMENSIONAL"
Triggered by Konami code or by clicking the `(2, 7, 19)` numerals five times. Page background flips to your synthwave palette (magenta + cyan, magenta perspective grid floor) and plays your "PROBABILITY WAVEFORM HRM" treatment.

Source: `Taste BABY/Important22.png` — the synthwave control panel is your own work and earns its cameo.

## Tech stack

- **Framework**: Next.js 16 (App Router, React Server Components for static sections, Client Components for the canvas + force graph)
- **Particle hero**: React Three Fiber + Three.js with a custom `InstancedBufferGeometry` of particle quads. ~5K instances. Mouse repel via shader uniform.
- **Force graph (work + brain)**: `three-forcegraph` (3D-capable, runs in same Three context as the hero for unified scene) OR `react-force-graph-2d` for performance if we keep it 2D
- **String overlay (cross-section)**: Custom SVG layer driven by GSAP timelines, drawn over the canvas, masked per section
- **Animation orchestration**: GSAP 3 with ScrollTrigger
- **Styling**: Tailwind CSS with the locked palette as CSS variables
- **Type**: next/font for Cormorant Garamond + Inter + JetBrains Mono
- **Build**: Vercel
- **Repo**: github.com/RichardTheBruce/portfolio (private during build, public on first deploy)

## Performance budget

- LCP ≤ 1.8s on desktop, ≤ 2.5s on a Pixel 5
- Hero canvas: hold 60 fps with 5,000 particles on a 2021 MacBook Pro, gracefully scale down to 2,000 on mobile (detected via `navigator.hardwareConcurrency < 6`)
- Total JS shipped: ≤ 280 kB gzipped
- No layout shift on font load (use `next/font` swap with size-adjust)
- Respect `prefers-reduced-motion`: particles freeze at rest position, force graph still draggable, strings static

## Out of scope for v1

- AGI Terminal section (intentionally blank slot per Richard's note)
- Blog posts under the portfolio (those live at gblock.gg already)
- Contact form (replaced by links to Upwork + LinkedIn + email)
- Dark/light mode toggle (we are dark only — INTERFACE-style commitment)
- i18n
- CMS or any content backend (this is a hand-curated static site)

## Council brief (to be dispatched to fe-particle-specialist)

Three variants for the **hero** section's particle field:

**Variant A — Field of points, single layer**: 5,000 particle quads in a flat 2D plane, each ~2px, color `--bone`. Mouse repel within 140px, exponential falloff. Letters spelled by sampling target positions on a hidden offscreen canvas where "RichardTheBruce" is rendered in Cormorant Garamond Bold at 200px. Idle motion: 0.15px/frame Brownian.

**Variant B — Field of strings, micro-segments**: 1,200 short line segments (each 4px long), each connecting two nearby points. Mouse drags the segment endpoints in the repel field. This makes the field LOOK like Richard's IMPORTANT_WAVE_OSCILLATION vector stars at micro scale. Slower compute but a closer brand match.

**Variant C — Hybrid mass + strings**: 3,000 points like Variant A, but every 8th-frame the engine draws blue vector lines between the 1,500 nearest neighbor pairs (within 60px). The site signature emerges from the particle dynamics. Highest compute, best art.

For each variant the Council reports:
- Tech feasibility (does it hit 60fps with 5K particles?)
- Visual differentiation
- Code surface area (LoC estimate)
- Recommendation: SHIP / ITERATE / REJECT

## Open decisions

1. Domain: `richardthebruce.dev` vs `richardwayne.dev` vs first-deploy on `richardthebruce-portfolio.vercel.app` until Richard picks one. Default to vercel.app subdomain for v1.
2. AGI Terminal: stay blank slot, or pull placeholder copy from Mythos description? Default: blank with a "(coming)" mono tag.
3. The brain (#5): build the force graph from a CURATED snapshot of Mythos vault (~100 nodes), or do a full export? Default: curate to 100 nodes for both perf and signal.

## Lineage

This spec inherits Lineage's brand DNA (Cormorant + Inter + JetBrains Mono, amber accent, cream as a body tone) but flips the canvas from cream → near-black. The two surfaces are siblings, not twins. Lineage is the warm intake experience. Portfolio is the dark scientific atelier.
