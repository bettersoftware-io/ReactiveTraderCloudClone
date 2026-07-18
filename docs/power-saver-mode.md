# Power-Saver Mode

One persisted toggle that trades the app's ambient GPU load and price-driven
re-render rate for headroom on slow hardware — **without** changing any
functional behaviour or the app's still visuals. It is off by default; the
full "wow-effect" experience stays the default.

- **Toggle it:** the compact `⌁` button in the header control cluster, or the
  **Preferences → DISPLAY → "Power saver"** row. Both drive the same
  preference.
- **Persisted** under the `rtc-power-saver` localStorage key (AsyncStorage on
  RN), replayed on load with no flash.
- **Master override:** while on, the cheap path is forced everywhere; your
  other preferences (animated background, theme skin/mode) are **not**
  rewritten and return intact when you toggle it back off.

See also the [rendering performance guide](performance.md) for why this floor
exists, and the [design spec](superpowers/specs/2026-07-09-power-saver-mode-design.md)
for the original rationale.

## What it changes

This table is the maintained source of truth for what the button does. Keep it
in sync with the implementation when the behaviour changes.

| Element | Full experience (OFF) | Power saver (ON) |
|---|---|---|
| Ambient-style layers (whichever of Aurora curtains / rays blobs+sweep is selected), particle dots | rendered, drifting (per the animated-background preference) | **not rendered at all** — the layers are removed from the DOM (absent layers cost no compositing, unlike paused ones); this applies to either `ambientStyle` equally — the Aurora curtain bands (`.auroraCurtainA`/`B`/`C`) and blobs are omitted just like the rays blobs/sweep are |
| Background grid + vignette | rendered | **rendered** (static, cheap — keeps the HUD identity) |
| HUD logo orbit / triangle rotations | spinning | **held still** (`animation-play-state: paused`) |
| Connection-status dot pulse | pulsing | **held still** (same mechanism) |
| Neon glows / shadows / gradients | on | **unchanged** (static paint, zero per-frame cost) |
| Price tick-flash | on | **unchanged** — kept as functional market feedback (compositor-only since the perf round) |
| Price update rate (tiles) | every tick (~2–4/s per tile) | **conflated** to ≤ ~4/s per tile (250 ms, leading + trailing) |
| Sparkline / price-history redraw | every tick | **conflated** to ≤ ~1/s (1000 ms) |

**Net effect:** roughly 3–5 % GPU / ~3 % renderer at steady state (down from
~35 % of one core on a 120 Hz display), while the app stays fully functional
and visually recognisable — dark HUD, glows, and tick-flashes remain; it is
just still and calm.

## How it works

- **Preference:** a `powerSaver` boolean on `PreferencesPort`
  (domain), persisted by each client adapter, exposed to the app layer by
  `PowerSaverPresenter` and to React by the `usePowerSaver()` view-model hook.
- **Visual gating (two mechanisms):**
  - `PowerSaverRoot` (a document-effect component) writes
    `data-power-saver` and the inherited `--fx-play` custom property
    (`paused` / `running`) on `<html>`. Every decorative CSS animation reads
    `animation-play-state: var(--fx-play, running)`, so they all still
    together from one place — the same idiom as the ambient-background
    `--amb-play` variable.
  - `AmbientBackground` reads `usePowerSaver()` directly and **removes**
    whichever `ambientStyle` layer group is active (Aurora curtains or rays
    blobs+sweep) plus the dots layer from the DOM (cheaper than pausing
    them). The `ambientStyle` preference itself is unaffected — power saver
    only decides whether the selected style's animated layers mount, not
    which style is selected.
- **Data-rate gating:** a small `conflateWhen(flag$, ms)` RxJS operator wraps
  the cached price and price-history streams in `client-core`. While the flag
  is on it throttles (leading + trailing) to one emission per `ms`; while off
  it passes through untouched, switching live on toggle. Because the
  `AnimationDirector` derives tick intents from the same conflated stream,
  flash frequency conflates automatically — no separate wiring.

> **Note:** `conflateWhen` multicasts its source with a deferred refcount reset
> (`share({ resetOnRefCountZero: () => timer(0) })`) so a toggle does **not**
> tear down and re-subscribe the underlying stream — the price-history rolling
> buffer survives a flip. See the operator's tests for the regression guard.

## Non-goals (current design)

- **No auto-detection.** Manual toggle only — no Battery/`deviceMemory`
  heuristics.
- **Live prices stay visible.** Power saver calms the *rate* of price updates
  and stills *decorative* motion, but deliberately keeps the price tick-flash
  and the moving numbers — the point is to cut GPU load, not to blind you to
  the market. (See "Future iterations" for when we might revisit this.)
- **No new low-power theme skin** — it composes with every skin.
- **No server/protocol changes** — conflation is client-side, in the
  presenters.

## Future iterations

Ideas we may pursue if the current mode isn't enough — captured here so we
track them rather than re-discovering them:

- **Aggressive "freeze everything" tier.** If performance on GPU-less VDI /
  Citrix boxes is still poor with power saver on, add a stronger step that
  *also* stills the price tick-flash and further conflates (or pauses) price
  motion — accepting reduced live-market feedback in exchange for the last
  slice of render cost. This is a deliberate scope extension beyond the
  current "keep the market visible" design, gated on real measurements from
  those environments.
- **Instant refresh on toggle.** After the `conflateWhen` resubscribe fix,
  flipping power saver *on* no longer emits an instant "leading" replay of the
  current price — the first throttled emission waits for the next real tick.
  This is arguably more correct, but if a future UX wants an immediate refresh
  when toggling, it would need an explicit replay-on-flip.
