# UI logic placement doctrine + `@rtc/motion-core` — Design

- **Date:** 2026-07-12
- **Status:** Approved (brainstorming), pending implementation plan
- **Related:** [ADR-004 ViewModel seam](../../adr/ADR-004-viewmodel-seam-and-feature-flags.md), [dumb-UI rxjs machines spec](2026-06-16-dumb-ui-rxjs-machines-design.md), [`docs/architecture/10-key-design-decisions.md`](../../architecture/10-key-design-decisions.md); goldens-as-portability-contract (ADR-001, referenced by number across the docs)

## Goal

Two reinforcing outcomes ahead of the planned SolidJS client:

1. **`@rtc/motion-core`** — extract the DOM-free animation math out of the two
   complex React motion hooks (`useFlipGrid`, `useRankGlide`) into a pure,
   zero-runtime-dependency package, so `client-react` and the future
   `client-solid` import *identical* logic and differ only in their thin,
   framework-specific imperative shells.
2. **A decision doctrine** — an unambiguous "where does this logic go?" tree
   (rxjs machine vs plain hook vs pure-function + shell), recorded canonically
   as **ADR-005**, pointed to from **CLAUDE.md**, and summarised in the
   architecture living reference.

## Why

The clone is a capability showcase whose headline architectural feature is
framework replaceability (React → Solid). Today the reuse boundary is implicit:
the pure parts of the motion hooks are already extracted as functions
(`flipDeltas`, `coalesceOrder`, …) and unit-tested, but they live *inside*
`client-react`, so Solid cannot import them without one client depending on
another (forbidden by the dependency rule).

Separately, the repo enforces a **negative** rule — grep-gates 26–33 ban
`rxjs`/`localStorage`/`fetch`/timers in `src/ui` — and the 2026-06-16 dumb-UI
spec documents the "logic-bearing hooks → machines" migration. But there is no
**positive** decision tree telling an author (human or agent) *which* home a
given piece of UI-adjacent logic belongs in. The recurring live question —
"shouldn't `useFlipGrid` be an rxjs presenter so Solid can reuse it?" — has a
precise answer that is currently undocumented.

### The core insight the doctrine encodes

**"Shared, component-free logic" ≠ "rxjs."** RxJS machines earn their place for
exactly one shape: an *autonomous async fold* — state that evolves over an event
stream on its own clock, decoupled from the view (WS prices, layout intents, RFQ
countdowns). For **per-frame / per-commit computation driven by DOM lifecycle
edges** (a React commit, an `Animation.finished`), a **pure function + injected
signal** is lighter and equally shareable. `useLayout` (a one-line binding over
`createLayoutMachine`) is the machine archetype; `coalesceOrder(committed,
pending, candidate, gliding)` — pure, with the DOM-derived `gliding` fact
injected by the shell — is the pure-function archetype.

## Workstreams

One spec, two workstreams. Doctrine (WS-B) is cheap and sets the frame;
extraction (WS-A) demonstrates it. They are independent enough to parallelise in
the implementation plan.

---

## WS-A — `@rtc/motion-core`

### Charter

Pure TypeScript. **Zero runtime dependencies** — not even `rxjs`, because this is
per-frame math, not streams. **No DOM imports.** Mirrors the focused,
single-purpose package pattern of `@rtc/ws-effects`.

### What moves in (with its existing unit tests)

| Symbol | From |
|---|---|
| `flipDeltas`, `Rect`, `FlipDelta` | `useFlipGrid.ts` |
| `computeRankDirections`, `sameOrder`, `coalesceOrder`, `RankDirection`, `CoalesceDecision` | `useRankGlide.ts` |
| FLIP easing/duration constants (`FLIP_DURATION_MS`, `FLIP_EASING`, `EXIT_*`, `DRIFT_PX`, `FLIP_MIN_DELTA_PX`) | `useFlipGrid.ts` |
| Glide/highlight constants (`GLIDE_DUR_MS`, `GLIDE_EASING`, `HIGHLIGHT_*`, `FALLBACK_ROW_HEIGHT`) | `useRankGlide.ts` |

The pure-function tests currently in `useFlipGrid.test.ts` / `useRankGlide.test.ts`
migrate to `@rtc/motion-core` (they are already DOM-free). Shared reduced-motion
query constant is view-agnostic and may move too if convenient.

### What stays in the shell (re-imports from motion-core)

DOM- and framework-bound, by nature not abstractable into a DOM-free package:
`measurePositions`, `anyGlideRunning`, `stageRectFromElements`,
`playFlip`/`playEnter`/`playExitGhost`/`playGlide`/`playHighlight`, `rowHeight`,
the `register`/ref wiring, `prefersReducedMotion`, and all `useEffect` /
`useLayoutEffect` orchestration. The hooks keep their DOM/effect tests, now
exercising the imported pure functions. Solid will later provide its own shell
(`use:` directive / `createEffect`) over the same motion-core functions.

### Scope (first cut)

**Animation math only.** `useTickFlash` and `useNewestOrderId` stay in
`client-react` — their pure helpers are already exported and tested, they are
~5 lines each, and they are "derived render state," not motion (YAGNI; the
doctrine still classifies them, see WS-B). No broader utility-package sweep.

### New-package wiring tax

A new package must be covered by every global gate (the "all gates cover every
package" rule). The full CI gate set (`ci.yml`) it must pass: `lint:eslint`,
`test:rules`, `lint:css`, `lint:actions`, `check:doc-links`, `check:versions`
(syncpack), `check:scripts`, `typecheck`, `test`, `lint:dead` (knip),
`check:deps` (dependency-cruiser), `lint:eslint:types`. Concretely:

- `tsconfig` project references + `#/` subpath-alias build (`tsc --build && tsc-alias`)
- `knip` entry (config key + name-specific paths) — `lint:dead`
- ESLint base + typed config path globs — `lint:eslint` + `lint:eslint:types`
- `turbo` task graph (topological build/typecheck/test pick-up)
- `syncpack` single-range enforcement — `check:versions`
- **`.dependency-cruiser.cjs`: add a `motion-core-stays-pure` forbidden rule**
  (zero deps — must not import domain/shared/client-core/bindings/clients/server),
  mirroring `ws-effects-stays-pure`. `check:deps` scans `packages/`, so the new
  package is picked up automatically; no existing rule forbids `client-react →
  motion-core`, so no rule needs loosening.
- `check:doc-links` (README links) + package `README.md`
- `client-react` adds `@rtc/motion-core` as a dependency; `client-solid` will too

---

## WS-B — Decision doctrine

### The decision tree

Walk in order; the logic lands in exactly one home.

**① Is it application state or behavior?** (what data exists; what happens on an
intent; timers; persistence; transport; business rules)
- **Needs external I/O** (transport/persistence) → **Port + adapter + presenter**
  in `client-core` (e.g. `AdminPort` + throughput).
- **Pure app state/behavior** → **rxjs machine** in `client-core`
  (`createXMachine`: `Subjects → merge → scan(reduce) → state()`), bound by a
  one-line `useMachine` in `createViewModel`. → *layout, orderTicket, boot,
  rfqCountdown, rowHighlight.*
- Else → ②

**② Is the logic's *substance* reading/writing the DOM at a specific frame?**
(`getBoundingClientRect`, `Element.animate`, `ResizeObserver`, focus/scroll/measure)
- **Yes** → it is a **view-layer effect**. It **stays in the framework layer**
  (React hook now; Solid directive / `createEffect` later). The timing seam
  (`useLayoutEffect` / `onMount`) is framework-specific and *cannot* be hoisted
  into rxjs or `client-core`. **Extract the pure parts** (geometry, decisions,
  set-diffs) **into `@rtc/motion-core` and inject DOM-derived facts as
  arguments** (the `coalesceOrder(…, gliding)` pattern). → *useFlipGrid,
  useRankGlide.*
- Else → ③

**③ Is it pure derived state from inputs?** (a value from current inputs ±
previous value; no DOM, no async, no timers)
- **Yes** → **plain React hook** using derive-during-render / effect-diff
  idioms; keep any non-trivial computation as an **exported pure function** for
  direct testing + Solid reuse. → *useTickFlash, useNewestOrderId.*
- Else → ④

**④ Just reading a context seam?** → trivial `useContext` reader, no logic.
→ *useFxView, useCreditView, useTheme.*

### The litmus (resolves "why not rxjs everywhere")

RxJS is for **autonomous async folds** — state evolving over an event stream on
its own clock, decoupled from the view. For **per-frame / per-commit computation
driven by DOM lifecycle edges**, prefer a **pure function + injected signal**:
lighter, and equally shareable across frameworks.

### Cross-check (already enforced)

grep-gates 26–33 ban `rxjs`/`localStorage`/`fetch`/timers in `src/ui`. Reaching
for any of those in the UI means the logic is category ① and belongs behind the
ViewModel.

### Worked-examples table (all current hooks)

| Hook | Branch | Home |
|---|---|---|
| `useLayout` | ① pure app state | `createLayoutMachine` (client-core) via `useMachine` |
| `useOrderTicket`, `useBootSequence`, `useRfqCountdown` | ① pure app state | machines in client-core |
| (admin throughput) | ① external I/O | `AdminPort` + adapter + presenter |
| `useFlipGrid` | ② DOM-frame effect | React hook shell + `flipDeltas` etc. in motion-core |
| `useRankGlide` | ② DOM-frame effect | React hook shell + `coalesceOrder`/`computeRankDirections` in motion-core |
| `useTickFlash` | ③ pure derived state | plain hook (derive-during-render) |
| `useNewestOrderId` | ③ pure derived state | plain hook + exported `newestUnseenId` |
| `useFxView`, `useCreditView`, `useTheme` | ④ context read | trivial `useContext` |

### Canonical contrast

`useLayout` (machine) vs `useFlipGrid` (pure-fn + shell) is the doctrine's
headline illustration: `createLayoutMachine` is ~100% pure `scan(reduce)` logic +
a thin rxjs harness, DOM-free, ports to Solid verbatim; `useFlipGrid` is ~30%
pure math (already extractable to motion-core) + ~70% irreducible DOM plumbing
(`getBoundingClientRect`/`Element.animate`/`useLayoutEffect`) that each framework
must re-implement.

---

## WS-C — Documentation & dependency-graph ripple

Adding the tenth package ripples through every artifact that enumerates the
package set, draws the dependency graph, or documents the "dependency walker"
(dependency-cruiser). This is distinct from WS-B's *new* doctrine docs — it is
maintenance of *existing* living docs. (Historical `docs/superpowers/plans|specs`
are immutable records and are **not** touched.)

### Package-count assertions (nine → ten)

- `CLAUDE.md` line ~11: "nine packages plus the `tests` workspace".
- `docs/architecture/10-key-design-decisions.md`: "Nine packages plus a `tests`
  workspace…" and "Nine packages means nine `package.json`s, nine `tsconfig`s…"
  (two occurrences), plus the inline graph string
  `domain → shared/ws-effects → client-core → react-bindings → clients/server`.

### Package enumerations / dependency graph

Audit each and add `@rtc/motion-core` (a zero-dep inner leaf consumed by
`client-react`, later `client-solid`):

- `CLAUDE.md` **Package Structure** block (the annotated package list) + the
  **dependency rule** paragraph.
- `docs/architecture/06-package-dependencies.md` — the **Mermaid graph**
  (`graph TB`): add a `motion` node and the `client-react → motion` edge; note
  the future `client-solid → motion` edge. Update surrounding prose.
- `docs/architecture/13-codebase-map.md` — codebase map (12 `@rtc/*` refs).
- `docs/architecture/01-overview.md`, `docs/architecture/02-c4-model.md` — package
  enumerations (10 `@rtc/*` refs each).
- `docs/architecture/08-replaceability-matrix.md` — add motion-core's row/axis if
  the matrix enumerates packages.
- `docs/architecture/11-key-files-reference.md` — add a motion-core key-files entry.
- `docs/dependency-cruiser.md` — document the new `motion-core-stays-pure` rule
  alongside the existing rule catalogue.
- `README.md` — package list (8 `@rtc/*` refs).
- `docs/architecture.md` — index/pointer file; likely no change, verify.

### Trap (known): citation drift

Per the architecture-doc-sync history, line-number citations and package counts
drift silently as `main` advances. The **implementation plan pins the exact
per-file edits and re-verifies every count/citation at execution time** — this
spec scopes the *set* of artifacts, not frozen line numbers. `check:doc-links`
and `check:deps` must be green after the ripple.

---

## Documentation placement (no duplication)

- **ADR-005 `docs/adr/ADR-005-ui-logic-placement.md`** — canonical source of
  truth. Context (dumb-UI rule + grep-gates exist, but no positive tree),
  Decision (the ① → ④ tree + the autonomous-fold-vs-DOM-edge litmus),
  worked-examples table, the `useLayout` vs `useFlipGrid` contrast, Consequences
  (incl. `@rtc/motion-core` as the shared pure-fn home), links to ADR-004 and the
  dumb-UI spec.
- **CLAUDE.md pointer** — one lean paragraph mirroring the existing
  `docs/performance.md` precedent: *"Before adding a UI hook or moving logic
  behind the ViewModel, consult ADR-005's decision tree (rxjs-machine vs plain
  hook vs pure-fn + shell)."* No tree inline.
- **Architecture-doc entry** — a short subsection in
  `docs/architecture/10-key-design-decisions.md`: 2–3 sentences stating the rule
  + a link to ADR-005. Living-reference index, **not** a copy of the tree.
  Registered with `check:doc-links`.

The split avoids duplication: ADR = decision record (why, alternatives,
consequences); arch-doc = living how-it-works reference that points at the ADR.

---

## Testing, gates, migration safety

- **Behavior-identical refactor.** WS-A is a pure code-move + re-import; no logic
  changes. Safety net = the full gauntlet: unit, **UI-contract (≥95%)**,
  presenter, and **visual goldens** (FLIP + rank-glide motion is golden-covered).
- **No golden regen expected.** If goldens shift, that is a regression to
  investigate — not a re-pin.
- **motion-core tests** are the migrated pure-function tests; hooks retain their
  DOM/effect tests.
- **New-package gates** as listed in WS-A must all be wired and green.

## Sequencing (for the implementation plan)

- **Phase 1 — doctrine (WS-B):** ADR-005 + CLAUDE.md pointer + arch-doc entry.
  Cheap, low-risk; establishes the frame. `check:doc-links` green. Independent
  of the package, so it can land first or in parallel.
- **Phase 2 — extraction + ripple (WS-A + WS-C together):** scaffold
  `@rtc/motion-core`, move the pure functions + tests, rewire `client-react`
  imports, wire all package gates (incl. the `motion-core-stays-pure` depcruise
  rule), **and** update the package-graph/enumeration docs in the same change so
  the docs never describe a package state that doesn't exist. Run the full
  gauntlet. WS-C rides with WS-A because it documents the package WS-A creates.

Phase 1 ∥ Phase 2 are parallelisable; within Phase 2, WS-A and WS-C are one
coherent commit.

## Out of scope

- The SolidJS client itself (this only prepares the shared seam).
- Migrating `useTickFlash` / `useNewestOrderId` into motion-core (deferred; YAGNI).
- Any behavioral change to the animations.
- A project skill encoding the tree (chose ADR + CLAUDE.md + arch-doc instead).
