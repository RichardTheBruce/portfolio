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
import { brainNodes, brainEdges, brainClusterColor, type BrainNode } from "@/data/brain-nodes";

type Node = BrainNode & SimulationNodeDatum;
type Link = SimulationLinkDatum<Node>;

const WIDTH = 1200;
const HEIGHT = 760;

export function Brain() {
  const [nodes] = useState<Node[]>(() => brainNodes.map((n) => ({ ...n })));
  const [links] = useState<Link[]>(() => brainEdges.map((e) => ({ source: e.source, target: e.target })));
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const simRef = useRef<Simulation<Node, Link> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const sim = forceSimulation<Node, Link>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(60)
          .strength(0.4)
      )
      .force("charge", forceManyBody().strength(-130))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        "collide",
        forceCollide<Node>().radius((d) => 6 + Math.sqrt(d.weight) * 1.5)
      )
      .alphaDecay(0.012)
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  function toSvgCoords(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    const y = ((clientY - rect.top) / rect.height) * HEIGHT;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    draggingRef.current = { id, offsetX: x - (node.x ?? 0), offsetY: y - (node.y ?? 0) };
    (e.target as Element).setPointerCapture(e.pointerId);
    if (simRef.current) simRef.current.alphaTarget(0.3).restart();
    node.fx = node.x;
    node.fy = node.y;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const node = nodes.find((n) => n.id === draggingRef.current!.id);
    if (!node) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    node.fx = x - draggingRef.current.offsetX;
    node.fy = y - draggingRef.current.offsetY;
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const node = nodes.find((n) => n.id === draggingRef.current!.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    if (simRef.current) simRef.current.alphaTarget(0);
    draggingRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  const selectedNode = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const hoverNeighbors = (() => {
    if (!hover) return new Set<string>();
    const set = new Set<string>([hover]);
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : (l.source as Node).id;
      const t = typeof l.target === "string" ? l.target : (l.target as Node).id;
      if (s === hover) set.add(t);
      if (t === hover) set.add(s);
    }
    return set;
  })();

  return (
    <section className="relative flex w-full flex-col items-center bg-ink px-6 py-32 md:px-16">
      <div className="mb-12 max-w-4xl text-center">
        <p className="mono-caps mb-4 text-xs text-bone/40">The brain</p>
        <h2 className="serif-display text-5xl text-bone md:text-7xl">
          Drag a node. The rest <span className="amber-glow">springs</span> back.
        </h2>
        <p className="mt-6 font-sans text-base text-bone/60">
          A curated 60-node subset of the Mythos vault. Each node is a real markdown file. The edges are real
          backlinks.
        </p>
      </div>

      <div className="relative w-full max-w-7xl rounded-sm border border-bone/10 bg-ink">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="aspect-[1200/760] w-full"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g>
            {links.map((l, i) => {
              const s = l.source as Node;
              const t = l.target as Node;
              if (s.x === undefined || t.x === undefined) return null;
              const active = hover && (s.id === hover || t.id === hover);
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={active ? "#3DA9FC" : "#1E96E6"}
                  strokeOpacity={active ? 0.9 : 0.18}
                  strokeWidth={active ? 1.2 : 0.5}
                />
              );
            })}
          </g>
          <g>
            {nodes.map((node) => {
              const r = 4 + Math.sqrt(node.weight) * 1.4;
              const isHover = hover === node.id;
              const isInNeighbor = hoverNeighbors.has(node.id);
              const dim = hover && !isInNeighbor;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                  onPointerDown={(e) => onPointerDown(e, node.id)}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(node.id)}
                  style={{ cursor: "grab", opacity: dim ? 0.2 : 1 }}
                  className="transition-opacity duration-200"
                >
                  <circle
                    r={r + (isHover ? 2 : 0)}
                    fill={brainClusterColor[node.cluster]}
                    fillOpacity={isHover ? 1 : 0.78}
                  />
                  {(isHover || node.weight > 9) && (
                    <text
                      y={r + 12}
                      textAnchor="middle"
                      fontFamily="var(--font-jetbrains)"
                      fontSize="9"
                      fill="#F5F2EC"
                      fillOpacity={isHover ? 0.95 : 0.55}
                      style={{ letterSpacing: "0.08em", pointerEvents: "none" }}
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {selectedNode && (
          <div className="pointer-events-auto absolute right-6 top-6 max-w-xs rounded-sm border-l-2 border-amber bg-ink/90 p-4 backdrop-blur">
            <button
              onClick={() => setSelected(null)}
              className="mono-caps absolute right-3 top-3 text-[10px] text-bone/40 hover:text-amber"
            >
              ×
            </button>
            <p className="mono-caps text-[10px]" style={{ color: brainClusterColor[selectedNode.cluster] }}>
              {selectedNode.cluster}
            </p>
            <p className="mt-1 font-serif text-xl text-bone">{selectedNode.label}</p>
            {selectedNode.excerpt && (
              <p className="mt-2 font-sans text-sm leading-relaxed text-bone/60">{selectedNode.excerpt}</p>
            )}
            <p className="mono-caps mt-3 text-[9px] text-bone/30">weight {selectedNode.weight}</p>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        {Object.entries(brainClusterColor).map(([cluster, color]) => (
          <div key={cluster} className="flex items-center gap-2">
            <span className="block h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="mono-caps text-[10px] text-bone/50">{cluster}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
