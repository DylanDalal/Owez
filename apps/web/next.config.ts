import type { NextConfig } from "next";

const config: NextConfig = {
  // Transpile the shared workspace package so Turbopack picks up source changes.
  transpilePackages: ["@owez/shared"],
  experimental: {
    // Server Actions are on by default in Next 15 — keep this block for future tweaks.
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
};

export default config;
