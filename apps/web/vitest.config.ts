import path from "node:path";
import { defineConfig } from "vitest/config";

// Minimal Vitest setup for @radio/web.
// Node environment only: the initial suite covers build output budgets,
// import boundaries and static assets, all without a browser.
// A future Playwright layer can own real load and interaction metrics.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
