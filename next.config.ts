import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are downscaled in the browser before upload, so 4mb is plenty.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
