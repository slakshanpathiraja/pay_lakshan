import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg must stay a Node.js dependency, not bundled.
  serverExternalPackages: ["pg", "nodemailer"],
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
