import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/jsdom-storage.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
