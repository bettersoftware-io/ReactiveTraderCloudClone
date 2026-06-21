#!/usr/bin/env tsx
/**
 * Parallel e2e orchestrator.
 *
 * Runs every suite concurrently and aggregates the results. The suites are
 * mutually independent once each owns its own resources:
 *   - Browser suites each start their OWN dev server (via with-server) on a
 *     distinct port (RTC_DEV_PORT = 3001..), so they never share app state.
 *   - Presenter suites run against in-process simulators — no server at all.
 *   - Full-stack smokes boot their own real server (and client) on dedicated
 *     ports (4123/4124/3100).
 *
 * Each suite's output is buffered and flushed atomically on completion (rather
 * than interleaved live), followed by a pass/fail summary. Wall-clock time is
 * the slowest single suite instead of the sum of all of them.
 */
import { spawn, spawnSync } from "node:child_process";

interface Suite {
  /** pnpm script name in tests/package.json. */
  readonly script: string;
  /** Extra env for this suite (e.g. its dedicated dev-server port). */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Whether this suite needs its OWN X display. Headless Cypress spawns its own
   * Xvfb on the fixed display :99, so two Cypress suites running at once collide
   * ("Server is already active for display 99"). On Linux we give each one a
   * private auto-allocated display via `xvfb-run -a`; elsewhere (macOS) Cypress
   * runs without Xvfb and the flag is a no-op. Playwright suites don't use Xvfb.
   */
  readonly isolateDisplay?: boolean;
}

// `xvfb-run -a` picks a free display number and exports DISPLAY for the child,
// which propagates through pnpm → with-server → cypress so Cypress reuses it
// instead of grabbing :99. Only needed/available on Linux.
const hasXvfbRun =
  process.platform === "linux" &&
  spawnSync("sh", ["-c", "command -v xvfb-run"], { stdio: "ignore" }).status ===
    0;

// Browser suites: one dev server each, on consecutive ports from here.
const BROWSER_BASE_PORT = 3001;
const browserScripts = [
  "test:browser:playwright",
  "test:browser:playwright-cucumber",
  "test:browser:cypress",
  "test:browser:cypress-cucumber",
];

// Order matters when a concurrency cap is in effect (see MAX_PARALLEL below):
// the pool starts suites in array order. Front-load the light, in-process
// presenter suites and the timing-sensitive full-stack smokes (their WS
// connection to the real server is starved if it competes with a heavy browser
// suite on a small CI runner) so they run first, uncontended. The four heavy
// browser suites (each = a dev server + a real browser) run last. Browser-suite
// dev-server ports stay fixed regardless of order (baked in via the map index).
const suites: Suite[] = [
  // Full-stack smokes — self-contained on their own ports; quick but timing-sensitive.
  { script: "test:fullstack:node" },
  { script: "test:fullstack:browser" },
  // Presenter peers — in-process, no server, mutually independent.
  { script: "test:presenter:cucumber" },
  { script: "test:presenter:cucumber-fake-timers" },
  { script: "test:presenter:vitest-fake-timers" },
  { script: "test:presenter:vitest-quickpickle-fake-timers" },
  // Heavy browser suites — one dev server + browser each.
  ...browserScripts.map((script, i) => ({
    script,
    env: { RTC_DEV_PORT: String(BROWSER_BASE_PORT + i) },
    isolateDisplay: script.includes("cypress"),
  })),
];

// Optionally drop the Cypress suites. Cypress's bundled Electron busy-spins at
// 100% CPU and never completes in some virtualized environments (notably the
// local aarch64 dev container — see the docs note + feedback memory), hanging
// the whole run. RTC_E2E_SKIP_CYPRESS=1 excludes the two Cypress suites so the
// rest (Playwright + presenter + full-stack) still run; surfaced as the
// `test:e2e:no-cypress` script. Cypress is unaffected on CI (x86), which keeps
// running the full set.
const skipCypress = ["1", "true"].includes(
  (process.env.RTC_E2E_SKIP_CYPRESS ?? "").toLowerCase(),
);
const droppedCypress = skipCypress
  ? suites.filter((s) => s.script.includes("cypress")).map((s) => s.script)
  : [];
const activeSuites = skipCypress
  ? suites.filter((s) => !s.script.includes("cypress"))
  : suites;

// Concurrency cap. Unset/invalid → run every suite at once (the default; ideal on
// a multi-core dev box). On a small CI runner the 10-wide fan-out starves the
// CPU and trips timing-sensitive suites, so CI sets RTC_E2E_MAX_PARALLEL=2 to run
// in small batches — slower wall-clock, but reliable.
const envCap = Number(process.env.RTC_E2E_MAX_PARALLEL);
const MAX_PARALLEL =
  Number.isFinite(envCap) && envCap > 0
    ? Math.floor(envCap)
    : activeSuites.length;

// Run `fn` over `items` with at most `limit` in flight at once. Results are kept
// in input order; each item's own completion logging still fires as it finishes.
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) break; // cursor < items.length guarantees this, but satisfies the type checker
      results[index] = await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

interface Result {
  readonly script: string;
  readonly code: number;
  readonly output: string;
  readonly seconds: number;
}

function runSuite(suite: Suite): Promise<Result> {
  const start = Date.now();
  const chunks: Buffer[] = [];
  const port = suite.env?.RTC_DEV_PORT;
  // RTC_DEV_PORT is the PREFERRED port; the suite bumps to the next free one if
  // it's taken (see devServer.ts) and logs the actual port via with-server.
  console.log(`▶ ${suite.script}${port ? `  (prefers :${port})` : ""}`);

  // Give Cypress suites a private X display on Linux so two can't fight over :99.
  const [cmd, args] =
    suite.isolateDisplay && hasXvfbRun
      ? (["xvfb-run", ["-a", "pnpm", suite.script]] as const)
      : (["pnpm", [suite.script]] as const);

  return new Promise<Result>((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...suite.env },
    });
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => chunks.push(d));

    const finish = (code: number) =>
      resolve({
        script: suite.script,
        code,
        output: Buffer.concat(chunks).toString("utf8"),
        seconds: (Date.now() - start) / 1000,
      });

    child.on("error", (err) => {
      chunks.push(Buffer.from(`failed to spawn: ${String(err)}\n`));
      finish(1);
    });
    child.on("exit", (code) => finish(code ?? 1));
  });
}

const rule = (ch: string) => ch.repeat(72);

if (skipCypress) {
  console.log(
    `(RTC_E2E_SKIP_CYPRESS — skipping ${droppedCypress.length} Cypress suite(s): ${droppedCypress.join(", ")})`,
  );
}

if (
  process.platform === "linux" &&
  !hasXvfbRun &&
  activeSuites.some((s) => s.isolateDisplay)
) {
  console.log(
    "⚠ xvfb-run not found — the parallel Cypress suites may collide on X display :99. " +
      "Install xvfb (provides xvfb-run) for reliable parallel Cypress runs.",
  );
}

const overallStart = Date.now();
if (MAX_PARALLEL < activeSuites.length) {
  console.log(
    `(running at most ${MAX_PARALLEL} suite(s) at a time — RTC_E2E_MAX_PARALLEL)`,
  );
}

// Resolve as each suite finishes so logs flush in completion order, not in a
// final batch — keeps a long run feeling responsive without interleaving.
const results = await mapWithLimit(activeSuites, MAX_PARALLEL, (s) =>
  runSuite(s).then((r) => {
    const status = r.code === 0 ? "PASS" : "FAIL";
    console.log(
      `\n${rule("=")}\n${status}  ${r.script}  (${r.seconds.toFixed(1)}s)\n${rule("=")}`,
    );
    process.stdout.write(r.output.endsWith("\n") ? r.output : `${r.output}\n`);
    return r;
  }),
);

const failures = results.filter((r) => r.code !== 0);
console.log(`\n${rule("─")}`);
console.log(
  `SUMMARY — wall clock ${((Date.now() - overallStart) / 1000).toFixed(1)}s`,
);
console.log(rule("─"));
for (const r of results) {
  const status = r.code === 0 ? "✓ PASS" : "✗ FAIL";
  console.log(
    `  ${status}  ${r.script.padEnd(32)} ${r.seconds.toFixed(1).padStart(6)}s`,
  );
}
console.log("");
if (failures.length > 0) {
  console.log(
    `${failures.length} suite(s) failed: ${failures.map((f) => f.script).join(", ")}`,
  );
}
process.exit(failures.length > 0 ? 1 : 0);
