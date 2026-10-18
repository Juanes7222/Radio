import { defineConfig } from "vitest/config";

// Minimal Vitest setup for @radio/backend.
// Node environment only: the suite runs pure modules and never boots Prisma,
// so the settings cache can be tested without a database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
