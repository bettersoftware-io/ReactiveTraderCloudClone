# UI Logic Placement Doctrine + `@rtc/motion-core` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the DOM-free animation math out of `useFlipGrid`/`useRankGlide` into a new zero-dependency `@rtc/motion-core` package so React and the future Solid client share identical logic, and record the "where does UI logic go?" decision tree as ADR-005 plus supporting doc updates.

**Architecture:** Pure per-frame math (`flipDeltas`, `coalesceOrder`, `computeRankDirections`, `sameOrder`, easing/duration constants) moves into `@rtc/motion-core` (pure TS, no runtime deps, no DOM). The two React hooks keep their imperative DOM shells (`getBoundingClientRect`, `Element.animate`, `useLayoutEffect`, `ResizeObserver`) and re-import the pure functions. A new dependency-cruiser rule (`motion-core-stays-pure`) and knip entry gate the package; the package graph docs and package-count prose are updated to reflect the tenth package.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Vitest, dependency-cruiser, knip, syncpack/manypkg, tsc + tsc-alias.

## Global Constraints

- `@rtc/motion-core` has **zero runtime dependencies** (not even `rxjs`) and **no DOM imports** — pure per-frame math only. Enforced by the new `motion-core-stays-pure` dependency-cruiser rule.
- Behavior-identical refactor: **no logic changes**. Visual goldens + UI-contract (≥95%) + presenter suites are the safety net; **no golden regeneration** is expected (a golden shift is a regression to investigate, not re-pin).
- New package must pass the full CI gate set (`ci.yml`): `lint:eslint`, `test:rules`, `lint:css`, `lint:actions`, `check:doc-links`, `check:versions`, `check:scripts`, `typecheck`, `test`, `lint:dead` (knip), `check:deps` (dependency-cruiser), `lint:eslint:types`.
- Within a package, imports use single-level `./x.js` relative specifiers (repo bans ≥2-up relative imports; cross-package uses the package name `@rtc/motion-core`).
- `client-react` resolves `@rtc/*` deps from built `dist/` (no vitest src alias) — **build `@rtc/motion-core` before typechecking/testing `client-react`**. Turbo handles this ordering automatically (`typecheck`/`test` `dependsOn` build).
- Spec: `docs/superpowers/specs/2026-07-12-ui-logic-placement-and-motion-core-design.md`.

---

### Task 1: ADR-005 — UI logic placement doctrine

The canonical decision-tree document. Pure docs; the "test" is `check:doc-links`.

**Files:**
- Create: `docs/adr/ADR-005-ui-logic-placement.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/adr/ADR-005-ui-logic-placement.md` (referenced by Task 2's CLAUDE.md pointer and arch-doc entry).

- [ ] **Step 1: Write ADR-005**

Create `docs/adr/ADR-005-ui-logic-placement.md`. Match the style of the sibling ADRs (`ADR-004-viewmodel-seam-and-feature-flags.md`): a `# ADR-005: …` title, then `## Status`, `## Context`, `## Decision`, `## Consequences`, `## See also`. Content (copy the tree verbatim from the spec's WS-B):

```markdown
# ADR-005: UI logic placement — machine vs plain hook vs pure-fn + shell

## Status

Accepted (2026-07-12).

## Context

The dumb-UI rule (grep-gates 26–33) bans `rxjs`/`localStorage`/`fetch`/timers in
`src/ui`, and the 2026-06-16 dumb-UI migration relocated business logic into
RxJS machines behind the ViewModel. But those are *negative* rules; there is no
positive decision tree telling an author which home a given piece of
UI-adjacent logic belongs in. The recurring question — "shouldn't this complex
hook (e.g. `useFlipGrid`) be an RxJS presenter so the future Solid client can
reuse it?" — has a precise answer that was undocumented.

Core insight: **"shared, component-free logic" ≠ "RxJS."** RxJS machines earn
their place for one shape only — an *autonomous async fold*, state evolving over
an event stream on its own clock, decoupled from the view. For per-frame /
per-commit computation driven by DOM lifecycle edges, a **pure function +
injected signal** is lighter and equally shareable across frameworks.

## Decision

Walk these in order; the logic lands in exactly one home.

**① Is it application state or behavior?** (what data exists; what happens on an
intent; timers; persistence; transport; business rules)
- Needs external I/O → **Port + adapter + presenter** in `client-core`.
- Pure app state/behavior → **RxJS machine** in `client-core` (`createXMachine`:
  `Subjects → merge → scan(reduce) → state()`), bound by a one-line `useMachine`
  in `createViewModel`. → *layout, orderTicket, boot, rfqCountdown, rowHighlight.*
- Else → ②

**② Is the logic's substance reading/writing the DOM at a specific frame?**
(`getBoundingClientRect`, `Element.animate`, `ResizeObserver`, focus/scroll/measure)
- Yes → **view-layer effect**. Stays in the framework layer (React hook now;
  Solid directive / `createEffect` later). The timing seam (`useLayoutEffect` /
  `onMount`) is framework-specific and cannot be hoisted into RxJS or
  `client-core`. Extract the pure parts (geometry, decisions, set-diffs) into
  `@rtc/motion-core` and inject DOM-derived facts as arguments (the
  `coalesceOrder(…, gliding)` pattern). → *useFlipGrid, useRankGlide.*
- Else → ③

**③ Is it pure derived state from inputs?** (a value from current inputs ±
previous value; no DOM, no async, no timers)
- Yes → **plain React hook** using derive-during-render / effect-diff idioms;
  keep non-trivial computation as an exported pure function for testing + Solid
  reuse. → *useTickFlash, useNewestOrderId.*
- Else → ④

**④ Just reading a context seam?** → trivial `useContext` reader, no logic.
→ *useFxView, useCreditView, useTheme.*

### Litmus

RxJS is for autonomous async folds decoupled from the view. For per-frame /
per-commit computation driven by DOM lifecycle edges, prefer a pure function +
injected signal.

### Worked examples

| Hook | Branch | Home |
|---|---|---|
| `useLayout` | ① pure app state | `createLayoutMachine` (client-core) via `useMachine` |
| `useOrderTicket`, `useBootSequence`, `useRfqCountdown` | ① pure app state | machines in client-core |
| (admin throughput) | ① external I/O | `AdminPort` + adapter + presenter |
| `useFlipGrid` | ② DOM-frame effect | React hook shell + `flipDeltas` in `@rtc/motion-core` |
| `useRankGlide` | ② DOM-frame effect | React hook shell + `coalesceOrder`/`computeRankDirections` in `@rtc/motion-core` |
| `useTickFlash` | ③ pure derived state | plain hook (derive-during-render) |
| `useNewestOrderId` | ③ pure derived state | plain hook + exported `newestUnseenId` |
| `useFxView`, `useCreditView`, `useTheme` | ④ context read | trivial `useContext` |

### Canonical contrast

`useLayout` (machine) is ~100% pure `scan(reduce)` + a thin RxJS harness,
DOM-free, ports to Solid verbatim. `useFlipGrid` is ~30% pure math (now in
`@rtc/motion-core`) + ~70% irreducible DOM plumbing each framework
re-implements. Same discipline (`LayoutMachine.reduce` is pure, effects
injected; `coalesceOrder`'s `gliding` fact is injected) at different
granularities.

## Consequences

- `@rtc/motion-core` is the DOM-free home for shared view-layer math; the React
  hooks and the future Solid directives import identical functions.
- The grep-gates (26–33) remain the negative cross-check: reaching for
  rxjs/localStorage/fetch/timers in `src/ui` means the logic is category ①.

## See also

- [ADR-004 — ViewModel seam](ADR-004-viewmodel-seam-and-feature-flags.md)
- [Dumb-UI RxJS machines spec](../superpowers/specs/2026-06-16-dumb-ui-rxjs-machines-design.md)
- [Package dependencies](../architecture/06-package-dependencies.md)
```

- [ ] **Step 2: Verify doc links resolve**

Run: `node scripts/check-doc-links.mjs`
Expected: `check-doc-links: N links OK across M files` (no failures). Confirm the four relative links in the ADR resolve (ADR-004, the dumb-UI spec, 06-package-dependencies).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-005-ui-logic-placement.md
git commit -m "docs(adr): ADR-005 UI logic placement decision tree"
```

---

### Task 2: CLAUDE.md pointer + architecture-doc entry

Point to ADR-005 from the always-in-context CLAUDE.md and the living architecture reference, without duplicating the tree.

**Files:**
- Modify: `CLAUDE.md` (add a doctrine pointer paragraph)
- Modify: `docs/architecture/10-key-design-decisions.md` (add a short entry linking ADR-005)

**Interfaces:**
- Consumes: `docs/adr/ADR-005-ui-logic-placement.md` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the CLAUDE.md pointer**

In `CLAUDE.md`, add a new top-level section after the "Rendering Performance" section (mirror that section's "read X before doing Y" pointer style):

```markdown
## UI Logic Placement

Before adding a UI hook or moving logic behind the ViewModel, consult
**`docs/adr/ADR-005-ui-logic-placement.md`** — the decision tree for choosing
between an RxJS machine in `client-core`, a plain React hook, and a pure
function in `@rtc/motion-core` + a thin framework shell. The rule of thumb:
RxJS machines are for autonomous async folds decoupled from the view; per-frame
DOM-edge-driven computation is a pure function + injected signal, shared via
`@rtc/motion-core`.
```

- [ ] **Step 2: Add the architecture-doc entry**

In `docs/architecture/10-key-design-decisions.md`, add a short subsection (2–3 sentences + link, NOT a copy of the tree):

```markdown
### UI logic placement (ADR-005)

Where UI-adjacent logic lives is a decision tree: application state/behavior →
an RxJS machine (or port + presenter) in `client-core` behind the ViewModel;
DOM-frame-driven animation → a framework hook/directive over pure math shared in
`@rtc/motion-core`; pure derived state → a plain hook; context read → a trivial
reader. See [ADR-005](../adr/ADR-005-ui-logic-placement.md) for the full tree,
litmus, and worked examples.
```

- [ ] **Step 3: Verify doc links**

Run: `node scripts/check-doc-links.mjs`
Expected: all links OK (the new `../adr/ADR-005-ui-logic-placement.md` link resolves).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/architecture/10-key-design-decisions.md
git commit -m "docs: point CLAUDE.md + architecture reference at ADR-005"
```

---

### Task 3: Scaffold `@rtc/motion-core` with the FLIP module; rewire `useFlipGrid`

Create the package, move the FLIP pure math + its tests, wire the gates (knip, dependency-cruiser, client-react dependency), and rewire the `useFlipGrid` shell to import from it.

**Files:**
- Create: `packages/motion-core/package.json`
- Create: `packages/motion-core/tsconfig.json`
- Create: `packages/motion-core/README.md`
- Create: `packages/motion-core/src/flip.ts`
- Create: `packages/motion-core/src/reducedMotion.ts`
- Create: `packages/motion-core/src/index.ts`
- Create: `packages/motion-core/src/flip.test.ts`
- Modify: `knip.json` (add `packages/motion-core` workspace)
- Modify: `.dependency-cruiser.cjs` (add `motion-core-stays-pure` rule)
- Modify: `packages/client-react/package.json` (add `@rtc/motion-core` dependency)
- Modify: `packages/client-react/src/ui/shell/motion/useFlipGrid.ts` (remove moved code, import it)
- Modify: `packages/client-react/src/ui/shell/motion/useFlipGrid.test.ts` (drop moved tests, fix import)

**Interfaces:**
- Consumes: nothing.
- Produces (from `@rtc/motion-core`):
  - `flipDeltas(prev: ReadonlyMap<string, Rect>, next: ReadonlyMap<string, Rect>): FlipDelta[]`
  - `interface Rect { left: number; top: number; width: number; height: number }`
  - `interface FlipDelta { key: string; dx: number; dy: number }`
  - `const FLIP_DURATION_MS: number`, `FLIP_EASING: string`, `EXIT_DURATION_MS: number`, `EXIT_EASING: string`, `DRIFT_PX: number`
  - `const REDUCED_MOTION_QUERY: string`

- [ ] **Step 1: Create the package manifest**

Create `packages/motion-core/package.json` (mirror `packages/ws-effects/package.json`, but with **no `dependencies` block** — zero runtime deps):

```json
{
  "name": "@rtc/motion-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "imports": {
    "#/*": "./src/*"
  },
  "scripts": {
    "build": "tsc --build && tsc-alias -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "dev": "tsc-alias -w -p tsconfig.json & tsc --build --watch",
    "clean": "rm -rf dist .turbo *.tsbuildinfo reports 2>/dev/null || true",
    "clean:deep": "pnpm run clean && (rm -rf node_modules 2>/dev/null || true)"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.8",
    "@vitest/ui": "^4.1.8",
    "tsc-alias": "1.9.0",
    "vitest": "^4"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

Create `packages/motion-core/tsconfig.json` (identical shape to `packages/ws-effects/tsconfig.json`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo",
    "paths": { "#/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the README**

Create `packages/motion-core/README.md`:

```markdown
# @rtc/motion-core

Framework-free, **zero-runtime-dependency** view-layer motion math. Pure
functions and constants shared by every client's animation shells (React today,
SolidJS next) so the *logic* is written once and only the imperative DOM shell
(`getBoundingClientRect` / `Element.animate` / `useLayoutEffect` / directives)
differs per framework.

No DOM, no RxJS, no React. See
[ADR-005](../../docs/adr/ADR-005-ui-logic-placement.md) for why animation math
lives here rather than behind the ViewModel.

## Exports

- `flipDeltas` — FLIP invert-phase deltas for a keyed grid.
- `computeRankDirections`, `sameOrder`, `coalesceOrder` — watchlist rank-glide math.
- Easing/duration constants (`FLIP_*`, `EXIT_*`, `GLIDE_*`, `HIGHLIGHT_*`, `FALLBACK_ROW_HEIGHT`).
- `REDUCED_MOTION_QUERY` — the shared `prefers-reduced-motion` media query string.
```

- [ ] **Step 4: Create `src/reducedMotion.ts`**

Create `packages/motion-core/src/reducedMotion.ts`:

```ts
/** The `prefers-reduced-motion` media query string. The query is view-agnostic
 *  and shared; the `window.matchMedia` call that reads it stays in each
 *  framework's shell (it touches the DOM). */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
```

- [ ] **Step 5: Create `src/flip.ts`** (moved verbatim from `useFlipGrid.ts`)

Create `packages/motion-core/src/flip.ts`:

```ts
export interface Rect {
  left: number;
  top: number;
  /** Only read by exit ghosts; flipDeltas ignores them. */
  width: number;
  height: number;
}

export interface FlipDelta {
  key: string;
  dx: number;
  dy: number;
}

// PROTO motion/useFlip.ts DEFAULT_DUR_MS / FLIP_EASING — one global glide.
export const FLIP_DURATION_MS = 440;
export const FLIP_EASING = "cubic-bezier(.22,.85,.3,1)";
// PROTO cardOut: .34s cubic-bezier(.4,0,.7,1).
export const EXIT_DURATION_MS = 340;
export const EXIT_EASING = "cubic-bezier(.4,0,.7,1)";
// Fallback travel distance when no [data-flip-stage] ancestor is found to
// measure the real panel borders against.
export const DRIFT_PX = 32;
// PROTO useFlip.ts sub-pixel suppression threshold.
const FLIP_MIN_DELTA_PX = 0.5;

/** Pure invert-phase math: for each key present in both position maps, the
 *  delta needed to animate FROM the previous position TO the next one. Keys
 *  that didn't move (within the sub-pixel threshold — PROTO useFlip.ts
 *  suppresses glides under ~0.5px so a re-render that barely nudges a node
 *  doesn't flicker), or that exist in only one of the two maps (added/
 *  removed by the filter), are omitted. */
export function flipDeltas(
  prev: ReadonlyMap<string, Rect>,
  next: ReadonlyMap<string, Rect>,
): FlipDelta[] {
  const deltas: FlipDelta[] = [];
  next.forEach((nextRect, key) => {
    const prevRect = prev.get(key);

    if (!prevRect) {
      return;
    }

    const dx = prevRect.left - nextRect.left;
    const dy = prevRect.top - nextRect.top;

    if (Math.abs(dx) < FLIP_MIN_DELTA_PX && Math.abs(dy) < FLIP_MIN_DELTA_PX) {
      return;
    }

    deltas.push({ key, dx, dy });
  });
  return deltas;
}
```

Note: `FLIP_MIN_DELTA_PX` stays module-private (only `flipDeltas` uses it) so knip won't flag an unused export.

- [ ] **Step 6: Create `src/index.ts`**

Create `packages/motion-core/src/index.ts`:

```ts
export { DRIFT_PX, EXIT_DURATION_MS, EXIT_EASING, FLIP_DURATION_MS, FLIP_EASING, flipDeltas } from "./flip.js";
export type { FlipDelta, Rect } from "./flip.js";
export { REDUCED_MOTION_QUERY } from "./reducedMotion.js";
```

- [ ] **Step 7: Move the `flipDeltas` tests**

Create `packages/motion-core/src/flip.test.ts`. Move the entire `describe("flipDeltas", …)` block (lines 6–77) verbatim from `packages/client-react/src/ui/shell/motion/useFlipGrid.test.ts`, changing only the import:

```ts
import { describe, expect, it } from "vitest";

import { flipDeltas } from "./flip.js";

// … the six it() cases from the old describe("flipDeltas") block, verbatim …
```

- [ ] **Step 8: Run the package's tests**

Run: `pnpm --filter @rtc/motion-core test`
Expected: PASS — 6 `flipDeltas` cases green. (Vitest runs on `src/` directly; no build needed for the package's own tests.)

- [ ] **Step 9: Add the knip workspace entry**

In `knip.json`, add (after the `packages/ws-effects` block, matching its shape):

```json
    "packages/motion-core": {
      "entry": "src/index.ts",
      "project": "src/**/*.ts"
    },
```

- [ ] **Step 10: Add the dependency-cruiser rule**

In `.dependency-cruiser.cjs`, add this object to the `forbidden` array (after the `ws-effects-stays-pure` rule):

```js
    {
      name: "motion-core-stays-pure",
      severity: "error",
      comment:
        "@rtc/motion-core is zero-dependency pure view-layer math — it must not depend on domain/shared/client-core/bindings/any client/server/ws-effects.",
      from: { path: "^packages/motion-core/src" },
      to: {
        path: "^packages/(domain|shared|client-core|react-bindings|client-react|client-react-native|client-prototype|server|ws-effects)/",
      },
    },
```

- [ ] **Step 11: Add `@rtc/motion-core` as a client-react dependency**

In `packages/client-react/package.json`, add to `dependencies` (alphabetical, between `@rtc/domain` and `@rtc/react-bindings`):

```json
    "@rtc/motion-core": "workspace:*",
```

Then run: `pnpm install`
Expected: lockfile updates, workspace link created, no errors.

- [ ] **Step 12: Rewire the `useFlipGrid` shell**

In `packages/client-react/src/ui/shell/motion/useFlipGrid.ts`:
1. **Delete** the moved declarations: the `flipDeltas` function (lines ~145–173), the `Rect` and `FlipDelta` interfaces, and the constants `FLIP_DURATION_MS`, `FLIP_EASING`, `EXIT_DURATION_MS`, `EXIT_EASING`, `DRIFT_PX`, `FLIP_MIN_DELTA_PX`, `REDUCED_MOTION_QUERY`.
2. **Keep** everything else (`useFlipGrid`, `measurePositions`, `anyGlideRunning`, `playFlip`, `playEnter`, `playExitGhost`, `stageRectFromElements`, `prefersReducedMotion`, `FlipGridApi`, `FlipGridOptions`).
3. **Add** at the top (after the React import):

```ts
import {
  DRIFT_PX,
  EXIT_DURATION_MS,
  EXIT_EASING,
  FLIP_DURATION_MS,
  FLIP_EASING,
  flipDeltas,
  type Rect,
  REDUCED_MOTION_QUERY,
} from "@rtc/motion-core";
```

`measurePositions` returns `Map<string, Rect>` and `flipDeltas`/`playFlip` are called exactly as before — only their definitions moved.

- [ ] **Step 13: Fix the shell test's import**

In `packages/client-react/src/ui/shell/motion/useFlipGrid.test.ts`:
1. **Delete** the `describe("flipDeltas", …)` block (now in `flip.test.ts`).
2. Change the import from `import { flipDeltas, useFlipGrid } from "./useFlipGrid";` to:

```ts
import { useFlipGrid } from "./useFlipGrid";
```

The `describe("useFlipGrid", …)` DOM tests stay unchanged.

- [ ] **Step 14: Build motion-core, then typecheck + test client-react**

Run:
```bash
pnpm --filter @rtc/motion-core build
pnpm --filter @rtc/client-react typecheck
pnpm --filter @rtc/client-react test
```
Expected: motion-core builds to `dist/`; client-react typechecks clean; all `useFlipGrid` DOM tests pass (import resolves to the built package).

- [ ] **Step 15: Run the affected gates**

Run:
```bash
pnpm check:deps
pnpm lint:dead
pnpm check:versions
```
Expected: `check:deps` PASS (new rule loads; no violations — `client-react → motion-core` is allowed). `lint:dead` (knip) PASS (all motion-core exports consumed by the shell or tests). `check:versions` PASS (manypkg + syncpack: motion-core's dep versions match the repo ranges).

- [ ] **Step 16: Commit**

```bash
git add packages/motion-core knip.json .dependency-cruiser.cjs \
  packages/client-react/package.json pnpm-lock.yaml \
  packages/client-react/src/ui/shell/motion/useFlipGrid.ts \
  packages/client-react/src/ui/shell/motion/useFlipGrid.test.ts
git commit -m "feat(motion-core): extract FLIP math into @rtc/motion-core; rewire useFlipGrid"
```

---

### Task 4: Add the rank-glide module; rewire `useRankGlide`

Move the watchlist rank-glide pure math into `@rtc/motion-core` and rewire the `useRankGlide` shell. `rowHeight` and the `play*` helpers stay in the shell (they touch the DOM).

**Files:**
- Create: `packages/motion-core/src/rankGlide.ts`
- Create: `packages/motion-core/src/rankGlide.test.ts`
- Modify: `packages/motion-core/src/index.ts` (re-export rank-glide symbols)
- Modify: `packages/client-react/src/ui/equities/watchlist/useRankGlide.ts` (remove moved code, import it)
- Modify: `packages/client-react/src/ui/equities/watchlist/useRankGlide.test.ts` (drop moved tests, fix import)

**Interfaces:**
- Consumes: `@rtc/motion-core` (Task 3) — the package already exists.
- Produces (added to `@rtc/motion-core`):
  - `type RankDirection = "rose" | "fell" | "unchanged"`
  - `computeRankDirections(prevRank: Record<string, number> | undefined, order: readonly string[]): Record<string, RankDirection>`
  - `sameOrder(a: readonly string[], b: readonly string[]): boolean`
  - `interface CoalesceDecision { readonly committed: readonly string[]; readonly bufferedPending: readonly string[] | null }`
  - `coalesceOrder(committed: readonly string[], pending: readonly string[] | null, candidate: readonly string[], gliding: boolean): CoalesceDecision`
  - `const GLIDE_DUR_MS: number`, `GLIDE_EASING: string`, `HIGHLIGHT_DUR_MS: number`, `HIGHLIGHT_EASING: string`, `FALLBACK_ROW_HEIGHT: number`

- [ ] **Step 1: Create `src/rankGlide.ts`** (moved verbatim from `useRankGlide.ts`)

Create `packages/motion-core/src/rankGlide.ts`:

```ts
export type RankDirection = "rose" | "fell" | "unchanged";

export const GLIDE_DUR_MS = 560;
export const GLIDE_EASING = "cubic-bezier(.34,1.28,.5,1)";
export const HIGHLIGHT_DUR_MS = 820;
export const HIGHLIGHT_EASING = "ease-out";
export const FALLBACK_ROW_HEIGHT = 52;

/** Pure so it can be exercised directly (jsdom lacks Element.animate, so the
 *  per-row direction — not whether WAAPI ran — is what tests pin down). */
export function computeRankDirections(
  prevRank: Record<string, number> | undefined,
  order: readonly string[],
): Record<string, RankDirection> {
  const directions: Record<string, RankDirection> = {};

  order.forEach((sym, index) => {
    const oldIndex = prevRank?.[sym];

    if (oldIndex === undefined || oldIndex === index) {
      directions[sym] = "unchanged";
    } else {
      directions[sym] = oldIndex > index ? "rose" : "fell";
    }
  });

  return directions;
}

/** True when two symbol orders are identical (same symbols, same sequence). */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((sym, index) => {
    return sym === b[index];
  });
}

export interface CoalesceDecision {
  /** The order the caller should render/glide against THIS render. */
  readonly committed: readonly string[];
  /** The latest candidate order held back because a glide is still
   * in-flight, or null when nothing is buffered. Only ever the MOST RECENT
   * candidate — a second candidate arriving before the first is applied
   * simply replaces it, so a burst of rapid changes collapses into exactly
   * one deferred commit. */
  readonly bufferedPending: readonly string[] | null;
}

/** Pure decision function for the I4 coalescing gate — no DOM/WAAPI, so it's
 *  directly unit-testable. Given what's currently committed, what (if anything)
 *  is already buffered, the newly observed candidate order, and whether a glide
 *  is still animating:
 *    - a candidate matching what's already committed is a no-op (and drops any
 *      now-stale buffered candidate — the order round-tripped back);
 *    - while idle, the candidate commits immediately;
 *    - while gliding, the candidate is buffered instead of committed — the
 *      hook's effect applies it once the in-flight glide's WAAPI animations
 *      finish, which turns a burst of rapid candidates into a single reorder
 *      per glide window. */
export function coalesceOrder(
  committed: readonly string[],
  pending: readonly string[] | null,
  candidate: readonly string[],
  gliding: boolean,
): CoalesceDecision {
  if (sameOrder(candidate, committed)) {
    return { committed, bufferedPending: null };
  }

  if (sameOrder(candidate, pending ?? [])) {
    return { committed, bufferedPending: pending };
  }

  if (gliding) {
    return { committed, bufferedPending: candidate };
  }

  return { committed: candidate, bufferedPending: null };
}
```

- [ ] **Step 2: Re-export from `src/index.ts`**

Append to `packages/motion-core/src/index.ts`:

```ts
export { coalesceOrder, computeRankDirections, FALLBACK_ROW_HEIGHT, GLIDE_DUR_MS, GLIDE_EASING, HIGHLIGHT_DUR_MS, HIGHLIGHT_EASING, sameOrder } from "./rankGlide.js";
export type { CoalesceDecision, RankDirection } from "./rankGlide.js";
```

- [ ] **Step 3: Move the pure rank tests**

Create `packages/motion-core/src/rankGlide.test.ts`. Move the `describe("computeRankDirections", …)` and `describe("coalesceOrder — I4 reorder coalescing", …)` blocks verbatim from `packages/client-react/src/ui/equities/watchlist/useRankGlide.test.ts`, with the import:

```ts
import { describe, expect, it } from "vitest";

import { coalesceOrder, computeRankDirections } from "./rankGlide.js";

// … the computeRankDirections cases and the coalesceOrder cases, verbatim …
```

Do **not** move the `describe("rowHeight", …)` block — `rowHeight` stays in the shell.

- [ ] **Step 4: Run the package tests**

Run: `pnpm --filter @rtc/motion-core test`
Expected: PASS — `flip`, `computeRankDirections`, and `coalesceOrder` suites all green.

- [ ] **Step 5: Rewire the `useRankGlide` shell**

In `packages/client-react/src/ui/equities/watchlist/useRankGlide.ts`:
1. **Delete** the moved declarations: `RankDirection`, `computeRankDirections`, `sameOrder`, `CoalesceDecision`, `coalesceOrder`, and the constants `GLIDE_DUR_MS`, `GLIDE_EASING`, `HIGHLIGHT_DUR_MS`, `HIGHLIGHT_EASING`, `FALLBACK_ROW_HEIGHT`, `REDUCED_MOTION_QUERY`.
2. **Keep** `rowHeight`, `playGlide`, `playHighlight`, the `useRankGlide` hook, and any other DOM/effect helpers.
3. **Add** the import (merge with the existing `@rtc/motion-core` import if the file gained one, else add fresh):

```ts
import {
  coalesceOrder,
  computeRankDirections,
  type CoalesceDecision,
  FALLBACK_ROW_HEIGHT,
  GLIDE_DUR_MS,
  GLIDE_EASING,
  HIGHLIGHT_DUR_MS,
  HIGHLIGHT_EASING,
  type RankDirection,
  REDUCED_MOTION_QUERY,
  sameOrder,
} from "@rtc/motion-core";
```

Drop any of `type CoalesceDecision` / `type RankDirection` from the import if the shell doesn't reference the type name directly (avoid an unused-import lint error) — keep only the symbols the shell actually uses (`coalesceOrder`, `computeRankDirections`, `sameOrder`, the constants, and whichever types annotate its locals).

- [ ] **Step 6: Fix the shell test's import**

In `packages/client-react/src/ui/equities/watchlist/useRankGlide.test.ts`:
1. **Delete** the `describe("computeRankDirections", …)` and `describe("coalesceOrder …")` blocks (now in `rankGlide.test.ts`).
2. Change the import to keep only `rowHeight`:

```ts
import { rowHeight } from "./useRankGlide";
```

The `describe("rowHeight", …)` block stays unchanged.

- [ ] **Step 7: Build motion-core, then typecheck + test client-react**

Run:
```bash
pnpm --filter @rtc/motion-core build
pnpm --filter @rtc/client-react typecheck
pnpm --filter @rtc/client-react test
```
Expected: clean typecheck; `rowHeight` tests plus all watchlist/equities hook + contract tests pass.

- [ ] **Step 8: Run the affected gates**

Run:
```bash
pnpm check:deps
pnpm lint:dead
pnpm --filter @rtc/client-react lint 2>/dev/null || pnpm lint:eslint
```
Expected: `check:deps` PASS; `lint:dead` PASS (no unused exports); ESLint clean (no unused imports left behind by the rewire).

- [ ] **Step 9: Commit**

```bash
git add packages/motion-core/src \
  packages/client-react/src/ui/equities/watchlist/useRankGlide.ts \
  packages/client-react/src/ui/equities/watchlist/useRankGlide.test.ts
git commit -m "feat(motion-core): extract rank-glide math; rewire useRankGlide"
```

---

### Task 5: Documentation & dependency-graph ripple (WS-C)

Update every living doc that enumerates packages, draws the dependency graph, or documents the dependency-cruiser rules, to reflect the tenth package. (Historical `docs/superpowers/plans|specs` are immutable — do not touch them.)

**Files:**
- Modify: `CLAUDE.md` (Package Structure block + package count + dependency-rule paragraph)
- Modify: `docs/architecture/10-key-design-decisions.md` (package counts nine → ten)
- Modify: `docs/architecture/06-package-dependencies.md` (Mermaid graph node + edge + prose)
- Modify: `docs/architecture/13-codebase-map.md`
- Modify: `docs/architecture/01-overview.md`
- Modify: `docs/architecture/02-c4-model.md`
- Modify: `docs/architecture/08-replaceability-matrix.md`
- Modify: `docs/architecture/11-key-files-reference.md`
- Modify: `docs/dependency-cruiser.md` (document the new rule; bump "12 forbidden rules" → 13)
- Modify: `README.md`

**Interfaces:**
- Consumes: the package created in Tasks 3–4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Re-verify current counts and enumerations before editing**

Run:
```bash
grep -rn -iE "nine package|9 package|ten package" CLAUDE.md docs/architecture
grep -rn "ws-effects" docs/architecture/06-package-dependencies.md
```
Expected: locates the exact lines (they may have drifted since the spec — re-read, don't trust frozen line numbers).

- [ ] **Step 2: Update CLAUDE.md**

1. Change "nine packages plus the `tests` workspace" → "ten packages plus the `tests` workspace".
2. In the **Package Structure** code block, add an entry (keep the existing alignment):

```
  motion-core/         @rtc/motion-core         — Framework-free, zero-dependency view-layer motion math (FLIP deltas, rank-glide coalescing, easing/duration constants). No DOM, no rxjs, no React. Shared by client animation shells (React now, Solid next).
```

3. In the **dependency rule** paragraph, note that `@rtc/motion-core` is a pure, zero-dep leaf consumed by the clients (like the clients consume `client-core`), and mirrors the rxjs-only-style purity constraint (here: *no* runtime deps).

- [ ] **Step 3: Update `10-key-design-decisions.md`**

Change both "Nine packages …" occurrences to "Ten packages …", and "nine `package.json`s, nine `tsconfig`s" → "ten `package.json`s, ten `tsconfig`s". If the inline dependency-graph string is present, extend it to show `motion-core` as a client-consumed leaf (e.g. `… → client-core → react-bindings → clients (← motion-core) / server`).

- [ ] **Step 4: Update the Mermaid graph in `06-package-dependencies.md`**

Add a `motion` node in the inner circles and an edge from the clients:

```
    motion["@rtc/motion-core\nView-layer motion math\npure, zero-dep"]
    react --> motion
```

Add a note that `client-solid` will add the same `client-solid --> motion` edge. Update any surrounding prose that lists package counts or the inner-circle members.

- [ ] **Step 5: Update the remaining enumerations**

For each of `13-codebase-map.md`, `01-overview.md`, `02-c4-model.md`, `08-replaceability-matrix.md`, `11-key-files-reference.md`, and `README.md`: add `@rtc/motion-core` wherever the package set is listed (map row, C4 component, replaceability axis/row, key-files entry, README package list). Match the surrounding format exactly. `docs/architecture.md` is an index/pointer file — open it and confirm no package enumeration needs the addition (likely none).

- [ ] **Step 6: Document the dependency-cruiser rule**

In `docs/dependency-cruiser.md`:
1. Change the "## The 12 forbidden rules" heading to "## The 13 forbidden rules".
2. Add a table row (matching the existing column format):

```
| `motion-core-stays-pure` | `^packages/motion-core/src` | `^packages/(domain\|shared\|client-core\|react-bindings\|client-react\|client-react-native\|client-prototype\|server\|ws-effects)/` | The view-layer motion-math package stays a zero-dependency pure leaf — no `@rtc/*` edges |
```

3. If the "## The allowed dependency graph" Mermaid graph enumerates packages, add the `motion` node there too.

- [ ] **Step 7: Verify links and counts**

Run:
```bash
node scripts/check-doc-links.mjs
grep -rn -iE "nine package|9 package" CLAUDE.md docs/architecture docs/dependency-cruiser.md README.md
```
Expected: all links OK; the second grep returns **no** stale "nine/9 package" hits in the living docs.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs/architecture docs/dependency-cruiser.md README.md
git commit -m "docs: fold @rtc/motion-core into package graph, counts, and depcruise catalogue"
```

---

### Task 6: Full-gauntlet verification

Prove the refactor is behavior-identical and every gate is green before the PR.

**Files:** none (verification only).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green gauntlet.

- [ ] **Step 1: Build everything topologically**

Run: `pnpm build`
Expected: all ten packages build in dependency order, including `@rtc/motion-core` before `@rtc/client-react`.

- [ ] **Step 2: Typecheck + unit/contract/presenter tests**

Run: `pnpm typecheck && pnpm test`
Expected: all green. The migrated pure tests run under `@rtc/motion-core`; the DOM/effect and contract tests run under `@rtc/client-react`; presenter suites under `tests`.

- [ ] **Step 3: Run the static gates**

Run:
```bash
pnpm lint:eslint
pnpm lint:eslint:types
pnpm lint:dead
pnpm check:deps
pnpm check:versions
pnpm check:doc-links
pnpm test:rules
```
Expected: all PASS. Notably `check:deps` shows the `motion-core-stays-pure` rule active with zero violations, and `lint:dead` reports no unused `@rtc/motion-core` exports.

- [ ] **Step 4: Visual goldens (regression check — expect NO changes)**

Run: `pnpm test:ui:visual`
Expected: PASS with **no golden diffs**. The FLIP and rank-glide motion is byte-covered; because the refactor is behavior-identical, goldens must not shift. If any golden diffs, STOP — that is a regression to investigate, not a re-pin (per Global Constraints).

Note: visual is heavy and also runs post-merge via `visual.yml`. If the local Playwright browser setup is unavailable, rely on CI's `visual.yml` run and record that here.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for motion-core extraction"
```

(If Steps 1–4 were clean with no edits, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** WS-A (Tasks 3–4), WS-B (Tasks 1–2), WS-C (Task 5), testing/gauntlet (Task 6). All spec sections mapped.
- **Scope boundary:** `useTickFlash`/`useNewestOrderId` intentionally NOT moved (spec "animation math only"); they are classified in ADR-005's table but stay in `client-react`.
- **Type consistency:** `flipDeltas`, `Rect`, `FlipDelta`, `coalesceOrder`, `CoalesceDecision`, `computeRankDirections`, `sameOrder`, `RankDirection` signatures match between the `Produces` blocks, the `src` implementations, and the shell import lists.
- **No golden regen:** enforced as a Global Constraint and Task 6 Step 4.
