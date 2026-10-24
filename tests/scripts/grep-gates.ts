#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { gateGrepArgs, keepViolations } from "./lib/gateLines.ts";

/** The fields of the root package.json that gate 52 reads. */
interface RootManifest {
  engines?: { node?: string };
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
  };
}

/** The fields of a package's package.json that gates 54 and 55 read. */
interface PackageManifest {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** One task of a package's turbo.json, as far as gate 55 reads it. */
interface PackageTurboTask {
  inputs?: string[];
}

/** The part of a package's turbo.json that gate 55 reads. */
interface PackageTurboConfig {
  tasks?: Record<string, PackageTurboTask>;
}

interface Gate {
  name: string;
  pattern: string;
  paths: string[];
  /**
   * Path fragments. A grep line is dropped when the FILE PATH it came from
   * contains one of them; the matched content is never consulted.
   */
  excludes?: string[];
  /**
   * Optional custom check. When present, runs INSTEAD OF the grep pipeline;
   * pattern/paths/excludes are ignored. Returns an array of failure-message
   * strings (empty array = pass).
   */
  customCheck?: () => string[];
}

/**
 * Gate 41. expo-router derives the app's routes from a `require.context` over
 * `app/` whose regex admits EVERY source file except `+api`/`+html`, and its
 * parser strips every extension — so a co-located `_layout.test.tsx` becomes a
 * second `_layout` and `getRoutesCore` throws a layout-conflict error at boot.
 * Metro's `blockList` in the RN package hides test files from the bundle, but
 * that is a shim over the root cause: nothing but route modules may live in
 * the route tree. The layout specs sit in `src/app/` and import the routes via
 * `#app/*`.
 */
const NON_ROUTE_FILE = /\.(test|spec|page|stories)\.[jt]sx?$/;

function checkRouteTreeHoldsOnlyRoutes(appDir: string): string[] {
  const failures: string[] = [];

  function walk(dir: string, relative: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = `${relative}${entry.name}`;

      if (entry.isDirectory()) {
        walk(`${dir}${entry.name}/`, `${relativePath}/`);
      } else if (NON_ROUTE_FILE.test(entry.name)) {
        failures.push(
          `${appDir}${relativePath}: not a route module — expo-router would register it as a route; move it out of app/`,
        );
      }
    }
  }

  walk(appDir, "");

  return failures;
}

/**
 * Maps a `specs/` feature file to its `presenter/vitest-fake-timers/` test
 * file. `feature` is the path under `specs/` (without `.feature`) — most
 * features sit directly in `specs/`, but some (e.g. ops/incident) live in a
 * subdirectory. `test` is the presenter test file's basename (without
 * `.test.ts`) — usually matches `feature`, but diverges when the feature path
 * has a directory segment the test file naming doesn't mirror.
 */
interface PresenterFeatureMapping {
  feature: string;
  test: string;
}

const FEATURE_NAMES: PresenterFeatureMapping[] = [
  { feature: "connection", test: "connection" },
  { feature: "fxLiveRates", test: "fxLiveRates" },
  { feature: "fxTrading", test: "fxTrading" },
  { feature: "analytics", test: "analytics" },
  { feature: "blotter", test: "blotter" },
  { feature: "fxRfq", test: "fxRfq" },
  { feature: "creditRfq", test: "creditRfq" },
  { feature: "ops/incident", test: "opsIncident" },
];

function checkPresenterScenarioCounts(): string[] {
  const failures: string[] = [];

  for (const { feature: feat, test: testName } of FEATURE_NAMES) {
    const featurePath = `specs/${feat}.feature`;

    if (!existsSync(featurePath)) {
      failures.push(`${feat}: feature file missing at ${featurePath}`);
      continue;
    }

    const featureSrc = readFileSync(featurePath, "utf8");
    const presenterScenarios = (
      featureSrc.match(/@presenter\s*\n\s*Scenario:/g) ?? []
    ).length;

    const testPath = `presenter/vitest-fake-timers/${testName}.test.ts`;

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

  for (const { test: testName } of FEATURE_NAMES) {
    const testPath = `presenter/vitest-fake-timers/${testName}.test.ts`;

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
  const result = spawnSync(
    "grep",
    gateGrepArgs("setTimeout|setInterval", [path]),
    {
      encoding: "utf8",
    },
  );

  return keepViolations(result.stdout ?? "", [
    "/node_modules/",
    ".test.",
    ".spec.",
  ]);
}

/** The two pixel specs, which must stay in lockstep (each is the other's copy). */
const PIXEL_SPECS = [
  "../packages/client-react/tests/ui/visual/playwright/visual.spec.ts",
  "../packages/client-solid/tests/ui/visual/playwright/visual.spec.ts",
];

/**
 * The spec statements that DRIVE a scenario to its photographable state. The
 * settled-capture wait has to sit after all of them: the click and the step
 * loop are what resize the dock, so a wait hoisted above them runs before the
 * flash it is meant to outlast even exists, and passes instantly.
 */
const SCENARIO_READINESS_STATEMENTS = [
  "if (action.click)",
  "for (const step of action.steps",
  "if (action.waitForText)",
];

/** The class `dockTabStripsAreSettled` keys on to tell "no dock" from "not yet". */
const DOCK_THEME_CLASS = "dockview-theme-rtc";

/** The per-client engine bridges that must keep that class on their container. */
const DOCK_ENGINE_BRIDGES = [
  "../packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx",
  "../packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx",
];

/** The in-page predicate the pixel specs wait on. */
const DOCK_FLASH_PREDICATE =
  "../packages/ui-contract/src/visual/dockResizeFlash.ts";

/** A `class=`/`className=` attribute carrying a given class on one line. */
function classAttributeCarrying(className: string): RegExp {
  return new RegExp(`class(?:Name)?=[^\\n]*\\b${className}\\b`);
}

function readGatedFile(path: string): string | null {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

/**
 * Settled-capture gate: every pixel spec must wait out dockview's tab-strip
 * resize flash BEFORE it settles motion and captures.
 *
 * Dockview adds `dv-scrollable-resizing` on every ResizeObserver tick of a tab
 * strip and clears it 500 ms after the last one; while it is there the strip
 * paints a 4 px scrollbar thumb. Without the wait, whether a golden contains
 * that bar is decided by wall clock: `app/equities-instances-dockview` shipped
 * with the bar in 6 of its 10 x86 skins and 9 of its 10 arm64 ones — from ONE
 * generation run over one DOM — and cost solid ~4 post-merge runs in 5 on the
 * one skin where the two clients' luck differed.
 *
 * ORDER IS THE POINT, which is why this is a custom check and not a pattern.
 * The wait is pinned between two walls, and BOTH walls are load-bearing:
 *   - below it, `settleAnimationsForCapture` and the screenshot. Removing the
 *     class starts dockview's `transition: background-color 1s`, so a capture
 *     taken between the wait and the settle pass can still catch the thumb
 *     mid-fade.
 *   - above it, the scenario's readiness statements (the click, the step loop,
 *     the text wait). THOSE are what resize the dock, so a wait hoisted to just
 *     after `goto` passes this gate's lower half while defeating the fix
 *     entirely: it settles a dock that has not been driven yet, and the flash
 *     arrives afterwards.
 * A spec that keeps the wait but moves it to either side is as broken as one
 * that drops it.
 */
function checkPixelSpecsWaitForSettledDock(): string[] {
  const failures: string[] = [];

  for (const spec of PIXEL_SPECS) {
    const source = readGatedFile(spec);

    if (source === null) {
      failures.push(
        `${spec}: not found — this gate cannot see the pixel spec; update its path with the move`,
      );
      continue;
    }

    const wait = source.indexOf("waitForFunction(dockTabStripsAreSettled)");
    const settle = source.indexOf("evaluate(settleAnimationsForCapture)");
    const capture = source.indexOf("toHaveScreenshot(");

    if (wait === -1) {
      failures.push(
        `${spec}: missing "await page.waitForFunction(dockTabStripsAreSettled)" — the capture would race dockview's 500 ms tab-strip resize flash`,
      );
      continue;
    }

    if (settle === -1 || capture === -1) {
      failures.push(
        `${spec}: no settle pass or no screenshot assertion found — this gate can no longer see the capture order; update it with the spec`,
      );
      continue;
    }

    if (wait > settle || wait > capture) {
      failures.push(
        `${spec}: the dock settle wait must come BEFORE settleAnimationsForCapture and the screenshot (a thumb caught mid-fade is still a transient)`,
      );
    }

    for (const statement of SCENARIO_READINESS_STATEMENTS) {
      const readiness = source.indexOf(statement);

      if (readiness === -1) {
        failures.push(
          `${spec}: readiness statement "${statement}" not found — this gate can no longer see what drives the dock; update it with the spec`,
        );
        continue;
      }

      if (wait < readiness) {
        failures.push(
          `${spec}: the dock settle wait must come AFTER "${statement}" — the scenario's own steps are what resize the dock, so a wait above them settles a dock that has not been driven yet`,
        );
      }
    }
  }

  return failures;
}

/**
 * Anti-collapse gate for the settled-capture predicate's "no dock here" branch.
 *
 * `dockTabStripsAreSettled` distinguishes "this page has no dockview at all"
 * (settled — nothing to wait for) from "the dock is mounted but has not laid
 * out yet" (NOT settled) by looking for the `dockview-theme-rtc` container each
 * client's engine bridge renders. Nothing in the type system couples that string
 * to the bridges' JSX, and `createDockEngine` puts the SAME class on dockview's
 * own root — so a refactor deleting the wrapper's copy as "redundant" would
 * leave the predicate reading every page as dock-free, the wait passing
 * instantly, and the flake back with no test failing. That is the exact silent
 * collapse this gate exists to make loud.
 *
 * It is a source gate rather than a bridge unit test because the invariant IS a
 * three-file string agreement across a package boundary the clients may not
 * import across (`@rtc/ui-contract` is a devDependency, never reachable from
 * `src/`), so no shared constant can carry it. A unit test could only assert one
 * client's rendered class at a time and would say nothing about the harness's
 * half of the agreement.
 */
function checkDockThemeClassStillCouplesToBridges(): string[] {
  const failures: string[] = [];
  const carriesClass = classAttributeCarrying(DOCK_THEME_CLASS);

  for (const bridge of DOCK_ENGINE_BRIDGES) {
    const source = readGatedFile(bridge);

    if (source === null) {
      failures.push(
        `${bridge}: not found — this gate cannot see the engine bridge; update its path with the move`,
      );
      continue;
    }

    if (!carriesClass.test(source)) {
      failures.push(
        `${bridge}: its container element no longer carries class "${DOCK_THEME_CLASS}" — the visual tier's dock settle wait keys on it and would silently read every page as dock-free (if the class moved to a multi-line class expression, teach this gate about it)`,
      );
    }
  }

  const predicate = readGatedFile(DOCK_FLASH_PREDICATE);

  if (predicate === null) {
    failures.push(
      `${DOCK_FLASH_PREDICATE}: not found — this gate cannot see the settled-capture predicate; update its path with the move`,
    );
  } else if (!predicate.includes(`".${DOCK_THEME_CLASS}"`)) {
    failures.push(
      `${DOCK_FLASH_PREDICATE}: no longer queries ".${DOCK_THEME_CLASS}" — the predicate and the engine bridges must agree on one class, and this gate on the same one`,
    );
  }

  return failures;
}

const GATES: Gate[] = [
  {
    name: "1. No raw data-testid literals outside testids.ts",
    pattern: 'data-testid="[a-z]',
    paths: ["."],
    // `./reports/` is generated, git-ignored output: since vitest 5 the
    // presenter suite's HTML report ships vitest's own UI bundle there, which
    // carries `data-testid="…"` strings — so a second local run failed on a
    // file that is not our code (CI, starting from a fresh checkout, never
    // saw it).
    excludes: [
      "browser/page-objects/contracts/testids.ts",
      "/node_modules/",
      "./reports/",
    ],
  },
  {
    name: "2. No driver imports in contracts",
    pattern: "@playwright/test",
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
    pattern: "@playwright/test",
    paths: ["browser/scenarios/", "presenter/scenarios/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "6. No @playwright/test expect in step files",
    pattern: 'from "@playwright/test"',
    paths: ["browser/steps/"],
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
    paths: ["browser/steps/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "9. No raw @playwright/test imports in native Playwright test bodies",
    pattern: 'from "@playwright/test"',
    paths: ["browser/playwright/", "fullstack/browser/"],
    excludes: [
      "/node_modules/",
      "browser/playwright/playwright.config.ts",
      "browser/playwright/_context.ts",
      "fullstack/browser/playwright.config.ts",
      "fullstack/browser/_context.ts",
    ],
  },
  {
    name: "10. No direct ctx.po.* access in native Playwright test bodies",
    pattern: "ctx\\.po\\.",
    paths: ["browser/playwright/", "fullstack/browser/"],
    excludes: [
      "/node_modules/",
      "browser/playwright/_context.ts",
      "fullstack/browser/_context.ts",
    ],
  },
  {
    name: "11. No direct page.* calls in native Playwright test bodies",
    pattern: "\\bpage\\.",
    paths: ["browser/playwright/", "fullstack/browser/"],
    excludes: [
      "/node_modules/",
      "browser/playwright/_context.ts",
      "fullstack/browser/_context.ts",
    ],
  },
  // Gates 12–14 retired with Cypress (2026-07-20) — numbers not reused.
  {
    name: "15. No driver imports in presenter step/scenario/support files",
    pattern: '@playwright/test|"quickpickle"',
    paths: ["presenter/scenarios/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "16. No DOM/page references in presenter step/scenario files",
    pattern: "getByTestId|page\\.|cy\\.",
    paths: ["presenter/scenarios/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "17. No createApp/createSimulatorPorts outside _buildApp.ts",
    pattern: "createApp|createSimulatorPorts",
    paths: ["presenter/scenarios/", "presenter/vitest-fake-timers/"],
    excludes: ["/node_modules/", "presenter/scenarios/_buildApp.ts"],
  },
  {
    name: "18. No rxjs 'timeout' keyword in presenter scenarios (use w.awaitFirstWithin)",
    pattern: "\\btimeout\\b",
    paths: ["presenter/scenarios/_shared/"],
    excludes: ["/node_modules/"],
  },
  {
    name: "19. No vitest/qpickle-loader imports outside the vitest peer",
    pattern: '"vitest"|"quickpickle"|from "vitest/',
    paths: ["presenter/scenarios/"],
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
  // Gate 24 retired with the quickpickle presenter peer (2026-07-20) — number not reused.
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
    name: "32. No fetch/process.env/import.meta.env/expo-constants in RN src/ui (transport & config belong in the app layer)",
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
  {
    name: "34. No rxjs/@rx-state imports in client-solid src/ui (only the solid-bindings bridge may)",
    pattern: 'from "rxjs"|@react-rxjs|@rx-state',
    paths: ["../packages/client-solid/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "35. No localStorage in client-solid src/ui (persistence belongs behind PreferencesPort)",
    pattern: "localStorage",
    paths: ["../packages/client-solid/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "36. No fetch/import.meta.env in client-solid src/ui (transport/config belongs in the app layer)",
    pattern: "fetch\\(|import\\.meta\\.env",
    paths: ["../packages/client-solid/src/ui/"],
    excludes: ["/node_modules/", ".test.", ".spec."],
  },
  {
    name: "37. No setTimeout/setInterval anywhere in client-solid src/ui",
    pattern: "",
    paths: [],
    customCheck: () => {
      return checkNoUiTimers("../packages/client-solid/src/ui/");
    },
  },
  {
    name: "38. No setTimeout/setInterval in devtools-app src (flash/timing runs through rAF or the store)",
    pattern: "setTimeout|setInterval",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
  {
    name: "39. No localStorage in devtools-app src (the inspector holds no persistence; state lives in InspectorStore)",
    pattern: "localStorage",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
  {
    name: "40. No fetch/WebSocket construction in devtools-app src (transport is the injected Duplex)",
    pattern: "fetch\\(|new WebSocket",
    paths: ["../packages/devtools-app/src/"],
    excludes: ["/node_modules/", "/__tests__/", ".test.", ".spec."],
  },
  {
    name: "41. No test/spec/page/story files inside the RN expo-router route tree (every file under app/ is a route)",
    pattern: "",
    paths: [],
    customCheck: () => {
      return checkRouteTreeHoldsOnlyRoutes(
        "../packages/client-react-native/app/",
      );
    },
  },
  {
    // `export type { … }` and `export type * from` still pass — only a
    // re-export WITHOUT the `type` keyword is a runtime value leaving the
    // package, and the earlier pattern (declarations only) could not see one.
    name: "42. @rtc/core-api exports no runtime value (types-only contract)",
    pattern:
      "^export (const|let|function|class|enum|async function) |^export \\{|^export \\* from",
    paths: ["../packages/core-api/src/"],
    excludes: ["/__tests__/", ".test."],
  },
  {
    // Belt and braces for dependency-cruiser's `bridge-owns-rxjs`: catches an
    // `import { x } from "rxjs"` of a VALUE even where the cruiser's type-only
    // detection misses a mixed import. A brace import without `type` is what a
    // value import looks like under `verbatimModuleSyntax`; the runner uses
    // `grep -rE`, which has no lookahead, so the pattern matches that form
    // directly. Both alternative cores are listed, and `@rtc/core-logic` — the
    // shared rules all three cores compose over, which has no `bridge/` and so
    // no exemption (dependency-cruiser `core-logic-stays-pure`); grep errors
    // (status 2) on a missing directory, so every path here must name a
    // package that exists.
    name: "43. Alternative cores (outside bridge/) and @rtc/core-logic import rxjs/@rx-state as types only (bridge-owns-rxjs, core-logic-stays-pure)",
    pattern: '^import \\{[^}]*\\} from "(rxjs|rxjs/operators|@rx-state/core)"',
    paths: [
      "../packages/client-core-async/src/",
      "../packages/client-core-effect/src/",
      "../packages/core-logic/src/",
    ],
    excludes: ["/bridge/", ".test."],
  },
  {
    name: "44. Pixel specs wait out dockview's tab-strip resize flash before capturing",
    pattern: "",
    paths: [],
    customCheck: checkPixelSpecsWaitForSettledDock,
  },
  {
    name: `45. Both engine bridges keep "${DOCK_THEME_CLASS}" on their container (the settle wait keys on it)`,
    pattern: "",
    paths: [],
    customCheck: checkDockThemeClassStillCouplesToBridges,
  },
  {
    // Since pnpm 12.6.0 a `pnpm exec`/`pnpm run` wrapper around a Playwright
    // webServer orphans the server at teardown (it survives the process-group
    // kill, reparented to PID 1) and the runner hangs forever after "N passed"
    // — main's visual.yml hung for hours that way (#841). Launch the package's
    // own node_modules/.bin shim instead; it `exec`s node, so the kill lands.
    name: "46. Visual-tier Playwright webServers launch their server without a pnpm wrapper",
    pattern: '^\\s*"pnpm (exec|run|--filter)',
    paths: [
      "../packages/client-react/tests/ui/visual/playwright/playwright.config.ts",
      "../packages/client-solid/tests/ui/visual/playwright/playwright.config.ts",
    ],
  },
  {
    // Hardening S13. The build steps need root (pnpm store, dist writes); the
    // running server does not — it writes nothing to disk. `node` is the
    // unprivileged user the official image ships. Without this line a
    // container escape is a root shell.
    name: "47. The server container runs as an unprivileged user (Dockerfile USER node — hardening S13)",
    pattern: "",
    paths: [],
    customCheck: checkDockerfileRunsAsNode,
  },
  {
    // Hardening §9.2. Fly offers no DDoS protection and no per-IP rules; the
    // per-app concurrency hard_limit is its ONLY load-shedding knob — past it
    // the proxy refuses connections instead of letting the 256 MB machine
    // run out of memory. WebSockets are long-lived, so the unit is
    // connections, not requests.
    name: "48. fly.toml declares a connections hard_limit (hardening §9.2 — Fly's only load-shedding knob)",
    pattern: "",
    paths: [],
    customCheck: checkFlyDeclaresConnectionHardLimit,
  },
  {
    // The Effect core's fibers run on its own turn scheduler, and a scope it
    // closes from plain code must release its port subscriptions first —
    // both live in `bridge/out.ts` (`runnerFor`, `interruptFiber`,
    // `closeScope`). A bare `Effect.runFork(Scope.close(…))` skips the
    // release: a disposed stale-flag machine folded two more connection
    // events that way (2026-10-04). Presenters and machines run effects
    // through a host's runner or those helpers, never through the global
    // `Effect.run*`.
    name: "49. The Effect core runs effects through its bridge, never the global Effect.run* (turn scheduler + synchronous port release)",
    pattern: "Effect\\.run(Fork|Sync|SyncExit|Promise|PromiseExit|Callback)\\(",
    paths: ["../packages/client-core-effect/src/"],
    excludes: ["/bridge/", ".test."],
  },
  {
    // State the Effect core owns lives in a `SyncRef` (`bridge/syncRef.ts`):
    // a write reaches every subscriber before it returns. A
    // `SubscriptionRef` reaches one through `ref.changes`, which takes a
    // fiber per subscriber to read — a step after the commit, and a third of
    // the fiber time left at start-up when the machines were moved off it
    // (2026-10-05). The pattern is the IMPORT, in its three spellings, so a
    // comment that names the type does not trip it.
    name: "50. The Effect core keeps its state in a SyncRef, never an Effect SubscriptionRef (a fiber per subscriber, a step late)",
    pattern:
      'from "effect/SubscriptionRef"|import \\{[^}]*\\bSubscriptionRef\\b|^\\s*(type )?SubscriptionRef,?\\s*$',
    paths: ["../packages/client-core-effect/src/"],
    excludes: [".test."],
  },
  {
    // An Effect combinator that joins streams (`merge`, `flatMap`,
    // `zipLatest`, `race`, …) runs each side on a fiber of its own and hands
    // every chunk across: about eleven scheduler tasks per value, and no
    // order between the sides. Two ports joined that way cost 4,250 tasks
    // per 6 s where the bridge's one queue costs 600 (2026-10-04). Members
    // join ports through `fromPort.merged([...])` and its sources
    // (`portEvents`, `switchedPortEvents`, `latestOfEach`, `firstPortEvent`)
    // instead; the bridge is the one place that may reach for the
    // combinators. The pattern is the CALL, so prose that names one does
    // not trip it.
    name: "51. The Effect core joins streams through its bridge (fromPort.merged), never an Effect Stream combinator (a fiber per side, ~11 steps per value)",
    pattern:
      "Stream\\.(merge|flatMap|zip|race|interleave|combine|cross|concat|switchMap)\\w*\\(",
    paths: ["../packages/client-core-effect/src/"],
    excludes: ["/bridge/", ".test."],
  },
  {
    // `vercel build` reads `engines.node` from the root package.json and
    // refuses any range that meets none of the Node lines Vercel hosts —
    // today 24.x at most — and nothing overrides it, not even the project's
    // own Node setting. The tooling needs Node 26, so `"engines": { "node":
    // ">=26" }` (added 2026-10-04) failed the next Deploy before its build
    // started (2026-10-06); no CI step runs `vercel build`, so the PR was
    // green. The floor lives in `devEngines.runtime` instead: Vercel does
    // not read it, and pnpm enforces it on install, which it never did for
    // `engines.node`. What the clients ship is static files, so the Node
    // line Vercel then selects runs nothing.
    name: "52. The root package.json keeps its Node floor in devEngines.runtime, never engines.node (vercel build rejects a range above the Node it hosts)",
    pattern: "",
    paths: [],
    customCheck: checkNodeFloorLivesInDevEngines,
  },
  {
    name: "53. A web client reads import.meta.env only in main.tsx (the entry hands the values to @rtc/web-boot)",
    pattern: "import\\.meta\\.env",
    paths: ["../packages/client-react/src/", "../packages/client-solid/src/"],
    excludes: ["/node_modules/", "/src/main.tsx", ".test.", ".spec."],
  },
  {
    // Vitest's default pool re-imports the environment and every module for
    // each test file; with jsdom that import alone is ~250 ms, and it was
    // 50–75% of the jsdom packages' test time. vmThreads loads modules once
    // and gives each file a fresh VM context: ~3x less CPU over the unit
    // suites, ~1.8x over the contract coverage gates, identical coverage
    // (measured 2026-10-17). A package that forgets the line is not wrong,
    // only several times slower — exactly what no other check would notice.
    name: "54. Every package's vitest config declares the vmThreads pool (server: threads, for Node's realm)",
    pattern: "",
    paths: [],
    customCheck: checkVitestPools,
  },
  {
    // CI replays a task from the turbo remote cache when its hash is
    // unchanged, and the hash covers only the package's own files, its
    // workspace dependencies and declared inputs. A test that reads another
    // package's files (or a repo-root folder) without declaring them would be
    // replayed as passed after those files changed. Two did (motion-core read
    // the clients' chart CSS, server read supabase/migrations) until their
    // packages' turbo.json declared the paths (ADR-008). Sees literal paths
    // only — imports, `import()`, `require`, `new URL` — not paths assembled
    // at runtime from separate segments.
    name: "55. A package reads files outside itself only from a workspace dependency or a declared turbo input (remote-cache correctness)",
    pattern: "",
    paths: [],
    customCheck: checkOutsideReadsAreHashed,
  },
];

/** Directories gate 55 does not scan: generated output and native projects. */
const UNSCANNED_DIRS = new Set([
  "node_modules",
  "dist",
  "reports",
  "coverage",
  ".turbo",
  "ios",
  "android",
]);

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs)$/;

/** A relative specifier in an import, `import()`, `require` or `new URL`. */
const RELATIVE_SPECIFIER =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|new URL\(\s*|import\s+)["'](\.\.?\/[^"']+)["']/g;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!UNSCANNED_DIRS.has(entry.name)) {
        files.push(...listSourceFiles(`${dir}/${entry.name}`));
      }
    } else if (SOURCE_FILE.test(entry.name)) {
      files.push(`${dir}/${entry.name}`);
    }
  }

  return files;
}

/** The tasks that run a package's tests: each is hashed on its own, so an
 * outside read must be declared in every one the package has a script for. */
const TEST_TASKS = ["test", "test:coverage"];

/** The repo-root-relative directories a package's turbo.json declares as
 * extra inputs (`$TURBO_ROOT$/…`) of one task, up to each glob's first
 * wildcard. */
function readDeclaredInputDirs(packageDir: string, task: string): string[] {
  const configPath = `${packageDir}/turbo.json`;

  if (!existsSync(configPath)) {
    return [];
  }

  const config = JSON.parse(
    readFileSync(configPath, "utf8"),
  ) as PackageTurboConfig;

  return (config.tasks?.[task]?.inputs ?? []).flatMap((input) => {
    if (!input.startsWith("$TURBO_ROOT$/")) {
      return [];
    }

    const glob = input.slice("$TURBO_ROOT$/".length);
    const staticPart = glob.split(/[*?{[]/)[0] ?? "";

    return [staticPart.replace(/\/[^/]*$/, "")];
  });
}

/** Whether a repo-root-relative path is the directory itself or inside it. */
function isWithinDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

function checkOutsideReadsAreHashed(): string[] {
  const repoRoot = resolve("..");
  const failures: string[] = [];
  const packageDirByName = new Map<string, string>();

  for (const entry of readdirSync("../packages", { withFileTypes: true })) {
    const manifestPath = `../packages/${entry.name}/package.json`;

    if (entry.isDirectory() && existsSync(manifestPath)) {
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as PackageManifest;

      if (manifest.name !== undefined) {
        packageDirByName.set(manifest.name, `packages/${entry.name}`);
      }
    }
  }

  for (const [name, packageDir] of packageDirByName) {
    const manifest = JSON.parse(
      readFileSync(`../${packageDir}/package.json`, "utf8"),
    ) as PackageManifest;

    const dependencyDirs = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).flatMap((dependency) => {
      const dir = packageDirByName.get(dependency);

      return dir === undefined ? [] : [dir];
    });

    const declaredDirsByTask = TEST_TASKS.filter((task) => {
      return manifest.scripts?.[task] !== undefined;
    }).map((task) => {
      return {
        task,
        dirs: readDeclaredInputDirs(`../${packageDir}`, task),
      };
    });

    for (const file of listSourceFiles(`../${packageDir}`)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
        const target = resolve(file, "..", match[1] ?? "")
          .slice(repoRoot.length + 1)
          .replace(/\/$/, "");

        function holdsTarget(dir: string): boolean {
          return isWithinDir(target, dir);
        }

        if (holdsTarget(packageDir) || dependencyDirs.some(holdsTarget)) {
          continue;
        }

        for (const { task, dirs } of declaredDirsByTask) {
          if (!dirs.some(holdsTarget)) {
            failures.push(
              `${file.slice(3)}: reads ${target}, which ${name}#${task}'s hash does not cover — declare it as a "$TURBO_ROOT$/…" input of "${task}" in ${packageDir}/turbo.json (docs/adr/ADR-008-ci-turbo-remote-cache.md)`,
            );
          }
        }
      }
    }
  }

  return failures;
}

/**
 * Gate 54's exceptions: a package whose tests must run outside VM contexts,
 * and the pool it declares instead. `server`'s tests drive Node built-ins
 * (http, streams), whose errors come from Node's realm, so its own
 * `instanceof Error` reads false inside a VM context.
 */
const POOL_EXCEPTIONS: Readonly<Record<string, string>> = { server: "threads" };

/** The contract-tier configs: standalone, they extend no package config. */
const CONTRACT_VITEST_CONFIGS = [
  "../packages/client-react/tests/ui/contract/vitest.config.ts",
  "../packages/client-solid/tests/ui/contract/vitest.config.ts",
];

function checkVitestPools(): string[] {
  const failures: string[] = [];

  function requirePool(configPath: string, pool: string): void {
    if (!existsSync(configPath)) {
      failures.push(
        `${configPath.slice(3)}: missing — a package whose test script runs vitest needs a vitest.config.ts that declares its pool`,
      );
    } else if (!readFileSync(configPath, "utf8").includes(`pool: "${pool}"`)) {
      failures.push(
        `${configPath.slice(3)}: does not declare pool: "${pool}" (docs/architecture/09-test-strategy.md §"The test pool")`,
      );
    }
  }

  for (const entry of readdirSync("../packages", { withFileTypes: true })) {
    const manifestPath = `../packages/${entry.name}/package.json`;

    if (!entry.isDirectory() || !existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as PackageManifest;

    if (manifest.scripts?.test?.includes("vitest") === true) {
      requirePool(
        `../packages/${entry.name}/vitest.config.ts`,
        POOL_EXCEPTIONS[entry.name] ?? "vmThreads",
      );
    }
  }

  for (const configPath of CONTRACT_VITEST_CONFIGS) {
    requirePool(configPath, "vmThreads");
  }

  return failures;
}

function checkDockerfileRunsAsNode(): string[] {
  const lines = readFileSync("../packages/server/Dockerfile", "utf8").split(
    "\n",
  );

  const userIndex = lines.findIndex((line) => {
    return /^USER node\s*$/.test(line);
  });

  const cmdIndex = lines.findIndex((line) => {
    return line.startsWith("CMD ");
  });

  if (userIndex < 0) {
    return [
      "packages/server/Dockerfile: no `USER node` line — the server would run as root",
    ];
  }

  if (cmdIndex >= 0 && userIndex > cmdIndex) {
    return ["packages/server/Dockerfile: `USER node` must come before CMD"];
  }

  return [];
}

function checkNodeFloorLivesInDevEngines(): string[] {
  const manifest = JSON.parse(
    readFileSync("../package.json", "utf8"),
  ) as RootManifest;
  const failures: string[] = [];

  if (manifest.engines?.node !== undefined) {
    failures.push(
      `package.json: engines.node is "${manifest.engines.node}" — move the floor to devEngines.runtime (vercel build reads engines.node)`,
    );
  }

  const runtime = manifest.devEngines?.runtime;

  if (runtime?.name !== "node" || !runtime.version) {
    failures.push(
      'package.json: devEngines.runtime must name "node" with a version range (the Node floor the .mts tooling needs)',
    );
  }

  if (runtime?.onFail !== undefined && runtime.onFail !== "error") {
    failures.push(
      `package.json: devEngines.runtime.onFail is "${runtime.onFail}" — it must be "error", or pnpm no longer enforces the floor`,
    );
  }

  return failures;
}

function checkFlyDeclaresConnectionHardLimit(): string[] {
  const toml = readFileSync("../fly.toml", "utf8");
  const failures: string[] = [];

  if (!/\[http_service\.concurrency\]/.test(toml)) {
    failures.push("fly.toml: missing [http_service.concurrency]");
  }

  if (!/type\s*=\s*"connections"/.test(toml)) {
    failures.push(
      'fly.toml: concurrency type must be "connections" (WebSockets are long-lived)',
    );
  }

  if (!/hard_limit\s*=\s*\d+/.test(toml)) {
    failures.push("fly.toml: missing hard_limit");
  }

  return failures;
}

let failed = 0;

for (const gate of GATES) {
  let lines: string[];

  if (gate.customCheck) {
    lines = gate.customCheck();
  } else {
    const args = gateGrepArgs(gate.pattern, gate.paths);
    const result = spawnSync("grep", args, { encoding: "utf8" });

    if (result.status === 2) {
      console.error(`ERROR running gate "${gate.name}":`, result.stderr);
      failed++;
      continue;
    }

    lines = keepViolations(result.stdout ?? "", gate.excludes ?? []);
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
