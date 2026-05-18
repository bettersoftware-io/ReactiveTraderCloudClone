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
  {
    name: "9. No raw @playwright/test imports in raw Playwright test bodies",
    pattern: 'from "@playwright/test"',
    paths: ["raw/playwright/"],
    excludes: [
      "/node_modules/",
      "raw/playwright/playwright.config.ts",
      "raw/playwright/_context.ts",
    ],
  },
  {
    name: "10. No direct ctx.po.* access in raw Playwright test bodies",
    pattern: 'ctx\\.po\\.',
    paths: ["raw/playwright/"],
    excludes: ["/node_modules/", "raw/playwright/_context.ts"],
  },
  {
    name: "11. No direct page.* calls in raw Playwright test bodies",
    pattern: '\\bpage\\.',
    paths: ["raw/playwright/"],
    excludes: ["/node_modules/", "raw/playwright/_context.ts"],
  },
  {
    name: "12. No driver imports in raw Cypress test bodies",
    pattern: '"cypress"|@badeball|@playwright/test',
    paths: ["raw/cypress/"],
    excludes: [
      "/node_modules/",
      "raw/cypress/cypress.config.ts",
      "raw/cypress/_context.ts",
    ],
  },
  {
    name: "13. No direct ctx.po.* access in raw Cypress test bodies",
    pattern: 'ctx\\.po\\.',
    paths: ["raw/cypress/"],
    excludes: ["/node_modules/", "raw/cypress/_context.ts"],
  },
  {
    name: "14. No direct cy.* calls in raw Cypress test bodies",
    pattern: '\\bcy\\.',
    paths: ["raw/cypress/"],
    excludes: ["/node_modules/", "raw/cypress/_context.ts"],
  },
  {
    name: "15. No driver imports in presenter step/scenario/support files",
    pattern: '"cypress"|@badeball|@playwright/test|"quickpickle"',
    paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
    excludes: ["/node_modules/", "/vitest-fake/"],
  },
  {
    name: "16. No DOM/page references in presenter step/scenario files",
    pattern: 'getByTestId|page\\.|cy\\.',
    paths: ["steps/presenter/", "scenarios/presenter/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "17. No createApp/createSimulatorPorts outside _buildApp.ts",
    pattern: 'createApp|createSimulatorPorts',
    paths: ["steps/presenter/", "scenarios/presenter/", "support/presenter/"],
    excludes: ["/node_modules/", "scenarios/presenter/_buildApp.ts"],
  },
  {
    name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
    pattern: '\\btimeout\\b',
    paths: ["scenarios/presenter/_shared/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "19. No vitest/qpickle-loader imports outside vitest-fake peer",
    pattern: '"vitest"|"quickpickle"|from "vitest/',
    paths: [
      "scenarios/presenter/",
      "support/presenter/cucumber-real/",
      "support/presenter/cucumber-fake/",
      "steps/presenter/cucumber-real/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "20. No Gherkin loader imports in vitest-plain peer",
    pattern: '"quickpickle"|"@cucumber/cucumber"|from "quickpickle/',
    paths: ["presenter-tests/vitest-plain/"],
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
