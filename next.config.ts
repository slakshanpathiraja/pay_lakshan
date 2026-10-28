import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg must stay a Node.js dependency, not bundled.
  serverExternalPackages: ["pg", "nodemailer"],
  // `npm run dev` behind the Cloudflare tunnel: let pages opened at the tunnel's domain load
  // the dev-only scripts (otherwise they never start — e.g. the checkout return page's redirect)
  allowedDevOrigins: ["pay4.lakshan.dev", "*.lakshan.dev"],
  poweredByHeader: false,
  // the portal is never shown inside another site's frame (clickjacking), browsers stick to
  // https, and don't guess content types
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
