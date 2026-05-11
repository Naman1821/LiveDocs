import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nm = (...parts) => path.join(__dirname, "node_modules", ...parts);

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,

  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: nm("tailwindcss"),
      "tw-animate-css": nm("tw-animate-css"),
      "shadcn/tailwind.css": nm("shadcn", "dist", "tailwind.css"),
      /** One Yjs instance for TipTap + Liveblocks (avoids "Yjs was already imported"). */
      yjs: nm("yjs"),
    },
  },

  // Used when running `next dev --webpack` / `next build --webpack`
  webpack: (config, { dev }) => {
    // Avoid flaky PackFileCacheStrategy ENOENT on missing *.pack.gz under .next/dev/cache/webpack
    // when the dev cache is cleared or out of sync (harmless but noisy). Production keeps disk cache.
    if (dev) {
      config.cache = false;
    }
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: nm("tailwindcss"),
      "tw-animate-css": nm("tw-animate-css"),
      "shadcn/tailwind.css": nm("shadcn", "dist", "tailwind.css"),
      yjs: nm("yjs"),
    };
    return config;
  },
};

export default nextConfig;
