// Runs every implemented visual runner and prints a pass/fail summary.
// `tsx tests/ui/visual/run-all.ts` runs all frameworks;
// `tsx tests/ui/visual/run-all.ts react` runs only react runners. Today only
// :react exists, so both are the same; when :solid lands it is discovered
// automatically (no edit here).
//
// Concurrency: each runner is a full browser stack (Chromium + a Vite dev
// server). Running all three at once oversubscribes a constrained host — on a
// virtualized box (e.g. the local arm64 Docker Desktop VM, which reports the
// host's core count but delivers a fraction of it) three stacks on too few real
// cores thrash, and the screenshot assertions fail as "Timeout exceeded" even
// though every runner passes in seconds on its own. Raising the timeouts only
// makes the thrash last longer; the fix is to stop oversubscribing. So the
// default is SERIAL locally and fully concurrent under CI (an x86 runner that
// copes). os.availableParallelism() can't pick this for us (it lies under
// virtualization), so override explicitly with RTC_VISUAL_MAX_PARALLEL=N.
//
// Perf caveat: when runners DO overlap they contend for CPU/GPU — wall-clock is
// NOT a fair per-runner benchmark. Run a single runner in isolation to measure.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageJson {
  scripts: Record<string, string>;
}

const pkgUrl = new URL("../../../package.json", import.meta.url);
const pkg = JSON.parse(
  readFileSync(fileURLToPath(pkgUrl), "utf8"),
) as PackageJson;

const frameworkFilter: string | undefined = process.argv[2]; // e.g. "react" | undefined

// Leaf runner scripts only: test:ui:visual:<runner>:<framework> (exactly 5
// parts), excluding :update / :ui variants (6 parts) and the aggregates
// (test:ui:visual and test:ui:visual:<framework>, which are ≤4 parts).
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");

  if (parts.length !== 5) {
    return false;
  }

  if (parts[0] !== "test" || parts[1] !== "ui" || parts[2] !== "visual") {
    return false;
  }

  return frameworkFilter ? parts[4] === frameworkFilter : true;
});

if (runners.length === 0) {
  console.error(
    `No visual runners found${frameworkFilter ? ` for "${frameworkFilter}"` : ""}.`,
  );
  process.exit(1);
}

// Default: concurrent under CI, serial locally. RTC_VISUAL_MAX_PARALLEL=N
// overrides (clamped to [1, runners.length]); a non-positive/NaN value falls
// back to the default.
const envMax = Number(process.env.RTC_VISUAL_MAX_PARALLEL);
const defaultMax: number = process.env.CI ? runners.length : 1;
const maxParallel: number =
  Number.isInteger(envMax) && envMax > 0
    ? Math.min(envMax, runners.length)
    : defaultMax;

console.log(
  `Running ${runners.length} visual runner(s) ${
    maxParallel === 1 ? "serially" : `with up to ${maxParallel} in parallel`
  }:`,
);

for (const r of runners) {
  console.log(`  • ${r}`);
}

interface RunResult {
  script: string;
  code: number;
  output: string;
}

function run(script: string): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn("pnpm", ["run", script], { shell: false });
    child.stdout.on("data", (d: Buffer) => {
      return chunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      return chunks.push(d);
    });

    function finish(code: number): void {
      resolve({
        script,
        code,
        output: Buffer.concat(chunks).toString("utf8"),
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

// Bounded worker pool: at most `maxParallel` runners execute at once. Results
// are written back by index so the printed order always matches `runners`,
// regardless of which finishes first.
const results: RunResult[] = new Array(runners.length);
let nextIndex = 0;

async function worker(): Promise<void> {
  while (nextIndex < runners.length) {
    const i = nextIndex++;
    results[i] = await run(runners[i]);
  }
}

await Promise.all(Array.from({ length: maxParallel }, worker));

for (const r of results) {
  console.log(
    `\n${"=".repeat(72)}\n${r.script} ${r.code === 0 ? "✅" : "❌"}\n${"=".repeat(72)}`,
  );
  console.log(r.output.trimEnd());
}

const failed = results.filter((r) => {
  return r.code !== 0;
});
console.log(
  `\nVisual summary: ${results.length - failed.length}/${results.length} runner(s) passed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
