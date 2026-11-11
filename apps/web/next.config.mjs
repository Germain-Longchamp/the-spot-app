/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The operator link is a secret: keep it out of Referer headers, search
  // engines and caches.
  async headers() {
    const secret = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      // The admin space shows guest and operator links: same treatment.
      { source: "/admin", headers: secret },
      { source: "/admin/:path*", headers: secret },
      {
        source: "/operateur/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
