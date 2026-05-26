import type { NextConfig } from "next";

const config: NextConfig = {
  // Transpile the shared workspace package so Turbopack picks up source changes.
  transpilePackages: ["@owez/shared"],
  // heic-convert / libheif-js ship a wasm emscripten bundle that webpack can't
  // statically analyze. Keep them external so they're required from node_modules
  // at runtime (and traced into the serverless function) instead of bundled.
  serverExternalPackages: ["heic-convert", "libheif-js"],
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
