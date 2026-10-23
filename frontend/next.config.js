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
    let backendUrl =
      process.env.INTERNAL_API_URL ||
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL;

    if (!backendUrl || backendUrl.trim() === "" || backendUrl === "/") {
      return [];
    }

    backendUrl = backendUrl.trim().replace(/\/api\/v1\/?$/, "");

    // If backendUrl is just a relative path like "/api/v1", no external proxy rewrite needed
    if (backendUrl.startsWith("/")) {
      return [];
    }

    // Next.js destination strictly requires starting with "/", "http://", or "https://"
    if (!backendUrl.startsWith("http://") && !backendUrl.startsWith("https://")) {
      if (
        backendUrl.includes("localhost") ||
        backendUrl.includes("127.0.0.1") ||
        !backendUrl.includes(".")
      ) {
        backendUrl = `http://${backendUrl}`;
      } else {
        backendUrl = `https://${backendUrl}`;
      }
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${backendUrl}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
