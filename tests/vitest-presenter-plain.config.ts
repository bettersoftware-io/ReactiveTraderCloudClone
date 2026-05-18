import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["presenter-tests/vitest-plain/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});
