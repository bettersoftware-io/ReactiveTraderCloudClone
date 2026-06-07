// tests/presenter/vitest-fake-timers/vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import quickpickle from "quickpickle";

export default defineConfig({
  // The config lives two levels below the package root; pin `root` back to
  // tests/ so include/setupFiles stay package-root-relative like every suite.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  // qpickle-loader's internal step-timeout uses global setTimeout, which
  // vi.useFakeTimers() patches. A step calling vi.advanceTimersByTimeAsync(N)
  // also fires that timeout if N >= stepTimeout. Current worst case:
  // buyNTimesWithDismissals(n=5) advances ~30s of virtual time per call.
  // Keep stepTimeout > the largest single advancement across all @presenter
  // steps. Default (3000ms) is far too small for fake-timer scenarios.
  plugins: [quickpickle({ stepTimeout: 60_000 })],
  test: {
    include: ["specs/**/*.feature"],
    setupFiles: ["./presenter/vitest-fake-timers/setup.ts"],
    testNamePattern: "@presenter",
    reporters: ["default"],
    pool: "threads",
  },
});
