// Regenerates the lint-warnings ledger in memory and fails if the committed
// docs/lint-warnings.md is stale. Mirrors check-manifest-drift.mts.
//
// DORMANT since 2026-10-06: a lint warning fails the build (#960), so the
// ledger reads zero and CI no longer runs this check (#963). Kept as the
// fallback — see the header of sync-lint-warnings.mts.
//
// With warnings allowed, this is what stops one arriving untracked: code that
// trips a new ESLint warning changes the regenerated ledger, so this check
// turns red until the author either fixes the warning or runs
// `pnpm sync:lint-warnings` and commits the updated ledger.

import { readFileSync } from "node:fs";

import {
  collectWarnings,
  LEDGER_PATH,
  renderLedger,
} from "./sync-lint-warnings.mts";

const expected = renderLedger(collectWarnings());

let committed: string | null = null;

try {
  committed = readFileSync(LEDGER_PATH, "utf8");
} catch {
  console.error(
    `check-lint-warnings-drift: ${LEDGER_PATH} is missing — run ` +
      `\`pnpm sync:lint-warnings\` and commit it.`,
  );
  process.exit(1);
}

if (committed === expected) {
  console.log(`check-lint-warnings-drift: ${LEDGER_PATH} is in sync`);
  process.exit(0);
}

// Show the first differing lines to make the failure actionable.
const expectedLines = expected.split("\n");
const committedLines = committed.split("\n");
const diff: string[] = [];

for (
  let i = 0;
  i < Math.max(expectedLines.length, committedLines.length);
  i++
) {
  const exp = expectedLines[i];
  const com = committedLines[i];

  if (exp !== com) {
    if (com !== undefined) {
      diff.push(`  committed | ${com}`);
    }

    if (exp !== undefined) {
      diff.push(`  expected  | ${exp}`);
    }
  }
}

console.error(
  `check-lint-warnings-drift: ${LEDGER_PATH} is out of date — a lint warning ` +
    `was added, removed, or changed without regenerating the ledger. Run ` +
    `\`pnpm sync:lint-warnings\` and commit the result. First differences:\n${diff
      .slice(0, 20)
      .join("\n")}`,
);
process.exit(1);
