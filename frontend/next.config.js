/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_API_URL ||
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL;

    if (backendUrl && !backendUrl.startsWith("/")) {
      const target = backendUrl.replace(/\/api\/v1\/?$/, "");
      return [
        {
          source: "/api/v1/:path*",
          destination: `${target}/api/v1/:path*`,
        },
        {
          source: "/media/:path*",
          destination: `${target}/media/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
