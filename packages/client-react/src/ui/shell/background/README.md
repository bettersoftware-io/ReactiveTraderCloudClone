# AmbientBackground — the aurora/ray/grid/dots backdrop

The decorative backdrop painted behind the whole workspace: a drifting **aurora**,
a rotating **ray sweep**, a **line grid**, a **dot field**, and a static
**vignette**. This note explains how each effect is made, how heavy it is, and how
its on/off setting is stored.

## Is it all CSS? — Yes, entirely

`AmbientBackground.tsx` is a ~20-line dumb component. It renders six stacked
`<div>`s and sets exactly one thing — a CSS custom property:

```tsx
style={{ "--amb-play": enabled ? "running" : "paused" }}
```

Every layer's motion is a CSS `@keyframes` animation whose
`animation-play-state` inherits that variable. There is **no JavaScript
animation, no `<canvas>`, no `requestAnimationFrame`** — the component paints
nothing itself and holds no data (it's `aria-hidden`, `pointer-events: none`
dead chrome). All the work is in `AmbientBackground.module.css`.

## The layers

Painted bottom-to-top, all inside a `.wrap` that is `position: absolute; inset: 0`:

| Layer | What it is | Animation |
|-------|-----------|-----------|
| `.aurora > .layerA` / `.layerB` | two multi-stop `radial-gradient` colour blobs | `translate3d` + `scale` drift, 52s / 68s |
| `.sweep` | one `conic-gradient` wedge (`transparent → accent → transparent`) | `rotate` 360° / 90s — the "ray" |
| `.grid` | two `linear-gradient`s (h-lines + v-lines), 48px tile | `translate3d(48px,48px)` drift, 60s |
| `.dots` | a tiled `radial-gradient` dot | `translate3d(0,48px)` drift, 90s |
| `.vignette` | a static darkening `radial-gradient` | none (`z-index: 1`, sits on top) |

### The aurora

`.layerA`/`.layerB` are big off-screen (`inset: -25%`) `radial-gradient` blobs in
the accent colours. They slowly `translate` and `scale` (see `@keyframes
aurora-a`/`aurora-b`), so the coloured glow breathes and drifts. The prototype
*blurred* these layers; that blur was **removed** (see Performance below) and the
soft falloff baked into the gradient stops instead.

### The ray (sweep)

`.sweep` is a single `conic-gradient` that is mostly transparent with one bright
`--accent-primary` wedge (~10°→34°), sized to `170vmax` and rotated a full turn
every 90s — a slow lighthouse beam across the screen.

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
with two `linear-gradient`s.

## How heavy is it? — Negligible (compositor-only)

This backdrop is **permanently on screen over a live price stream**, so any
per-frame main-thread or GPU-filter cost would compound with every frame the
trading surface produces. It was deliberately engineered to avoid that:

- **Every animated layer animates only `transform` / `opacity`** (with
  `will-change: transform`). Those are the only two properties the browser can
  animate **on the GPU compositor without touching the main thread** — so
  steady-state main-thread cost is ≈ 0.
- **The blur filter was removed.** A viewport-sized `filter: blur()` is
  re-evaluated by the GPU on *every* composited frame — it was measured at ~7% of
  a core of steady GPU burn while prices stream. The falloff is now baked into
  the gradient stops.
- **The grid/dots drift was moved off `background-position`.** That is a *paint*
  property (full-layer main-thread repaint every frame); translating the whole
  oversized layer by one tile is visually identical and runs entirely on the
  compositor.

Net: essentially free on the main thread; the compositor does bounded raster work
for a handful of large layers. This is why it now ships **enabled by default**
(see below). The steady-state target from [`docs/performance.md`](../../../../../../docs/performance.md)
— zero `compositeFailed` events — holds here.

> **If you edit the CSS:** keep every animated property to `transform`/`opacity`.
> Do not reintroduce `filter`, `background-position`, `box-shadow`, `width`, or
> `var()` inside an animated `transform`. Read `docs/performance.md` first.

## The on/off setting: default, gating, and persistence

The backdrop's motion is gated by the **`animatedBackground` preference**:

- **Default: ON.** `DEFAULT_ANIMATED_BACKGROUND = true` in
  `@rtc/domain` (`preferences/preferences.ts`). New users get the drift; it is
  cheap enough to ship on. (The React Native client intentionally overrides this
  to **off** — a native, non-compositor backdrop is a battery cost on device.)
- **Persisted in local storage,** exactly like theme / mode / boot-variant. The
  browser build's `LocalStoragePreferencesAdapter` reads/writes the key
  **`rtc-animated-bg`** (`"true"`/`"false"`), seeding synchronously on load. So a
  user's choice **survives reload** — flip it off and it stays off next time.
  The Preferences-modal "Animated background" toggle is the only real control in
  that modal; it writes through `useAnimatedBackground()` →
  `AnimatedBackgroundPresenter` → `setAnimatedBackground` → this key.
- **The preference toggles motion, not visibility.** `enabled` maps to
  `--amb-play: running | paused`, which every layer's `animation-play-state`
  reads. When paused the layers simply hold still.
- **OS `prefers-reduced-motion: reduce` always wins.** A media query sets
  `animation: none` on every layer regardless of the preference, so reduced-motion
  users get a static backdrop even with the setting on.

### Visibility is a per-skin theme decision (separate from the toggle)

Whether the backdrop is *visible at all* is a theme concern, not the motion
toggle. `.wrap` opacity is driven by the `--aurora-opacity` token:

- **holo / holo3d / neon** skins set a non-zero `--aurora-opacity` (e.g. holo
  dark `0.6`), so the aurora shows. The default skin is **holo**, so the default
  experience now shows a gently drifting aurora.
- **classic / terminal** skins set `--aurora-opacity: 0`, which collapses the
  whole backdrop (grid and vignette included) to invisible — those skins never
  show it, animated or not.

## Related

- Per-frame animation rules and the profiling recipe: [`docs/performance.md`](../../../../../../docs/performance.md).
- The shell's other full-screen chrome (boot splash, lock): [`docs/architecture/17-web-client-up-close.md`](../../../../../../docs/architecture/17-web-client-up-close.md).
