#!/usr/bin/env node
// Runs a batch of mutation checks and prints a kill table.
//
// A new test is only worth its line count if some plausible wrong
// implementation makes it fail. Proving that means: apply a mutant, run the
// test, expect RED, restore. Done by hand that is a dozen interactive steps
// per test, and a crash between "apply" and "restore" leaves the mutant in the
// tree — where the next test run reads it as a REAL result. Slice 5 of the
// pluggable-core workstream lost ~4h to exactly that (an agent wedged
// mid-pass, and a later run read a live mutant as a surviving one).
//
// Here restore is in a `finally`, so the tree is always put back, and one
// command produces the whole table.
//
//   node scripts/mutation-check.mjs <spec.json> [--keep-going]
//
// The spec is a JSON array of mutants:
//
//   [
//     {
//       "name": "window truncation keeps the NEWEST samples",
//       "file": "packages/client-core/src/presenters/adminFolds.ts",
//       "find": ".slice(-METRIC_WINDOW)",
//       "replace": ".slice(0, METRIC_WINDOW)",
//       "test": "pnpm --filter @rtc/client-core test adminFolds"
//     }
//   ]
//
// `find` is a literal string (not a regex) and must match EXACTLY ONCE in the
// file — an ambiguous mutant is reported as such rather than guessed at, since
// "which of the three occurrences did it change?" is not a question a kill
// table can answer. Exit code is 0 only when every mutant was killed.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

const KILLED = "KILLED";
const SURVIVED = "SURVIVED";
const ERROR = "ERROR";

function readSpec(path) {
  const spec = JSON.parse(readFileSync(path, "utf8"));

  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error(`${path}: expected a non-empty JSON array of mutants`);
  }

  for (const [index, mutant] of spec.entries()) {
    for (const field of ["name", "file", "find", "replace", "test"]) {
      if (typeof mutant[field] !== "string") {
        throw new Error(`${path}: mutant ${index} is missing "${field}"`);
      }
    }

    if (mutant.find === mutant.replace) {
      throw new Error(`${path}: mutant ${index} ("${mutant.name}") is a no-op`);
    }
  }

  return spec;
}

/** Does `command` fail? A mutant is killed when its test goes RED.
 *
 * `execSync` runs the spec's `test` through a shell deliberately: the spec is
 * developer-authored and its commands are pnpm/vitest invocations with filters
 * and test-name patterns, exactly like an npm script. It is never fed
 * untrusted input — treat a spec file as code, not as data. */
function testFails(command) {
  try {
    execSync(command, { stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
}

/** Apply one mutant, run its test, and put the file back whatever happens. */
function runMutant(mutant) {
  const original = readFileSync(mutant.file, "utf8");
  const occurrences = original.split(mutant.find).length - 1;

  if (occurrences !== 1) {
    return {
      status: ERROR,
      detail: `"find" matched ${occurrences} times in ${mutant.file}; it must match exactly once`,
    };
  }

  try {
    writeFileSync(mutant.file, original.replace(mutant.find, mutant.replace));

    // A GREEN test under the mutant means the test cannot see this mistake:
    // it would pass against an implementation that is wrong in this exact way.
    return testFails(mutant.test)
      ? { status: KILLED, detail: "" }
      : { status: SURVIVED, detail: "the test passes with the mutant applied" };
  } finally {
    writeFileSync(mutant.file, original);
  }
}

function main() {
  const [specPath, ...flags] = argv.slice(2);

  if (!specPath) {
    console.error(
      "usage: node scripts/mutation-check.mjs <spec.json> [--keep-going]",
    );
    exit(2);
  }

  const keepGoing = flags.includes("--keep-going");
  const spec = readSpec(specPath);
  const results = [];

  for (const mutant of spec) {
    process.stdout.write(`… ${mutant.name}\n`);
    const result = runMutant(mutant);
    results.push({ mutant, result });
    process.stdout.write(`  ${result.status} ${result.detail}\n`);

    if (result.status !== KILLED && !keepGoing) {
      break;
    }
  }

  console.log("\nmutation kill table");
  for (const { mutant, result } of results) {
    console.log(`  ${result.status.padEnd(9)} ${mutant.name}`);
  }

  const unkilled = results.filter((r) => {
    return r.result.status !== KILLED;
  });
  const ran = results.length;

  console.log(
    `\n${ran - unkilled.length}/${spec.length} killed` +
      (ran < spec.length
        ? ` (stopped early; pass --keep-going to run all)`
        : ""),
  );

  exit(unkilled.length === 0 && ran === spec.length ? 0 : 1);
}

main();
