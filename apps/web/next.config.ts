import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@leetcode-app/observability"],
};

export default nextConfig;
