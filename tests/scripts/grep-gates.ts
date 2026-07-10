#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  excludes?: string[];
  /**
   * Optional custom check. When present, runs INSTEAD OF the grep pipeline;
   * pattern/paths/excludes are ignored. Returns an array of failure-message
   * strings (empty array = pass).
   */
  customCheck?: () => string[];
}

const FEATURE_NAMES = [
  "connection",
  "fxLiveRates",
  "fxTrading",
  "analytics",
  "blotter",
  "fxRfq",
  "creditRfq",
];

function checkPresenterScenarioCounts(): string[] {
  const failures: string[] = [];

  for (const feat of FEATURE_NAMES) {
    const featurePath = `specs/${feat}.feature`;

    if (!existsSync(featurePath)) {
      failures.push(`${feat}: feature file missing at ${featurePath}`);
      continue;
    }

    const featureSrc = readFileSync(featurePath, "utf8");
    const presenterScenarios = (
      featureSrc.match(/@presenter\s*\n\s*Scenario:/g) ?? []
    ).length;

    const testPath = `presenter/vitest-fake-timers/${feat}.test.ts`;

    if (presenterScenarios === 0 && !existsSync(testPath)) {
      continue;
    }

    if (presenterScenarios === 0 && existsSync(testPath)) {
      failures.push(`${feat}: 0 @presenter scenarios but ${testPath} exists`);
      continue;
    }

    if (!existsSync(testPath)) {
      failures.push(
        `${feat}: ${presenterScenarios} @presenter scenarios but ${testPath} missing`,
      );
      continue;
    }

    const testSrc = readFileSync(testPath, "utf8");
    // Count it("...") and it.skip("...") at line start (after indent) — NOT describe(.
    const itBlocks = (testSrc.match(/^\s*it(?:\.skip)?\(/gm) ?? []).length;

    if (itBlocks !== presenterScenarios) {
      failures.push(
        `${feat}: ${presenterScenarios} @presenter scenarios in ${featurePath} ` +
          `but ${itBlocks} it() blocks in ${testPath}`,
      );
    }
  }

  return failures;
}

function checkPresenterDescribePrefix(): string[] {
  const failures: string[] = [];

  for (const feat of FEATURE_NAMES) {
    const testPath = `presenter/vitest-fake-timers/${feat}.test.ts`;

    if (!existsSync(testPath)) {
      continue;
    }

    const testSrc = readFileSync(testPath, "utf8");
    const titles = [...testSrc.matchAll(/^\s*describe\(\s*"([^"]+)"/gm)].map(
      ([, title]) => {
        if (title === undefined) {
          throw new Error(
            "grep-gates: regex matched but capture group (title) is undefined",
          );
        }

        return title;
      },
    );

    for (const title of titles) {
      if (!title.startsWith("@presenter Feature: ")) {
        failures.push(
          `${testPath}: describe title "${title}" missing "@presenter Feature: " prefix`,
        );
      }
    }
  }

  return failures;
}

function checkQuickpickleBarrelCompleteness(): string[] {
  const failures: string[] = [];
  const stepsDir = "presenter/vitest-quickpickle-fake-timers/steps";
  const setupPath = "presenter/vitest-quickpickle-fake-timers/setup.ts";

  if (!existsSync(stepsDir) || !existsSync(setupPath)) {
    return failures;
  }

  const stepFiles = readdirSync(stepsDir).filter((f) => {
    return f.endsWith(".steps.ts");
  });
  const setupSrc = readFileSync(setupPath, "utf8");

  for (const f of stepFiles) {
    const stem = f.replace(/\.ts$/, "");
    const importMarker = `./steps/${stem}`;

    if (!setupSrc.includes(importMarker)) {
      failures.push(
        `${setupPath}: missing import for ${stepsDir}/${f} (expected literal containing ${JSON.stringify(importMarker)})`,
      );
    }
  }

  return failures;
}

/**
 * Supply-chain gate: fail if any PRODUCTION dependency has a known high/critical
 * advisory. Runs `pnpm audit --prod --audit-level high` from the repo root (this
 * script's cwd is the tests package). Dev-only advisories are intentionally not
 * gated here — those are surfaced by Dependabot and a plain `pnpm audit`. If the
 * audit can't complete (e.g. offline), it warns rather than blocking, so the gate
 * never produces false failures on a flaky network.
 */
function checkProductionAudit(): string[] {
  const result = spawnSync(
    "pnpm",
    ["audit", "--prod", "--audit-level", "high"],
    { cwd: resolve(process.cwd(), ".."), encoding: "utf8" },
  );

  if (result.status === 0) {
    return [];
  }

  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  // Distinguish real advisories from an audit that couldn't run (network/registry).
  if (/vulnerabilit(?:y|ies)\s+found/i.test(out)) {
    const summary = out
      .split("\n")
      .map((l) => {
        return l.trim();
      })
      .filter((l) => {
        return /^Severity:/i.test(l) || /vulnerabilit/i.test(l);
      });
    return [
      "high/critical advisory in production dependencies:",
      ...summary,
      'remediate by bumping the package or adding a pnpm-workspace.yaml override; run "pnpm audit --prod" for details.',
    ];
  }

  console.warn(
    `WARN gate "pnpm audit --prod": audit did not complete; treating as non-blocking.\n${out.trim().slice(0, 400)}`,
  );
  return [];
}

/**
 * Dumb-UI gate: NO setTimeout/setInterval anywhere in production src/ui. Every
 * timer is business/timer logic that belongs in the app-layer (machines/
 * presenters) behind the ViewModel seam — the last holdout, BlotterRow's new-row
 * highlight, has been relocated to createRowHighlightMachine. The useMachine
 * bridge schedules disposal with queueMicrotask (not setTimeout), so no hooks
 * exception is needed. Test files are not gated here.
 */
function checkNoUiTimers(path: string): string[] {
  const result = spawnSync("grep", ["-rnE", "setTimeout|setInterval", path], {
    encoding: "utf8",
  });
  const out = result.stdout ?? "";
  return out
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      return !line.includes("/node_modules/");
    })
    .filter((line) => {
      return !line.includes(".test.") && !line.includes(".spec.");
    });
}

const GATES: Gate[] = [
  {
    name: "1. No raw data-testid literals outside testids.ts",
    pattern: 'data-testid="[a-z]',
    paths: ["."],
    excludes: ["browser/page-objects/contracts/testids.ts", "/node_modules/"],
  },
  {
    name: "2. No driver imports in contracts",
    pattern: "@playwright/test|cypress|@badeball",
    paths: ["browser/page-objects/contracts/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "3. No driver names in features",
    pattern: "data-testid|playwright|cy\\.",
    paths: ["specs/"],
    excludes: ["/node_modules/"],
  },
  {
    name: '4. No raw getByTestId("...") in PO impls',
    pattern: 'getByTestId\\("',
    paths: ["browser/page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "5. No driver imports in scenarios layer",
    pattern: '@playwright/test|"cypress"|@badeball',
    paths: [
      "browser/scenarios/",
      "browser/cypress/scenarios/",
      "presenter/scenarios/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "6. No @playwright/test expect in step files",
    pattern: 'from "@playwright/test"',
    paths: [
      "browser/steps/",
      "presenter/steps/",
      "presenter/vitest-quickpickle-fake-timers/steps/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "7. No copy-as-selector strings in PO impls (must use STRINGS)",
    pattern: 'getByText\\("[A-Z]|cy\\.contains\\("[A-Z]',
    paths: ["browser/page-objects/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "8. No this.page.* in step files",
    pattern: "this\\.page\\.",
    paths: [
      "browser/steps/",
      "presenter/steps/",
      "presenter/vitest-quickpickle-fake-timers/steps/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "9. No raw @playwright/test imports in native Playwright test bodies",
    pattern: 'from "@playwright/test"',
    paths: ["browser/playwright/"],
    excludes: [
      "/node_modules/",
      "browser/playwright/playwright.config.ts",
      "browser/playwright/_context.ts",
    ],
  },
  {
    name: "10. No direct ctx.po.* access in native Playwright test bodies",
    pattern: "ctx\\.po\\.",
    paths: ["browser/playwright/"],
    excludes: ["/node_modules/", "browser/playwright/_context.ts"],
  },
  {
    name: "11. No direct page.* calls in native Playwright test bodies",
    pattern: "\\bpage\\.",
    paths: ["browser/playwright/"],
    excludes: ["/node_modules/", "browser/playwright/_context.ts"],
  },
  {
    name: "12. No driver imports in native Cypress test bodies",
    pattern: '"cypress"|@badeball|@playwright/test',
    paths: ["browser/cypress/"],
    excludes: [
      "/node_modules/",
      "browser/cypress/cypress.config.ts",
      "browser/cypress/_context.ts",
      "browser/cypress/scenarios/",
    ],
  },
  {
    name: "13. No direct ctx.po.* access in native Cypress test bodies",
    pattern: "ctx\\.po\\.",
    paths: ["browser/cypress/"],
    excludes: [
      "/node_modules/",
      "browser/cypress/_context.ts",
      "browser/cypress/scenarios/",
    ],
  },
  {
    name: "14. No direct cy.* calls in native Cypress test bodies",
    pattern: "\\bcy\\.",
    paths: ["browser/cypress/"],
    excludes: [
      "/node_modules/",
      "browser/cypress/_context.ts",
      "browser/cypress/scenarios/",
    ],
  },
  {
    name: "15. No driver imports in presenter step/scenario/support files",
    pattern: '"cypress"|@badeball|@playwright/test|"quickpickle"',
    paths: [
      "presenter/steps/",
      "presenter/scenarios/",
      "presenter/cucumber/",
      "presenter/cucumber-fake-timers/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "16. No DOM/page references in presenter step/scenario files",
    pattern: "getByTestId|page\\.|cy\\.",
    paths: [
      "presenter/steps/",
      "presenter/vitest-quickpickle-fake-timers/steps/",
      "presenter/scenarios/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "17. No createApp/createSimulatorPorts outside _buildApp.ts",
    pattern: "createApp|createSimulatorPorts",
    paths: [
      "presenter/steps/",
      "presenter/scenarios/",
      "presenter/cucumber/",
      "presenter/cucumber-fake-timers/",
      "presenter/vitest-fake-timers/",
      "presenter/vitest-quickpickle-fake-timers/",
    ],
    excludes: ["/node_modules/", "presenter/scenarios/_buildApp.ts"],
  },
  {
    name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
    pattern: "\\btimeout\\b",
    paths: ["presenter/scenarios/_shared/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "19. No vitest/qpickle-loader imports outside the two vitest peers",
    pattern: '"vitest"|"quickpickle"|from "vitest/',
    paths: [
      "presenter/scenarios/",
      "presenter/cucumber/",
      "presenter/cucumber-fake-timers/",
      "presenter/steps/",
    ],
    excludes: ["/node_modules/"],
  },
  {
    name: "20. No Gherkin loader imports in the plain vitest peer",
    pattern: '"quickpickle"|"@cucumber/cucumber"|from "quickpickle/',
    paths: ["presenter/vitest-fake-timers/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "21. plain vitest it() count matches @presenter scenario count per .feature",
    pattern: "",
    paths: [],
    customCheck: checkPresenterScenarioCounts,
  },
  {
    name: '22. plain vitest describe titles start with "@presenter Feature: "',
    pattern: "",
    paths: [],
    customCheck: checkPresenterDescribePrefix,
  },
  {
    name: "23. Contract describers stay pure (no impl imports)",
    pattern:
      'from "(\\.\\./)+simulators|from "@rtc/(client|shared/__fixtures__)',
    paths: ["../packages/domain/src/ports/__contracts__/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "24. vitest-quickpickle-fake-timers/setup.ts imports every step file in tests/presenter/vitest-quickpickle-fake-timers/steps/",
    pattern: "",
    paths: [],
    customCheck: checkQuickpickleBarrelCompleteness,
  },
  {
    name: "25. No high/critical advisories in production deps (pnpm audit --prod)",
    pattern: "",
    paths: [],
    customCheck: checkProductionAudit,
  },
  {
    name: "26. No rxjs/react-rxjs imports in src/ui (only src/ui/viewModel bridge may)",
    pattern: 'from "rxjs"|@react-rxjs|@rx-state',
    paths: ["../packages/client-react/src/ui/"],
    excludes: ["/node_modules/", "/src/ui/viewModel/", ".test.", ".spec."],
  },
  {
    name: "27. No localStorage in src/ui (persistence belongs in app-layer ports)",
    pattern: "localStorage",
    paths: ["../packages/client-react/src/ui/"],
    excludes: ["/node_modules/", "/src/ui/viewModel/", ".test.", ".spec."],
  },
  {
    name: "28. No fetch/import.meta.env in src/ui (transport/config belongs in app-layer)",
    pattern: "fetch\\(|import\\.meta\\.env",
    paths: ["../packages/client-react/src/ui/"],
    excludes: ["/node_modules/", "/src/ui/viewModel/", ".test.", ".spec."],
  },
  {
    name: "29. No setTimeout/setInterval anywhere in src/ui",
    pattern: "",
    paths: [],
    customCheck: () => {
      return checkNoUiTimers("../packages/client-react/src/ui/");
    },
  },
  {
    name: "30. No rxjs/react-rxjs imports in RN src/ui (only the bindings bridge may)",
    pattern: 'from "rxjs"|@react-rxjs|@rx-state',
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "31. No localStorage/AsyncStorage in RN src/ui (persistence belongs behind PreferencesPort)",
    pattern: "localStorage|AsyncStorage",
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "32. No fetch/process.env/expo-constants in RN src/ui (transport & config belong in the app layer)",
    pattern: "fetch\\(|process\\.env|import\\.meta\\.env|expo-constants",
    paths: ["../packages/client-react-native/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "33. No setTimeout/setInterval anywhere in RN src/ui",
    pattern: "",
    paths: [],
    customCheck: () => {
      return checkNoUiTimers("../packages/client-react-native/src/ui/");
    },
  },
];

let failed = 0;

for (const gate of GATES) {
  let lines: string[];

  if (gate.customCheck) {
    lines = gate.customCheck();
  } else {
    const args = ["-rE", gate.pattern, ...gate.paths];
    const result = spawnSync("grep", args, { encoding: "utf8" });

    if (result.status === 2) {
      console.error(`ERROR running gate "${gate.name}":`, result.stderr);
      failed++;
      continue;
    }

    const out = result.stdout ?? "";
    lines = out
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        return !(gate.excludes ?? []).some((e) => {
          return line.includes(e);
        });
      });
  }

  if (lines.length > 0) {
    console.error(`FAIL ${gate.name}`);

    for (const line of lines) {
      console.error(`   ${line}`);
    }

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
