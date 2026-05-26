/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@owez/shared'],
  // Keep the wasm-backed HEIC converter external so it's required at runtime
  // rather than bundled (libheif's emscripten output isn't statically analyzable).
  serverExternalPackages: ['heic-convert', 'libheif-js'],
};

module.exports = nextConfig;
