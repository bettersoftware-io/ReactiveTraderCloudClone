// tests/presenter/vitest/vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The config lives two levels below the package root; pin `root` back to
  // tests/ so `include` stays package-root-relative like every other suite.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["presenter/vitest/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});
