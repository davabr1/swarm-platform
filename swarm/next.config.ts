import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
  async redirects() {
    return [
      { source: "/apply-expert", destination: "/become", permanent: true },
    ];
  },
};

export default nextConfig;
