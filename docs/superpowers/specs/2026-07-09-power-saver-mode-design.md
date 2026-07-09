# Power-Saver Mode — Design

**Status:** approved design, implementation deferred (plan at
`docs/superpowers/plans/2026-07-09-power-saver-mode.md`).

## Problem

After the compositor-animation perf round (PR #139), the app's steady-state
cost in Chrome on a 120Hz display is ~35% of one core across three processes:

- **GPU process ~16.5%** — compositing the always-moving ambient stack
  (2 aurora layers, 170vmax conic sweep, grid + particle-dot fields) plus
  panel glows at display refresh, permanently.
- **Renderer main ~10%** — ~35 live price re-renders/s plus per-tick
  sparkline `path d` rewrites.

That is fine on a modern Mac, but on slower hardware (older laptops, small
VMs, constrained VDI) it is the difference between smooth and sluggish. The
wow-effect experience should stay the default; a **power-saver mode** gives
one switch that trades ambience for headroom.

## Goals

- One toggle ("Power saver") that cuts steady-state cost to roughly
  3–5% GPU / ~3% renderer while keeping the app fully functional and
  visually recognisable (dark HUD, glows, tick flashes — just still and calm).
- **Master-override semantics:** while ON, the cheap path is forced
  everywhere; the user's underlying preferences (animated background, theme
  skin) are NOT rewritten and return intact when toggled OFF.
- Persisted like every other preference (localStorage, replay-current
  stream, no flash on load).
- Reachable from the Preferences modal AND a one-click header control.

## Non-goals

- No auto-detection (Battery/deviceMemory heuristics) — manual toggle only.
- No changes to `client-react-native` or `client-prototype`.
- No new "low-power theme skin" — power saver composes with every skin.
- No server/protocol changes: conflation happens client-side in presenters.

## Design

### 1. Preference (domain + adapters)

New boolean preference `powerSaver` (default `false`), following the
`animatedBackground` pattern exactly:

- `PreferencesPort` gains `powerSaver$(): Observable<boolean>` and
  `setPowerSaver(on: boolean): void` (replay-current contract).
- `PreferencesSimulator` gains the backing BehaviorSubject + `powerSaver`
  seed field.
- `LocalStoragePreferencesAdapter` persists under `rtc-power-saver` via the
  existing `readBool`/`writeStored` helpers.

### 2. App layer (client-core)

- `PowerSaverPresenter` — a structural clone of
  `AnimatedBackgroundPresenter`: `enabled$` (shareReplay) + `set`/`toggle`.
  Registered in the composition root as `presenters.powerSaver`.
- `conflateWhen(flag$, ms)` — a small RxJS operator in
  `packages/client-core/src/presenters/conflateWhen.ts`: when `flag$` is
  `true`, the source is throttled to at most one emission per `ms`
  (leading + trailing, so the first tick after quiet is instant and the
  last tick in a burst is never lost); when `false`, the source passes
  through untouched. Flag changes switch live.
- `PriceStreamPresenter` and `PriceHistoryPresenter` accept
  `powerSaver$: Observable<boolean>` and pipe their cached streams through
  `conflateWhen`: prices at **250ms**, history (sparkline) at **1000ms**.
  Because `AnimationDirector` derives tick intents from the same conflated
  `priceFor` stream, flash frequency conflates automatically — no separate
  wiring.

### 3. View wiring (react-bindings + client-react)

- `createViewModel` exposes `usePowerSaver(): { enabled, setEnabled,
  toggle }` (same shape as `useAnimatedBackground`, via `bind`).
- A `PowerSaverRoot` effect component (mounted in `AppRoot` beside
  `ThemeProvider`, same "painting is the View's job" rationale) writes on
  `document.documentElement`:
  - `dataset.powerSaver = "true" | "false"` (test/e2e observability), and
  - the inherited custom property `--fx-play: paused | running`.

### 4. What power saver changes visually

| Element | Full experience | Power saver |
|---|---|---|
| Aurora layers, conic sweep, particle dots | rendered, drifting (per `animatedBackground` pref) | **not rendered at all** (`AmbientBackground` skips them — absent layers cost no compositing, unlike paused ones) |
| Background grid + vignette | rendered | rendered (static, cheap — keeps the HUD identity) |
| HUD logo orbit/triangle rotations | spinning | held still via `animation-play-state: var(--fx-play, running)` |
| Connection-dot pulse | pulsing | held still (same mechanism) |
| Neon glows / shadows / gradients | on | **unchanged** (static paint, zero per-frame cost) |
| Price tick flash | on | **unchanged** (functional feedback; compositor-only since PR #139) |
| Price update rate | every tick (~2–4/s per tile) | conflated to ≤4/s per tile (250ms) |
| Sparkline redraw | every tick | ≤1/s |

`AmbientBackground` computes its render from BOTH prefs: power saver ON
forces the cheap path regardless of `animatedBackground`; the underlying
pref value is preserved and honoured again once power saver goes OFF.

### 5. UI surfaces

- **PreferencesModal:** a real (wired) `PrefToggle` row "Power saver" at the
  top of the DISPLAY column, above "Animated background", description
  "Stills ambience & calms price updates. Best on slower hardware.",
  `testid="pref-toggle-powerSaver"`.
- **HeaderChrome:** a compact quick-toggle button (⌁ glyph) in the control
  cluster next to the theme-mode button; `aria-label="Toggle power saver"`,
  `aria-pressed` reflects state, lit accent style when active,
  `data-testid="power-saver-toggle"`.

### 6. Error handling

No new failure modes: preference reads fall back to `false` on
missing/invalid/throwing storage (existing `readBool` semantics); the
operator is pure; all streams are replay-current so no UI flash.

## Testing

- **Unit (domain):** `PreferencesSimulator` powerSaver seed/stream/set.
- **Unit (client-core):** `PowerSaverPresenter` (mirror of the
  AnimatedBackgroundPresenter test); `conflateWhen` with fake timers
  (passthrough when off, leading+trailing throttle when on, live flag flip);
  `PriceStreamPresenter`/`PriceHistoryPresenter` conflation gating.
- **Contract (client-react):** adapter persistence round-trip
  (`preferences.contract.test.ts` extension); `AmbientBackground` renders
  aurora/sweep/dots only when power saver is off; PreferencesModal row
  toggles the port; HeaderChrome quick toggle flips state + `aria-pressed`.
- **Visual goldens:** one additive App-level scenario `fx-power-saver`
  (power saver ON) in all three tiers — static by construction, so it is a
  stable golden. Regenerate ONLY the new goldens (both sets: x86 workflow +
  local arch), per the only-sync-changed-goldens rule.
- **e2e (Playwright):** toggle via header button → `data-power-saver`
  flips on `<html>` → reload → state persists.

## Acceptance criteria

1. Toggling power saver ON stills all decorative motion and removes the
   aurora/sweep/dots layers within one frame; OFF restores the previous
   experience exactly (including the user's animated-background choice).
2. With power saver ON, steady-state trace shows: no composite-failed
   animations, main-thread style recalcs only on conflated ticks
   (≤ ~10/s), GPU process ≤ ~5% on the reference machine.
3. Preference survives reload and is independent of theme skin/mode.
4. Full gauntlet green; only additive golden changes.
