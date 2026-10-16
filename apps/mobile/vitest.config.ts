import { defineConfig } from "vitest/config";

// Node environment: the suite covers workspace logic that has no React Native
// runtime, such as the now-playing SSE polyfill, which is plain JavaScript
// driving XMLHttpRequest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});