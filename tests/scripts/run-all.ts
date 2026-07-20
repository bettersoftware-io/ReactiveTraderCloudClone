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
import { spawn } from "node:child_process";

interface Suite {
  /** pnpm script name in tests/package.json. */
  readonly script: string;
  /** Extra env for this suite (e.g. its dedicated dev-server port). */
  readonly env?: Readonly<Record<string, string>>;
}

// Browser suites: one dev server each, on consecutive ports from here.
// The two playwright-driver suites are duplicated for the Solid client (same
// Gherkin features/steps/page-objects, RTC_CLIENT_PKG=@rtc/client-solid — see
// tests/package.json) so the shared contract is proven against both clients.
const BROWSER_BASE_PORT = 3001;
const browserScripts = [
  "test:browser:playwright",
  "test:browser:playwright-cucumber",
  "test:browser:playwright:solid",
  "test:browser:playwright-cucumber:solid",
];

// Order matters when a concurrency cap is in effect (see MAX_PARALLEL below):
// the pool starts suites in array order. Front-load the light, in-process
// presenter suites and the timing-sensitive full-stack smokes (their WS
// connection to the real server is starved if it competes with a heavy browser
// suite on a small CI runner) so they run first, uncontended. The four heavy
// browser suites (each = a dev server + a real browser) run last. Browser-suite
// dev-server ports stay fixed regardless of order (baked in via the map index):
// react playwright/playwright-cucumber get 3001-3002; the two solid suites
// continue the same block at 3003-3004.
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
  ...browserScripts.map((script, i) => {
    return {
      script,
      env: { RTC_DEV_PORT: String(BROWSER_BASE_PORT + i) },
    };
  }),
];

// Concurrency cap. Unset/invalid → run every suite at once (the default; ideal on
// a multi-core dev box). On a small CI runner the 10-wide fan-out starves the
// CPU and trips timing-sensitive suites, so CI sets RTC_E2E_MAX_PARALLEL=2 to run
// in small batches — slower wall-clock, but reliable.
const envCap = Number(process.env.RTC_E2E_MAX_PARALLEL);
const MAX_PARALLEL: number =
  Number.isFinite(envCap) && envCap > 0 ? Math.floor(envCap) : suites.length;

// Run `fn` over `items` with at most `limit` in flight at once. Results are kept
// in input order; each item's own completion logging still fires as it finishes.
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];

      if (item === undefined) {
        break; // cursor < items.length guarantees this, but satisfies the type checker
      }

      results[index] = await fn(item);
    }
  }

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

  return new Promise<Result>((resolve) => {
    const child = spawn("pnpm", [suite.script], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...suite.env },
    });
    child.stdout.on("data", (d: Buffer) => {
      return chunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      return chunks.push(d);
    });

    function finish(code: number): void {
      resolve({
        script: suite.script,
        code,
        output: Buffer.concat(chunks).toString("utf8"),
        seconds: (Date.now() - start) / 1000,
      });
    }

    child.on("error", (err) => {
      chunks.push(Buffer.from(`failed to spawn: ${String(err)}\n`));
      finish(1);
    });
    child.on("exit", (code) => {
      return finish(code ?? 1);
    });
  });
}

function rule(ch: string): string {
  return ch.repeat(72);
}

const overallStart = Date.now();

if (MAX_PARALLEL < suites.length) {
  console.log(
    `(running at most ${MAX_PARALLEL} suite(s) at a time — RTC_E2E_MAX_PARALLEL)`,
  );
}

// Resolve as each suite finishes so logs flush in completion order, not in a
// final batch — keeps a long run feeling responsive without interleaving.
const results: Result[] = await mapWithLimit(suites, MAX_PARALLEL, (s) => {
  return runSuite(s).then((r) => {
    const status = r.code === 0 ? "PASS" : "FAIL";
    console.log(
      `\n${rule("=")}\n${status}  ${r.script}  (${r.seconds.toFixed(1)}s)\n${rule("=")}`,
    );
    process.stdout.write(r.output.endsWith("\n") ? r.output : `${r.output}\n`);
    return r;
  });
});

const failures = results.filter((r) => {
  return r.code !== 0;
});
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
    `${failures.length} suite(s) failed: ${failures
      .map((f) => {
        return f.script;
      })
      .join(", ")}`,
  );
}

process.exit(failures.length > 0 ? 1 : 0);
