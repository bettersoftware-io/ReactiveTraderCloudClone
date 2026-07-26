# ADR-003: React Compiler, and the end of manual memoization

**Status:** Accepted (implemented). Scope: `client-react`, `devtools-app`, and
`client-react-native` all run the compiler, and manual memoization is banned by
lint (`pnpm check:compiler` plus a `no-restricted-imports` ESLint rule) across
all three — see [Measured coverage](#measured-coverage-2026-07-26). Two scoped
lint exceptions remain: one **provisional — flagged for revisit** (see
[Follow-up](#follow-up-to-revisit)); one **permanent by design**
(`useHoldToUnlock.ts` — its two `useMemo`s carry semantics the compiler cannot
supply, documented in the file's header comment and in the measured-coverage
section below).

> Sibling decision records. ADR-001 lives co-located with its concern at
> `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`;
> [ADR-002](./ADR-002-layout-management-port.md) covers layout management.
> This ADR is UI-layer-specific but cross-cuts every component file, so it
> lives here under `docs/adr/`.

## Context

The client runs **React 19 + Vite 8 + `@vitejs/plugin-react@6`** — the exact
stack the **React Compiler** (`babel-plugin-react-compiler@1.0.0`, stable)
targets with zero runtime shim (`react-compiler-runtime` is only needed on
React ≤ 18).

The React Compiler rewrites components at build time to **auto-memoize**
everything — every derived value and every callback is cached on the compiler's
terms — provided the component obeys the [Rules of React](https://react.dev/reference/rules),
chiefly **render must be pure**. With the compiler on, hand-written `useMemo` /
`useCallback` become redundant: they add noise, can drift out of sync with the
real dependencies, and duplicate work the compiler does more reliably.

Before this change the UI carried **~35 manual-memoization call sites** across
26 files (10 `useMemo`, 16 `useCallback`; no component-level `memo()` wrappers).
The goal: turn the compiler on and delete the manual memoization, keeping render
output byte-identical (the visual goldens and e2e suite are the safety net).

**Scope, extended 2026-07-26.** The decision below was made and shipped for
`client-react` alone. A later workstream (spec:
[2026-07-26-manual-memoization-ban-design.md](../superpowers/specs/2026-07-26-manual-memoization-ban-design.md))
found the same premise applied — and had gone unmeasured — in two more
packages that also run the compiler: `devtools-app` (compiler on since it was
built, never linted for it until then) and `client-react-native` (compiler not
yet on; RN's `useMemo`/`useCallback` sites were load-bearing pre-compiler
Reanimated idioms until it was enabled). That workstream turned the compiler on
for `client-react-native`, extended the lint ban to all three packages, and
replaced "manual memoization is gone from the UI" as a **convention** with a
**lint-enforced** gate: `pnpm check:compiler` (a Babel harness asserting every
de-memoized file still compiles `OPTIMIZED`) plus a `no-restricted-imports`
ESLint rule banning `useMemo`/`useCallback`/`memo` imports from `react`, scoped
to all three packages' source. See
[Measured coverage](#measured-coverage-2026-07-26) below for what that
workstream measured, and `docs/STATUS.md` for what it deliberately deferred.

## Decision

1. **Enable the React Compiler** in `packages/client-react/vite.config.ts` via
   `@vitejs/plugin-react`'s Babel hook:

   ```ts
   react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } })
   ```

   Added `babel-plugin-react-compiler` as a `client-react` devDependency.

2. **Remove all manual memoization.** Every `useMemo` becomes a plain derived
   value; every `useCallback` becomes a **function declaration** in the
   component body (not `const x = () => …`, which the repo's ESLint
   `func-style: "declaration"` rule forbids). The compiler re-memoizes both
   forms — a function declared in the body gets a stable identity just as a
   `useCallback` did.

3. **Add the compiler's lint half.** `eslint-plugin-react-hooks@7`
   (`recommended-latest` flat preset) is wired into `eslint.config.mjs`, scoped
   to `packages/client-react/src/**/*.{ts,tsx}` — exactly the source the
   compiler compiles (not tests, which never go through the Babel transform).
   The preset bundles `rules-of-hooks`, `exhaustive-deps`, and the granular
   compiler diagnostics (`purity`, `immutability`, `set-state-in-render`,
   `refs`, …) that flag code the compiler would otherwise silently bail on.
   Note: in v7 the old single `react-compiler` rule was split into these
   granular rules — there is no rule literally named `react-compiler` anymore.

4. **Fix the two real impurity bugs the lint surfaced** (render must be pure):
   - `NewRfqForm.tsx` called `setSelectedDealerIds(...)` inside a value-less
     `useMemo` (a `useMemo`-as-effect anti-pattern; flagged `void-use-memo` +
     `set-state-in-render`). Converted to a `useEffect`.
   - `FxBlotter.tsx` *mutated* a ref (`seenTradeIds.current.add(...)`) inside a
     `useMemo` during render (flagged `refs`). The "which trades are new"
     bookkeeping moved into a `useEffect`, leaving render pure — which also lets
     the compiler optimize the component instead of bailing on it.

5. **Scope `react-hooks/refs` off for two seam files** — `useMachine.ts` and
   `AppRoot.tsx` — via a config-level override with a documented rationale (no
   inline `// eslint-disable`; the same mechanism the repo already uses to scope
   AST rules off for contract specs). This is the provisional part; the rest of
   the rule set, including `refs` everywhere else, stays on. See below for why.

6. **(2026-07-26) Enable the compiler on `client-react-native`, extend the ban
   to all three compiled packages, and enforce it by lint.** `client-react-native`
   gained `experiments.reactCompiler: true`; `devtools-app` (compiler already on,
   never linted for it) and `client-react-native` both joined the
   `eslint-plugin-react-hooks` block from Decision item 3. A new
   `no-restricted-imports` rule bans importing `useMemo`/`useCallback`/`memo`
   from `react` across `client-react/src`, `client-react-native/{src,app}`, and
   `devtools-app/src`. `pnpm check:compiler` (`scripts/react-compiler-healthcheck.mjs`,
   wired into `ci.yml` and `/rtc:gauntlet`'s fast tier) asserts every
   de-memoized file still compiles `OPTIMIZED` — the narrow anti-rot gate that
   would have caught this ADR's original, unmeasured coverage assumption. One
   file, `useHoldToUnlock.ts`, is exempted from the lint ban entirely (not a
   `refs`-only override like item 5) because its two `useMemo`s are semantic,
   not caching — see [Measured coverage](#measured-coverage-2026-07-26).

## Why the `refs` exception is necessary (and not a real bug)

`useMachine` and `AppRoot` use the **build-exactly-once** pattern:

```ts
const ref = useRef(null);
if (ref.current === null) ref.current = factory(); // lazy init (allowed)
const machine = ref.current;                        // read in render → FLAGGED
const state = useStateObservable(machine.state$);   // read in render → FLAGGED
```

`react-hooks/refs` forbids reading `ref.current` during render, because a
*mutable* ref can change without telling React to re-render, serving stale
output. But these refs are **built once and never reassigned** — effectively
immutable after init — so reading them in render is safe. The rule cannot
distinguish "stable ref, read once" from "mutable ref, mutated mid-render", so
it conservatively flags both. (This is exactly why `FxBlotter`, which genuinely
*mutated* its ref in render, was a real bug, while `useMachine`, which only
*reads* a stable ref, is not.)

**There is no lint-clean rewrite** that keeps all three hard requirements of
these components — *(a)* build the object exactly once even though StrictMode
double-renders in dev, *(b)* have it available on the first render (a hook,
`useStateObservable`, reads `machine.state$` in render), *(c)* dispose its RxJS
subscriptions on unmount:

| Approach | exactly-once | first-render | architecture | lint-clean |
|---|---|---|---|---|
| **Current `useRef` + `if null`** | ✅ | ✅ | ✅ | ❌ (`refs`) |
| `useState(() => factory())` | ❌ leaks¹ | ✅ | ✅ | ✅ |
| build in `useEffect`, `setState` | ✅ | ❌ null first frame | ✅ | ✅ |
| construct outside the component | ✅ | ✅ | ❌ breaks per-instance lifetime / DI | ✅ |

¹ React **StrictMode double-invokes `useState` initializers** in dev: `factory()`
runs twice, React keeps one machine and discards the other — and the discarded
one's RxJS subscriptions are never disposed. The `if (ref.current === null)`
guard is what makes the second render pass skip construction, guaranteeing a
single machine. This is the documented reason the seam uses a ref, not state
(see the comments in `useMachine.ts` / `AppRoot.tsx`, and the
`useMachine`-StrictMode note).

So the ref pattern is the **clean, leak-free** solution; the lint rule is simply
too conservative to recognize it. Scoping the rule off for those two files
acknowledges "we have checked these — the ref is stable; the compiler bail is
fine here" while keeping the protection everywhere else.

## What "the compiler bails" means

If a component breaks a Rule of React, the compiler **does not error** — it
leaves that one component **un-optimized but otherwise untouched**. The
component still renders, still has its instance, still works identically; it
just doesn't receive the compiler's auto-memoization. Bailing is **opt-out
per component**, never a global prohibition. The compiler is *designed* to
coexist with escape hatches this way. (The `useMachine`/`AppRoot` seam reads a
ref in render, so the compiler bails on those two — which is harmless: they hold
a stable object and have nothing render-derived to memoize.)

This also clears up a common misconception: **per-instance components and
per-instance objects remain fully supported.** `useRef`/`useState` are exactly
the tools for instance-scoped state, and the compiler supports them. What you
forgo for the seam files is the *automatic optimization* of those two
components, not the ability to have an instance.

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

## Consequences

- **Manual memoization is gone from the UI, and gone by lint, not convention**
  (as of 2026-07-26 — see Decision item 6). New code cannot add
  `useMemo`/`useCallback` for performance in `client-react`, `client-react-native`,
  or `devtools-app`: `no-restricted-imports` rejects the import at lint time,
  write the plain value / function and let the compiler memoize. They remain
  legal where they carry *semantics* rather than caching — rare, and the one
  known instance (`useHoldToUnlock.ts`) is a file-scoped lint exemption, not a
  case-by-case review.
- **The lint preset is the guardrail.** Rules-of-React violations that would
  make the compiler bail are caught at lint time, on `src` only.
- **`func-style` interaction:** unwrapped callbacks are function *declarations*,
  consistent with the rest of the codebase.
- **Verification:** render output is unchanged — the visual goldens (both
  committed sets) and the full e2e suite (browser · presenter · fullstack) are
  the witnesses, the latter being the only faithful witness for the
  StrictMode-lifecycle seam.
- **Two scoped exceptions** to a clean `recommended-latest` + memo-ban lint
  surface: one **provisional** (`refs` off for two files — `useMachine.ts` /
  `AppRoot.tsx`, plus `InspectorApp.tsx` after 2026-07-26, see below); one
  **permanent by design** (`useHoldToUnlock.ts`'s memo-ban exemption — its two
  `useMemo`s are semantic, not caching; see
  [Measured coverage](#measured-coverage-2026-07-26)).

## Follow-up (to revisit)

The `react-hooks/refs` exception for `useMachine.ts` / `AppRoot.tsx` — joined
2026-07-26 by `devtools-app`'s `InspectorApp.tsx`, whose `liveHistory` converted
from a `useMemo` to the same build-once-ref idiom (see
[Measured coverage](#measured-coverage-2026-07-26)) — is **accepted for now,
deliberately deferred for a later look** — at the user's request, not because a
better answer is known to exist. Things that could change the calculus on a
revisit:

- A future `eslint-plugin-react-hooks` release that recognizes the
  build-once-stable-ref pattern (an allow-list for never-reassigned refs), which
  would let us drop the exception entirely.
- A react-rxjs / bridge API that hands the UI an already-subscribed value
  without a per-instance machine object held in a ref.
- Revisiting whether the per-instance machine lifetime can move to the
  composition root (it currently cannot without losing per-mount isolation —
  see [§3.6 The ViewModel Seam](../architecture/03-uml-class-diagrams.md#36-the-viewmodel-seam)).

Until then: the exception stays scoped to those three files, with `refs` active
everywhere else.
