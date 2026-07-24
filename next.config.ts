import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors previously did not fail the build, which is how a missing
  // `components/dashboard/types` module went unnoticed across the whole UI.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
