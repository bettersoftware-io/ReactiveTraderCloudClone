#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  excludes?: string[];
}

const GATES: Gate[] = [
  {
    name: "1. No raw data-testid literals outside testids.ts",
    pattern: 'data-testid="[a-z]',
    paths: ["."],
    excludes: ["page-objects/contracts/testids.ts", "/node_modules/"],
  },
  {
    name: "2. No driver imports in contracts",
    pattern: '@playwright/test|cypress|@badeball',
    paths: ["page-objects/contracts/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "3. No driver names in features",
    pattern: 'data-testid|playwright|cy\\.',
    paths: ["specs/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "4. No raw getByTestId(\"...\") in PO impls",
    pattern: 'getByTestId\\("',
    paths: ["page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "5. No driver imports in scenarios layer",
    pattern: '@playwright/test|"cypress"|@badeball',
    paths: ["scenarios/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "6. No @playwright/test expect in step files",
    pattern: 'from "@playwright/test"',
    paths: ["steps/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "7. No copy-as-selector strings in PO impls (must use STRINGS)",
    pattern: 'getByText\\("[A-Z]|cy\\.contains\\("[A-Z]',
    paths: ["page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "8. No this.page.* in step files",
    pattern: 'this\\.page\\.',
    paths: ["steps/"],
    excludes: ["/node_modules/"],
  },
];

let failed = 0;

for (const gate of GATES) {
  const args = ["-rE", gate.pattern, ...gate.paths];
  const result = spawnSync("grep", args, { encoding: "utf8" });
  if (result.status === 2) {
    console.error(`ERROR running gate "${gate.name}":`, result.stderr);
    failed++;
    continue;
  }
  const out = result.stdout ?? "";
  const lines = out
    .split("\n")
    .filter(Boolean)
    .filter((line) => !(gate.excludes ?? []).some((e) => line.includes(e)));

  if (lines.length > 0) {
    console.error(`FAIL ${gate.name}`);
    for (const line of lines) console.error(`   ${line}`);
    failed++;
  } else {
    console.log(`PASS ${gate.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} gate(s) failed.`);
  process.exit(1);
}
console.log("\nall gates passed.");
