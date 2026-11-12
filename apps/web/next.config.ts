import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Let Next recover from deployment mismatches without forcing every link to reload.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID ?? process.env.VERCEL_DEPLOYMENT_ID,
  serverExternalPackages: ["@leetcode-app/observability"],
};

export default nextConfig;
