import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg must stay a Node.js dependency, not bundled.
  serverExternalPackages: ["pg", "nodemailer"],
  // `npm run dev` behind the Cloudflare tunnel: let pages opened at the tunnel's domain load
  // the dev-only scripts (otherwise they never start — e.g. the checkout return page's redirect)
  allowedDevOrigins: ["pay4.lakshan.dev", "*.lakshan.dev"],
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
