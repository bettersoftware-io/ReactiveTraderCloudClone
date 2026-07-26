# Ban manual memoization repo-wide, and make React Compiler coverage measurable

**Date:** 2026-07-26
**Status:** Approved (design), pending implementation
**Base:** `f1dd8e07`

## Context

[ADR-003](../../adr/ADR-003-react-compiler-and-manual-memoization.md) turned the
React Compiler on for `client-react` and deleted ~35 manual-memoization call
sites, on the premise that the compiler auto-memoizes what `useMemo` /
`useCallback` used to. That premise was **never measured**. This spec records
the measurement, bans manual memoization by lint across every package that
actually runs the compiler, and ships the measurement as a repo tool so the
premise cannot silently rot again.

The trigger was a narrower observation — `client-react-native` still uses
`useMemo` / `useCallback` — which turned out to have a good reason (see below)
and to be the smaller half of the story.

### What was measured

A Babel harness runs `babel-plugin-react-compiler` over a file list with a
`logger` attached and reports, per component/hook, `CompileSuccess`
(**OPTIMIZED**) or `CompileError`/`CompileSkip` (**BAILED**) with the reason.
Against base `f1dd8e07`:

| package | compiler | manual memo sites | compiler coverage |
|---|---|---|---|
| `client-react` | **on** (`vite.config.ts:129`) | **1** | **88 optimized / 123 bailed** |
| `devtools-app` | **on** (`vite.config.ts:10`) | **25** | mostly optimized; 2 bails |
| `client-react-native` | **off** | **13** | n/a — no compiler in the pipeline |
| `client-prototype` | off (isolated port) | 44 | out of scope (see Non-goals) |
| `client-solid`, `solid-bindings` | n/a | `createMemo` ×195 | out of scope — a reactivity primitive, not caching |

**39 call sites are in scope** (1 + 13 + 25).

### Finding 1 — the ViewModel seam defeats the compiler

**118 of `client-react`'s 123 bails** are one diagnostic:

> Hooks must be the same function on every render, but this value may change
> over time to a different function.

It fires on the ViewModel seam — `const { useWatchlist } = useViewModel()`.
Confirmed by minimal repro; **every** dynamically-obtained hook bails, and no
seam shape avoids it:

| shape | result |
|---|---|
| `const { useX } = useViewModel(); useX()` | **BAILED** |
| `const vm = useViewModel(); vm.useX()` | **BAILED** |
| `const { useX } = useContext(VmContext); useX()` | **BAILED** |
| statically imported hook | OPTIMIZED |
| non-hook value off the seam (`const { formatPrice } = useViewModel()`) | OPTIMIZED |

React Compiler requires **static hook identity**; the seam
([ADR-004](../../adr/ADR-004-viewmodel-seam-and-feature-flags.md)) exists to
supply hooks dynamically for DI, the swap-trio, and framework replaceability.
The two are mutually exclusive by construction. **This is a documented
limitation, not a defect to fix in this workstream** — reworking the seam would
touch ADR-004, both bindings packages, the contract swap-trio and every UI
file. Logged to `docs/STATUS.md` instead.

### Finding 2 — 38 of the 39 sites are pure caching; exactly one is semantic (corrected to 36/3 — see below)

> **Corrected 2026-07-26, post-implementation.** This finding's classification
> was wrong for one file. Measurement during implementation (Task 3) found that
> `useHoldToUnlock.ts`'s two `useMemo`s, which this AST pass had classified as
> pure caching, are load-bearing. **The true split is 36 pure caching (deleted
> cleanly) and 3 semantic** — 1 converted to the build-once-ref idiom
> (`InspectorApp`'s `liveHistory`) and 2 kept in `useHoldToUnlock`, with a
> scoped lint exception (see the corrected "Result" line at the end of this
> finding, and ADR-003's measured-coverage section). The reasoning below is
> left as originally written, with the correction noted where it broke: the
> static AST classifier could not have caught `useHoldToUnlock` because its
> criteria (effect-dependency membership, constructed-instance return) are
> properties of the file under analysis — but `useHoldToUnlock`'s memos are
> necessary for a reason that lives **outside** that file: the compiler's
> inferred memoization key for `gesture` is `onComplete`, a callback declared
> in the caller (`LockScreen`), and `LockScreen` itself bails on the ViewModel
> seam, so `onComplete` gets a new identity every render regardless of what
> `useHoldToUnlock` does internally. Whether a given file's memo is necessary
> can depend on its caller's compiler status — a fact no single-file static
> pass can see.

This repo has **zero `React.memo` boundaries** (ADR-003 recorded this too, and
it still holds). `useCallback` only pays off when a memoized child compares
props by identity, or when the value is an effect dependency. So most of the
in-scope sites buy nothing at runtime whether the compiler bails or not.

Every site was classified against the Babel AST (not grep) on two criteria:
does the memoized name appear in a `useEffect`/`useLayoutEffect` dependency
array, and does it return a constructed long-lived instance?

**One site is genuinely semantic: `InspectorApp.tsx:35`.**

```ts
const liveHistory = useMemo((): LiveHistory => new LiveHistory(), []);
// …
useEffect(() => { … store.tap(msg => liveHistory.record(msg)) }, [store, liveHistory]);
```

Its identity is load-bearing twice over: it is an effect dependency (a new
instance per render would re-tap the store every render) and a
`seededHistoryRef` StrictMode guard is keyed on it. This is **not** caching —
it is the build-exactly-once instance pattern, and `useMemo` was always the
wrong tool for it: React documents that a `useMemo` cache may be discarded, so
identity was never actually guaranteed here.

Three further sites tripped a first-pass heuristic and were cleared on
inspection: `useRecording`'s `startRecording` / `importRecording` construct
objects *inside the callback body* (transient per invocation, not identity), and
`ContextPane`'s `changedIds` returns a `new Set()` as a derived value.

The remaining **38 were believed to be pure caching and delete cleanly.**

> **Corrected 2026-07-26, post-implementation:** false for one of the 38.
> `useHoldToUnlock.ts`'s two memos looked like pure caching by this pass's
> criteria (no effect-dependency membership on the memoized names beyond the
> gesture object itself, no obviously-external instance) but proved semantic
> once the fix below was actually attempted — see the corrected count above
> Finding 2 and the table's `useHoldToUnlock.ts` row. **36**, not 38, delete
> cleanly.

Where memoization *does* pay — expensive derivation — the compiler measurably
covers it. Every RN scene file (`DockingScene`, `LaserScene`, `bootSceneFonts`,
`useThemedStyles`, `useShellTelemetry`) is **OPTIMIZED**. Only two in-scope
files bail for a reason that isn't the seam, and both were believed fixable:

| file | bail reason | resolution |
|---|---|---|
| `useHoldToUnlock.ts` | `Cannot access refs during render` | ~~move `onCompleteRef.current = onComplete` into a `useEffect` — Rules-of-React-clean~~ **corrected:** this clears the ref-write bail, but a second bail remains — `runOnJS(fireComplete)()` closes over `onCompleteRef` (a `useRef`), which the compiler has no special case for, so it still bails. Dropping the ref instead does compile clean, but then the compiler's inferred memoization key for `gesture` becomes `onComplete` — a callback declared in `LockScreen`, which itself bails on the seam, so `onComplete` churns every render and the gesture would be rebuilt regardless. Not fixable within this file; kept as the one memo-ban exception (see Task 3's corrected treatment below and ADR-003's measured-coverage section) |
| `ThemeProvider.tsx` | seam | make the memo unnecessary: resolve `skin × mode` at module scope |
| `useRecording.ts` | value blocks in try/catch | none needed — its callbacks are event handlers with no memo boundary |

### Finding 3 — RN can run the compiler; it just doesn't

Expo supports the compiler (`experiments.reactCompiler: true` +
`babel-plugin-react-compiler`; SDK 54+ auto-wires Babel, and this repo is on
SDK 57). Reanimated's own performance guide annotates the two patterns RN uses
here — memoized gesture objects and `useFrameCallback` bodies — with *"React
Compiler handles this automatically."* RN's `useMemo`s are therefore
**load-bearing today** and must not be deleted before the compiler is enabled.

## Goals

1. Enable React Compiler on `client-react-native`.
2. Ban `useMemo` / `useCallback` / `memo` by lint in the three compiled packages.
3. Delete all 39 sites, fixing the two fixable bails rather than exempting them.
4. Ship the healthcheck as a repo tool with a narrow anti-rot gate.
5. Record measured coverage in ADR-003; log the seam tension in `docs/STATUS.md`.

## Non-goals

- **Reworking the ViewModel seam.** Finding 1 is documented, not fixed.
- **`client-prototype`** (44 sites). Deliberately isolated readable port of the
  v2 design prototype; churning it works against its purpose. Descoped
  explicitly in `docs/STATUS.md`.
- **Test harnesses.** `viewModelFromWorld.ts` and RN specs never go through the
  Babel transform, so nothing auto-memoizes them — their stable identity is
  real. Out of scope by file-glob construction.
- **Solid's `createMemo`.** A reactivity primitive, not a caching hint.

## Design

### 1. Enable the compiler on `client-react-native`

- `app.config.ts` gains `experiments: { reactCompiler: true }`.
- `babel-plugin-react-compiler@^1.0.0` joins devDependencies, matching the
  version `client-react` and `devtools-app` already pin (syncpack single range).
- `babel.config.js` needs **no** change: `babel-preset-expo@57` injects the
  plugin from the flag, and the worklets plugin stays last as that file
  documents.
- `app.config.test.ts` asserts the flag. That file exists because an
  `app.config` value was silently dropped once before, stranding the app in
  simulator mode; the same failure mode applies here (silent loss of all
  memoization).

### 2. Ban manual memoization by lint

New block in `eslint.config.mjs`:

```js
{
  files: [
    "packages/client-react/src/**/*.{ts,tsx}",
    "packages/client-react-native/{src,app}/**/*.{ts,tsx}",
    "packages/devtools-app/src/**/*.{ts,tsx}",
  ],
  rules: { "no-restricted-imports": ["error", { paths: [{
    name: "react",
    importNames: ["useMemo", "useCallback", "memo"],
    message:
      "Manual memoization is banned — the React Compiler memoizes (ADR-003). " +
      "Write the plain value, or a function declaration for a callback.",
  }]}]},
}
```

**Why `no-restricted-imports` and not `no-restricted-syntax`.** The shared
`restrictedSyntax` array exists because flat config **replaces** rather than
merges a rule's options across matching blocks — any new block setting
`no-restricted-syntax` must re-spread it or silently disable the type bans.
`no-restricted-imports` is unused in this config, so a new block carries no such
coupling.

**Residual risk:** the rule cannot see `React.useMemo` via a namespace/default
import. Verified zero such imports exist across all three packages (named
imports only), so there is no back door today. Accepted rather than paying the
`restrictedSyntax` re-spread; a future namespace import would be visible in
review.

**Also:** `packages/devtools-app/src` joins the existing `react-hooks` lint
block. It has run the compiler since day one and has never been linted by it —
a gate gap, and gates here are meant to cover every package.

### 3. Delete the 39 sites

| package | sites | treatment |
|---|---|---|
| `client-react` | 1 (`WatchlistPanel.tsx:40`) | → function declaration |
| `devtools-app` | 24 (`useTimeline` 13, `useRecording` 6, `InspectorApp` 3, `ContextPane` 2) | plain values / function declarations |
| `devtools-app` `InspectorApp:35` | 1 | **semantic — convert, don't delete**: build-once-ref idiom (below) |
| RN scenes | 8 (`DockingScene` 3, `LaserScene` 4, `bootSceneFonts` 1) | plain values — all measured OPTIMIZED |
| RN `useThemedStyles`, `useShellTelemetry` | 2 | plain value / function declaration |
| RN `useHoldToUnlock` | 2 | ~~fix the bail first (ref write → `useEffect`), then delete both~~ **corrected — became comment-only:** the ref-write fix cleared one bail but exposed a second (`runOnJS` closing over a ref), and removing the ref entirely made the memo's key `onComplete`, which churns because the caller (`LockScreen`) bails on the seam. Both memos are semantic, kept, and given a scoped lint exception; the file gained a header comment recording why, not a deletion |
| RN `ThemeProvider` | 1 | **remove the need**: module-scope `skin × mode` lookup |

`ThemeProvider` detail: `skin × mode` is a finite set, so `withPlatformMono` can
resolve every cell once at module load. The provider then reads a table entry —
stable identity by construction, no hook, compiler-independent. This is
[ADR-005](../../adr/ADR-005-ui-logic-placement.md)'s "pure function, not a hook"
branch, and it is strictly better than the `useMemo` it replaces because the
provider bails on the seam and would otherwise have needed an exception.

`InspectorApp` detail: `liveHistory` converts to the **build-once-ref** idiom
ADR-003 already blesses for `useMachine` / `AppRoot`:

```ts
const historyRef = useRef<LiveHistory | null>(null);

if (historyRef.current === null) { historyRef.current = new LiveHistory(); }

const liveHistory = historyRef.current;
```

This *strengthens* the guarantee — identity becomes structural rather than
resting on a `useMemo` cache React is free to discard — and it makes the
existing `seededHistoryRef` StrictMode guard coherent. It reads a ref during
render, so `InspectorApp.tsx` joins the existing `react-hooks/refs` scoped-off
override alongside `useMachine.ts` and `AppRoot.tsx`, for the identical
documented reason (a never-reassigned ref, which the rule cannot distinguish
from a mutable one).

**Result (as designed): zero memo exceptions.** No inline disables, no memo
allowlist. The one semantic site is converted to a better idiom rather than
exempted, at the cost of a third entry on the pre-existing `refs` override
list.

> **Corrected 2026-07-26, post-implementation: this did not hold.** The design
> above expected `useHoldToUnlock` to be fixable (see the corrected treatment
> row above) and therefore predicted zero exceptions. Measurement disproved
> it: `useHoldToUnlock.ts` keeps both `useMemo`s, with a scoped
> `no-restricted-imports: "off"` override in `eslint.config.mjs` for that one
> file. **Final tally: 36 pure caching sites deleted, 1 converted to a
> build-once ref (`InspectorApp`), 2 kept as a documented exception
> (`useHoldToUnlock`)** — one exception, not zero. See ADR-003's
> measured-coverage section and the `docs/STATUS.md` follow-up
> ("Revisit `useHoldToUnlock` with a clean architecture") for why it was kept
> rather than forced out, and why this static classifier's design could not
> have predicted it: necessity here turns on a fact about the *caller*
> (`LockScreen`'s seam bail), invisible from `useHoldToUnlock.ts` alone.

Every replacement callback becomes a **function declaration**, not
`const x = () => …` — the repo's `func-style: ["error", "declaration"]` forbids
the arrow form (ADR-003 §2 established this).

### 4. Healthcheck tool + gate

`scripts/react-compiler-healthcheck.mjs`, exposed as `pnpm check:compiler`.

The gate is deliberately **narrow**: *every file this workstream de-memoized
must still compile OPTIMIZED.* A ratchet on total bail count would be pure noise
against 118 seam bails. The narrow form catches the real rot — someone
reintroducing a render-time ref write into `DockingScene` silently drops all its
memoization, with no other signal. It is exactly the check that would have
caught ADR-003's unmeasured assumption.

Wired into `ci.yml`'s `checks` job and `/rtc:gauntlet`'s fast tier (it is a
sub-second Babel pass, no build required).

### 5. Documentation

- **ADR-003**: scope extended from `client-react` to the three compiled
  packages; new **Measured coverage** section (88/123, 118 seam bails); the
  "no manual memoization" consequence upgraded from convention to enforced lint.
- **`docs/STATUS.md`** (via the tracking skill): the seam-vs-compiler tension as
  a known architectural limitation, and `client-prototype`'s 44 sites as
  explicitly descoped.

## Verification

| tier | covers | notes |
|---|---|---|
| `pnpm check:compiler` | the new gate | must show every de-memoized file OPTIMIZED |
| `/rtc:gauntlet full` | lint, typecheck, unit, coverage, build | the ban itself is a lint gate |
| both golden sets + e2e | `client-react` render output | render must be byte-identical |
| RN jest | RN unit tier | **cannot witness worklet breakage** — Reanimated is wholesale-mocked |
| **iOS simulator** | boot scenes (all six variants) + hold-to-unlock ring | **required, non-skippable** |

The simulator step is not optional diligence. Deleting the `useMemo` around
Skia `SkPath`s and the gesture object changes exactly what worklet closures
capture; jest mocks Reanimated so worklets run as ordinary JS there. This repo
has already shipped two sim-only worklet crashes (#334, #340), the second in
the lock ring this spec touches.

## Risks

| risk | mitigation |
|---|---|
| Compiler bails on an RN file after enabling, silently dropping memoization | `pnpm check:compiler` gate; RN files measured OPTIMIZED before deletion |
| Worklet closure capture changes break on device | mandatory simulator verification; jest cannot catch it |
| Enabling the compiler perturbs RN render output | visual/e2e tiers plus on-device check |
| A namespace `React.useMemo` import dodges the lint | verified none exist; visible in review |
| Deleting a memo whose identity is load-bearing (effect dep / instance) | AST classification found exactly one (`InspectorApp` `liveHistory`), converted to build-once-ref rather than deleted. Re-run the classifier if new sites appear |
| A future `useMemo` reintroduces a semantic dependency the ban then forces out | the ban's message points at ADR-003; the build-once-ref idiom is the documented answer for instance identity |
