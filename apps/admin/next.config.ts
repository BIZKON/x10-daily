import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

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
};

export default nextConfig;
