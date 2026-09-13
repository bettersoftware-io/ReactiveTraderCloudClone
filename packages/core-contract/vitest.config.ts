import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only this package's OWN tests — the registry drift test. The suites
    // under src/suites/ are exported spec functions: they run inside each
    // core's runner file (packages/<core>/src/composition.coreContract.test.ts),
    // never here.
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
