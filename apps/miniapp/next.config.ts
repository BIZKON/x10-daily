import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Next.js 16 — Cache Components + PPR (см. CLAUDE.md §2)
 * cacheComponents теперь top-level и включает PPR-режим.
 * reactCompiler: автомемоизация (требует babel-plugin-react-compiler).
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  transpilePackages: ["@x10/ui", "@x10/config", "@x10/db"],
  turbopack: {
    root: workspaceRoot,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
