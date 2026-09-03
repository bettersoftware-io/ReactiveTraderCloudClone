# @rtc/layout-dockview

Framework-neutral Dockview wrapper — the only package allowed to import
`dockview`. Converts the app's seed-tree layout description into
Dockview's `SerializedDockview` (pixel-pinned rails included), restores/
serialises the opaque persisted layout blob, emulates the in-house
collapse and maximize (both as axis-aware strips) over Dockview's API, and
restyles Dockview's chrome as the app's own panel chrome.

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

Strip orientation to know: a collapsed panel's strip reads against the
nearest enclosing split that is *not* itself fully stripped — the in-house
engine's `stripDir` walk. One panel of the FX rail column collapsed is a
32px horizontal bar (its space reclaims down the column); once *both* are
strips the column has nothing left to reclaim along, so it reclaims sideways
in the row and both strips flip to 32px vertical bars sharing the rail's
height, with the column pinned to 32px and its width remembered for the
first expand. Because one collapse can re-orient its siblings, orientations
reach the client through the `onStripsChange` callback (the whole current
map, whenever it changes), not through `collapsePanel`'s result.

Motion to know: the in-house engine glides a collapse / expand / maximize /
restore over 0.34s and nothing else — a sash drag or a window resize lands
instantly. Dockview positions every group and sash through inline
`left/top/width/height` styles, so the same glide is one CSS transition on
those in `dockview-hud.css`, gated on a `data-dock-glide` attribute
`createDockEngine` sets on the container around each of the four intents
and clears once the transition has run (`GLIDE_ATTRIBUTE_MS`). Drags and
resizes rewrite the very same inline styles, which is why the gate is
inverted from in-house's "not while dragging": on only around an intent.
Maximize is the same glide: the siblings shrink into their strips while the
maximized panel grows into the space they free.

Maximize to know: in-house maximize is a *policy over strips*, not a
geometry primitive — every leaf under the maximize boundary except the
maximized panel becomes a strip, the boundary being the whole dock or, for
a `maximizeScope: "nearest-column"` panel (the FX and equities rail
panels), its nearest enclosing column. Dockview's own `maximize()` is a
different thing (it *hides* every other group and knows no scope), so
`createDockEngine` does not use it: `maximizePanel` collapses exactly the
panels the in-house policy would, through the same records the collapse
path uses — so the `stripDir` flip applies (root-maximizing Live Rates turns
the rail into two vertical bars) — and `exitMaximize` restores only the
strips *that* maximize made, leaving a strip the user collapsed before or
during it in place. The scope reaches the engine through the optional
`maximizeScope(panelId)` hook, read from the same `PanelSpec` field the
in-house engine reads. The client tells a maximize-forced strip from the
user's by its own `collapsed` set: the former's restore bar dispatches
`restore`, the latter's `expand`, as in-house.

Surface painting to know: the card and the head bar are painted through the
`background` **shorthand**, never `background-color`, and `--panel` /
`--panel-head` are never routed into a `--dv-*` variable. Dockview's base
sheet applies its background variables with `background-color:`, and in the
3D skins those tokens are `linear-gradient(…)` images — a gradient is not a
`<color>`, so such a declaration is invalid at computed-value time and
paints nothing (every panel body showed the page backdrop). The dock root is
also kept transparent, as the in-house engine root is: Dockview's default
paints it with the group colour, which tints the gutters and composites a
translucent skin's card fill twice. `dockviewHud.test.ts` pins all of this
at the stylesheet-text level, since jsdom cannot model the invalidity.

Gap arithmetic to know — the gap-0 model (`rtcBlobVersion: 2`): the theme
carries NO dockview `gap`. Dockview's own gap shaves `gap × (n − 1) / n`
off each of a branch's `n` children at layout time and serialises those
shaved sizes, which made every wanted size fractional and sibling-count
dependent (a 360px rail modelled as 363.5), demanded a whole compensation
layer, and put every card edge on a half pixel. Instead every LEAF view is
inset half a gutter per side in `dockview-hud.css` (branch views stay
uninset so the gutter never compounds with depth) and the client bridges'
root padding is 6.5px — so cards still sit 7px apart inside the 10px page
inset, while a view's MODEL size is always its visible card + 7, a
constant. Model equals render: `toSerializedDockview(…, { gap })` allocates
in card space and lifts each child by one gap, the engine sets and reads
the same integers everywhere, and `toJSON()` round-trips byte-stable with
no compensation. A legacy gap-7 blob (no version stamp) is lifted on load
by `migrateDockBlob` — each branch child `+gap/n`, strip-sidecar sizes
`+gap`, pins untouched (they persist the public card px in both eras).

Design widths to know: the in-house engine renders an `initialPx`/`fixedPx`
cell at `flex: 0 0 <px>` — it HOLDS its design width (FX rail 360, credit
330, equities 290) through every viewport resize while the fraction siblings
absorb the delta, until the first drag of its own split's handle converts
the split to plain fractions for good. Dockview instead rescales every child
proportionally, so the seed's exact pixel allocation would drift on the
first window resize. `convertSeed` therefore also reports each pinned child
as a `DockDesignPin`, and the engine holds it the way strips are held —
min=max constraints on the pinned child's groups, honoured live by
dockview's resize distribution — releasing it on the first pointer move of a
sash drag inside the declaring split, and persisting live pins as an
`rtcDesignPins` sidecar inside the blob so pin state survives reloads.

Strip restore sizes survive reloads the same way: the grid serialises as
rendered — bars included — so a reload restores a collapsed group at
Dockview's ~100px default minimum and a bare re-collapse would remember
*that* as the size to restore. While strips exist the save adds an
`rtcStripGeometry` sidecar (each strip's pre-collapse size, plus each
flipped split's pre-flip width keyed by its stripped panel ids), which the
post-reload collapse replay consumes; constraints are re-derived live, a
malformed sidecar is dropped, and a strip-free blob keeps its legacy shape.

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
