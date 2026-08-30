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
// Dependency note: `@babel/core` and `babel-plugin-react-compiler` are resolved
// via createRequire scoped to `packages/client-react/` — DELIBERATELY, so this
// gate compiles with the exact compiler version the app builds with. Declaring
// them at the repo root instead would let the two drift, and this gate silently
// measuring a different compiler than the one that ships is precisely the class
// of bug it exists to catch. knip cannot see through createRequire, so both are
// listed under the root workspace's `ignoreDependencies` in knip.json.
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
// worth asserting on its own — assert only that the tracked FUNCTION's own
// compiled output memoized *something*" (scoped to that function's
// `CompileSuccess` event, not summed across every function the file happens
// to contain — a sibling function's unrelated memoization must never mask a
// regression in the one this entry tracks), kept for
// `useBootSceneFonts`/`useThemedStyles`, which each build a module-level
// lookup table with no single named binding worth pointing at on its own.
const TRACKED = [
  {
    // `selectedRow` was tracked here until the store-first navigation rework
    // and is deliberately no longer per-value asserted; re-measured against
    // the compiled output, see the note below the list. `reconstruction` is
    // unchanged — still the one multi-statement derivation in this hook,
    // still a standalone bare-temp binding. `rows` is re-tracked: it fuses
    // with `filter`/`pinnedRowHidden` into one shared memo block rather than
    // compiling as its own bare-temp binding, and `fusedBlockMemoized` below
    // classifies that shape via the else-branch slot readback.
    file: "packages/devtools-app/src/timeline/useTimeline.ts",
    fn: "useTimeline",
    values: ["reconstruction", "rows"],
  },
  {
    // Renamed, not lost: the ≠-live change set split per family, so the old
    // `changedIds` VALUE is now `changedStreams` (its sibling
    // `changedMachines` is new — it never traded away a manual memo, so it is
    // out of this gate's scope per the header note), and `visibleStreams` is
    // now `streams`. Both re-verified as bare-temp memoized bindings.
    file: "packages/devtools-app/src/timeline/StateTab.tsx",
    fn: "StateTab",
    values: ["changedStreams", "streams"],
  },
  {
    // The 2026-08-30 fix wave's B1: an eager `useState(...)` object literal
    // for the keyboard cursor defeated the compiler across most of the
    // component (measured `NavTree[5v]/_c(16)` at the pre-Task-15 base →
    // `[2v]/_c(5)` with the eager literal — the surviving 2 values are
    // `selectedId` and a JSX block keyed on `moveTreeCursor`, which the
    // compiler re-creates every render, so that block's guard can never be
    // satisfied; see `docs/architecture/20-devtools.md` §20.12 and A3 in
    // `.superpowers/sdd/2026-08-29-devtools-follow-ups-sweep/final-review-phase2.md`).
    // Switching to a lazy `useState(() => {...})` initializer restored
    // `[6v]/_c(19)`. `visible` (the `flattenVisible(nodes, expanded)` result)
    // and `moveTreeCursor` both compile as plain `const`s directly inside the
    // one shared memo block that also produces the returned JSX (not their
    // own bare-temp bindings, and not the `let name;` if/else-readback shape
    // `fusedBlockMemoized` classifies either) — so per-value assertion cannot
    // discriminate this shape. Whole-function mode with `minMemoValues: 6`
    // is the discriminator that actually catches the regression: the broken
    // eager shape still reports `memoValues: 2` (not 0), so the default
    // ">=1" threshold used by the `CandleChart`/`useBootSceneFonts`/
    // `useThemedStyles` entries below would silently pass it.
    file: "packages/devtools-app/src/nav/NavTree.tsx",
    fn: "NavTree",
    values: null,
    minMemoValues: 6,
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
    // The movers-row sparkline: lifted `useCandles(symbol)` out of this
    // component (into MoversBoard's MoversBoardRow) specifically so it would
    // compile here — a ViewModel-seam read bails the compiler outright (see
    // MoversBoard below, still bailing for that reason). `path` is the
    // memoized binding; `svgPath` fuses into the same memo block feeding it
    // (a different compiled shape than a standalone bare-temp binding — see
    // the discriminator note above — so it isn't separately tracked).
    file: "packages/client-react-native/src/ui/equities/markets/RowSparkline.tsx",
    fn: "RowSparkline",
    values: ["path"],
  },
  {
    // The Skia candlestick chart: same lift-the-seam-read fix as
    // RowSparkline above (TradeView now owns `useCandles`, passing `candles`
    // down as a prop). `bars`/`keyedBars` fuse into the same memo block as
    // the JSX they feed rather than compiling as their own bare-temp
    // bindings, so no single value is worth tracking — whole-function form
    // asserts the fused block memoized something.
    file: "packages/client-react-native/src/ui/equities/trade/CandleChart.tsx",
    fn: "CandleChart",
    values: null,
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
// - `useTimeline.ts`'s `selectedRow` no longer computes anything: it was
//   `computeSelectedRow(log, selection)` (a log lookup) and is now
//   `selection.mode === "pinned" ? selection.row : null` — a read of the row
//   the selection already captured (spec §6.2, so an evicted row survives).
//   There is no computation left to cache.
// - `useTimeline.ts`'s `filter` fuses into the same shared memo block as
//   `rows` (see the TRACKED entry above) rather than compiling as its own
//   bare-temp binding, so it stays untracked — the fused-block discriminator
//   asserts the block via `rows`, its readback witness.
// - `useRecording.ts` bails on a compiler limitation (value blocks inside
//   try/catch), but its callbacks were pure caching with no memo boundary —
//   nothing was traded away, so there is nothing to protect.
// - `MoversBoard.tsx`'s own `MoversBoard`/`MoversBoardRow` bail on the
//   ViewModel seam (`useWatchlist`/`useEqWatchlistSort`/`useEquityQuote`/
//   `useCandles` all read off `useViewModel()`) and carry no doc comment
//   claiming otherwise — unlike `RowSparkline`/`CandleChart` above, which
//   were lifted specifically so THEY would compile, `MoversBoard` is the
//   seam-reading parent that makes that lift possible and was never a
//   candidate for compiler memoization itself.
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

for (const { file, fn, values, minMemoValues = 1 } of TRACKED) {
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
    // Whole-function assertion: the compiler memoized at least
    // `minMemoValues` values in this function's own compiled output.
    // Scoped to `win` (the `CompileSuccess` event already matched by
    // `fnName === fn` above), not summed across every function the file
    // happens to contain — a sibling function's unrelated memoization must
    // never mask a regression in the tracked one. Default threshold is 1
    // ("memoized SOMETHING"); an entry sets its own higher `minMemoValues`
    // when a low-but-nonzero count is itself the regression signature (a
    // function can keep memoizing an unrelated value or two while the
    // specific block that mattered goes dead — see the `NavTree` entry,
    // where the broken eager-`useState` shape still reports `memoValues: 2`,
    // not 0).
    const totalMemoValues = win.memoValues ?? 0;

    if (totalMemoValues >= minMemoValues) {
      console.log(
        `ok  ${file}  ${fn}  (fn-scoped: ${totalMemoValues} memo values, min ${minMemoValues})`,
      );
    } else {
      failures.push(
        `${file}: ${fn} compiles (CompileSuccess) but memoized only ${totalMemoValues} value(s), below the tracked minimum of ${minMemoValues} — the memoization this entry protects has regressed.`,
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
      if (fusedBlockMemoized(code, name)) {
        console.log(`ok  ${file}  ${fn}  ${name}  (memoized, fused block)`);
        continue;
      }

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

// Fused-block shape: `let name;` declared bare, assigned inside
// `if ($[n] !== …) { … name = <expr>; … $[k] = name; … } else { … name = $[k]; … }`.
// The compiler merged this value's reactive scope with a sibling that reads
// it. Witness = the else-branch readback from the SAME slot it was written to.
// `[\s\S]*?` (not `[^}]*?`): the if-block legitimately contains nested object
// literals (`filter = { ...a, ...b }`), whose braces a negated class cannot cross.
function fusedBlockMemoized(code, name) {
  const bareDecl = new RegExp(`(?:const|let)\\s+${name};`);

  if (!bareDecl.test(code)) {
    return false;
  }

  const fused = new RegExp(
    `if\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\b${name}\\s*=\\s*[^;\\n]+;[\\s\\S]*?\\$\\[(\\d+)\\]\\s*=\\s*${name};[\\s\\S]*?\\}\\s*else\\s*\\{[\\s\\S]*?\\b${name}\\s*=\\s*\\$\\[\\1\\];[\\s\\S]*?\\}`,
  );

  return fused.test(code);
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
