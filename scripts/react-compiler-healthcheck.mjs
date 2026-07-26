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
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(path.join(repoRoot, "packages/client-react/"));
const babel = require("@babel/core");
const compilerPath = require.resolve("babel-plugin-react-compiler");

// The FUNCTIONS that gave up a manual memo and now depend on the compiler.
//
// Granularity is per-function, not per-file, because the compiler bails per
// function — a single unrelated bail elsewhere in a file (e.g. `DiffTab`
// used to bail on a ternary inside try/catch, fixed by hoisting the
// computation out of the JSX in `ContextPane.tsx`) would otherwise read the
// WHOLE file as failing under a file-level gate and pressure someone into
// deleting the gate rather than fixing anything.
const TRACKED = [
  {
    file: "packages/devtools-app/src/timeline/useTimeline.ts",
    fn: "useTimeline",
  },
  {
    file: "packages/devtools-app/src/timeline/ContextPane.tsx",
    fn: "StateTab",
  },
  {
    file: "packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx",
    fn: "DockingScene",
  },
  {
    file: "packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx",
    fn: "LaserScene",
  },
  {
    file: "packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts",
    fn: "useBootSceneFonts",
  },
  {
    file: "packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts",
    fn: "useShellTelemetry",
  },
  {
    file: "packages/client-react-native/src/ui/theme/useThemedStyles.ts",
    fn: "useThemedStyles",
  },
];

// Deliberately NOT tracked, each for a different reason:
//
// - `useRecording.ts` bails on a compiler limitation (value blocks inside
//   try/catch), but its callbacks were pure caching with no memo boundary —
//   nothing was traded away, so there is nothing to protect.
// - `ThemeProvider.tsx` bails on the ViewModel seam; its memo was replaced by a
//   module-scope lookup table, not by compiler memoization.
// - `InspectorApp.tsx` holds a build-once INSTANCE via ref, not compiler-
//   memoized derived state.
// - `WatchlistPanel.tsx` CANNOT be protected: the component itself bails on the
//   seam (ADR-004), so its deleted `useCallback` gets no compiler memoization
//   at all. That deletion is justified instead by the fact that this repo has
//   zero `React.memo` boundaries, so callback identity buys nothing at runtime.
//   Recorded here because "untracked" must never read as "forgotten".
// - `useHoldToUnlock.ts` keeps semantic memos — the compiler cannot supply
//   gesture identity, since it bails on `runOnJS(fireComplete)()` (no special
//   case for `runOnJS`) and, even if the ref were removed, would key
//   `gesture`'s memoization on `LockScreen`'s `submit`, which churns identity
//   every render because `LockScreen` itself bails on the ViewModel seam; see
//   the hook's header comment for the full measured chain.

const failures = [];

for (const { file, fn } of TRACKED) {
  const abs = path.join(repoRoot, file);
  const events = [];

  babel.transformSync(readFileSync(abs, "utf8"), {
    filename: abs,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [compilerPath, { logger: { logEvent: (_f, e) => events.push(e) } }],
    ],
  });

  const win = events.find(
    (e) => e.kind === "CompileSuccess" && e.fnName === fn,
  );

  if (win) {
    console.log(`ok  ${file}  ${fn}  (${win.memoSlots} memo slots)`);
    continue;
  }

  // Not optimized. Bail events carry NO `fnName` — only `fnLoc` — so the bail
  // cannot be attributed to the tracked function by name. List every bail in
  // the file with its line, and let the reader match it up. Reporting "not
  // optimized" with no location would be a riddle, not a gate.
  const bails = events
    .filter((e) => e.kind === "CompileError" || e.kind === "CompileSkip")
    .map((e) => {
      const reason = e.detail?.reason ?? e.detail?.description ?? "unknown";

      return `line ${e.fnLoc?.start?.line ?? "?"}: ${String(reason).split("\n")[0]}`;
    });

  if (bails.length > 0) {
    failures.push(
      `${file}: ${fn} is NOT optimized. Bails in this file:\n      ${bails.join("\n      ")}`,
    );
  } else {
    failures.push(
      `${file}: ${fn} not found and nothing bailed — was it renamed or moved? Update TRACKED.`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    "\nReact Compiler regression — these files traded a manual memo for compiler memoization and no longer compile:\n",
  );

  for (const failure of failures) {
    console.error(`  ${failure}`);
  }

  console.error(
    "\nEither restore the Rules-of-React compliance, or re-add an explicit memo and remove the file from TRACKED.\n",
  );
  process.exit(1);
}

console.log(`\ncheck:compiler: ${TRACKED.length} tracked functions OK`);
