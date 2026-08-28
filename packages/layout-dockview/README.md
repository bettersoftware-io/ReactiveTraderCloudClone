# @rtc/layout-dockview

Framework-neutral Dockview wrapper — the only package allowed to import
`dockview`. Converts the app's seed-tree layout description into
Dockview's `SerializedDockview` (pixel-pinned rails included), restores/
serialises the opaque persisted layout blob, bridges maximize/exit-maximize
and an emulated, axis-aware collapse through Dockview's API, and restyles
Dockview's chrome as the app's own panel chrome.

## The header is the client's, not Dockview's

`createDockEngine` takes three hooks of one shape, `(panelId, element) =>
dispose`: `mount` fills the panel body, `mountTab` fills the panel's **tab**
(Dockview's drag surface), and `mountActions` fills the group's right-hand
actions slot for whichever panel is active. A client portals the same
header nodes its in-house engine renders into the last two, so under
Dockview the tab bar *is* the panel header — same 38px head, same head
tabs, same collapse/maximize glyphs — and dragging the header rearranges
the workspace. `styles/dockview-hud.css` carries the rest of the parity:
the theme `gap` (7px, the in-house handle track), the bordered card,
the head rule and the sash grip, every value annotated with the in-house
rule it copies. A stripped (collapsed) panel marks its tab mount
`data-dock-strip="true"`; the stylesheet hides that group's header so the
client's restore bar is the panel's entire chrome, as in-house.

Gap arithmetic to know: Dockview keeps a split's model sizes summing to the
full extent and shaves `gap × (n − 1) / n` off each of its `n` children when
laying out. `toSerializedDockview(…, { gap })` compensates so pinned pixels
and fractions describe what renders, the collapse/expand sizing reads the
rendered size back and re-applies the shortfall rather than guessing a
sibling count the public API does not expose, and `compensateGap` adds each
child's share back into `toJSON()` output before it is persisted — Dockview
serialises the *rendered* sizes, so an uncompensated blob restores a little
differently on every load (a 360px rail measured 360 → 358 → 349 across
three reloads; React's StrictMode double-mount is one such cycle).

Zero other `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM
math) this package legitimately touches the DOM: `createDockEngine` mounts
Dockview into a container element. Its only architectural constraint is that
it imports no other `@rtc` package (`layout-dockview-stays-pure` in
`.dependency-cruiser.cjs`) and that `dockview` is confined to this
package (`dockview-only-in-layout-dockview`) — the engine stays
swappable by replacing one package (ADR-002).

## Why `dockview`, not `dockview-core`

`dockview-core` is a real npm package and works, but constructing a
`DockviewComponent` from it logs a one-time console warning: *"do not use
`dockview-core` directly — it is an internal package. Use the `dockview`
package … instead."* Verified against the registry (`npm view dockview@7.0.4`)
before switching:

- `dockview@7.0.4` exists at the exact pin this package uses for
  `dockview-core`.
- Its only runtime dependency is `dockview-core: ^7.0.4` — no React or other
  framework runtime dep.
- Its entry (`dist/package/main.esm.mjs`) is `export * from 'dockview-core'`
  plus a call to `markDockviewPackageLoaded()` — the exact flag `dockview-core`
  checks before emitting the warning. Same API surface (`createDockview`,
  `DockviewApi`, every type used here), same base stylesheet (`npm pack` +
  `diff` confirmed `dockview/dist/styles/dockview.css` is byte-identical to
  `dockview-core`'s).

So the swap is a drop-in: same imports, same behaviour, warning gone.

## A cost of the `dockview` entry package worth knowing

Importing `dockview` (rather than `dockview-core` directly) registers four
extra feature modules at import time — TabGroupChips, ContextMenu,
AdvancedDnD, and Accessibility. Their services attach **document-level**
capture listeners on construction, not on first use. Those listeners stay
dormant while the `keyboardNavigation` option is left unset (this package's
default), so today there is no measured cost — but it is a real divergence
from bare `dockview-core`, worth knowing on a perf-sensitive HUD where every
document-level listener is one more thing evaluated on every keydown/click,
whether or not Dockview is the active layout engine.
