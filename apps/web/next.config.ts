import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const root = path.resolve(process.cwd(), "../..");
loadEnvConfig(root);
const apiOrigin = process.env.STUDIO_API_ORIGIN ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
