import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  // Standalone output для prod Docker-образа (минимальный server.js +
  // node_modules только нужные). См. apps/admin/Dockerfile + ТЗ M0.
  output: "standalone",
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
