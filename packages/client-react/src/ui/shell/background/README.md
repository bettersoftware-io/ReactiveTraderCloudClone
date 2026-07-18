# AmbientBackground — the aurora/rays backdrop

The decorative backdrop painted behind the whole workspace: one of two
user-selectable animated **ambient styles** — drifting **aurora** curtains or
the original **rays** blobs + sweep — plus a static **line grid**, a **dot
field**, and a static **vignette**. This note explains how each style is
made, how heavy it is, and how the style + on/off settings are stored.

## Is it all CSS? — Yes, entirely

`AmbientBackground.tsx` is a small dumb component. It reads the
`animatedBackground` / `powerSaver` / `ambientStyle` preferences and sets
exactly one CSS custom property:

```tsx
style={{ "--amb-play": enabled && !powerSaver ? "running" : "paused" }}
```

Every layer's motion is a CSS `@keyframes` animation whose
`animation-play-state` inherits that variable. There is **no JavaScript
animation, no `<canvas>`, no `requestAnimationFrame`** — the component paints
nothing itself and holds no data (it's `aria-hidden`, `pointer-events: none`
dead chrome). All the work is in `AmbientBackground.module.css`.

## Two mutually-exclusive ambient styles

The `ambientStyle` preference (`"aurora" | "rays"`, default **`"aurora"`**)
picks exactly one layer group, rendered conditionally and reflected on the
wrapper as `data-ambient-style` / `data-layer`:

- **`"rays"`** (`data-layer="rays"`) — the original v2 backdrop: two blurred,
  theme-tinted `radial-gradient` blobs (`.layerA`/`.layerB`) plus one rotating
  `conic-gradient` wedge (`.sweep`).
- **`"aurora"`** (`data-layer="aurora-curtains"`) — northern-lights curtains:
  two soft `radial-gradient` blobs on a **fixed** (non-theme-tinted)
  green/teal/sky/purple/magenta palette (`.auroraBlobA`/`.auroraBlobB`) plus
  three drifting `repeating-linear-gradient` comb bands
  (`.auroraCurtainA`/`B`/`C`, keyframes `aurora-c`/`aurora-d`/`aurora-e`) and a
  static top-down wash (`.auroraWash`). The palette is deliberately fixed so
  it reads as an aurora in every skin, unlike the rays style which tints
  itself from the active theme's accent colours.

Both styles share the drifting grid, the drifting dot field, and the static
vignette described below. Power saver removes whichever style's animated
layers are active from the DOM outright (see "How heavy is it?" below) — it
never leaves them paused.

## The layers

Painted bottom-to-top, all inside a `.wrap` that is `position: absolute; inset: 0`:

| Layer | Style | What it is | Animation |
|-------|-------|-----------|-----------|
| `.aurora > .layerA` / `.layerB` | rays | two multi-stop `radial-gradient` colour blobs, theme-tinted | `translate3d` + `scale` drift, 52s / 68s |
| `.sweep` | rays | one `conic-gradient` wedge (`transparent → accent → transparent`) | `rotate` 360° / 90s — the "ray" |
| `.auroraWrap > .auroraBlobA` / `.auroraBlobB` | aurora | two multi-stop `radial-gradient` colour blobs, fixed palette | `translate3d` + `scale` drift, 52s / 68s |
| `.auroraCurtainA` / `B` / `C` | aurora | `repeating-linear-gradient` comb bands, `mask-image`-faded top→bottom | `translate3d` + `skewX` + `scaleY` sway, 44s / 61s / 27s |
| `.auroraWash` | aurora | a static top-down `linear-gradient` wash | none |
| `.grid` | both | two `linear-gradient`s (h-lines + v-lines), 48px tile | `translate3d(48px,48px)` drift, 60s |
| `.dots` | both | a tiled `radial-gradient` dot | `translate3d(0,48px)` drift, 90s |
| `.vignette` | both | a static darkening `radial-gradient` | none (`z-index: 1`, sits on top) |

### The rays style: blobs + sweep

`.layerA`/`.layerB` are big off-screen (`inset: -25%`) `radial-gradient` blobs
in the accent colours. They slowly `translate` and `scale` (see `@keyframes
aurora-a`/`aurora-b`), so the coloured glow breathes and drifts. The prototype
*blurred* these layers; that blur was **removed** (see Performance below) and
the soft falloff baked into the gradient stops instead. `.sweep` is a single
`conic-gradient` that is mostly transparent with one bright
`--accent-primary` wedge (~10°→34°), sized to `170vmax` and rotated a full
turn every 90s — a slow lighthouse beam across the screen.

### The aurora style: blobs + curtains

`.auroraBlobA`/`.auroraBlobB` are the same shape of off-screen radial blobs as
the rays style, but on a **fixed** northern-lights palette (never theme-
tinted) and reusing the same `aurora-a`/`aurora-b` drift keyframes. The
distinctive part is the three curtain bands: `.auroraCurtainA`/`B`/`C` are
`repeating-linear-gradient` "combs" — alternating colour/transparent stops at
a shallow angle, imitating an aurora's vertical rays — each clipped by a
`mask-image` that fades it from opaque at the top to transparent by the
bottom. Each band sways independently on its own keyframes
(`aurora-c`/`aurora-d`/`aurora-e`, 44s/61s/27s), animating `translate3d` +
`skewX` + `scaleY` together as **one** animation (never a second animation on
the same element — see `docs/performance.md` trap T5). `.auroraWash` is a
plain static `linear-gradient` sitting under the curtains for extra depth; it
has no animation at all.

### Where the "subtle dots" are encoded

Not an image, not SVG — a **tiled CSS gradient**:

```css
.dots {
  background-image: radial-gradient(var(--accent-primary) 1.1px, transparent 1.4px);
  background-size: 24px 24px;   /* one dot per 24px tile, repeated */
  animation: dots-drift 90s linear infinite;  /* translate down 48px = 2 tiles */
}
```

Each 24×24 tile holds one ~1px accent dot (opaque to 1.1px, transparent by
1.4px). The layer is oversized by one tile and `translate3d`-drifts down two
tiles per loop, so the field scrolls seamlessly. The `.grid` works the same way
with two `linear-gradient`s. Both are shared by the rays and aurora styles.

## How heavy is it? — Negligible (compositor-only), for both styles

This backdrop is **permanently on screen over a live price stream**, so any
per-frame main-thread or GPU-filter cost would compound with every frame the
trading surface produces. Both ambient styles were deliberately engineered to
avoid that:

- **Every animated layer animates only `transform` / `opacity`** (with
  `will-change: transform`). Those are the only two properties the browser can
  animate **on the GPU compositor without touching the main thread** — so
  steady-state main-thread cost is ≈ 0.
- **The blob layers bake their blur into the gradient, not a `filter`.** A
  viewport-sized `filter: blur()` is re-evaluated by the GPU on *every*
  composited frame — it was measured at ~7% of a core of steady GPU burn for
  the rays blobs while prices stream, so the softness is baked into the
  gradient stops instead (see `docs/performance.md` pattern P6). The aurora
  blobs (`.auroraBlobA`/`.auroraBlobB`) follow the same rule.
- **The aurora curtain bands carry no `filter` either.** They originally kept
  a small `filter: blur()` to soften the comb, but it was **removed** — the
  gradient's wide transparent runs plus the top-down `mask-image` already read
  as soft, separated light shafts, so the whole backdrop is now filter-free and
  purely `transform`/`opacity`-composited (`will-change: transform`, one
  animation per element). See `docs/performance.md` pattern P6b.
- **The grid/dots drift was moved off `background-position`.** That is a *paint*
  property (full-layer main-thread repaint every frame); translating the whole
  oversized layer by one tile is visually identical and runs entirely on the
  compositor.

Net: essentially free on the main thread; the compositor does bounded raster
work for a handful of large layers plus three small blurred bands when the
aurora style is active. This is why the backdrop ships **enabled by default**
(see below). The steady-state target from [`docs/performance.md`](../../../../../../docs/performance.md)
— zero `compositeFailed` events — holds here.

> **If you edit the CSS:** keep every animated property to `transform`/`opacity`.
> Do not reintroduce a viewport-sized `filter`, `background-position`,
> `box-shadow`, `width`, or `var()` inside an animated `transform`. Read
> `docs/performance.md` first.

## The style + on/off settings: defaults, gating, and persistence

Two independent preferences gate this backdrop — which style is drawn, and
whether it drifts:

- **`ambientStyle` picks the style.** `AmbientStyle = "aurora" | "rays"` in
  `@rtc/domain` (`preferences/preferences.ts`); `DEFAULT_AMBIENT_STYLE =
  "aurora"`. **Persisted in local storage** under the key
  **`rtc-ambient-style`**, seeded synchronously on load like every other
  preference. Selected from **Preferences → Display → "Ambient style"**, a
  two-option segmented control (`Aurora` / `Rays`, described in-modal as
  "Northern-lights curtains or the original accent rays.") wired through
  `useAmbientStyle()` → `AmbientStylePresenter` → `setAmbientStyle` → this
  key. (React Native uses
  the same preference from its Appearance → Motion segmented control, with a
  Skia-drawn approximation of the aurora curtains — see
  `docs/design/mobile/v1/dev-handoff/HANDOFF.md`.)
- **`animatedBackground` gates motion, not the style choice — default ON.**
  `DEFAULT_ANIMATED_BACKGROUND = true` in `@rtc/domain`
  (`preferences/preferences.ts`). New users get the drift; it is cheap enough
  to ship on. (The React Native client intentionally overrides this to
  **off** — a native, non-compositor backdrop is a battery cost on device.)
  **Persisted in local storage,** exactly like theme / mode / boot-variant.
  The browser build's `LocalStoragePreferencesAdapter` reads/writes the key
  **`rtc-animated-bg`** (`"true"`/`"false"`). The Preferences-modal "Animated
  background" toggle writes through `useAnimatedBackground()` →
  `AnimatedBackgroundPresenter` → `setAnimatedBackground` → this key.
- **The preference toggles motion, not visibility.** `enabled` maps to
  `--amb-play: running | paused`, which every layer's `animation-play-state`
  reads, for whichever style is active. When paused the layers simply hold
  still.
- **OS `prefers-reduced-motion: reduce` always wins.** A media query sets
  `animation: none` on every layer of both styles regardless of the
  preference, so reduced-motion users get a static backdrop even with the
  setting on.
- **GPU-less / VDI / Citrix boxes.** This backdrop is pure CSS, so it *paints*
  even where the canvas-based boot splash falls back to a static frame — but on
  hardware with no GPU its `transform`/`opacity` animations run on the CPU
  software compositor and stop being free — though with **no `filter`s** left
  in the backdrop, that's plain compositing, not per-frame filter re-evaluation.
  Only `prefers-reduced-motion`
  freezes it automatically; otherwise **power saver** is the manual lever. The
  full degradation model — and why there is no automatic no-GPU detection — is
  documented in [`docs/power-saver-mode.md` → *On GPU-less / VDI / Citrix
  hardware*](../../../../../../docs/power-saver-mode.md#on-gpu-less--vdi--citrix-hardware).

### Visibility is a per-skin theme decision (separate from the style/motion toggles)

Whether the backdrop is *visible at all* is a theme concern, not the style
picker or the motion toggle. `.wrap` opacity is driven by the
**`--aurora-opacity`** token:

- **holo / holo3d / neon** skins set a non-zero `--aurora-opacity` (e.g. holo
  dark `0.6`), so the active ambient style shows. The default skin is
  **holo**, so the default experience now shows a gently drifting aurora.
- **classic / terminal** skins set `--aurora-opacity: 0`, which collapses the
  whole backdrop (grid and vignette included) to invisible — those skins never
  show either style, animated or not.

**Why `--aurora-opacity` kept its legacy name.** The token predates the
`ambientStyle` split — it was named for the backdrop's original prototype
name ("aurora") back when there was only one style. It was **not** renamed
when the rays/aurora choice was added, because its role generalized cleanly
rather than changed: it is the theme's **master opacity for whichever ambient
style is active**, not a knob specific to the aurora style. Two things read
it: `.wrap` itself turns it into a binary 0/1 show/hide gate
(`clamp(0, var(--aurora-opacity) * 100, 1)`) that covers *every* layer of
*both* styles plus the grid/dots/vignette, and — within the active style —
`.aurora` (the rays blob wrapper), `.auroraWrap` (the aurora blob wrapper),
`.sweep`, and `.dots` each also derive a proportional fraction of it
directly for their own opacity. The individual blob/curtain/grid layers
underneath then layer their own fixed per-layer opacity on top. Renaming the
token would only churn every skin's token file for a purely cosmetic
identifier; the semantics already fit both styles.

## Related

- Per-frame animation rules and the profiling recipe: [`docs/performance.md`](../../../../../../docs/performance.md).
- Power saver's removal of the active style's animated layers from the DOM: [`docs/power-saver-mode.md`](../../../../../../docs/power-saver-mode.md).
- The shell's other full-screen chrome (boot splash, lock): [`docs/architecture/17-web-client-up-close.md`](../../../../../../docs/architecture/17-web-client-up-close.md).
