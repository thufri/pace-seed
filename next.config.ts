import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading 3D models and assets from Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
