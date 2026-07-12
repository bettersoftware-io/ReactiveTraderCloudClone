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
