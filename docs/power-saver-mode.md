# Power-Saver Mode

A persisted, ordered ladder — **Off → Calm → Freeze** — that trades the app's
ambient GPU load, price-driven re-render rate, and (at the top step) every
last piece of decorative motion for headroom on slow hardware, **without**
changing any functional behaviour: the market stays live and readable at
every step. Off by default; the full "wow-effect" experience stays the
default. `Freeze ⊇ Calm` — Freeze does everything Calm does, plus more.

- **Toggle it:** the compact `⌁` button in the header control cluster cycles
  `off → calm → freeze → off`; its fill glyph shows the current level
  (`○` off, `◐` calm, `●` freeze). The **Preferences → DISPLAY → "Power
  saver"** row is a segmented control `Off | Calm | Freeze` that jumps
  straight to any level — the back-stop for the cycler's "can't skip a step"
  limitation, and the screen-reader-friendly path. Both drive the same
  `powerSaverLevel` preference.
- **Persisted** under the `rtc-power-saver` key (localStorage on web,
  AsyncStorage on RN) as the level string, replayed on load with no flash.
  Legacy stored values from before the Freeze tier are migrated on read:
  `"true"` → `"calm"`, `"false"` / absent → `"off"`.
- **Master override:** at any level above Off, the cheap path is forced
  everywhere; your other preferences (animated background, theme skin/mode)
  are **not** rewritten and return intact when you drop back to Off.

See also the [rendering performance guide](performance.md) for why this floor
exists, the [original design spec](superpowers/specs/2026-07-09-power-saver-mode-design.md)
for the Calm-level rationale, and the
[Freeze-tier design spec](superpowers/specs/2026-07-18-power-saver-freeze-tier-design.md)
for the decisions behind this rewrite.

## What it changes

This table is the maintained source of truth for what each level does. Keep
it in sync with the implementation when the behaviour changes.

| Element | Off | Calm | **Freeze** |
|---|---|---|---|
| Ambient-style layers (aurora curtains or rays blobs+sweep) + dots | rendered | removed from DOM | removed from DOM |
| Logo spin, connection-dot pulse (`--fx-play`) | animating | paused | frozen |
| **Price tick-flash** | on | on | **frozen** |
| Price *number* + directional tint | live | conflated | conflated (same rate as Calm), **tint kept** |
| **CSS transitions** (panel maximize/restore, hover, modal, chrome) | on | on | **~instant (0.01ms)** |
| **FLIP tile/row reorder, rank-glide** (WAAPI) | glide | glide | **snap, no glide** |
| **Spinners, infinite pulses, row-flash keyframes** | on | on | **frozen** |
| FPS-meter `rAF` loop | running | running | **paused** |
| Boot splash canvas | plays | plays | **skipped** (persisted Freeze) |
| Static neon (box/text-shadow), grid, vignette | on | on | **kept** |
| Countdown fill bars (RFQ / credit) | animate | animate | **frozen bar — expiry still fires** |

**Countdown-bar trade-off:** the RFQ/credit countdown *fill bar* stops
sweeping under Freeze — the one accepted feedback loss. The expiry itself is
timer/data-driven, not tied to the visual sweep, so it **still fires on
time**; only the visual countdown is lost.

**Net effect (Calm, measured):** roughly 3–5 % GPU / ~3 % renderer at steady
state (down from ~35 % of one core on a 120 Hz display; measured on the **rays**
ambient style, but **aurora** now shares that floor since its curtain
`filter: blur()` was removed — see [performance.md](performance.md) P6b), while
the app stays fully functional and visually recognisable. Freeze removes the
app's remaining per-frame work on top of that — see below for why that matters
on hardware Calm alone doesn't fix.

## Why a Freeze tier exists

Calm was built on a "compositor-friendly" premise: `opacity`/`transform`
animations — the tick-flash, FLIP glides, panel transitions — are handed to
the GPU compositor and cost the main thread nothing, so Calm left them
running. That premise holds on any machine with a GPU. It does **not** hold
on a GPU-less Citrix / VDI thin client.

On a normal machine, the browser's compositor thread composites animated
layers directly on the GPU — the CPU is not involved once the layer exists.
On a GPU-less VDI box **there is no compositor**: the whole desktop,
including every "compositor-only" animation, is rasterised on the **CPU**,
then that rasterised frame is encoded (e.g. H.264) and streamed over the
network to the thin client as pixels. A tick-flash that is free on a laptop
becomes, on Citrix, a continuous **CPU-rasterise-plus-encode tax** — repeated
for every tile, on every tick, for as long as the market moves. Calm's
conflation slows the *rate* of that work; it does not remove it. Multiplied
across a blotter full of tiles, that residual per-frame cost is what still
makes the app "very junky" on real GPU-less hardware even with Calm on.

The fix isn't to make the motion cheaper — there's no cheaper primitive to
fall back to once you're off the compositor. The fix is to **stop the
per-frame work from happening at all**, which is what Freeze opts into.

Two things Freeze deliberately does *not* take away:

- **The numbers stay live.** A tile carries three signals on a price change:
  the number (plain text), a directional tint (static colour), and the
  tick-flash (a fading colour overlay). Freeze stops only the tick-flash — a
  pure animation — and reuses Calm's conflation for the number and keeps the
  tint. You lose the shimmer, not the market.
- **Static neon stays.** Once the UI is frozen and prices are conflated,
  repaints are rare — so a static `box-shadow` / `text-shadow` glow costs
  almost nothing to keep painted, and it's what makes the HUD still look like
  Reactive Trader rather than a plain data grid.

## How it works

- **Preference:** `PowerSaverLevel` (`"off" | "calm" | "freeze"`, an ordered
  enum) on `PreferencesPort` (domain), persisted by each client adapter,
  exposed to the app layer by `PowerSaverPresenter` as two derived streams:
  `isCalm$` (`level !== "off"`, drives everything Calm does today — unchanged
  behaviour, unchanged rates) and `isFreeze$` (`level === "freeze"`, drives
  everything below). Freeze reuses Calm's conflation verbatim; there is no
  separate Freeze-specific throttle.
- **`PowerSaverRoot`** (a document-effect component, React and Solid) writes
  the level string to `data-power-saver` on `<html>`, plus the inherited
  `--fx-play` custom property (`paused`/`running`) that Calm already used.
- **Global CSS catch-all (Approach A — not per-file gating):** each web
  client's non-module global stylesheet (`index.css`) carries:

  ```css
  [data-power-saver="freeze"] *,
  [data-power-saver="freeze"] *::before,
  [data-power-saver="freeze"] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  ```

  This is the deliberate choice over per-file gating: the whole point of
  "freeze *everything*" is that motion added to the app **later** is frozen
  automatically, which only a catch-all guarantees.

  **`0.01ms`, not `none`.** Setting the duration to (near-)zero rather than
  disabling animation entirely keeps two things working that `animation: none`
  would break: `forwards`-filled animations still resolve to their end state
  (fill confirmations, a countdown bar landing on "done"), and
  `animationend` / `transitionend` still fire — so any JS choreography
  waiting on those events does not hang.
- **JS gates (CSS can't reach imperative motion):**
  - **WAAPI** — `useFlipGrid` (tile/row FLIP glide, enter/exit) and
    `useRankGlide` (watchlist rank glide + highlight) already contained a
    `prefersReducedMotion()` no-op branch that snaps elements to their final
    position instead of calling `element.animate()`. Freeze threads `isFreeze`
    into that same branch — it reuses the reduced-motion no-op rather than
    adding a parallel code path.
  - **rAF** — `useLiveMetrics`'s permanent `requestAnimationFrame` loop for
    the FPS/MEM HUD readout is paused under Freeze; it shows the last sampled
    value instead of continuing to sample every frame.
  - **Boot** — `BootSequence` already skips its `rAF` canvas splash under
    `prefers-reduced-motion`. Because a persisted Freeze level is read before
    first paint (no flash), `PowerSaverRoot` sets the attribute early enough
    that `BootSequence` reuses the same skip path — a Freeze session never
    runs the boot animation.
  - Solid has the parallel gates in its hook/binding equivalents; the same
    global CSS block is duplicated in Solid's `index.css`.

## On GPU-less / VDI / Citrix hardware

[Why a Freeze tier exists](#why-a-freeze-tier-exists) covers the app-wide motion
cost on these boxes. The **ambient backdrop** has its own story worth calling
out. It is **pure CSS** — gradient layers animated only with
`transform`/`opacity` (`AmbientBackground.module.css`) — unlike the **boot
splash**, which draws on a 2D `<canvas>` and falls back to a static frame when
`getContext("2d")` is unavailable *or* `prefers-reduced-motion` is set
(`BootSequence.tsx`). So on a locked-down VDI/Citrix image the backdrop still
**paints** even when the boot animation doesn't — and what it *costs* has two
independent brakes:

- **Automatic — `prefers-reduced-motion: reduce`.** An `@media` block in
  `AmbientBackground.module.css` sets `animation: none` on every animated layer
  (aurora curtains + blobs, rays blobs + sweep, grid, dots), so the backdrop
  paints but is **frozen static** — the same visual as turning **Animated
  background** off. Many enterprise VDI/Citrix images set this flag (also the
  usual reason the boot splash doesn't play).
- **Manual — power saver (Calm or Freeze).** Removes the active style's animated
  layers from the DOM entirely (see [What it changes](#what-it-changes)).

**The gap to know about:** there is **no automatic no-GPU detection** (see the
No-auto-detection non-goal below). A GPU-less box that does *not* set
reduced-motion and does not have power saver on still runs the backdrop's
`transform`/`opacity` animations on the **CPU software compositor**. The backdrop
carries **no `filter`s** — the aurora curtain bands' `filter: blur()` was removed
(see [performance.md](performance.md) P6b) — so that is plain compositing, not
per-frame filter re-evaluation: cheaper than it once was, but still not free on
a permanently-animated full-viewport layer. Fix: the image sets
`prefers-reduced-motion`, or the user picks Calm/Freeze.

## Non-goals

- **No auto-detection.** Every level is a manual choice — no Battery /
  `deviceMemory` heuristics select Calm or Freeze automatically.
- **No further price slowdown in Freeze.** Freeze reuses Calm's conflation
  rates as-is; it removes the *flash*, not the *data* — prices update at the
  same conflated cadence as Calm.
- **No new low-power theme skin.** Every level composes with every skin.
- **No server/protocol changes.** Both conflation and the Freeze gates are
  client-side, in the presenters and the UI shell.
- **RN Freeze visuals are deferred.** React Native accepts and persists the
  `PowerSaverLevel` enum (parity on the preference plumbing) but currently
  renders Freeze the same as Calm — no CSS-catch-all equivalent, no RN-side
  motion gating yet. Tracked in [STATUS.md](STATUS.md) and the
  [RN mobile-v1 rehaul spec](superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md).

## Future iterations

- **Aggressive "freeze everything" tier — SHIPPED.** This is that tier: on
  top of Calm, Freeze also stills the price tick-flash, snaps FLIP/rank-glide
  instead of animating it, and collapses every CSS transition/keyframe to a
  near-zero duration — trading the last slice of decorative feedback for the
  render cost that still hurt GPU-less Citrix/VDI boxes with only Calm on.
- **Instant refresh on toggle.** *(still open)* After the `conflateWhen`
  resubscribe fix, flipping power saver on no longer emits an instant
  "leading" replay of the current price — the first throttled emission waits
  for the next real tick. This is arguably more correct, but if a future UX
  wants an immediate refresh when jumping to Calm or Freeze, it would need an
  explicit replay-on-flip.
- **Auto-degrade on GPU-less hardware.** Today only `prefers-reduced-motion`
  freezes the backdrop automatically; a GPU-less box that doesn't set that flag
  still animates on the CPU (see [On GPU-less / VDI / Citrix
  hardware](#on-gpu-less--vdi--citrix-hardware)). A boot-time probe
  (`hardwareConcurrency`, a WebGL-context check, or a first-frame timing sample)
  could auto-select Calm/Freeze — closing the gap without a user toggle.
  Deliberately not built yet (see the No-auto-detection non-goal); heuristics
  misfire, and the current design prefers an explicit choice.
