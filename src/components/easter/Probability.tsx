"use client";

import { useEffect, useState } from "react";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function ProbabilityEasterEgg() {
  const [active, setActive] = useState(false);
  const [buffer, setBuffer] = useState<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      setBuffer((prev) => {
        const next = [...prev, e.key].slice(-KONAMI.length);
        if (next.length === KONAMI.length && next.every((k, i) => k === KONAMI[i])) {
          setActive(true);
        }
        return next;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0d0428 0%, #2a0a3e 35%, #4a0f5e 70%, #1a042a 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            "linear-gradient(transparent, transparent 96%, rgba(199, 42, 142, 0.6) 96%, rgba(199, 42, 142, 0.6) 100%), repeating-linear-gradient(90deg, transparent 0, transparent 4%, rgba(199, 42, 142, 0.6) 4%, rgba(199, 42, 142, 0.6) 4.1%)",
          transform: "perspective(400px) rotateX(60deg)",
          transformOrigin: "center bottom",
        }}
      />

      <div className="relative z-10 text-center">
        <p
          className="font-mono text-7xl font-bold tracking-widest"
          style={{
            color: "#C72A8E",
            textShadow:
              "0 0 8px #C72A8E, 0 0 24px #C72A8E, 0 0 56px #C72A8E, 4px 0 0 #3FD9FF, -4px 0 0 #3FD9FF",
          }}
        >
          PROBABILITY
        </p>
        <p className="mono-caps mt-4 text-sm" style={{ color: "#3FD9FF" }}>
          14-DIMENSIONAL · WAVEFORM HRM
        </p>
        <p className="mt-12 max-w-md font-sans text-sm text-bone/80">
          The hidden track. Richard built this aesthetic before he built any of the rest. The strings here
          oscillate; they do not draw.
        </p>
        <button
          onClick={() => setActive(false)}
          className="mono-caps mt-16 rounded-sm border px-4 py-2 text-xs"
          style={{ borderColor: "#3FD9FF", color: "#3FD9FF" }}
        >
          close the rift
        </button>
      </div>
    </div>
  );
}
