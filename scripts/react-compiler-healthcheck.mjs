// Reports, per tracked VALUE, whether the React Compiler actually memoized
// it — not merely whether the function it lives in reports `CompileSuccess`.
//
// Why this exists: ADR-003 deleted ~35 manual memo call sites on the premise
// that the compiler memoizes instead. A file-or-function-level `CompileSuccess`
// check cannot tell the difference between "the compiler cached this exact
// value" and "the compiler cached something in this function, plus this value
// happens to sit in an untouched expression" — and that gap is exactly how a
// real regression shipped once already: three boot scenes' `world`/`stamp`
// values kept reporting `CompileSuccess` while compiling with NO memo guard at
// all, because they were read only inside a `useDerivedValue` closure and
// never JSX (the compiler has no reason to cache what it never sees consumed
// in a re-render-sensitive position). This gate asserts the actually-memoized
// shape of the compiled output for each tracked value, so that class of miss
// fails loudly instead of silently.
//
// Discriminator: the compiler emits a MEMOIZED value's declaration as
//     let t0;
//     if ($[0] !== dep) { t0 = expr; $[0] = dep; $[1] = t0; } else { t0 = $[1]; }
//     const name = t0;
// so a memoized binding's declaration RHS is a bare temp (`t<digits>`), while
// an unmemoized one keeps its original expression inline as the RHS. A value
// that instead compiles down to a `function name(...) { ... }` declaration
// (rather than a `const`/`let` binding) is a DIFFERENT compiled shape this
// discriminator does not classify — flagged as a hard failure below rather
// than silently guessed at, so a future tracked entry of that shape gets
// caught rather than rubber-stamped.
//
// Scope note: the gate deliberately tracks only functions/values that traded
// a manual memo for compiler memoization. A global bail-count ratchet would be
// noise — the ViewModel seam (ADR-004) bails ~118 functions in client-react by
// design, since React Compiler requires static hook identity and the seam
// supplies hooks dynamically. See the spec for the measurement.
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

// The FUNCTIONS that gave up a manual memo and now depend on the compiler,
// each with the specific VALUES to assert are actually memoized (not just
// that the function compiles). `values: null` means "no individual value is
// worth asserting on its own — assert only that the whole file memoized
// *something*", kept for `useBootSceneFonts`/`useThemedStyles`, which each
// build a module-level lookup table with no single named binding worth
// pointing at on its own.
const TRACKED = [
  {
    file: "packages/devtools-app/src/timeline/useTimeline.ts",
    fn: "useTimeline",
    values: ["rows", "selectedRow", "reconstruction"],
  },
  {
    file: "packages/devtools-app/src/timeline/ContextPane.tsx",
    fn: "StateTab",
    values: ["changedIds", "visibleStreams"],
  },
  {
    file: "packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx",
    fn: "LaserScene",
    values: ["grid", "panelRects", "emitterPoint"],
  },
  {
    file: "packages/client-react-native/src/ui/analytics/PnlChart.tsx",
    fn: "PnlChart",
    values: ["paths"],
  },
  {
    file: "packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts",
    fn: "useBootSceneFonts",
    values: null,
  },
  {
    file: "packages/client-react-native/src/ui/theme/useThemedStyles.ts",
    fn: "useThemedStyles",
    values: null,
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
// - `WatchlistPanel.tsx` and `RfqCard.tsx` CANNOT be protected: the component
//   itself bails on the seam (ADR-004) — `RfqCard` reads `useRfqCountdown` off
//   `useViewModel()` — so their deleted `useCallback`s get no compiler
//   memoization at all. That deletion is justified instead by the fact that
//   this repo has zero `React.memo` boundaries, so callback identity buys
//   nothing at runtime.
//   Recorded here because "untracked" must never read as "forgotten".
// - `useHoldToUnlock.ts` keeps semantic memos — the compiler cannot supply
//   gesture identity, since it bails on `runOnJS(fireComplete)()` (no special
//   case for `runOnJS`) and, even if the ref were removed, would key
//   `gesture`'s memoization on `LockScreen`'s `submit`, which churns identity
//   every render because `LockScreen` itself bails on the ViewModel seam; see
//   the hook's header comment for the full measured chain.
// - `DockingScene.tsx`'s `scanlines`/`corridor`/`hudGrid`, `LaserScene.tsx`'s
//   `contentShapes`, and `GeoScene.tsx`/`JarvisScene.tsx`/`TopoScene.tsx`'s
//   `world` were all found, by an on-device-motivated audit, to compile with
//   NO memo guard at all — each is read only inside a `useDerivedValue`
//   closure and never JSX, so the compiler has no re-render-sensitive
//   consumer to key a cache off. All six now live in a module-scope,
//   compiler-independent cache instead (`sceneGeometryCache.ts`), so there is
//   no compiler behavior left here to protect — the gate would just be
//   asserting a permanent, structural bail. (`LaserScene`'s OWN function stays
//   tracked above for `grid`/`panelRects`/`emitterPoint`, which genuinely are
//   compiler-memoized — only `contentShapes`, computed in the sibling
//   `LaserPanelTrace` function, moved to the module cache.)
// - `TopoScene.tsx`'s `stamp` is the one genuine bug this audit found (not a
//   memoization gap): it read `new Date()` on every render, which is impure
//   regardless of caching. Fixed as a build-once-per-mount ref, which is a
//   React lifecycle guarantee, not compiler memoization — nothing for this
//   gate to assert.
// - `useShellTelemetry.ts`'s `publishFps` compiles as a plain, unmemoized
//   function (confirmed by the same audit) — but its only consumer is
//   `runOnJS(publishFps)(...)`, called synchronously within the same render
//   pass that defined it. Nothing ever compares it across renders (the
//   `useState` setter it closes over is itself referentially stable by
//   React's own contract, independent of `publishFps`'s identity), so a
//   fresh function every render was always harmless — there is no
//   memoization guarantee to protect here.

const failures = [];

for (const { file, fn, values } of TRACKED) {
  const abs = path.join(repoRoot, file);
  const events = [];

  const { code } = babel.transformSync(readFileSync(abs, "utf8"), {
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

  if (win === undefined) {
    // Not optimized at all. Bail events carry NO `fnName` — only `fnLoc` —
    // so the bail cannot be attributed to the tracked function by name. List
    // every bail in the file with its line, and let the reader match it up.
    // Reporting "not optimized" with no location would be a riddle, not a
    // gate.
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

    continue;
  }

  if (values === null) {
    // Whole-file assertion: the compiler memoized SOMETHING in this file.
    const totalMemoValues = events
      .filter((e) => e.kind === "CompileSuccess")
      .reduce((n, e) => n + (e.memoValues ?? 0), 0);

    if (totalMemoValues > 0) {
      console.log(
        `ok  ${file}  ${fn}  (whole-file: ${totalMemoValues} memo values)`,
      );
    } else {
      failures.push(
        `${file}: ${fn} compiles (CompileSuccess) but memoized nothing in the whole file (memoValues=0) — the module-scope table this hook builds from is no longer being cached.`,
      );
    }

    continue;
  }

  // Per-value assertion: each tracked value's own declaration must be a bare
  // memoized temp, not its original expression re-inlined.
  const valueFailures = [];

  for (const name of values) {
    const declMatch = code.match(
      new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([^;\\n]+)`),
    );

    if (declMatch === null) {
      const isFnDecl = new RegExp(`function\\s+${name}\\s*\\(`).test(code);

      if (isFnDecl) {
        valueFailures.push(
          `${name} compiles as a \`function ${name}(...)\` declaration, not a plain memoized binding — this gate's temp-assignment discriminator does not classify that shape. Verify manually and either restore a plain-binding form or extend this script's discriminator; do not assume it is memoized.`,
        );
      } else {
        valueFailures.push(
          `${name} not found in the compiled output — was it renamed or removed? Update TRACKED.`,
        );
      }

      continue;
    }

    const rhs = declMatch[1].trim();
    const isMemoized = /^t\d+$/.test(rhs);

    if (isMemoized) {
      console.log(`ok  ${file}  ${fn}  ${name}  (memoized)`);
    } else {
      valueFailures.push(
        `${name} compiles inline (\`${rhs.slice(0, 60)}\`), not memoized — no \`$[n] !== dep\` guard wraps it.`,
      );
    }
  }

  if (valueFailures.length > 0) {
    failures.push(
      `${file}: ${fn} compiles (CompileSuccess) but these tracked values regressed:\n      ${valueFailures.join("\n      ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    "\nReact Compiler regression — these values traded a manual memo for compiler memoization and no longer compile as memoized:\n",
  );

  for (const failure of failures) {
    console.error(`  ${failure}`);
  }

  console.error(
    "\nEither restore the Rules-of-React compliance that lets the compiler cache this value, or re-add an explicit cache (e.g. a module-scope cache like `sceneGeometryCache.ts`, or an explicit memo) and remove the value from TRACKED.\n",
  );
  process.exit(1);
}

const trackedValueCount = TRACKED.reduce((n, t) => {
  return n + (t.values === null ? 1 : t.values.length);
}, 0);

console.log(
  `\ncheck:compiler: ${TRACKED.length} tracked functions OK (${trackedValueCount} tracked values)`,
);
