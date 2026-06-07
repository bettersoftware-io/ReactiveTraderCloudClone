import os from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Tier 3: Vitest browser mode (`@vitest/browser` + `vitest-browser-react`) using
// the experimental `toMatchScreenshot` matcher (Vitest 4). Mounts the React
// harness in a real Chromium via the Playwright provider and diffs against the
// SAME committed goldens as the other tiers.
//
// Goldens are routed by environment exactly like the Playwright tiers (see
// playwright.config.ts): CI (x86 Linux container) owns the canonical `react/`
// set; a local dev machine writes its own committed `react-local/<plat>-<arch>/`
// set, because font rasterization differs by OS/arch. See ADR-001.
const baseline = process.env.CI ? "react" : `react-local/${os.platform()}-${os.arch()}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ui-harness": fileURLToPath(new URL("./visual/react", import.meta.url)),
    },
  },
  test: {
    include: ["visual/vitest-browser/**/*.spec.tsx"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
      viewport: { width: 1280, height: 800 },
      // `toMatchScreenshot`'s built-in `screenshotDirectory` plumbing resolves a
      // custom value to an absolute path and then mis-joins it under the spec's
      // directory (producing a mangled `…/Users/…/…` path). Bypass it with our
      // own resolver, which deterministically yields:
      //   visual/vitest-browser/__screenshots__/<baseline>/<spec>/<arg>-<browser>.png
      // Arch lives in <baseline>, so the filename needs no platform suffix.
      expect: {
        toMatchScreenshot: {
          resolveScreenshotPath: ({
            root,
            testFileDirectory,
            testFileName,
            arg,
            browserName,
            ext,
          }) =>
            resolve(
              root,
              testFileDirectory,
              "__screenshots__",
              baseline,
              testFileName,
              `${arg}-${browserName}${ext}`,
            ),
        },
      },
    },
  },
});
