# Live FPS + MEM readouts in the HUD status bar

**Date:** 2026-07-17
**Status:** Designed — not yet built
**Depends on:** [ADR-005 — UI logic placement](../../adr/ADR-005-ui-logic-placement.md) (§② view-layer effect + `@rtc/motion-core` pure math); [`docs/performance.md`](../../performance.md) (per-frame main-thread budget)

**Scope decisions (locked, from brainstorming):**
- **FPS *and* MEM go live.** The user asked for a real FPS meter "the way react-scan does"; MEM (`performance.memory.usedJSHeapSize`) is the one other genuinely-measurable cosmetic cell, so it goes live in the same pass. The remaining cells (`GW`, `LAT`, `TPUT`, `POS`, `P&L`, `SES`, clock, build) stay static — they have no real signal and are out of scope.
- **react-scan fidelity.** 1-second rolling frame-count window; the number repaints at most ~once per second (not every frame); the FPS value is coloured by threshold (green / amber / red), matching react-scan's traffic-light readout.
- **Freeze via a context seam.** `status/bar` is a pixel-diffed visual golden; the live number would flap it. A framework context injects a *frozen* `{ fps, mem }` under the visual + contract harnesses, so goldens stay byte-identical. Production has no provider → live. Chosen over dropping `status/bar` from pixel-diff (loses coverage of the stable footer) and over a race-prone "placeholder until first sample".
- **Both web clients, at parity.** `client-react` and `client-solid` both render `CosmeticMetrics`; the Solid coverage gate requires parity, so both get the live path. `client-react-native` has no `CosmeticMetrics` and is untouched.
- **No ViewModel, no `client-core`.** This is a view-layer timing effect, not application state (ADR-005 §②). It stays in the framework layer + `@rtc/motion-core`; the domain/shared/client-core/server packages do not change.

## 1. Why

The footer's `FPS: "60"` and `MEM: "248MB"` are decorative placeholders (see `CosmeticMetrics.tsx`, `METRICS`). For a permanently-animated HUD over a live data stream, a *real* frame-rate readout is both credible chrome and a genuinely useful diagnostic — it makes the app's own rendering cost visible, which is exactly the thing `docs/performance.md` exists to protect. react-scan popularised the pattern: a tiny always-on rAF meter that surfaces jank the moment it appears.

The tension is that the current values are static *by design* — the code comment states they are fixed "so the view stays gate-clean and golden-stable." A live number is non-deterministic and would break the `status/bar` visual golden and any future snapshot of the footer. The design's core job is to make the readout real **without** surrendering that determinism.

## 2. How react-scan measures FPS (the behaviour we match)

A single `requestAnimationFrame` loop increments a frame counter every frame. Once ~1000 ms have elapsed (measured with `performance.now()`), it publishes `fps = frames-counted-in-that-window`, resets the counter and window start, and colours the number by threshold. It is a **1-second rolling count**, not an instantaneous inter-frame delta — which is why it reads as a stable integer that ticks once per second rather than a jittering number.

## 3. Architecture (ADR-005 §②: pure fn in `@rtc/motion-core` + thin framework shell)

An FPS meter is a per-frame computation driven by a browser timing edge (rAF). ADR-005 §② puts the irreducible timing seam in the framework layer and the pure math in `@rtc/motion-core`, injecting DOM-derived facts (here: frame timestamps and heap bytes) as arguments. This is the same split as `useFlipGrid` + `flipDeltas`.

### 3a. `@rtc/motion-core` — pure, framework-free, unit-tested, ports verbatim

Three pure functions (no DOM, no rAF, no state held internally — the caller/hook holds the counters):

```ts
// Frames counted over the elapsed window → integer fps (react-scan's 1s bucket).
export function computeFps(frameCount: number, elapsedMs: number): number;

// react-scan traffic-light thresholds → an existing metric tone token.
export type MetricTone = "positive" | "aware" | "negative";
export function fpsTone(fps: number): MetricTone; // green ≥55, amber ≥30, else red

// Heap bytes → the existing "248MB" shape (integer MB, no decimals).
export function formatHeapMb(usedBytes: number): string;
```

Thresholds and the MB divisor (`1024 * 1024`) live here so both clients share one definition and the numbers are asserted in deterministic unit tests. `MetricTone`'s three arms map 1:1 to existing CSS accent vars — `--accent-positive`, `--accent-aware`, `--accent-negative` — so no new design tokens are invented.

### 3b. Framework shell — `useLiveMetrics()` (React `src/ui/shell/status/`, Solid primitive later)

The hook owns the timing seam and the DOM reads:

- **One rAF loop.** Each frame: `frameCount++`. When `performance.now() - windowStart >= PUBLISH_MS` (1000 ms), it computes `fps = computeFps(frameCount, elapsed)`, reads memory, publishes state, and resets `frameCount`/`windowStart`. Publishing once per second means **one small re-render per second** — negligible on the HUD and consistent with `docs/performance.md`. The value repaints only when it changes.
- **The throttle is time-gated *inside the rAF loop*** using `performance.now()` — **never** `setInterval`/`setTimeout`. Grep-gate 29 (React) / 37 (Solid) bans those in `src/ui`; rAF is allowed there (BootSequence already uses it). This is not a workaround — a self-clocked rAF window is the correct way to measure frame rate anyway.
- **MEM reads `performance.memory?.usedJSHeapSize`** at each publish. `performance.memory` is non-standard (Chromium-only). When absent (Firefox / Safari / jsdom) the hook publishes `mem: null`; the view renders `—` with the default dim tone. This graceful-degradation path is required regardless of tests.
- **No `import.meta.env`** (grep-gate 28 bans it in `src/ui`) — the freeze arrives via context, not an env check.

Returns `{ fps: number | null, fpsTone: MetricTone, mem: string | null }`.

### 3c. The freeze seam — a framework context

- A React context (`LiveMetricsContext`) and a parallel Solid context. **Default = `null` → live**: production has no provider, so the meter runs.
- When a provider supplies a frozen `LiveMetrics`, the hook returns it and **does not start the rAF loop** — deterministic and side-effect-free.
- The **visual harness** and the **contract/jsdom harness** wrap their mount in the provider with a frozen seed that **reproduces today's exact footer appearance**: `fps: 60`, `mem: "248MB"`, and — deliberately — the FPS cell's current **`dim`** tone (not the live green). The seed's job is golden determinism, not asserting the live colour; choosing the pre-change appearance keeps every committed golden **byte-identical** and avoids churning the full-app goldens (the footer appears in every `app/*` scenario). So:
  - `status/bar` and `app/*` goldens stay byte-identical — no regeneration, and the post-merge (non-gating) `visual.yml` stays green.
  - jsdom contract specs are deterministic and never spin a rAF loop.
  - The live traffic-light (`positive`/`aware`/`negative`) is exercised only at runtime and verified **in-browser** (§5), which is the accepted method for rAF-driven content anyway.
- This mirrors how `ThemeProvider` and `PowerSaverRoot` inject render-affecting facts at the tree boundary, and keeps production component signatures prop-free (no test-only prop threaded through `StatusBar` → `CosmeticMetrics`).

`freezeClock.ts` cannot be reused for this: it deliberately pins only `Date.now()`/`new Date()` and leaves `requestAnimationFrame`/`performance.now()` live (so it doesn't interfere with React's scheduler). The explicit context seam is therefore genuinely required.

### 3d. `CosmeticMetrics` wiring

`CosmeticMetrics` stops hardcoding the FPS and MEM cells. It calls `useLiveMetrics()` and renders those two cells from the result (value + `data-tone` for FPS; value + dim tone for MEM). `GW`, `LAT`, `TPUT`, `POS`, `P&L`, `SES`, build, and clock remain the existing static `METRICS`. The `data-testid="cosmetic-metrics"` container and its child structure are preserved, so `StatusBarPage.hasCosmeticMetrics()` and the contract spec are unaffected.

## 4. What changes / what doesn't

**Changes:**
- `@rtc/motion-core` — `computeFps`, `fpsTone`, `formatHeapMb` + `MetricTone` type, with unit tests.
- `@rtc/client-react` — `useLiveMetrics` hook + `LiveMetricsContext` (in `src/ui/shell/status/`); `CosmeticMetrics.tsx` wiring; two new `data-tone="aware"` / `data-tone="negative"` rows in `StatusBar.module.css`; harness provider in the visual + contract mounts.
- `@rtc/client-solid` — parallel `useLiveMetrics` primitive + context + `CosmeticMetrics` wiring + the same two CSS rows (parity; required by the Solid contract-coverage gate).
- **Test harnesses (per client, not `@rtc/ui-contract` src)** — each framework's render driver wraps its mount in the frozen `LiveMetricsContext.Provider`: `client-react`'s contract `render.tsx` + visual `VisualScenario.tsx`, and `client-solid`'s contract `render.tsx`. `@rtc/ui-contract` itself (framework-neutral specs) is unchanged.

**Does NOT change:** `@rtc/domain`, `@rtc/shared`, `@rtc/client-core`, `@rtc/server`, the ViewModel seam, `client-react-native`, or any port/adapter/machine/presenter. No new runtime dependencies. The FPS/MEM readouts never touch application state.

## 5. Testing & verification

- **`@rtc/motion-core` unit tests** — deterministic: `computeFps(60, 1000) === 60`; `computeFps(30, 500) === 60`; `fpsTone` boundaries at 55 / 30; `formatHeapMb(260 * 1024 * 1024) === "260MB"`.
- **Contract specs** — unchanged in intent; still assert the `cosmetic-metrics` container exists, now rendered under the frozen provider (so the two live cells read their seeded values). Add a small spec asserting the frozen seam short-circuits the loop (no rAF scheduled when a provider value is present).
- **`status/bar` visual golden** — re-verified **byte-identical** to the committed PNGs after the change (frozen seed = current static values).
- **Live path** — verified **in-browser** (the accepted method for rAF/time-driven content that `animations: "disabled"` cannot freeze — see `scenarios.ts:540`, the BootSequence precedent): the number is a live integer, colours cross green→amber→red under induced jank, MEM tracks the heap, and `—` shows where `performance.memory` is absent.
- **Gauntlet** — full gate run including **both** react and solid contract-coverage (per the power-saver-workstream lesson that a react-only change must still pass the Solid coverage gate), grep-gates (no `setTimeout`/`setInterval`/`import.meta.env` in either `src/ui`), Biome, ESLint, stylelint, typecheck, knip.

## 6. Defaulted sub-decisions (revisit if wrong)

- **First-second seed** shows `—` (dim), not a fake `60`, until the first real 1 s window publishes. Avoids briefly asserting a value we haven't measured.
- **MEM is not colour-coded** — react-scan doesn't colour memory; it keeps the default dim tone. Only FPS gets the traffic-light.
- **The meter keeps running in power-saver mode.** The rAF loop is near-free, and frame rate is exactly the diagnostic you most want visible when rendering is constrained. (Revisit only if power-saver's intent is "zero non-essential rAF".)

## 7. See also

- [ADR-005 — UI logic placement](../../adr/ADR-005-ui-logic-placement.md)
- [`docs/performance.md`](../../performance.md)
- [UI-logic placement & motion-core charter](2026-07-12-ui-logic-placement-and-motion-core-design.md) — motion-core's pure-math home
