import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  // Never ship browser source maps to production (OWASP Next.js sheet, control 8).
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      // Hard ceiling on a Server Action request body. The transcript rules in
      // lib/transcript/constants.ts are stricter; this is the outer backstop.
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
