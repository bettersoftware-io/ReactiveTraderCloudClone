// tests/vitest-presenter-fake.config.ts
import { defineConfig } from "vitest/config";
import quickpickle from "quickpickle";

export default defineConfig({
  plugins: [quickpickle({ stepTimeout: 60_000 })],
  test: {
    include: ["specs/**/*.feature"],
    setupFiles: ["./support/presenter/vitest-fake/setup.ts"],
    testNamePattern: "@presenter",
    reporters: ["default"],
    pool: "threads",
  },
});
