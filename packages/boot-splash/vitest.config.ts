import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The six scene variants are imperative 2D-canvas drawing: ~2,150 lines
      // whose entire output is pixels on a context. Unit-testing them means
      // asserting a sequence of calls against a mock CanvasRenderingContext2D,
      // which pins the implementation rather than any behaviour — rename a
      // helper or reorder two strokes and the test fails while the render is
      // identical. Their real oracle is the eye, plus the `boot/chrome` golden.
      //
      // They are excluded from the DENOMINATOR rather than left at 0% because
      // 0% is indistinguishable from "untested and forgotten": it put seven
      // files at the top of every `pnpm coverage:gaps` ranking and dragged this
      // tier to 0.29%, burying the gaps that ARE worth closing.
      //
      // Deliberately NOT excluded: bootCanvas.ts. Most of it is drawing (ignored
      // in-file), but it also exports `hexToRgba` and `ease` — pure functions,
      // cheap to test, and exactly the kind of maths that breaks silently.
      exclude: ["src/variants/**"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
  },
});
