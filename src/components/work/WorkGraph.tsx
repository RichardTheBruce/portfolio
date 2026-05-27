"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { projects, relationships, type Project } from "@/data/projects";

type Node = Project & SimulationNodeDatum;
type Link = SimulationLinkDatum<Node> & { weight: number };

const SIZE_RADIUS: Record<Project["size"], number> = {
  hub: 42,
  primary: 28,
  secondary: 22,
};

const CLUSTER_COLOR: Record<Project["cluster"], string> = {
  founder: "#C97D3E",
  frontend: "#3FA66B",
  research: "#7E5BCC",
  infra: "#1E96E6",
};

// IMPORTANT6 / Important1 vector burst aesthetic: loose blue lines radiating
// asymmetrically from a central anchor, like a comet trail or angel wing
// caught mid-flight. Renders behind the work-graph at very low opacity.
function BurstLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g stroke="#1E96E6" strokeWidth="0.7" fill="none">
        <line x1="500" y1="500" x2="80" y2="120" />
        <line x1="500" y1="500" x2="60" y2="280" />
        <line x1="500" y1="500" x2="90" y2="480" />
        <line x1="500" y1="500" x2="70" y2="720" />
        <line x1="500" y1="500" x2="120" y2="900" />
        <line x1="500" y1="500" x2="280" y2="60" />
        <line x1="500" y1="500" x2="500" y2="40" />
        <line x1="500" y1="500" x2="720" y2="50" />
        <line x1="500" y1="500" x2="920" y2="80" />
        <line x1="500" y1="500" x2="940" y2="260" />
        <line x1="500" y1="500" x2="950" y2="460" />
        <line x1="500" y1="500" x2="930" y2="660" />
        <line x1="500" y1="500" x2="900" y2="880" />
        <line x1="500" y1="500" x2="700" y2="940" />
        <line x1="500" y1="500" x2="500" y2="960" />
        <line x1="500" y1="500" x2="320" y2="920" />
        <line x1="200" y1="200" x2="800" y2="800" />
        <line x1="800" y1="200" x2="200" y2="800" />
        <line x1="100" y1="500" x2="900" y2="500" />
        <line x1="500" y1="100" x2="500" y2="900" />
      </g>
    </svg>
  );
}

export function WorkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>(() => projects.map((p) => ({ ...p })));
  const [links] = useState<Link[]>(() =>
    relationships.map((r) => ({ source: r.source, target: r.target, weight: r.weight }))
  );
  const simRef = useRef<Simulation<Node, Link> | null>(null);

  useEffect(() => {
    const width = 1000;
    const height = 640;
    const sim = forceSimulation<Node, Link>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((d) => 220 - d.weight * 80)
          .strength((d) => d.weight)
      )
      .force("charge", forceManyBody().strength(-380))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<Node>().radius((d) => SIZE_RADIUS[d.size] + 16)
      )
      .alphaDecay(0.04)
      .on("tick", () => setNodes((curr) => [...curr]));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, []);

  const hoveredNeighbors = (() => {
    if (!hoverId) return new Set<string>();
    const set = new Set<string>([hoverId]);
    for (const link of links) {
      const sId = typeof link.source === "string" ? link.source : (link.source as Node).id;
      const tId = typeof link.target === "string" ? link.target : (link.target as Node).id;
      if (sId === hoverId) set.add(tId);
      if (tId === hoverId) set.add(sId);
    }
    return set;
  })();

  const selectedProject = selectedId ? projects.find((p) => p.id === selectedId) ?? null : null;

  return (
    <section className="relative flex w-full flex-col items-center overflow-hidden bg-ink px-6 py-32 md:px-16">
      <BurstLines />

      <div className="relative z-10 mb-16 max-w-4xl text-center">
        <p className="mono-caps mb-4 text-xs text-bone/40">The work</p>
        <h2 className="serif-display text-5xl text-bone md:text-7xl">
          Each project is a Stage 4 <span className="amber-glow">rebound</span>.
        </h2>
        <p className="mt-6 max-w-2xl mx-auto font-sans text-base text-bone/60">
          Per the resistance innovation cycle: institutional collapse produces a counter-form whose
          architecture is the inverse of the collapse inputs. Pull any node to see what each project
          inverts.
        </p>
      </div>

      <div className="relative w-full max-w-6xl">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 640"
          className="aspect-[1000/640] w-full"
          onMouseLeave={() => setHoverId(null)}
        >
          <g>
            {links.map((link, i) => {
              const s = link.source as Node;
              const t = link.target as Node;
              if (!s.x || !t.x) return null;
              const active = hoverId && (s.id === hoverId || t.id === hoverId);
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={active ? "#3DA9FC" : "#1E96E6"}
                  strokeWidth={active ? 1.6 : 0.6}
                  strokeOpacity={active ? 0.95 : 0.35}
                  className="transition-all duration-300"
                />
              );
            })}
          </g>

          <g>
            {nodes.map((node) => {
              const r = SIZE_RADIUS[node.size];
              const isHover = hoverId === node.id;
              const isInNeighbor = hoveredNeighbors.has(node.id);
              const isSelected = selectedId === node.id;
              const dim = hoverId && !isInNeighbor;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoverId(node.id)}
                  onClick={() => setSelectedId(node.id)}
                  style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                  className="transition-opacity duration-300"
                >
                  <circle
                    r={r + (isHover || isSelected ? 4 : 0)}
                    fill={CLUSTER_COLOR[node.cluster]}
                    fillOpacity={isHover || isSelected ? 1 : 0.85}
                    stroke={isSelected ? "#F5F2EC" : "transparent"}
                    strokeWidth={2}
                    className="transition-all duration-300"
                  />
                  <text
                    y={r + 22}
                    textAnchor="middle"
                    fontFamily="var(--font-jetbrains)"
                    fontSize="11"
                    fill="#F5F2EC"
                    fillOpacity={0.85}
                    style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {hoverId && (
          <div className="pointer-events-none absolute bottom-6 right-6 max-w-sm rounded-sm border-l-2 border-amber bg-ink/80 p-4 backdrop-blur">
            <p className="mono-caps text-[10px] text-bone/40">Pull quote</p>
            <p className="mt-1 font-serif text-xl text-bone">
              {projects.find((p) => p.id === hoverId)?.pull}
            </p>
          </div>
        )}
      </div>

      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-6 backdrop-blur" onClick={() => setSelectedId(null)}>
          <div
            className="relative max-w-3xl rounded-sm border border-bone/10 bg-ink p-12"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedId(null)}
              className="mono-caps absolute right-6 top-6 text-xs text-bone/40 hover:text-amber"
            >
              close
            </button>
            <p className="mono-caps mb-3 text-xs text-amber">{selectedProject.role}</p>
            <h3 className="serif-display text-5xl text-bone">{selectedProject.name}</h3>
            <p className="mt-1 font-serif text-2xl italic text-bone/60">{selectedProject.tagline}</p>
            <p className="mt-6 font-sans text-base leading-relaxed text-bone/80">
              {selectedProject.description}
            </p>

            <div className="mt-8 border-l-2 border-amber/60 pl-5">
              <p className="mono-caps mb-1 text-[10px] text-amber/80">Rebound to</p>
              <p className="font-serif text-lg italic text-bone/80">{selectedProject.rebound.collapse}</p>
              <p className="mt-3 mono-caps text-[10px] text-bone/40">Inversion</p>
              <p className="font-sans text-sm leading-relaxed text-bone/70">{selectedProject.rebound.inversion}</p>
            </div>

            <p className="mono-caps mt-8 text-[10px] text-bone/40">{selectedProject.dates}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {selectedProject.stack.map((s) => (
                <li
                  key={s}
                  className="mono-caps rounded-sm border border-bone/15 px-2 py-1 text-[10px] text-bone/60"
                >
                  {s}
                </li>
              ))}
            </ul>
            <ul className="mt-8 flex flex-wrap gap-4">
              {selectedProject.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono-caps text-xs text-amber hover:text-bone"
                  >
                    {l.label} →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
