# Manual Memoization Ban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ban `useMemo` / `useCallback` / `memo` by lint across the three packages that run the React Compiler, enable the compiler on `client-react-native`, and ship the compiler-coverage measurement as a repo gate.

**Architecture:** React Compiler auto-memoizes at build time, making manual memoization redundant — but only for components it actually compiles. This plan enables the compiler where it was missing (RN), deletes the 38 pure-caching call sites, converts the single semantic one to the build-once-ref idiom, enforces the ban with `no-restricted-imports`, and adds `pnpm check:compiler` so silent bail regressions are caught.

**Tech Stack:** React 19, React Compiler (`babel-plugin-react-compiler@1.0.0`), Vite 8 / `@vitejs/plugin-react@6` (web), Expo SDK 57 / `babel-preset-expo` (RN), ESLint flat config, `eslint-plugin-react-hooks@7`.

**Spec:** [`docs/superpowers/specs/2026-07-26-manual-memoization-ban-design.md`](../specs/2026-07-26-manual-memoization-ban-design.md)

## Global Constraints

- **Callbacks become function declarations, never arrows.** `func-style: ["error", "declaration", { allowArrowFunctions: false }]` is repo-wide. `const x = () => {}` fails lint; `function x(): void {}` is correct. (ADR-003 §2.)
- **Newspaper order.** `rtc/component-newspaper` requires the exported component to be the file's lede, with private helpers/types *below* it. Any helper function extracted from a memo body goes below the component.
- **Blank-line padding.** `padding-line-between-statements` requires a blank line before/after every `function` declaration and around multiline blocks. Biome collapses runs to one.
- **No inline `eslint-disable`.** Exceptions are config-scoped blocks in `eslint.config.mjs` with a documented rationale (ADR-003 §5 precedent).
- **`babel-plugin-react-compiler` version is `^1.0.0`** — must match `client-react` and `devtools-app` exactly (syncpack enforces a single range repo-wide).
- **Do not touch** `client-prototype`, `client-solid`, `solid-bindings`, or any test harness file. Out of scope per the spec's Non-goals.
- **Run gates from the worktree root**, never the primary checkout — linting from the primary globs sibling worktrees and produces false reds.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/client-react-native/app.config.ts` | turn the compiler on for RN | 1 |
| `packages/client-react-native/app.config.test.ts` | pin the flag against silent loss | 1 |
| `packages/client-react-native/package.json` | add the compiler devDep | 1 |
| `scripts/react-compiler-healthcheck.mjs` | measure + gate compiler coverage | 2 |
| `package.json` (root) | `check:compiler` script | 2 |
| `.github/workflows/ci.yml` | run the gate in `checks` | 2 |
| `.claude/commands/rtc/gauntlet.md` | run the gate in the fast tier | 2 |
| `packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts` | fix ref-in-render bail; drop 2 memos | 3 |
| `packages/client-react-native/src/ui/theme/ThemeProvider.tsx` | module-scope theme table; drop 1 memo | 4 |
| `packages/client-react-native/src/ui/theme/useThemedStyles.ts` | drop 1 memo | 4 |
| `packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts` | drop 1 callback | 4 |
| `packages/client-react-native/src/ui/shell/boot/scenes/{DockingScene,LaserScene}.tsx`, `bootSceneFonts.ts` | drop 8 memos | 5 |
| `packages/devtools-app/src/InspectorApp.tsx` | build-once-ref + drop 3 callbacks | 6 |
| `packages/devtools-app/src/timeline/{useTimeline,ContextPane}.tsx?`, `recording/useRecording.ts` | drop 21 sites | 7 |
| `packages/client-react/src/ui/equities/watchlist/WatchlistPanel.tsx` | drop 1 callback | 8 |
| `eslint.config.mjs` | the ban + `refs` override + devtools react-hooks block | 8 |
| `docs/adr/ADR-003-react-compiler-and-manual-memoization.md` | measured coverage; scope extension | 9 |
| `docs/STATUS.md` | seam tension + descoped prototype | 9 |

**Task order is load-bearing.** The lint ban (Task 8) must land *after* every deletion, or intermediate commits fail lint. The healthcheck (Task 2) must land *before* the deletions so it witnesses OPTIMIZED status throughout.

---

### Task 1: Enable React Compiler on client-react-native

**Files:**
- Modify: `packages/client-react-native/package.json` (devDependencies)
- Modify: `packages/client-react-native/app.config.ts:63` (the `plugins` line area)
- Modify: `packages/client-react-native/app.config.test.ts`

**Interfaces:**
- Produces: `experiments.reactCompiler === true` in the resolved Expo config; the compiler runs over `packages/client-react-native/src/**` and `app/**` at Metro build time. Tasks 3–5 depend on this being live.

- [ ] **Step 1: Write the failing test**

Append to `packages/client-react-native/app.config.test.ts` (below the existing `describe`, keeping the file's newspaper order — helpers stay at the bottom):

```ts
describe("app.config react compiler", () => {
  it("enables the React Compiler experiment", async () => {
    const config = await loadConfig();

    expect(config.experiments?.reactCompiler).toBe(true);
  });
});
```

If the file has no `loadConfig` helper, reuse whatever the existing `resolveServerUrl` helper does to re-import the module (`vi.resetModules()` then `await import("./app.config")`), and add the parallel helper at the bottom of the file:

```ts
async function loadConfig(): Promise<ExpoConfig> {
  vi.resetModules();

  const mod = await import("./app.config");

  return mod.default;
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native test -- app.config`
Expected: FAIL — `expected undefined to be true`.

- [ ] **Step 3: Add the devDependency**

In `packages/client-react-native/package.json`, add to `devDependencies`, keeping keys alphabetical:

```json
"babel-plugin-react-compiler": "^1.0.0",
```

Then install: `pnpm install`

- [ ] **Step 4: Enable the experiment**

In `packages/client-react-native/app.config.ts`, add above the existing `plugins: ["expo-router"],` line:

```ts
  // React Compiler (ADR-003). `babel-preset-expo@57` injects
  // `babel-plugin-react-compiler` from this flag, so `babel.config.js` needs no
  // entry — and the worklets plugin stays last, as that file requires.
  // Without this flag RN runs NO auto-memoization, which is why manual
  // `useMemo`/`useCallback` were load-bearing here until this change.
  experiments: { reactCompiler: true },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native test -- app.config`
Expected: PASS.

- [ ] **Step 6: Verify the compiler actually compiles RN source**

Run: `pnpm --filter @rtc/client-react-native test`
Expected: the full RN jest suite passes (the compiler now transforms components under test).

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/package.json packages/client-react-native/app.config.ts packages/client-react-native/app.config.test.ts pnpm-lock.yaml
git commit -m "feat(rn): enable React Compiler via Expo experiments flag"
```

---

### Task 2: Healthcheck script and gate

**Files:**
- Create: `scripts/react-compiler-healthcheck.mjs`
- Modify: `package.json` (root `scripts`)
- Modify: `.github/workflows/ci.yml` (the `checks` job)
- Modify: `.claude/commands/rtc/gauntlet.md` (fast-tier gate list)

**Interfaces:**
- Produces: `pnpm check:compiler` — exits 0 when every file in `TRACKED` compiles OPTIMIZED, exits 1 naming any that bailed. Tasks 3–7 rely on it to prove their deletions are safe.

- [ ] **Step 1: Write the script**

Create `scripts/react-compiler-healthcheck.mjs`:

```js
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

// The FUNCTIONS that gave up a manual memo and now depend on the compiler.
//
// Granularity is per-function, not per-file, because the compiler bails per
// function: `ContextPane.tsx` holds seven optimized components and one
// unrelated bail (`DiffTab`, a ternary inside try/catch). A file-level gate
// would read that file as failing and pressure someone into deleting the gate
// rather than fixing anything.
const TRACKED = [
  { file: "packages/devtools-app/src/timeline/useTimeline.ts", fn: "useTimeline" },
  { file: "packages/devtools-app/src/timeline/ContextPane.tsx", fn: "StateTab" },
  { file: "packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx", fn: "DockingScene" },
  { file: "packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx", fn: "LaserScene" },
  { file: "packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts", fn: "useBootSceneFonts" },
  { file: "packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts", fn: "useHoldToUnlock" },
  { file: "packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts", fn: "useShellTelemetry" },
  { file: "packages/client-react-native/src/ui/theme/useThemedStyles.ts", fn: "useThemedStyles" },
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

const failures = [];

for (const { file, fn } of TRACKED) {
  const abs = path.join(repoRoot, file);
  const events = [];

  babel.transformSync(readFileSync(abs, "utf8"), {
    filename: abs,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [[compilerPath, { logger: { logEvent: (_f, e) => events.push(e) } }]],
  });

  const win = events.find((e) => e.kind === "CompileSuccess" && e.fnName === fn);

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
    failures.push(`${file}: ${fn} is NOT optimized. Bails in this file:\n      ${bails.join("\n      ")}`);
  } else {
    failures.push(`${file}: ${fn} not found and nothing bailed — was it renamed or moved? Update TRACKED.`);
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
```

- [ ] **Step 2: Run it to verify it passes on the current tree**

Run: `node scripts/react-compiler-healthcheck.mjs`
Expected: 7 of the 8 entries report `ok`. `useHoldToUnlock` reports NOT optimized (`Cannot access refs during render`) — expected until Task 3 fixes it. Temporarily comment that entry out of `TRACKED` with a `TODO(Task 3)` marker so the gate is green on landing, and state prominently in your report that Task 3 must restore it.

- [ ] **Step 3: Verify the gate actually fails**

Temporarily add `"packages/devtools-app/src/recording/useRecording.ts"` to `TRACKED`, run the script, and confirm it exits 1 naming the try/catch bail. Then remove it again. A gate never proven to fail is not a gate.

- [ ] **Step 4: Wire the npm script**

In root `package.json`, add alongside the other `check:*` entries:

```json
"check:compiler": "node scripts/react-compiler-healthcheck.mjs",
```

- [ ] **Step 5: Wire CI**

In `.github/workflows/ci.yml`, add a step to the `checks` job next to the other `check:*` steps:

```yaml
      - name: React Compiler coverage
        run: pnpm check:compiler
```

- [ ] **Step 6: Wire the gauntlet**

In `.claude/commands/rtc/gauntlet.md`, add `pnpm check:compiler` to the fast-tier gate list, matching the surrounding format. Update the stated gate count in that file if it names one.

- [ ] **Step 7: Verify**

Run: `pnpm check:compiler && pnpm check:scripts && pnpm lint:actions`
Expected: all pass (`check:scripts` validates workspace script wiring; `lint:actions` validates the workflow YAML).

- [ ] **Step 8: Commit**

```bash
git add scripts/react-compiler-healthcheck.mjs package.json .github/workflows/ci.yml .claude/commands/rtc/gauntlet.md
git commit -m "feat(ci): gate React Compiler coverage for de-memoized files"
```

---

### Task 3: RN — record why useHoldToUnlock keeps its memos

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts` (comments only — NO code change)
- Modify: `scripts/react-compiler-healthcheck.mjs` (make the exclusion permanent)

**Interfaces:**
- Produces: no behavioural change. `gesture` and `progress` keep their current identities and semantics.

**This task was originally a refactor. It is not any more.** The original plan
assumed moving `onCompleteRef.current = onComplete` out of render would make the
hook compiler-clean, after which both memos could go. That was **measured and
disproved**. Do not attempt the refactor.

The evidence chain, verified with `babel-plugin-react-compiler@1.0.0`:

1. Moving the ref write into a `useEffect` removes the first bail but leaves a
   second: `runOnJS(fireComplete)()` closes over a ref, and the compiler has no
   special case for `runOnJS`.
2. Removing the ref entirely **does** make `useHoldToUnlock` compile
   (`OPTIMIZED`) — but then its memoization keys on `onComplete`.
3. `onComplete` is `submit`, declared inside `LockScreen`.
4. **`LockScreen` bails** on the ViewModel seam (`useViewModel()`), so `submit`
   gets a fresh identity on every render — and the gesture would be rebuilt on
   every render regardless.

So these memos carry **semantics, not caching**: they decouple the gesture's
identity from a caller whose callback identity churns for reasons this
workstream cannot fix. Rebuilding a `Gesture.LongPress()` reattaches it on every
render — Reanimated's own performance guide is explicit that gesture objects
should be memoized to avoid exactly that, and notes the React Compiler normally
handles it. Here the compiler cannot. This is ADR-003's documented "legal where
they carry semantics rather than caching" carve-out.

(Do NOT claim this has caused an observed failure in this repo — it has not.
An earlier revision of this plan asserted it could "drop in-flight gestures";
that was extrapolation, and a reviewer correctly rejected a comment citing it.)

- [ ] **Step 1: Record the reasoning in the file**

Add a comment above the two `useMemo`s in
`packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts` capturing
the four-step chain above in your own words. It must say plainly that these are
**not** caching, that the React Compiler cannot replace them, and **why** —
name `runOnJS`, the ref, and `LockScreen`'s seam bail. Anyone who later runs the
memo-ban lint and sees the exception must be able to find this reasoning without
re-deriving it.

Do NOT change any executable line in this file.

- [ ] **Step 2: Make the healthcheck exclusion permanent**

`scripts/react-compiler-healthcheck.mjs` has a commented-out `TRACKED` entry for
`useHoldToUnlock` marked `TODO(Task 3)`. **Delete that commented entry** and add
`useHoldToUnlock.ts` to the script's documented exclusion list, with a one-line
reason ("keeps semantic memos — the compiler cannot supply gesture identity; see
the hook's header comment"). The gate must not track it, and must not look like
it was forgotten.

- [ ] **Step 3: Verify nothing changed behaviourally**

```bash
node scripts/react-compiler-healthcheck.mjs
pnpm --filter @rtc/client-react-native test -- useHoldToUnlock
git diff --stat
```

Expected: gate passes; tests pass; `git diff` shows **comment-only** changes to
`useHoldToUnlock.ts`. If the diff touches an executable line, revert it.

- [ ] **Step 4: Commit**

```bash
git add packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts scripts/react-compiler-healthcheck.mjs
git commit -m "docs(rn): record why useHoldToUnlock's memos are semantic, not caching"
```

---

### Task 4: RN — theme and telemetry (3 sites)

**Files:**
- Modify: `packages/client-react-native/src/ui/theme/ThemeProvider.tsx`
- Modify: `packages/client-react-native/src/ui/theme/useThemedStyles.ts`
- Modify: `packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts:44`

**Interfaces:**
- Produces: `ThemeProvider` and `useThemedStyles` keep identical signatures. The resolved theme object identity is now **stable per `skin × mode` cell for the process lifetime** — a stronger guarantee than the `useMemo` it replaces.

- [ ] **Step 1: Replace ThemeProvider's memo with a module-scope table**

`skin × mode` is a closed set of 12 cells (6 skins × 2 modes), so resolve every cell once at module load. Rewrite `ThemeProvider.tsx`'s component body and add the table **below** the component (newspaper order — the exported component stays the lede; module-eval order still initializes the table before any render):

```tsx
export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const { useThemePreference, useThemeSkinPreference } = useViewModel();
  const { mode } = useThemePreference();
  const { skin } = useThemeSkinPreference();
  const theme = RESOLVED_THEMES[skin][mode];

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}
```

and below the existing `withPlatformMono` helper:

```tsx
/** Every `skin × mode` cell with its platform mono filled in, resolved once at
 * module load. A lookup beats a `useMemo` here on two counts: identity is
 * stable for the process lifetime rather than per-mount, and it does not depend
 * on the React Compiler — which bails on this component anyway, because reading
 * hooks off the ViewModel seam defeats static hook identity (see ADR-003's
 * measured-coverage section). Stable identity matters: this value is a context
 * value, so a fresh object per render would re-render every themed leaf. */
const RESOLVED_THEMES = resolveAllThemes();

function resolveAllThemes(): Record<ThemeSkin, Record<ThemeMode, RnTheme>> {
  const resolved = {} as Record<ThemeSkin, Record<ThemeMode, RnTheme>>;

  for (const skin of Object.keys(rnThemeTokens) as ThemeSkin[]) {
    const byMode = {} as Record<ThemeMode, RnTheme>;

    for (const mode of Object.keys(rnThemeTokens[skin]) as ThemeMode[]) {
      byMode[mode] = withPlatformMono(rnThemeTokens[skin][mode]);
    }

    resolved[skin] = byMode;
  }

  return resolved;
}
```

Add `import type { ThemeMode, ThemeSkin } from "@rtc/domain";` and drop the `useMemo` import.

- [ ] **Step 2: Drop useThemedStyles' memo**

Replace the body of `useThemedStyles.ts`:

```ts
export function useThemedStyles<T>(make: (theme: RnTheme) => T): T {
  const theme = useTheme();

  return make(theme);
}
```

Remove the `useMemo` import. Update the doc comment: styles are now memoized by the compiler keyed on `theme` + `make`, and `theme`'s identity is stable per cell (Step 1), so the practical caching behaviour is unchanged.

- [ ] **Step 3: Drop useShellTelemetry's callback**

Replace:

```ts
  const publishFps = useCallback((frames: number, elapsedMs: number): void => {
    setFps(computeFps(frames, elapsedMs));
  }, []);
```

with:

```ts
  function publishFps(frames: number, elapsedMs: number): void {
    setFps(computeFps(frames, elapsedMs));
  }
```

Remove `useCallback` from the import. **Leave the block comment above it intact** — it documents the Remote Function crash (#334) and is still accurate and load-bearing.

- [ ] **Step 4: Verify**

```bash
node scripts/react-compiler-healthcheck.mjs
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/client-react-native typecheck
```

Expected: healthcheck OK (`useThemedStyles.ts`, `useShellTelemetry.ts` optimized); tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/theme packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts
git commit -m "refactor(rn): resolve themes at module scope, drop manual memos"
```

---

### Task 5: RN — boot scenes (8 sites)

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/DockingScene.tsx:175,179,183`
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/LaserScene.tsx:81,87,93,261`
- Modify: `packages/client-react-native/src/ui/shell/boot/scenes/bootSceneFonts.ts:79`

**Interfaces:**
- Produces: unchanged. All three files were measured OPTIMIZED, so the compiler supplies the same build-once behaviour the memos did.

**Risk note:** these values are Skia `SkPath` / font objects captured in worklet closures. Jest mocks Reanimated, so unit tests cannot witness a regression here — Task 10's simulator check is mandatory and covers all six boot variants.

- [ ] **Step 1: Unwrap each single-expression memo**

Each of the 8 sites has the shape `const x = useMemo(() => { return f(args); }, [deps]);`. Unwrap to the plain call. In `DockingScene.tsx`:

```tsx
  const scanlines = buildScanlinePath(width, height);

  const corridor = buildCorridorPath(width, height);

  const hudGrid = buildHudGridPath(width, height);
```

Apply the identical transformation to `LaserScene.tsx`'s `grid`, `panelRects`, `emitterPoint`, and `contentShapes`, and to `bootSceneFonts.ts`'s returned memo (`return useMemo(() => { … }, [specs, regular, bold]);` → return the expression directly).

If any body has more than a single `return`, hoist it into a function declaration **below the component** and call it — do not inline a multi-statement IIFE.

Remove the now-unused `useMemo` import from each file.

- [ ] **Step 2: Preserve the performance comments**

`DockingScene.tsx:172-174` explains that rebuilding these paths per frame would allocate ~300 path segments per frame. That rationale is **still true and still load-bearing** — the compiler is now what prevents it. Reword from "built once" to name the compiler as the mechanism, and keep the `docs/performance.md` reference.

- [ ] **Step 3: Verify**

```bash
node scripts/react-compiler-healthcheck.mjs
pnpm --filter @rtc/client-react-native test
pnpm --filter @rtc/client-react-native typecheck
```

Expected: all three scene files report optimized; tests and typecheck pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client-react-native/src/ui/shell/boot/scenes
git commit -m "refactor(rn): drop manual memos from boot scenes"
```

---

### Task 6: devtools — InspectorApp (1 semantic conversion + 3 deletions)

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx:35,126,134,146`

**Interfaces:**
- Produces: `liveHistory` is still a single `LiveHistory` instance for the component's lifetime, with the same identity semantics the `useEffect` at `:47-56` and the `seededHistoryRef` guard depend on.

**Why this one is different:** `liveHistory` is the only one of the 39 sites whose identity is *observed* — it is a `useEffect` dependency and a long-lived instance. Deleting it would re-tap the devtools store on every render. `useMemo` was always the wrong tool: React may discard a `useMemo` cache, so identity was never actually guaranteed.

- [ ] **Step 1: Convert liveHistory to the build-once-ref idiom**

Replace:

```tsx
  const liveHistory = useMemo((): LiveHistory => {
    return new LiveHistory();
  }, []);
```

with the idiom ADR-003 blesses for `useMachine` / `AppRoot`:

```tsx
  // Build-exactly-once instance, NOT a cache. Its identity is observed twice —
  // it is a dependency of the store-tap effect below, and `seededHistoryRef` is
  // keyed on it — so a fresh instance per render would re-tap the store every
  // render. A ref guarantees single construction even under StrictMode's
  // double-render; `useMemo` never did (React may discard a memo cache).
  const liveHistoryRef = useRef<LiveHistory | null>(null);

  if (liveHistoryRef.current === null) {
    liveHistoryRef.current = new LiveHistory();
  }

  const liveHistory = liveHistoryRef.current;
```

- [ ] **Step 2: Convert the three callbacks to function declarations**

`handleFocusInTimeline` (`:126`), `handlePinIntent` (`:134`), and `handleMsgTypePill` (`:146`) each become function declarations with the same parameter and return types. For example:

```tsx
  function handleFocusInTimeline(machineId: string): void {
    timeline.addPill({ type: "machine", id: machineId });
    setLens("timeline");
  }
```

Remove `useMemo` and `useCallback` from the `react` import; `useRef` is already imported.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @rtc/devtools-app test
pnpm --filter @rtc/devtools-app typecheck
node scripts/react-compiler-healthcheck.mjs
```

Expected: tests and typecheck pass.

**Do NOT touch `scripts/react-compiler-healthcheck.mjs`.** `InspectorApp` was never added to `TRACKED` — Task 2 already excluded it, with the reason documented in the script's exclusion comments. (An earlier revision of this plan told you to remove it here; that instruction is obsolete.) After your change the compiler will report `InspectorApp` as bailing with "Cannot access refs during render", which is expected and correct: reading a never-reassigned ref during render is the documented build-once seam pattern, and the gate deliberately does not track it.

- [ ] **Step 4: Commit**

```bash
git add packages/devtools-app/src/InspectorApp.tsx scripts/react-compiler-healthcheck.mjs
git commit -m "refactor(devtools): build LiveHistory once via ref, drop manual memos"
```

---

### Task 7: devtools — useTimeline, useRecording, ContextPane (21 sites)

**Files:**
- Modify: `packages/devtools-app/src/timeline/useTimeline.ts` (13 sites: `:59,63,82,94,98,102,108,114,123,133,144,150,159`)
- Modify: `packages/devtools-app/src/recording/useRecording.ts` (6 sites: `:79,87,99,105,111,134`)
- Modify: `packages/devtools-app/src/timeline/ContextPane.tsx` (2 sites: `:237,245`)

**Interfaces:**
- Produces: all three modules keep identical public shapes — `useTimeline` still returns the same object of rows/selection/actions, `useRecording` the same recording controls.

All 21 are pure caching (AST-verified: none is an effect dependency, none returns an observed instance), so each unwraps mechanically.

- [ ] **Step 1: Unwrap the useMemos**

Single-expression memos unwrap directly:

```ts
  const rows = filterLog(log, filter);
```

Multi-statement memos (`useTimeline:63` `selectedRow`, `:82` `reconstruction`; `ContextPane:237` `changedIds`, `:245` `visibleStreams`) become function declarations placed **below** the hook/component, called from the body:

```ts
  const selectedRow = computeSelectedRow(selection, rows, agedOut, history);
```

with the extracted function carrying the original body verbatim and explicit parameter and return types. Do not use an inline IIFE.

- [ ] **Step 2: Convert the useCallbacks to function declarations**

All 16 remaining sites follow one shape:

```ts
  function pin(seq: number): void {
    setSelection({ mode: "pinned", seq });
  }

  function resume(): void {
    setSelection({ mode: "follow" });
  }
```

`useRecording:111` `importRecording` is `async` — keep the modifier and the `Promise<void>` return type: `async function importRecording(file: File): Promise<void>`.

Remove `useMemo` / `useCallback` from each file's `react` import.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @rtc/devtools-app test
pnpm --filter @rtc/devtools-app typecheck
node scripts/react-compiler-healthcheck.mjs
```

Expected: tests and typecheck pass; the gate reports `ok` for `useTimeline`/`useTimeline.ts` and `StateTab`/`ContextPane.tsx`. Note `ContextPane.tsx` also contains `DiffTab`, which bails on a compiler limitation (ternary inside try/catch) — that is pre-existing, unrelated to the two memos you are deleting (both live in `StateTab`), and deliberately untracked. Do not try to fix it. `useRecording.ts` is likewise untracked.

- [ ] **Step 4: Commit**

```bash
git add packages/devtools-app/src
git commit -m "refactor(devtools): drop manual memos from timeline and recording"
```

---

### Task 8: client-react residual, and enforce the ban

**Files:**
- Modify: `packages/client-react/src/ui/equities/watchlist/WatchlistPanel.tsx:40-56`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Produces: the lint rule that makes every preceding task permanent.

**This task must come last of the code tasks** — the ban fails lint against any remaining call site.

- [ ] **Step 1: Convert the last client-react callback**

Replace the `reportQuote` `useCallback` with a function declaration carrying the identical body:

```tsx
  function reportQuote(symbol: string, last: number, changePct: number): void {
    setQuotes((prev) => {
      const existing = prev[symbol];

      if (
        existing &&
        existing.last === last &&
        existing.changePct === changePct
      ) {
        return prev;
      }

      return { ...prev, [symbol]: { last, changePct } };
    });
  }
```

Remove `useCallback` from the import.

**Note on why this one is not gated:** `WatchlistPanel` bails on the ViewModel
seam, so the compiler will NOT memoize this function — the gate cannot protect
it. The deletion is safe for a different reason: this repo has zero
`React.memo` boundaries, so a stable callback identity buys nothing at runtime.
Do not add this file to `TRACKED`; it would fail.

- [ ] **Step 2: Add the ban**

In `eslint.config.mjs`, add a new block after the existing RN `react-hooks` block:

```js
  {
    // Manual memoization is banned — the React Compiler memoizes at build time
    // (ADR-003). Scoped to the three packages that actually run the compiler;
    // `client-prototype` (isolated design port) and test harnesses (never
    // transformed) are deliberately out of scope.
    //
    // `no-restricted-imports` rather than `no-restricted-syntax`: flat config
    // REPLACES a rule's options across matching blocks, which is why the shared
    // `restrictedSyntax` array has to be re-spread everywhere it appears. This
    // rule is used nowhere else, so a new block carries no such coupling.
    // Caveat: it cannot see `React.useMemo` via a namespace import — verified
    // that no such import exists in these packages (named imports only).
    files: [
      "packages/client-react/src/**/*.{ts,tsx}",
      "packages/client-react-native/src/**/*.{ts,tsx}",
      "packages/client-react-native/app/**/*.{ts,tsx}",
      "packages/devtools-app/src/**/*.{ts,tsx}",
    ],
    // Test files are OUT of scope: they never go through the Babel transform,
    // so nothing auto-memoizes them and their stable identities are real.
    // `client-react` keeps tests outside `src/`, but `devtools-app` keeps them
    // in `src/__tests__/` — without this the glob catches them and contradicts
    // the deliberate non-goal stated in the comment above.
    ignores: ["**/__tests__/**", "**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useMemo", "useCallback", "memo"],
              message:
                "Manual memoization is banned — the React Compiler memoizes (ADR-003). Write the plain value, or a function declaration for a callback. For a build-once INSTANCE (not a cache), use the useRef + `if (current === null)` idiom.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 2b: Carve out the one semantic exception**

`useHoldToUnlock.ts` keeps two `useMemo`s that the compiler cannot replace (see
Task 3 for the measured evidence chain). Scope the ban off for that one file,
using a config-scoped block — never an inline disable:

```js
  {
    // The ONE exception to the memo ban. `useHoldToUnlock`'s two `useMemo`s
    // carry semantics, not caching: they hold the `Gesture.LongPress()`
    // identity stable so its native handler is not reattached every render.
    // The compiler cannot supply that identity here — `runOnJS(fireComplete)()`
    // closes over a ref (a bail), and even ref-free the memo would key on
    // `onComplete`, which churns because `LockScreen` bails on the ViewModel
    // seam. Full reasoning in the hook's header comment. A clean-architecture
    // fix is tracked in docs/STATUS.md.
    files: ["packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts"],
    rules: { "no-restricted-imports": "off" },
  },
```

- [ ] **Step 2c: Fix DiffTab's error-boundary violations**

Adding `devtools-app/src` to the `react-hooks` block (next step) surfaces two
pre-existing `react-hooks/error-boundaries` errors in
`packages/devtools-app/src/timeline/ContextPane.tsx`'s `DiffTab`: it constructs
JSX inside a `try`/`catch`. The rule is right — React renders the element later,
so a render error escapes the `catch`.

The `catch` is not useless, though: `findPredecessorRow`, `diffableValueOf` and
`diffSerialized` are all *called* inside the `try`, so genuine diff failures do
get caught. Preserve that. Hoist the computation out of the JSX — compute the
entries (or an error) inside the `try`/`catch`, then construct the JSX outside
it — so the `catch` still covers exactly the calls that can throw.

Keep user-visible behaviour identical: a failed diff still renders `ErrorCard`
with the same message, and both `noPrior` cases still render `DiffView` as
before.

This should also clear `DiffTab`'s React Compiler bail ("Support value blocks
within a try/catch statement"). Verify with the healthcheck — but do NOT add it
to `TRACKED`: it traded no manual memo for compiler memoization, and the gate
tracks only functions that did.

- [ ] **Step 3: Extend the react-hooks block to devtools-app**

`devtools-app` has run the compiler since day one and has never been linted by it. Add to the existing `client-react` react-hooks block's `files` array:

```js
      "packages/devtools-app/src/**/*.{ts,tsx}",
```

- [ ] **Step 4: Add InspectorApp to the refs override**

Task 6's build-once ref reads `.current` during render, so add to the existing two-file `react-hooks/refs` override block's `files` array:

```js
      "packages/devtools-app/src/InspectorApp.tsx",
```

and extend that block's comment to note the third file holds a `LiveHistory` instance for the same documented reason.

- [ ] **Step 5: Verify the ban catches a violation**

Temporarily re-add `import { useMemo } from "react";` to any in-scope file and run `pnpm lint:eslint`. Confirm it errors with the ban message, then revert. An unproven gate is not a gate.

- [ ] **Step 6: Verify everything is clean**

```bash
pnpm lint:eslint
pnpm check:compiler
npx biome ci .
```

Expected: zero findings. `biome ci` covers formatting and import sorting, which `pnpm lint` alone does not.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src eslint.config.mjs
git commit -m "feat(lint): ban manual memoization in compiler-enabled packages"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/adr/ADR-003-react-compiler-and-manual-memoization.md`
- Modify: `docs/STATUS.md`

**REQUIRED SUB-SKILL for the STATUS.md half:** use the `tracking-workstream-status` skill — it owns that file's shape and section ordering.

- [ ] **Step 0: Fix two documentation drifts this workstream caused**

`CLAUDE.md` (repo root) describes `/rtc:gauntlet` as running "the 14 fast gates". Task 2 added `check:compiler`, making it 15. Update that count.

In `scripts/react-compiler-healthcheck.mjs`, the closing line reads `${TRACKED.length} files OK`, but `TRACKED` is keyed by function, not file. Change the wording to `${TRACKED.length} tracked functions OK` so it stays accurate if a second function in an already-tracked file is ever added.

- [ ] **Step 0b: Correct the spec — it now asserts things that are false**

`docs/superpowers/specs/2026-07-26-manual-memoization-ban-design.md` was written
before implementation and three of its claims did not survive contact:

1. **"Result: zero memo exceptions"** — false. `useHoldToUnlock.ts` keeps two
   `useMemo`s and has a scoped lint exception. Correct this and say why.
2. **The 38-pure-caching / 1-semantic split** — the AST pass classified
   `useHoldToUnlock`'s two memos as caching. Measurement during implementation
   proved otherwise. The true split is **36 pure caching deleted, 3 semantic**
   (1 converted to a build-once ref in `InspectorApp`, 2 kept in
   `useHoldToUnlock`). Correct the numbers and add a line explaining why the
   static classifier could not have caught it: the memos' necessity depends on
   the *caller's* compiler status (`LockScreen` bails on the seam), which is not
   visible from the file under analysis.
3. **Task 3's description as a refactor** — it became comment-only. Update the
   spec's treatment table accordingly.

Do not delete the original reasoning — mark what changed and why. A spec that
quietly rewrites itself to match the outcome teaches nothing.

- [ ] **Step 1: Extend ADR-003's scope**

The ADR is written as a `client-react`-only decision. Update the Context and Decision sections to state that the compiler now runs in `client-react`, `devtools-app`, and `client-react-native`, and that manual memoization is **enforced by lint**, not convention. Reference the new `pnpm check:compiler` gate.

- [ ] **Step 2: Add the measured-coverage section**

Add a new section to ADR-003 recording what was never measured before:

```markdown
## Measured coverage (2026-07-26)

`pnpm check:compiler`'s underlying harness was run across `client-react/src`:

| result | count |
|---|---|
| OPTIMIZED | 88 |
| BAILED | 123 |

**118 of the 123 bails are one diagnostic** — "Hooks must be the same function
on every render" — and every one of them is the ViewModel seam
(`const { useX } = useViewModel()`). React Compiler requires *static* hook
identity; the seam (ADR-004) supplies hooks dynamically so that the swap-trio
and framework replaceability work. Verified exhaustively: destructuring,
member-calling (`vm.useX()`), and reading the bundle straight from
`useContext` all bail; only statically-imported hooks compile. Non-hook values
off the seam are fine.

**This means the compiler does not memoize most data-bound components** — a
material limitation of this ADR's premise, measured for the first time here.
The ban is nonetheless safe: the repo has zero `React.memo` boundaries, so
callback identity buys nothing, and the expensive-derivation sites (RN's Skia
paths, fonts, themed styles) all measure OPTIMIZED. Tracked in `docs/STATUS.md`.
```

- [ ] **Step 3: Log pending work to STATUS.md**

Two entries, via the `tracking-workstream-status` skill:

1. **ViewModel seam defeats React Compiler** — 118 bails in `client-react`; the seam and the compiler are mutually exclusive by construction. Fixing it would touch ADR-004, both bindings packages, the contract swap-trio and every UI file, so it is deliberately deferred. Cross-reference ADR-003's measured-coverage section and this spec.
2. **Revisit `useHoldToUnlock` with a clean architecture** — it is the single
   exception to the memo ban, and the exception is a symptom rather than a
   design. The gesture needs a stable identity; the compiler cannot give it one
   because `runOnJS` + ref bails, and because `LockScreen` bails on the seam so
   `onComplete` churns. There should be a clean solution (a stable-callback seam,
   a gesture built outside the render path, or a `SharedValue`-mediated
   completion signal); none was attempted here because it is a design change,
   not a cleanup. Cross-reference the hook's header comment, ADR-003, and this
   plan's Task 3.
3. **`client-prototype` retains 44 manual memo sites** — explicitly descoped: it is the deliberately-isolated readable port of the v2 design prototype (`react`/`react-dom` only, no compiler), and churning it works against its purpose. Revisit only if it stops being a faithful port.

- [ ] **Step 4: Verify links**

Run: `pnpm check:doc-links`
Expected: all links OK. Anchors are validated too — if you added a heading that another file links to, verify the slug with `github-slugger` semantics.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/ADR-003-react-compiler-and-manual-memoization.md docs/STATUS.md
git commit -m "docs: record measured React Compiler coverage and the seam limitation"
```

---

### Task 10: Full verification

**Files:** none modified (fix-forward if a gate reds).

- [ ] **Step 1: Confirm zero remaining call sites**

```bash
grep -rnE "(^|[^.\w])(useMemo|useCallback|memo)\(" \
  packages/client-react/src packages/client-react-native/src \
  packages/client-react-native/app packages/devtools-app/src \
  --include="*.ts" --include="*.tsx" | grep -vE ":[0-9]+:\s*(\*|//)"
```

Expected: no output.

- [ ] **Step 2: Run the full local gauntlet**

Run: `/rtc:gauntlet full`
Expected: all gates green — includes lint, typecheck, unit tests, both ≥95% coverage gates, type-aware ESLint, build, and `check:compiler`.

- [ ] **Step 3: Run the web visual and e2e tiers**

```bash
pnpm test:ui:visual
pnpm test:e2e
```

Expected: goldens match pixel-for-pixel (render output must be unchanged) and all e2e suites pass. The e2e tier is the only faithful witness for StrictMode-lifecycle behaviour, which Task 6's ref conversion touches.

- [ ] **Step 4: Verify on the iOS simulator — MANDATORY**

```bash
pnpm dev:ios
```

Then, on the booted simulator, confirm by eye:
- **all six boot scene variants** render correctly (cycle through them) — Task 5 changed what worklet closures capture for the Skia paths;
- **the hold-to-unlock ring** fills, completes, and decays on release — Task 3 rewrote its gesture construction and ref handling;
- **theme switching** across skins and light/dark still repaints — Task 4 replaced the theme resolution path.

**This step cannot be skipped or substituted with jest.** Reanimated is wholesale-mocked in `jest.setup.ts`, so worklets run as ordinary JS in tests and Remote Function crashes are invisible there. This repo has shipped two sim-only worklet crashes already (#334, #340), the second in the very lock ring Task 3 touches.

- [ ] **Step 5: Push and open the PR**

Follow the `shipping-repo-changes` skill: push the branch, open the PR, and poll `gh run list --branch <branch> --workflow CI` matching on `headSha` until the run for your latest commit completes successfully. Then triage catch-up risk before merging.

## Self-Review

**Spec coverage:** Goal 1 → Task 1. Goal 2 → Task 8. Goal 3 → Tasks 3–8 (39 sites: 2+3+8+4+21+1 = 39 ✓). Goal 4 → Task 2. Goal 5 → Task 9. Verification table → Task 10.

**Type consistency:** `RESOLVED_THEMES` / `resolveAllThemes` (Task 4) used consistently; `liveHistoryRef` / `liveHistory` (Task 6) consistent with the effect dependency at `InspectorApp:56`; `TRACKED` (Task 2) is amended by Tasks 3 and 6 and both amendments are stated.

**Known ordering hazards, stated explicitly:** the ban lands last (Task 8); the healthcheck lands before deletions (Task 2); `useHoldToUnlock` and `InspectorApp` each mutate `TRACKED` and say so in their own steps.
