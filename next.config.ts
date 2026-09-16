import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Allow HMR/dev resources when the dev server is reached via these hosts (e.g. a
  // Cloud Agent VM browsing 127.0.0.1). Next 16 blocks cross-origin dev requests by
  // default, which otherwise stalls client hydration. Dev-only; no production effect.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
