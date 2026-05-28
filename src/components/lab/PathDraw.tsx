"use client";

// Experiment 13: Scroll-driven SVG path draw + object traversal.
//
// The section is 300vh tall. Inside, a sticky container holds an SVG with
// a flowing curve. As the user scrolls, two things happen in lockstep:
//   1. The path draws progressively (stroke-dashoffset 100% → 0%)
//   2. A glowing dot traverses the path (GSAP MotionPathPlugin)
//
// Both are driven by ScrollTrigger with scrub, so the dot and the drawn
// stroke advance and retreat exactly in time with the scroll position.
// Lenis (wired at layout level) smooths the underlying scroll input, so the
// motion feels glassy rather than wheel-snappy.

import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

export function PathDraw({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const path = pathRef.current;
    const dot = dotRef.current;
    const trail = trailRef.current;
    const progress = progressRef.current;
    if (!section || !path || !dot || !trail || !progress) return;

    const pathLength = path.getTotalLength();
    gsap.set(path, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
    });

    const ctx = gsap.context(() => {
      // Stroke draws as scroll progresses
      gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
        },
      });

      // Dot rides the path
      gsap.to(dot, {
        motionPath: {
          path: path,
          align: path,
          alignOrigin: [0.5, 0.5],
        },
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
        },
      });

      // Trail (slightly laggy second dot) for a streak effect
      gsap.to(trail, {
        motionPath: {
          path: path,
          align: path,
          alignOrigin: [0.5, 0.5],
        },
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.6,
        },
      });

      // Progress bar
      gsap.to(progress, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.2,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-[300vh] w-full border-b border-bone/5 bg-ink"
    >
      <div
        ref={stickyRef}
        className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden"
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1440 800"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <radialGradient id="pd-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F5F2EC" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#F5F2EC" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#F5F2EC" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            ref={pathRef}
            // A flowing journey: rise from lower-left, sweep up, dip, climb,
            // overshoot, settle, exit lower-right.
            d="M 80 620
               C 220 620, 320 200, 480 200
               S 760 620, 920 480
               S 1200 180, 1280 280
               S 1340 540, 1380 620"
            stroke="#C97D3E"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Trail dot (slightly laggy) */}
        <div
          ref={trailRef}
          className="pointer-events-none absolute z-10 h-2.5 w-2.5 rounded-full bg-bone/40"
          style={{ left: 0, top: 0, filter: "blur(4px)" }}
        />

        {/* Lead dot */}
        <div
          ref={dotRef}
          className="pointer-events-none absolute z-20 h-3 w-3 rounded-full bg-bone"
          style={{
            left: 0,
            top: 0,
            boxShadow:
              "0 0 12px #F5F2EC, 0 0 32px #C97D3E, 0 0 56px #C97D3E66",
          }}
        />

        {/* Caption */}
        <div className="pointer-events-none absolute left-6 top-6 z-30">
          <p className="mono-caps text-[10px] text-bone/40">{index}</p>
          <p className="font-serif text-2xl text-bone/80">{title}</p>
          <p className="mono-caps mt-2 max-w-[680px] text-[10px] text-bone/30">
            {meta}
          </p>
        </div>

        {/* Scroll progress bar */}
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-30 h-px w-[260px] -translate-x-1/2 bg-bone/10">
          <div
            ref={progressRef}
            className="h-full origin-left bg-amber/80"
            style={{ background: "#C97D3E", transform: "scaleX(0)" }}
          />
        </div>

        <p className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 mono-caps text-[10px] tracking-[0.3em] text-bone/30">
          scroll to draw the path
        </p>
      </div>
    </section>
  );
}
