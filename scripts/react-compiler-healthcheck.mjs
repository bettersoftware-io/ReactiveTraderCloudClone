// Reports, per component/hook, whether the React Compiler OPTIMIZES or BAILS on
// it — and fails if any file this repo de-memoized has started bailing.
//
// Why this exists: ADR-003 deleted ~35 manual memo call sites on the premise
// that the compiler memoizes instead. Nothing measured that premise for months.
// A component that starts breaking a Rule of React silently loses ALL of its
// memoization — the compiler leaves it un-optimized but working, so no test,
// type, or lint failure ever fires. This gate is the only signal.
//
// Scope note: the gate deliberately tracks only files that traded a manual memo
// for compiler memoization. A global bail-count ratchet would be noise — the
// ViewModel seam (ADR-004) bails ~118 functions in client-react by design, since
// React Compiler requires static hook identity and the seam supplies hooks
// dynamically. See the spec for the measurement.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "packages/client-react/"));
const babel = require("@babel/core");
const compilerPath = require.resolve("babel-plugin-react-compiler");

// Files that gave up a manual memo and now depend on the compiler. Adding a
// de-memoized file here is REQUIRED — that is what makes the trade enforceable.
const TRACKED = [
  "packages/devtools-app/src/timeline/useTimeline.ts",
  "packages/devtools-app/src/InspectorApp.tsx",
  "packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx",
  "packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx",
  "packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts",
  "packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts",
  "packages/client-react-native/src/ui/theme/useThemedStyles.ts",
];

// `useRecording.ts` is deliberately NOT tracked: it bails on a compiler
// limitation (value blocks inside try/catch), and its callbacks were pure
// caching with no memo boundary — nothing was traded away, so there is nothing
// to protect. `ThemeProvider.tsx` is likewise untracked: it bails on the seam,
// and its memo was replaced by a module-scope table, not by compiler memoization.
//
// TEMPORARILY DROPPED as of Task 2 (2026-07-26) — each BAILS today, for a
// reason unrelated to the manual memo its own later task plans to touch. Each
// must be resolved (fixed and re-added, or permanently justified like the two
// above) by the task named, not silently left out:
//   - "packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts"
//     BAILS — "Cannot access refs during render". Expected per the plan;
//     Task 3 fixes the ref access and re-adds it as its final step.
//   - "packages/client-react/src/ui/equities/watchlist/WatchlistPanel.tsx"
//     BAILS on the whole component — "Hooks must be the same function on
//     every render" (the ADR-004 ViewModel-seam pattern: useWatchlist,
//     useEqWorkspace, useEqWatchlistSort, usePowerSaver are all destructured
//     from useViewModel()). This is NOT caused by the one useCallback Task 8
//     plans to delete — the compiler already cannot optimize this component
//     at all, seam or no seam, so that callback is not provably safe to drop
//     until this is resolved. Unanticipated by the plan; flagged in the Task
//     2 report for the plan owner.
//   - "packages/devtools-app/src/timeline/ContextPane.tsx"
//     BAILS in DiffTab — "Support value blocks (conditional, logical,
//     optional chaining, etc) within a try/catch statement", triggered by a
//     ternary inside a try block. This is NOT one of the two useMemo sites
//     (changedIds, visibleStreams) Task 7 plans to remove — that task's own
//     "report optimized" expectation for this file does not hold as written
//     unless the try/catch is also addressed. Unanticipated by the plan;
//     flagged in the Task 2 report for the plan owner.

const failures = [];

for (const rel of TRACKED) {
  const abs = path.join(repoRoot, rel);
  const events = [];

  babel.transformSync(readFileSync(abs, "utf8"), {
    filename: abs,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [[compilerPath, { logger: { logEvent: (_f, e) => events.push(e) } }]],
  });

  const bails = events.filter((e) => e.kind === "CompileError" || e.kind === "CompileSkip");
  const wins = events.filter((e) => e.kind === "CompileSuccess");

  if (bails.length > 0) {
    for (const bail of bails) {
      const reason = bail.detail?.reason ?? bail.detail?.description ?? "unknown";

      failures.push(`${rel}: BAILED — ${String(reason).split("\n")[0]}`);
    }
  } else if (wins.length === 0) {
    failures.push(`${rel}: no component or hook found — is the path still correct?`);
  } else {
    console.log(`ok  ${rel}  (${wins.length} optimized)`);
  }
}

if (failures.length > 0) {
  console.error("\nReact Compiler regression — these files traded a manual memo for compiler memoization and no longer compile:\n");

  for (const failure of failures) {
    console.error(`  ${failure}`);
  }

  console.error("\nEither restore the Rules-of-React compliance, or re-add an explicit memo and remove the file from TRACKED.\n");
  process.exit(1);
}

console.log(`\ncheck:compiler: ${TRACKED.length} files OK`);
