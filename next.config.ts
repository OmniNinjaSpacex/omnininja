import type { NextConfig } from "next";

const isSitesBuild = process.env.npm_lifecycle_event === "build:sites";

const nextConfig: NextConfig = {
  // Node deployments need Next's standalone server. Sites/vinext emits a
  // Cloudflare Worker bundle instead, so asking it to also copy Node runtime
  // dependencies can misclassify Worker-only virtual WASM modules as packages.
  output: isSitesBuild ? undefined : "standalone",
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
