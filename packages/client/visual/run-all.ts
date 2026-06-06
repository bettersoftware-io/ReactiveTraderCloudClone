// Runs every implemented visual runner concurrently and prints a pass/fail
// summary. `tsx visual/run-all.ts` runs all frameworks; `tsx visual/run-all.ts
// react` runs only react:* runners. Today only :react exists, so both are the
// same; when :solid lands it is discovered automatically (no edit here).
//
// Perf caveat: concurrent runs contend for CPU/GPU — wall-clock here is NOT a
// fair per-runner benchmark. Run a single runner in isolation to measure speed.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as {
  scripts: Record<string, string>;
};

const frameworkFilter = process.argv[2]; // e.g. "react" | undefined

// Leaf runner scripts only: test:visual:<runner>:<framework> (exactly 4 parts),
// excluding :update / :ui variants and the aggregates added below.
const runners = Object.keys(pkg.scripts).filter((name) => {
  const parts = name.split(":");
  if (parts.length !== 4) return false;
  if (parts[0] !== "test" || parts[1] !== "visual") return false;
  return frameworkFilter ? parts[3] === frameworkFilter : true;
});

if (runners.length === 0) {
  console.error(
    `No visual runners found${frameworkFilter ? ` for "${frameworkFilter}"` : ""}.`,
  );
  process.exit(1);
}

console.log(`Running ${runners.length} visual runner(s) concurrently:`);
runners.forEach((r) => console.log(`  • ${r}`));

const run = (script: string) =>
  new Promise<{ script: string; code: number; output: string }>((resolve) => {
    const child = spawn("pnpm", ["run", script], { shell: false });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) =>
      resolve({ script, code: code ?? 1, output }),
    );
  });

const results = await Promise.all(runners.map(run));

for (const r of results) {
  console.log(`\n${"=".repeat(72)}\n${r.script} ${r.code === 0 ? "✅" : "❌"}\n${"=".repeat(72)}`);
  console.log(r.output.trimEnd());
}

const failed = results.filter((r) => r.code !== 0);
console.log(
  `\nVisual summary: ${results.length - failed.length}/${results.length} runner(s) passed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
