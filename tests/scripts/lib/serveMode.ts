// What the browser suites drive: the client's production build behind
// `vite preview`, or the Vite dev server. The knob is RTC_E2E_SERVE.
//
// The build is the default. Each test opens a fresh browser context, so each
// one loads the whole app again, and the dev server answers that with one
// request per module: 637 requests and 15 MB per test on the default core
// (8.8 MB with the lean-deps switch), against a handful of chunks from a
// build. MEASURED 2026-10-05, the 97-test React Playwright suite, same
// machine, back to back: 310 s on the dev server, 197 s on the build
// (3.13 s per test against 2.00 s), every test passing unchanged; the
// 47-scenario Gherkin suite 73 s against 43 s.
//
// The dev server stays where it is the thing under test or the better tool:
// the two Gherkin suites and the full-stack smokes keep it (so React's dev
// double-mount, the `import.meta.env.DEV` branches and Vite's own transforms
// still have a browser witness), and so do the `:headed` / `:ui` scripts,
// where source-mapped modules are what a person debugging wants.

const SERVE_MODES = ["build", "dev"] as const;

export type ServeMode = (typeof SERVE_MODES)[number];

/** The mode the run asked for: RTC_E2E_SERVE, else the build. Throws on an
 * unknown value — a typo must not quietly select the default. */
export function resolveServeMode(env: NodeJS.ProcessEnv): ServeMode {
  const chosen = env.RTC_E2E_SERVE || "build";

  if (!isServeMode(chosen)) {
    throw new Error(
      `RTC_E2E_SERVE="${chosen}" is not one of ${SERVE_MODES.join(", ")}`,
    );
  }

  return chosen;
}

function isServeMode(value: string): value is ServeMode {
  return (SERVE_MODES as readonly string[]).includes(value);
}
