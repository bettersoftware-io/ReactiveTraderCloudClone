// tests/vitest-presenter-fake.config.ts
import { defineConfig } from "vitest/config";
import quickpickle from "quickpickle";

export default defineConfig({
  // qpickle-loader's internal step-timeout uses global setTimeout, which
  // vi.useFakeTimers() patches. A step calling vi.advanceTimersByTimeAsync(N)
  // also fires that timeout if N >= stepTimeout. Current worst case:
  // buyNTimesWithDismissals(n=5) advances ~30s of virtual time per call.
  // Keep stepTimeout > the largest single advancement across all @presenter
  // steps. Default (3000ms) is far too small for fake-timer scenarios.
  plugins: [quickpickle({ stepTimeout: 60_000 })],
  test: {
    include: ["specs/**/*.feature"],
    setupFiles: ["./support/presenter/vitest-fake/setup.ts"],
    testNamePattern: "@presenter",
    reporters: ["default"],
    pool: "threads",
  },
});
