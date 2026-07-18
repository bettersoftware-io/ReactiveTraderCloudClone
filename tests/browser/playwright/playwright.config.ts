import { defineConfig, devices } from "@playwright/test";

// run-all.ts runs every browser suite concurrently by default (no
// RTC_E2E_MAX_PARALLEL cap), and the solid variant of this suite (see
// tests/package.json test:browser:playwright:solid) reuses this SAME config
// file with RTC_CLIENT_PKG=@rtc/client-solid — so react's and solid's runs of
// "this" suite can be mid-flight at once. Suffix the report/artifact dirs by
// client so they never write to the same path concurrently; empty for the
// react default keeps its output path byte-identical to before.
const isSolid = process.env.RTC_CLIENT_PKG === "@rtc/client-solid";
const reportSuffix = isSolid ? "-solid" : "";

// Mirrors client-solid's tests/ui/contract/vitest.config.ts
// `notYetPortedSpecs` — same rationale, same exclusion mechanism, one level
// up the test pyramid. Both are React-only, not port gaps:
//   - login.spec.ts: drives the real LoginScreen/AuthGate. Solid has no
//     sign-in/gate UI yet (AppRoot.tsx auto-logs in as demo/demo on mount) —
//     the same shell/auth deviation the ui-contract tier already excludes.
//   - devtools.spec.ts: connects to the same-origin /devtools/ inspector.
//     Solid's vite.config.ts never wires that dev-only asset edge (only
//     client-react's does — see its devtoolsPanel() plugin), so there is no
//     panel for Solid to serve.
// Both are tracked as pending follow-ups in docs/STATUS.md, not silently
// dropped. React (the default client) is unaffected — this array is empty
// unless RTC_CLIENT_PKG=@rtc/client-solid.
const notYetPortedSpecs = isSolid ? ["login.spec.ts", "devtools.spec.ts"] : [];

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  testIgnore: notYetPortedSpecs,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Terminal reporter unchanged; HTML is additive. The html reporter owns (and
  // wipes) ONLY report/; raw failure output (traces, screenshots) goes to the
  // artifacts/ sibling — never nest one inside the other. Paths are
  // config-file-relative (../../ = tests/).
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: `../../reports/browser/playwright${reportSuffix}/report`,
        open: "never",
      },
    ],
  ],
  outputDir: `../../reports/browser/playwright${reportSuffix}/artifacts`,
  timeout: 30_000,
  use: {
    // Per-suite port via RTC_DEV_PORT (parallel runners); defaults to 3000.
    baseURL: `http://localhost:${process.env.RTC_DEV_PORT ?? 3000}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
