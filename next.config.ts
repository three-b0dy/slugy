const nextConfig: import("next").NextConfig = {
  output: "standalone",
  reactCompiler: true,
  allowedDevOrigins: ["oxidize-ashen-pastel.ngrok-free.dev"],

  images: {
    qualities: [70, 75, 85],
    remotePatterns: [
      // CDN and storage services
      { hostname: "public.blob.vercel-storage.com" },
      { hostname: "res.cloudinary.com" },
      { hostname: "zplink.s3.ap-south-1.amazonaws.com" },
      { hostname: "files.slugy.co" },
      { hostname: "opengraph.b-cdn.net" },
      { hostname: "api.producthunt.com" },
      { hostname: "img.shields.io" },
      { hostname: "peerlist.io" },
      { hostname: "github.com" },
      { hostname: "direct" },
      { hostname: "images.unsplash.com" },

      // Social media platforms
      { hostname: "abs.twimg.com" },
      { hostname: "pbs.twimg.com" },

      // Avatar and profile services
      { hostname: "avatar.vercel.sh" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "api.dicebear.com" },

      // Icon and favicon services
      { hostname: "img.icons8.com" },
      { hostname: "twenty-icons.com" },
      { hostname: "favicone.com" },
      { hostname: "biological-zinc-xerinae.faviconkit.com" },

      // External services
      { hostname: "www.google.com" },
      { hostname: "flag.vercel.app" },
      { hostname: "flagcdn.com" },
      { hostname: "illustrations.popsy.co" },
      { hostname: "images.prismic.io" },
      { hostname: "api.microlink.io" },

      // Custom domains
      { hostname: "assets.sandipsarkar.dev" },
      { hostname: "assets.slugy.co" },
      { hostname: "slugy.co" },
      { hostname: "slugylink.github.io" },
      { hostname: "i.postimg.cc" },
    ],
  },

  async redirects() {
    return [
      {
        source: "/onboarding",
        destination: "/onboarding/welcome",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "assets.slugy.co",
          },
        ],
        destination: "https://assets.sandipsarkar.dev/:path*",
      },
    ];
  },
};

export default nextConfig;
