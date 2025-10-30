import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.ap-southeast-1.amazonaws.com',
        port: '',
        pathname: '/media.property-stewards.com/**',
      },
    ],
  },
  experimental: {
    // Ensure native binaries are available in serverless
    serverComponentsExternalPackages: ["pdfkit", "sharp"],
  },
};

export default nextConfig;
