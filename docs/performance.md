# Rendering Performance — Traps, Patterns, and How to Profile

This guide records what the July 2026 performance rounds found and fixed
(PR #139 — FX/shell, PR #141 — Credit/Equities), so the same traps are not
reintroduced. The app is a permanently-animated HUD over a live data stream:
**any per-frame main-thread work multiplies with every frame the app
produces, forever.** Before those rounds the app burned ~70% of a core in
steady state (fans audible); after them, steady-state main-thread work is
tick-driven only and every animation runs on the compositor.

The one-sentence rule: **steady-state animations may touch only `transform`
and `opacity`, with literal keyframe values, one animation per property per
element** — everything else runs on the main thread every frame it is
active, no matter how small the element.

---

## 1. The trap catalogue

Every entry below was found live in this codebase and confirmed by traces.
"Main thread" here means: Chrome re-resolves the element's style (and often
layout and paint) on **every frame** for the animation's whole lifetime.

| # | Trap | Why it burns | Found in |
|---|------|--------------|----------|
| T1 | Keyframes/transitions on `width`, `height`, `padding`, `margin`, `left/top` | Layout property → style + **layout** every frame. Layout invalidates subtrees, not just the element. | RfqCard countdown bar, FX RfqCountdown, pips tick flash (`padding`) |
| T2 | Keyframes/transitions on `background-*`, `color`, `border-color`, `box-shadow`, `text-shadow` | Paint property → style + paint every frame. `box-shadow` repaints an inflated area. | pips flash + transition, accept-button pulse, ticket fill flash, blotter row flashes, last-price color transition |
| T3 | Animating `transform` on **SVG child elements** (`circle`, `g`, `path`) | SVG-internal transforms are *never* compositor-offloaded. | HudLogo orbit/triangle rotations |
| T4 | `transform: scaleX(var(--x))` (or any var()-dependent transform) in a transition/animation | The compositor cannot resolve `var()`; the animation silently falls back to the main thread. **Timing** vars (`animation-duration: var(--d)`) are fine — they resolve once at creation. | RfqCard bar, first fix attempt |
| T5 | Two animations of the **same property** on one element | Chrome refuses to composite the element wholesale (`kTargetHasIncompatibleAnimations`, `compositeFailed` bit 64) — even if both properties are compositable, even if they don't overlap in time (a comma-separated `animation` list counts). | accept button `acceptIn` + `acceptPulse` |
| T6 | `filter: blur()` (or any filter) on large layers | Filters are re-evaluated at **composite time**: every frame produced by *anything else* re-pays the filter, even when the filtered layer itself is static or its animation is paused. | AmbientBackground aurora layers (viewport-sized blur 46/58px) |
| T7 | Animating `background-position` | Paint property on the whole element — a full-viewport grid repainted every frame. | AmbientBackground grid/dot drift |
| T8 | JS/WAAPI `element.animate()` with non-compositable properties | Same rules as CSS — `boxShadow` keyframes via WAAPI are main-thread, and (per T5) they drag sibling compositable animations on the same element down with them. | watchlist rank-glide highlight |
| T9 | Freshly-inserted animated overlays without `will-change` | Chrome may not promote a just-mounted element in time; even an opacity-only animation then ticks on the main thread. | watchlist `.flashPulse`, connection-dot pulse |
| T10 | Per-tick style/geometry writes driving a transition (`--pct` written every second + `transition`) | Every write retargets the transition → a new main-thread animation segment per tick → effectively continuous. | both countdown bars |
| T11 | "Event-driven" flashes that the simulator makes continuous | A 0.6s one-shot is harmless at 1/minute and catastrophic at 4/s. Triage by **measured frequency**, not by how the trigger is named. | OrderTicket fill flash (sim auto-fills ~4/s) |

Two systemic effects make single offenders expensive:

- **One main-thread animation wakes everything.** While any main-thread
  animation is active, Chrome runs a style-recalc pass every frame, and every
  *other* active animation gets style-synced in that pass. Trace entries for
  properly-composited animations often vanish once the one real offender is
  fixed — find the driver, don't chase the piggybackers.
- **The frame pipeline never idles while any animation runs.** Ambient
  compositing cost (T6) is paid per frame produced by anything — the two
  multiply.

---

## 2. Fix patterns (all keep the visuals)

**P1 — Progress bars: mount-once drain animation.**
Never transition `width` (T1) or `scaleX(var())` (T4). Give the fill
`width: 100%; transform-origin: left` and one animation with **literal**
keyframes `scaleX(1) → scaleX(0)`, timed by custom properties written once
at mount: `animation: drain var(--duration) linear var(--delay) forwards`,
where `--delay` is *negative elapsed time* to fast-forward a mid-life mount.
In React, freeze the timing with a `useState` initializer (never
`ref.current` in render — lint enforces it). The caption/warn threshold can
keep re-rendering per tick; the bar's progression is owned by CSS.
See `RfqCard.module.css` / `RfqCountdown.tsx`.

**P2 — Glows and fills: baked-shadow overlay, animate opacity.**
Put the target look (box-shadow, border ring, background fill) **statically**
on a dedicated overlay (`::before`/`::after` with `inset: 0`, or a real
child span when JS needs to find it), and animate only the overlay's
`opacity` (plus `transform` for a throb — different properties compose fine
in ONE animation). Remember: `pointer-events: none` when it covers controls;
`z-index: -1` + `isolation: isolate` on the parent to sit under text;
`will-change: opacity` (T9). See `QuoteRow.module.css`,
`OrderTicket.module.css`, `WatchlistRow.module.css` (`.rankGlow`).

**P3 — Text color inversion: mirror the text into the overlay.**
You can't cheaply animate `color`, but you can fade an opaque pre-rendered
copy: `content: attr(data-value) / ""` on the overlay carries the digits in
the inverted colour; the trailing `/ ""` is mandatory (without it the a11y
tree announces the text twice and breaks name-based selectors). See the pips
tick flash in `TilePrice.module.css`.

**P4 — Rotating SVG parts: rotate an HTML wrapper.**
Stack multiple SVGs; the rotating parts live in absolutely-positioned HTML
`<span>` wrappers that carry the `animation` (T3). Square wrappers make the
default 50% transform-origin equal the viewBox centre. See `HudLogo.tsx`.

**P5 — Pattern drift: oversized layer + translate3d.**
Instead of animating `background-position` (T7), oversize the layer by one
pattern tile and translate it. A diagonal translate of a line grid is
visually identical to per-axis background drift because each line set is
invariant along its own axis. See `AmbientBackground.module.css`.

**P6 — Soft ambient blobs: bake blur into gradients.**
Replace `filter: blur(46px)` on gradient layers (T6) with a slightly larger
radius and an eased mid-stop in the gradient itself — visually
indistinguishable on already-smooth radial gradients, and it eliminates the
per-frame composite-time filter cost.

**P7 — One animation per property per element (T5).**
When an element needs an intro pop *and* an infinite throb, split them:
intro on the element (or `::before`), throb on `::after`. A single animation
may move `opacity` **and** `transform` together — that's still one animation
per property.

**P8 — Delete invisible motion.**
A uniform solid circle rotating is a visual no-op that still costs per-frame
work (`PositionsPanel` bubble ring). Check whether the motion is observable
before porting it.

---

## 3. How to profile (the recipe that found all of this)

1. **Steady state, per tab, with the tab exercised.** Record ~12s DevTools
   traces without reload. **Put the tab in its live state first** — an idle
   Credit tab measured clean; with three live RFQs it was the worst surface
   in the app. Raise RFQs, let quotes arrive, let the sim fill orders.
2. **Read four numbers**: per-thread busy (GPU main / renderer main / Viz /
   renderer compositor as % of span) and recalcs/layouts/paints per second.
   A healthy idle tab has recalcs at the *data* rate (a few per second);
   recalcs ≈ display Hz means a main-thread animation is alive.
3. **Name the offenders** from `StyleRecalcInvalidationTracking` /
   `LayoutInvalidationTracking` args (`reason` + `nodeName` carries the CSS-
   module class) and from `Animation` events with `compositeFailed` /
   `unsupportedProperties` — the failure lists the exact guilty properties;
   bit 64 with an empty list = incompatible-animations (T5).
   `document.getAnimations()` in the console names every live animation and
   transition (WAAPI ones show up as bare `Animation`).
4. **Attribute causally**: pause/hide a suspect (`anim.pause()`,
   `display: none` via console) and re-trace. Numbers, not vibes.
5. **Verify the fix the same way**: the exit criterion is *zero*
   `compositeFailed` events and recalcs back at data rate — not "it feels
   smoother". A composited animation still shows a few style-sync entries
   piggybacking on tick-driven recalc passes; that's fine (see §1).
6. **Beware measurement pollution**: one trace captures *all* open tabs of
   the profiled browser, and dev-server (unminified React) numbers carry
   ~5-7 points of main-thread overhead a production build doesn't have —
   compare like against like.

The session-scriptable variant (Playwright drives the tab into its live
state, `chromium` `browser.startTracing` captures the same trace format) was
used for the #141 round; any Chrome trace JSON works with the same event
names.

---

## 4. Non-rendering learnings from the rounds

- **Interaction-triggered sub-second transitions are fine.** Hover/click
  transitions (`transition: background 0.15s` on buttons) run rarely and
  briefly — do not churn the codebase converting them. Triage by measured
  duty cycle (T11), fix what traces show hot.
- **Making the app faster can flip timing-marginal tests.** The e2e
  "confirmation is dismissible" test passed only while the 5s auto-dismiss
  timer beat its 5s hide-assertion — the optimized app lost that race
  deterministically. When a test reddens after a perf change, check whether
  it ever tested what it claims (the fix was making the page object click
  the actual DISMISS control). Assertion windows must not equal the timers
  they race.
- **These fixes are golden-stable.** Both rounds shipped with zero visual-
  golden churn: captured states render identically because only *how* the
  motion runs changed. If a compositor-only conversion diffs a golden, the
  static state regressed — fix the code, don't regenerate.
- **The residual cost is a product decision.** After both rounds the
  steady-state floor is the ambient backdrop compositing (~5-8% GPU per
  tab) plus tick-driven React rendering — that's the wow-effect and the
  live stream, by design. The **power-saver mode** trades that floor away on
  slow hardware (one toggle → still ambience + conflated price re-renders);
  what it disables vs keeps is documented in
  [power-saver-mode.md](power-saver-mode.md).

---

## 5. Checklist for new animated UI

Before merging any CSS/WAAPI animation that runs in steady state (or can be
made steady-state by streaming data):

- [ ] Animates only `transform`/`opacity`? (T1/T2/T8)
- [ ] Keyframe values literal — no `var()` inside `transform`? (T4)
- [ ] One animation per property per element? (T5)
- [ ] Target is an HTML element, not an SVG child? (T3)
- [ ] Overlay carries any shadow/fill/border look statically? (P2)
- [ ] `will-change` on freshly-mounted animated overlays? (T9)
- [ ] Driven by a mount-once animation, not per-tick style writes? (T10/P1)
- [ ] How often does live data trigger it — per minute or per second? (T11)
- [ ] Verified: a steady-state trace shows zero `compositeFailed` events.
