import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei", "d3-force", "d3-selection"],
  },
};

export default nextConfig;
