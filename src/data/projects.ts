export type Project = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  role: string;
  dates: string;
  stack: string[];
  links: Array<{ label: string; href: string }>;
  pull: string;
  cluster: "founder" | "frontend" | "research" | "infra";
  size: "hub" | "primary" | "secondary";
  rebound: {
    collapse: string;
    inversion: string;
  };
};

export const projects: Project[] = [
  {
    id: "nuro",
    name: "Nuro Finance",
    tagline: "Agentic finance across 23 chains.",
    description:
      "Founder and CEO. AFI mainnet path on LayerZero V2 and Circle CCTP, Visa rails, x402 native. Sprint 2.3 pushing live end-to-end across 23 chains.",
    role: "Founder, CEO",
    dates: "2025 to present",
    stack: ["TypeScript", "LayerZero V2", "Circle CCTP", "Postgres", "Visa rails", "x402"],
    links: [
      { label: "nuro-cli", href: "https://github.com/RichardTheBruce/nuro-cli" },
    ],
    pull: "23 chains. One agent. Visa-grade rails.",
    cluster: "founder",
    size: "hub",
    rebound: {
      collapse: "Captured institutional finance, 2008 onward",
      inversion:
        "Opacity → on-chain transparency. Centralization → 23 distributed chains. Trusted intermediaries → cryptographic proof. Engineered incomprehensibility → mathematically verifiable rules.",
    },
  },
  {
    id: "memetropolis",
    name: "Memetropolis",
    tagline: "$300K LayerZero V2 cross-chain launchpad.",
    description:
      "Lead architect and frontend. Battle-tested OApp/OFT patterns. Patterns now feeding the Nuro Finance bridge layer.",
    role: "Lead architect",
    dates: "2024 to 2025",
    stack: ["Solidity", "LayerZero V2", "The Graph", "Next.js", "wagmi"],
    links: [
      {
        label: "scalars docs",
        href: "https://welcoming-dazzle-7q822.apidocumentation.com/guide/memetropolis-technical-documentation/1-systems-overview",
      },
    ],
    pull: "The math of the strings.",
    cluster: "infra",
    size: "primary",
    rebound: {
      collapse: "Captured token launch market (rugpulls, opaque tokenomics, intermediary risk)",
      inversion:
        "OFT standard cross-chain settlement. Transparent on-chain mechanics. Patterns now feeding the Nuro Finance bridge layer.",
    },
  },
  {
    id: "2gather",
    name: "2gather",
    tagline: "Invite-only social network.",
    description:
      "Four mobile sprints shipped single-day on 2026-05-19. Expo SDK 54, Supabase, Mapbox, 26-event contract.",
    role: "Solo dev",
    dates: "2026",
    stack: ["Expo SDK 54", "React Native", "Supabase", "Mapbox"],
    links: [{ label: "2gather-mobile.vercel.app", href: "https://2gather-mobile.vercel.app" }],
    pull: "Four sprints. One day. Shipped.",
    cluster: "frontend",
    size: "primary",
    rebound: {
      collapse: "Algorithmic attention economy of captured social networks",
      inversion:
        "Invite-only membership. Real-world events, not infinite feed. Member-owned graph, not platform-extracted.",
    },
  },
  {
    id: "lineage",
    name: "Lineage",
    tagline: "Neural nets for everything.",
    description:
      "Productized intake loop that builds personal neural nets for clients. 10-phase conversation kernel.",
    role: "Founder, builder",
    dates: "2026",
    stack: ["Next.js 16", "Claude API", "Postgres", "Vercel Blob"],
    links: [{ label: "Upwork catalog", href: "https://www.upwork.com/services/product/development-it-you-will-get-your-own-personal-neural-net-custom-built-for-your-life-or-business-2054540114667442621" }],
    pull: "The intake is the first delivery.",
    cluster: "frontend",
    size: "primary",
    rebound: {
      collapse: "Generic-AI consulting market (opaque outputs, customer-owned-nothing)",
      inversion:
        "Each client receives their own portable neural net vault. Their data, their agents, their continuity. The intake itself is the first delivery.",
    },
  },
];

export const projectsById = new Map(projects.map((p) => [p.id, p]));

export const relationships: Array<{ source: string; target: string; weight: number }> = [
  { source: "nuro", target: "memetropolis", weight: 0.9 },
  { source: "nuro", target: "lineage", weight: 0.7 },
  { source: "lineage", target: "2gather", weight: 0.4 },
  { source: "memetropolis", target: "2gather", weight: 0.3 },
  { source: "lineage", target: "memetropolis", weight: 0.3 },
];
