import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei", "d3-force", "d3-selection"],
  },
};

export default nextConfig;
