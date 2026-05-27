import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0B",
        bone: "#F5F2EC",
        string: {
          DEFAULT: "#1E96E6",
          bright: "#3DA9FC",
        },
        amber: {
          DEFAULT: "#C97D3E",
          deep: "#8A5128",
        },
        field: {
          peak: "#1A0B2E",
          warm: "#F7E6D0",
        },
        probability: {
          magenta: "#C72A8E",
          cyan: "#3FD9FF",
        },
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tight: "-0.02em",
      },
      keyframes: {
        "amber-pulse": {
          "0%, 100%": { opacity: "0.85", textShadow: "0 0 24px rgba(201, 125, 62, 0.4)" },
          "50%": { opacity: "1", textShadow: "0 0 40px rgba(201, 125, 62, 0.7)" },
        },
        "string-draw": {
          from: { strokeDashoffset: "1" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "amber-pulse": "amber-pulse 1.25s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
