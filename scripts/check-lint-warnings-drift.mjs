// CI gate: regenerates the lint-warnings ledger in memory and fails if the
// committed docs/lint-warnings.md is stale. Mirrors check-manifest-drift.mjs.
//
// This is what makes warnings impossible to introduce untracked: adding code
// that trips a new ESLint warning changes the regenerated ledger, so this gate
// turns red until the author either fixes the warning or runs
// `pnpm sync:lint-warnings` and commits the updated ledger. It does NOT force
// fixing (warnings stay non-blocking as code) — only that they be recorded.

import { readFileSync } from "node:fs";

import {
  collectWarnings,
  LEDGER_PATH,
  renderLedger,
} from "./sync-lint-warnings.mjs";

const expected = renderLedger(collectWarnings());

let committed = null;

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
const diff = [];

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
