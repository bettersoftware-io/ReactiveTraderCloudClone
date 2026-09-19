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

## Drag-and-drop policy

Dockview's native tab drag-and-drop is a supported feature of this engine
(Phase 1 of the Dockview-native features workstream). The blessed drop set:
the four edge-split bands and the centre-stack of any EXPANDED group, plus
intra-group tab reordering. Three rules the engine enforces on top of
dockview's own behaviour:

- **Stripped groups reject drops.** A collapsed (or maximize-forced) bar
  hides its whole group header, so a drop into it would swallow the dropped
  panel invisibly. `recordStrip` sets the group's `locked =
  "no-drop-target"` for the strip's lifetime and the release path lifts it.
  The lock is DERIVED state: dockview serialises `locked` into `toJSON()`,
  so the save scrubs it from every leaf (`withoutLockMarks`) and the load
  normalises all groups unlocked — a blob never carries lock marks.
- **Pins dissolve structurally on drag-out.** Dragging a member out of a
  pinned rail dissolves the pin and releases its min=max clamps
  immediately (the DnD analogue of the sash-drag release). Exact-fill alone
  passes vacuously after such a drag — both fragments still hold only
  pinned panels — so the invariant is rail identity: all pinned panels must
  share one direct child view of the pin's declaring split.
- **Strip ledgers are keyed by membership, not DOM identity.** A drop can
  restructure split elements while reusing group elements, so the flip and
  pre-strip-world ledgers key on sorted member panel ids; a world whose
  membership drifted is voided rather than re-asserted over members it
  never described.

Stack-collapse policy, recorded: collapsing a member of a stacked (multi-
tab) group first ejects it into its own group, so expanding it later does
NOT re-stack it — the eject is permanent. Re-stack-on-expand is
deliberately not built until a product need shows up.

Zero other `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM
math) this package legitimately touches the DOM: `createDockEngine` mounts
Dockview into a container element. Its only architectural constraint is that
it imports no other `@rtc` package (`layout-dockview-stays-pure` in
`.dependency-cruiser.cjs`) and that `dockview` is confined to this
package (`dockview-only-in-layout-dockview`) — the engine stays
swappable by replacing one package (ADR-002).

### Stacked-tab chrome (Phase 2)

A centre-drop stack renders as one 38px bar: the ACTIVE tab keeps the full
panel head (its registered head-slot widgets), each INACTIVE tab collapses to
a muted title chip drawn from the bridge's `data-panel-title` attribute
(`content: attr(...)` in `dockview-hud.css` — the sheet cannot name the
clients' hashed CSS-module nodes), with a 1px card-border seam between tabs
and a 2px accent seat under the active one. All stacked-tab rules are
selector-scoped to multi-tab bars, so a single-tab bar is pixel-identical to
the pre-Phase-2 chrome. Collapse of a stacked member permanently un-stacks it
(the eject rule); re-stack-on-expand is deliberately not built. The pixel
witness is `shell/layout-dockview-stacked` — the first single-engine
scenario (stacks are blob-private arrangement the in-house engine cannot
express).

## Close / reopen (Phase 3)

A View-menu close is layer-2 state (`LayoutState.closed`, client-core): the
engine's `closePanel` removes the panel live (releasing any strip record
without a restore, exiting a maximize that names it, and letting the
structural pin check dissolve an affected pin), and `reopenPanel` re-adds
it **at its seed home**: the anchor is the nearest surviving SEED sibling —
proximity within the panel's own seed split first, then outward — with a
right-edge fallback when nothing of the seed survives (exported pure
`seedAnchorFor`). The bridges reconcile the whole seed set on every change
(close and reopen are both no-op-safe), so StrictMode rebuilds, tab
switches and blobs saved while closed all converge with no bookkeeping.
The last visible static panel of a tab cannot be closed — the reducer
enforces the floor; the View menu only reflects it.

## Pop-out windows (Phase 5)

`popoutPanel(panelId)` delegates to dockview's native `addPopoutGroup`: a
same-origin child window opens at the group's screen box (`popoutUrl`
option, default `/popout.html` — both clients ship a real, minimal page at
that path: dockview waits for the child's `load`, appends its own container
and copies every parent stylesheet, so the page needs nothing but an empty
body). The group's DOM moves wholesale into the child document — both
frameworks keep painting live across the boundary, no portal work — while
the main grid keeps a hidden placeholder. Closing the window docks the
panels home natively (`beforeunload`; note a driver-level page close skips
it — e2e closes from inside).

**Popped state is engine-owned session state**, surfaced whole through
`onPopoutsChange` (the strips idiom) — deliberately NOT layer-2 machine
state: "popped" is not a workspace semantic the other engine honours (the
panel is still *open*), so the machine and `workspaceLayoutV1` never learn
of it, and a reload restores docked by construction. The second lock is the
serialize-time scrub: `withoutPopoutGroups` re-parents any mid-popout save's
`popoutGroups` views onto their hidden `gridReferenceGroup` leaf (the
`withoutLockMarks` walk style), so a persisted blob never carries a popout.
While popped, the head's collapse/maximize (and the ↗ control itself)
render disabled — geometry intents have no meaning for a group parked in
another document.

## Floating groups (Phase 6a)

A float is a group lifted out of the grid into a draggable, resizable box
that stays visible over it. Two entry points create one, both deliberately
kept live: the head's own `Float <title>` / `Dock <title>` control
(`floatPanel` / `dockPanel`), and dockview's native shift-drag gesture —
`disableFloatingGroups` stays unset because drag-to-float and drag-to-dock
are dockview's own gestures, not a deviation this engine suppresses.
Dock-home resolves through the same `seedAnchorFor` helper `reopenPanel`
already uses — the nearest GRID-resident seed sibling — falling back, for a
dynamic panel (a chart instance has no seed slot by construction) or a
panel whose every seed sibling is itself closed, floating or popped, to the
root's right edge, exactly where `insertDynamicPanel` opens one.

The design's §3.2 rules reduce to one predicate, `isInGrid` (keyed on
`group.api.location.type`, never a DOM class — a float's own private nested
gridview wrapper reuses the grid's `.dv-split-view-container` class, Task
1's Q2):

| Rule | Refuses / does | Enforced in |
|---|---|---|
| R1 | Collapse refused on a floating panel — a strip has no slot or home for it | `collapsePanel` |
| R2 | Maximize refused on a floating panel — no space to claim, no home to restore | `maximizePanel` |
| R3 | Float refused (head control) while a maximize is live — no coherent home to return to; both client bridges also withhold the control itself on every head while a maximize is live (spec §3.2's "button hidden") | `floatPanel`; the bridges' `onFloat` |
| R4 | Float refused (shift-drag) while a maximize is live — mirrors R3 for the gesture | `cancelRefusedShiftFloat` |
| R5 | Floating suspends a design pin (min=max) on its own record list — including a pin already lifted because nothing absorbs; returning to the grid re-clamps it if it still applies. Holds for EVERY entry and exit: the head control, dockview's shift-drag float, a drag of a float onto the grid, and a pop-out closing back into the grid | `settleFloatTransitions` → `suspendPinsFor` / `clampPinsFloatSuspendedFor` |
| R6 | A floating chart instance leaves the equal-share rule, and re-enters it the moment it is back in the grid (not at the next resize) | `instanceSplitOf`; `settleFloatTransitions` |
| R7 | DOM containment is not grid membership — a float sits inside this engine's own container, so `boundary.contains` is true for it. Every `api.groups` walk either filters explicitly with `isInGrid`, or is scoped STRUCTURALLY by sitting inside a grid split's DOM (`directMembersOf`, `childViewsOf`, `holdsStripChild`, `instanceSplitOf`'s inner walk, `shareSplitAmongInstances`, `firstGroupIn` — a grid split never contains a float's private gridview) | `isInGrid` call sites; the split-scoped walks |
| R8 | Float refused (both entry points) for a collapsed panel — a strip and a float are mutually exclusive states | `floatPanel` / `cancelRefusedShiftFloat` |

The float rules do not live on the two verbs. dockview's shift-drag float,
a drag of a float onto the grid, and a pop-out window closing back into the
grid call `addFloatingGroup` / `moveGroupOrPanel` themselves and never reach
`floatPanel` / `dockPanel` — so R5, R6 and the absorption re-settle (Ruling
10: a float removes an absorber exactly as a close does) run from ONE
function, `settleFloatTransitions`, subscribed to dockview's synchronous
`onDidMutateLayout`. It fires as each top-level mutation closes, so a verb's
caller reads settled state the moment the verb returns, and a gesture never
leaves a float clamped even transiently. (`onDidLayoutChange` would not do:
dockview buffers it to a microtask.)

R4/R8's shift-drag veto is **not** dockview's `onWillDragGroup`: measured
against the 8.3.1 bundle, that hook fires from an HTML5 `dragstart`, and the
shift-drag gesture's own `pointerdown` handler calls `event.preventDefault()`
before `dragstart` would ever fire — subscribing to the hook would never see
a float. The only reachable veto is a capture-phase `pointerdown` listener
on this engine's own container, ahead of dockview's target-phase handlers,
scoped to a group `isInGrid` is true for — on an ALREADY-floating group the
identical shift-pointerdown is dockview's own **redock** gesture
(`VoidContainer.isFloatingMoveHandle`), and vetoing it there would break
dragging a float home.

**Dock-home restores the size, not just the slot.** A bare dockview move
halves the anchor group, so a panel docked home would otherwise come back at
half its neighbour's extent (measured: fx-blotter 206px before floating, 303px
after a bare dock-home). Instead, `settleFloatTransitions` remembers each
panel's extent along its parent split's dividing axis as it enters a float,
and re-applies it through the axis `set` (the strips' size path) as the panel
lands back in the grid, then forgets it. Siblings give the space back. Both
halves live in that one function, so every entry and exit point is covered —
the head control, shift-drag, a drag of the float onto the grid, and a
pop-out closing back into the grid. The re-applied size is clamped to the
group's own min/max and to what its split can give without pushing a sibling
below its minimum, so a container resized or a sibling closed while the
panel floated lands what fits. Nothing is re-applied to a panel that docks
into a split dividing the other axis, or that lands as a TAB in a group
holding others (a drop on a group's centre is not a return home, and sizing
that group would resize the sibling it joined). Under a live maximize the
restore is **deferred**, not dropped: drag-home still works then (only the
head control is hidden), and re-applying would shrink the maximized panel,
so the entry waits and `exitMaximize` applies it.

The extent is captured on dockview's `onWillMutateLayout`, not in the settle
itself: `settleFloatTransitions` runs on `onDidMutateLayout`, AFTER the float
has detached the group — its grid extent is already gone by then — while
`onWillMutateLayout` opens the same top-level mutation with the group still
laid out. Remembered sizes persist across a reload in an optional
`rtcFloatSizes` sidecar (`{ [panelId]: { axis: "width" | "height", size } }`,
model units), written by `serializeLayout` only while an entry exists and
validated on load like `rtcStripGeometry`; an entry whose panel did not come
back floating is dropped. `DOCK_BLOB_VERSION` stays 2 — the field is additive.

Two kinds of panel are **deliberately excluded**, because another rule
already owns their docked extent and two mechanisms fighting over one extent
would be worse than either:

- **A design-pin member** — its pin re-clamps on dock-home (R5) and restores
  the designed size itself.
- **A chart instance** (an unpinned dynamic panel) — on dock-home it
  re-enters the equal-share rule (R6), which decides every instance's width.

**Persistence.** Unlike a pop-out (session-scoped, engine-owned state that
never reaches the blob), a float persists: `toJSON()` emits `floatingGroups`
and a fresh engine's `fromJSON()` restores `location.type === "floating"`
for free. `loadBlobOrSeed`'s retry ladder is **cumulative** — each rung
retries on the OUTPUT of the rung above it, never the original blob —
`"blob"` → `"blob-without-floats"` → `"blob-without-dynamic"` → `"seed"`, so
a tier's name implies every scrub above it already ran; a blob damaged two
ways at once reports the last and most severe scrub, never a combined
label. `withoutFloatingGroups` is a **load-time retry only**, deliberately
absent from the save path — a live float is always saved as one, never
pre-emptively dropped.

**Known limitations:**

- **A float wears a 60px stacked header.** dockview's default
  `floatingGroupDragHandle: "titlebar"` renders its own 22px drag rail above
  this engine's 38px panel head. Dropping the rail via
  `floatingGroupDragHandle: "tabbar"` was measured and declined: under this
  engine's `singleTabMode: "fullwidth"`, that mode leaves a single-panel
  float's tab-bar void with `flex-grow: 0` — no draggable surface at all,
  and every float `floatPanel` produces is single-panel. The rail and its
  matching `dockview-hud.css` chrome ship as an accepted cosmetic deviation.
- **Floating a panel and reloading within ~250ms can lose the float.**
  Every layout write is debounced 250ms before it reaches storage; this is
  not float-specific — every layout mutation (drag, stack, close, resize)
  rides the same debounce.
- **A damaged saved float costs the float and its pin, not the panel.**
  When the loader falls back to `"blob-without-floats"`, the engine restores
  WITHOUT the floated panel (dockview never instantiates an unreferenced
  `panels` entry). The application does not leave it missing: both client
  bridges' closed-set effect calls `reopenPanel` for every seed panel not in
  the machine's `closed` set, so a STATIC panel re-docks at its seed home on
  mount, and `reconcileDynamicPanels` re-adds a listed chart instance. What
  is actually lost is the float itself and any design pin it held — the
  pin's record no longer fills its panels at restore, so the re-docked
  panel comes back unpinned.

## Instances consume the dynamic-panel API (Phase 4)

Multi-instance equities charts (one `eq-chart:<symbol>` panel per open
symbol) are built entirely on the client side of the engine boundary — this
package gained no code for Phase 4. The client-core layout machine owns
`LayoutState.instances` as its second layer-2 lift (alongside `closed`), and
the bridges open/close an instance by calling the existing
`addDynamicPanel({ id, initialPx })` / `removeDynamicPanel(id)` pair — no
spec travels with the call. The engine pulls an instance's title and
maximize scope the same way it does for every panel, through
`opts.panels.title(id)` / `opts.panels.maximizeScope(id)`, which the bridge
answers from its merged specs map (the instance slice sets title = the
symbol, `maximizeScope: "root"`). See the dynamic-panel API and its
restore-time reconciliation rules in the
[GenUI × Dockview design's engine-API section](../../docs/superpowers/specs/2026-09-12-genui-dockview-docking-and-default-flip-design.md#4-engine-api-rtclayout-dockview).

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
document-level listener is one more thing evaluated on every keydown/click.
Dockview is the default layout engine (as of the Task 10 flip), so this cost
is now the common case, not a conditional aside — every session that never
switches to the in-house engine carries these four modules' listeners
whether or not `keyboardNavigation` ever gets turned on.
