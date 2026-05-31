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
const BROWSER_BASE_PORT = 3001;
const browserScripts = [
  "test:browser:playwright",
  "test:browser:raw-playwright",
  "test:browser:cypress",
  "test:browser:raw-cypress",
];

const suites: Suite[] = [
  ...browserScripts.map((script, i) => ({
    script,
    env: { RTC_DEV_PORT: String(BROWSER_BASE_PORT + i) },
  })),
  // Presenter peers — in-process, no server, mutually independent.
  { script: "test:presenter:cucumber-real" },
  { script: "test:presenter:cucumber-fake" },
  { script: "test:presenter:vitest-fake" },
  { script: "test:presenter:vitest-plain" },
  // Full-stack smokes — self-contained on their own ports.
  { script: "test:fullstack:node" },
  { script: "test:fullstack:browser" },
];

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
  console.log(`▶ ${suite.script}${port ? `  (:${port})` : ""}`);

  return new Promise<Result>((resolve) => {
    const child = spawn("pnpm", [suite.script], {
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
const overallStart = Date.now();

// Resolve as each suite finishes so logs flush in completion order, not in a
// final batch — keeps a long run feeling responsive without interleaving.
const results = await Promise.all(
  suites.map((s) =>
    runSuite(s).then((r) => {
      const status = r.code === 0 ? "PASS" : "FAIL";
      console.log(
        `\n${rule("=")}\n${status}  ${r.script}  (${r.seconds.toFixed(1)}s)\n${rule("=")}`,
      );
      process.stdout.write(r.output.endsWith("\n") ? r.output : `${r.output}\n`);
      return r;
    }),
  ),
);

const failures = results.filter((r) => r.code !== 0);
console.log(`\n${rule("─")}`);
console.log(`SUMMARY — wall clock ${((Date.now() - overallStart) / 1000).toFixed(1)}s`);
console.log(rule("─"));
for (const r of results) {
  const status = r.code === 0 ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${status}  ${r.script.padEnd(32)} ${r.seconds.toFixed(1).padStart(6)}s`);
}
console.log("");
if (failures.length > 0) {
  console.log(`${failures.length} suite(s) failed: ${failures.map((f) => f.script).join(", ")}`);
}
process.exit(failures.length > 0 ? 1 : 0);
