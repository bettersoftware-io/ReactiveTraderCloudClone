# Power-Saver "Freeze" Tier — Design

**Status:** approved, pre-implementation
**Date:** 2026-07-18
**Supersedes/extends:** [`2026-07-09-power-saver-mode-design.md`](2026-07-09-power-saver-mode-design.md) — realises that spec's "Future iterations → aggressive freeze-everything tier."

## Problem

The shipped power-saver mode (the "Calm" behaviour) calms the app's ambient GPU
load and price re-render rate but **deliberately keeps the market moving** —
price tick-flashes still fire, FLIP tile/row reordering still glides, panel
transitions still play. On real GPU-less Citrix / VDI boxes this is still
"very junky": every one of those still counts, because there is no GPU to
absorb it.

**Why "compositor-friendly" isn't free on Citrix.** On a normal machine an
`opacity`/`transform` animation is handed to the GPU compositor and costs the
main thread nothing. On a GPU-less VDI box there *is* no compositor: every
frame is rasterised on the CPU and then encoded and streamed to the thin client
as pixels. So a "compositor-only" tick-flash — cheap on a laptop — becomes a
continuous CPU-rasterise-plus-encode tax, multiplied across every tile, every
tick, forever. The fix is not to make the motion cheaper; it is to **stop the
per-frame work happening at all** when the user opts in.

## Goal

Add a third, stronger power-saver step — **Freeze** — that disables *all*
decorative motion so the app is snappy on GPU-less hardware, while keeping the
market fully **readable** (live numbers, direction colour) and the HUD visually
recognisable (static neon kept). Freeze is a superset of Calm.

## Decisions (all confirmed in brainstorming)

1. **Two levels, not a redefinition.** Keep today's Calm mode and add Freeze
   above it: an ordered ladder **Off → Calm → Freeze**, where `Freeze ⊇ Calm`.
2. **Freeze kills motion only; static neon stays.** Animated pulses, flashes,
   transitions, FLIP/glide are all stopped. Static `box-shadow` / `text-shadow`
   neon is **kept** — once the app is frozen and conflated, repaints are rare,
   so static glow costs almost nothing and preserves the HUD identity.
3. **Tick-flash is frozen, price stays live.** A tile carries three signals on
   a price change: the *number* (plain text), a *directional tint* (static
   colour on the pips), and the *tick-flash* (a fading colour overlay). Only
   the tick-flash is an animation. In Freeze the number still updates
   (conflated, as Calm) and the direction tint stays — you lose only the fading
   pulse, not any price information.
4. **Controls:** a **cycling header button** (`off → calm → freeze → off`, icon
   fill shows level `○ ◐ ●`) plus a **segmented control** `Off | Calm | Freeze`
   in Preferences. Both drive the same preference.
5. **Client scope:** the preference plumbing lands in **every** client (parity);
   the Freeze *visuals* ship in **React + Solid** now. **RN** accepts the enum
   but renders Freeze the same as Calm for now (tracked follow-up).
6. **Mechanism: Approach A — global CSS catch-all + JS gates**, not per-file
   gating. The whole point of "freeze *everything*" is that motion added later
   is frozen automatically; a catch-all guarantees that where per-file opt-in
   cannot.
7. **Documentation is a first-class deliverable**, including the
   compositor-vs-CPU-raster rationale above.

## 1. Preference model — `boolean` → ordered enum

`PreferencesPort` today:

```ts
powerSaver$(): Observable<boolean>;
setPowerSaver(on: boolean): void;
```

becomes an ordered three-state:

```ts
// @rtc/domain
export type PowerSaverLevel = "off" | "calm" | "freeze";

powerSaverLevel$(): Observable<PowerSaverLevel>;
setPowerSaverLevel(level: PowerSaverLevel): void;
```

- **Rename the accessor, do not merely retype it.** Every current consumer does
  a truthy test (`if (powerSaver)`, `powerSaver ? …`). If we kept the name and
  changed only the type `boolean → PowerSaverLevel`, `"off"` would be truthy and
  every guard would silently break with **no compile error**. Renaming
  `powerSaver → powerSaverLevel` turns each of the consumers into a compile
  error, forcing every site to be revisited deliberately.
- **Storage & migration.** Same key `rtc-power-saver` (localStorage on web,
  AsyncStorage on RN); the stored value is now the level string. Read-time
  legacy migration: `"true" → "calm"`, `"false"` / absent → `"off"`. Domain
  default is `"off"`. Writing always writes the new string form.
- **`Freeze ⊇ Calm` derivation.** `PowerSaverPresenter` exposes the level and two
  derived predicates the app consumes:
  - `isCalm$ = level !== "off"` — drives **everything Calm does today**: ambient
    layers removed, `--fx-play: paused`, price/history conflation. Unchanged
    behaviour, unchanged rates.
  - `isFreeze$ = level === "freeze"` — drives the **new** catch-all + JS gates.
  - Freeze reuses Calm's conflation rates verbatim; **no new throttle wiring.**

## 2. UI controls

Both controls read and write the same `powerSaverLevel`.

- **Header cycler** (`PowerSaverToggle`): a single button that cycles
  `off → calm → freeze → off` on click. The `⌁` icon carries a fill indicator
  (`○` off, `◐` calm, `●` freeze). `aria-label` announces the current level and
  the next action, e.g. *"Power saver: Calm. Activate to switch to Freeze."* —
  so the cycling control is still describable to assistive tech.
- **Preferences → DISPLAY**: the "Power saver" row becomes a **segmented
  control** `Off | Calm | Freeze`, allowing a direct jump to any state. This is
  the primary/back-stop path — it covers the cycler's "can't go straight to a
  state" weakness and is the screen-reader-friendly control.

## 3. Freeze mechanism (Approach A) — React and Solid

### 3a. Global CSS catch-all

Added to each web client's **non-module** global stylesheet (`index.css`), so it
can legitimately select `*`:

```css
[data-power-saver="freeze"] *,
[data-power-saver="freeze"] *::before,
[data-power-saver="freeze"] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;   /* stop infinite loops re-firing */
  transition-duration: 0.01ms !important;
}
```

`PowerSaverRoot` already writes `data-power-saver` on `<html>`; it now writes the
level string, so `="freeze"` activates this rule. Using `0.01ms` rather than
`none` is deliberate: `forwards` animations still resolve to their end state
(e.g. fill confirmations, countdown bars land on "done") and
`animationend` / `transitionend` events still fire, so any JS choreography
waiting on them does not hang.

This is the standard reduced-motion kill-switch pattern; it is a broad
`!important` hammer, so the plan includes a quick audit that no
*correctness*-critical transition depends on a non-trivial duration (there are
very few, and none identified as load-bearing in the current inventory).

### 3b. JS gates (CSS cannot reach imperative motion)

- **WAAPI** — `useFlipGrid` (tile/row FLIP glide + enter/exit) and
  `useRankGlide` (watchlist rank glide + highlight) already contain a
  `prefersReducedMotion()` no-op branch that snaps elements to their final
  position without calling `element.animate()`. Thread `isFreeze` in and reuse
  that exact branch.
- **rAF** — `useLiveMetrics` runs a permanent `requestAnimationFrame` loop for
  the FPS/MEM HUD readout. Pause it under Freeze (display the last sampled
  value, or `—`).
- **Boot** — `BootSequence` already skips its `rAF` canvas splash under
  `prefers-reduced-motion`. A persisted Freeze level is read on load (no flash),
  so `PowerSaverRoot` sets the attribute early and `BootSequence` reuses the
  same skip path — a Freeze box never runs the boot animation.

Solid gets the parallel gates in its hook/binding equivalents; the global CSS is
copied to Solid's `index.css`.

## 4. Behaviour matrix — what Freeze changes vs. keeps

| Element | Off | Calm (today) | **Freeze (new)** |
|---|---|---|---|
| Ambient aurora / sweep / dots | rendered | removed from DOM | removed from DOM |
| Logo spin, connection-dot pulse (`--fx-play`) | animating | paused | frozen |
| **Price tick-flash** | on | on | **frozen** |
| Price *number* + directional tint | live | conflated | **conflated (same as Calm), tint kept** |
| **CSS transitions** (panel maximize/restore, hover, modal, chrome) | on | on | **~instant (0.01ms)** |
| **FLIP tile/row reorder, rank-glide** (WAAPI) | glide | glide | **snap, no glide** |
| **Spinners, infinite pulses, row-flash keyframes** | on | on | **frozen** |
| FPS-meter `rAF` loop | running | running | **paused** |
| Boot splash canvas | plays | plays | **skipped** (persisted Freeze) |
| Static neon (box/text-shadow), grid, vignette | on | on | **kept** |
| Countdown fill bars (RFQ / credit) | animate | animate | **frozen bar — expiry still fires** |

**Accepted feedback loss (one item):** the RFQ/credit countdown *fill bars* stop
sweeping under Freeze. The expiry itself is timer/data-driven and still fires on
time — only the visual sweep is lost. This is called out explicitly in the docs.

## 5. Scope & follow-up

- **Preference plumbing (all clients):** `PreferencesPort`, `PreferencesSimulator`,
  the three storage adapters (React localStorage, Solid localStorage, RN
  AsyncStorage), the shared `PreferencesPortContract`, `PowerSaverPresenter`, and
  both framework bindings' `createViewModel`.
- **Freeze visuals (now):** React + Solid.
- **Deferred:** RN Freeze visuals — RN accepts the enum but renders Freeze as
  Calm for now. Tracked in `docs/STATUS.md` and the RN mobile-v1 rehaul spec.

## 6. Documentation

Rewrite `docs/power-saver-mode.md`:

- Three-column **Off / Calm / Freeze** behaviour table (the matrix above).
- The `PowerSaverLevel` enum, the storage key, and the legacy→enum migration.
- The two controls (header cycler + Preferences segmented control).
- A **"Why a Freeze tier exists"** narrative capturing the
  compositor-friendly-on-a-GPU vs. CPU-rasterised-and-streamed-on-Citrix
  reasoning: why even a "static" or "compositor-only" animation still burns a
  GPU-less VDI box, why stopping per-tick repaints is the actual win, and why
  the numbers stay live (you lose the shimmer, not the market).
- Graduate the "Future iterations → aggressive freeze" item to **shipped**;
  keep the "instant refresh on toggle" item as still-open.
- Note the countdown-bar feedback trade-off.
- Cross-link from `docs/performance.md`.

## 7. Tests & goldens

- **Preference contract** (`describePreferencesPortContract`): replace the
  boolean clauses with enum clauses — default `"off"`; set each of the three
  levels and assert push to subscribers; seeded read-back per level; **legacy
  `"true" → "calm"` read-migration**.
- **Both bindings' `createViewModel` tests:** updated for the level and the
  `isCalm` / `isFreeze` derivations.
- **Shared UI contract** (`@rtc/ui-contract`, `shell/power/`): extend the
  existing power-saver specs for three states. Because Solid now implements
  Freeze visuals, these run green against **both** React and Solid via the
  swap-trio — no `notYetPortedSpecs` exclusion needed (and the React-only
  isolation from the original workstream is retired for these specs).
- **Visual goldens:** add a Freeze scenario to the visual matrix. A frozen UI is
  maximally stable to snapshot (no motion → no flake).
- **E2E** (Playwright): cycle the header button through the three states, assert
  `data-power-saver="freeze"` on `<html>`, and assert a representative animated
  element resolves to a ~0 effective duration under Freeze.

## 8. Blast-radius checklist

Derived from prior preference-change scars — a single preference touches all of:

- `@rtc/domain`: `PreferencesPort` + `PreferencesSimulator` + `PowerSaverLevel` type
- `PreferencesPortContract` (shared contract)
- Three storage adapters: React localStorage, Solid localStorage, RN AsyncStorage
- `client-core`: `PowerSaverPresenter` + composition wiring + `conflateWhen` flag source
- Both bindings' `createViewModel` (+ their tests)
- `PowerSaverRoot` (React + Solid)
- Both header togglers (`PowerSaverToggle` React + Solid)
- Both Preferences modals (React + Solid)
- Global `index.css` catch-all (React + Solid)
- WAAPI hooks (`useFlipGrid`, `useRankGlide`) + `useLiveMetrics` rAF (React + Solid equivalents)
- Grep-gates / eslint-selectors keyed on the literal `powerSaver` name
- `docs/power-saver-mode.md`, `docs/performance.md` cross-link, `docs/STATUS.md`

## Non-goals

- **No auto-detection.** Still a manual control — no Battery / `deviceMemory`
  heuristics selecting Freeze automatically.
- **No further price slowdown in Freeze.** Freeze reuses Calm's conflation rates;
  it removes the *flash*, not the *data*.
- **No new low-power theme skin.** Freeze composes with every skin.
- **No server/protocol changes.**
- **No RN Freeze visuals in this workstream** (deferred, tracked).
