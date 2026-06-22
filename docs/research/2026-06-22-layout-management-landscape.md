# Research: layout / panel / window management landscape

**Date:** 2026-06-22 · **Status:** point-in-time survey (libraries and licences
change — verify before adopting).

Companion to [ADR-002: Layout / panel / window management as a swappable port](../adr/ADR-002-layout-management-port.md),
which records the *decision* (a thin `LayoutPort`, Dockview as the first adapter,
a custom free-floating engine as a future adapter). This note holds the full
**catalogue of solutions and inspiration** the ADR draws on, so the decision
record stays lean.

## Three paradigms

The space splits into three, and the `LayoutPort` is designed so an adapter from
any of them can satisfy it:

- **Docking-tree** — panels live in a tree of splits/stacks/tabs; floating is a
  secondary mode (Category A). The trading-workspace default.
- **Grid / free-float + animation** — tiles or free windows that drag, reflow,
  and animate (Categories B–D). Home of the "isotope" reflow and the CMC-era
  free-float UX.
- **Desktop multi-window interop** — beyond a single browser tab; real OS windows
  and cross-app messaging (Category G). Real RTC ships an OpenFin variant.

Categories E (drag/resize primitives) and F (animation engines) are **building
blocks** for a custom adapter rather than adapters themselves.

Licensing is called out where it bites (several finance-relevant libs are
commercial or GPL-or-pay). **Verify licences before adopting — they change.**

## A. Docking-tree panel managers — primary adapter candidates

| Library | Framework | Licence | Maintenance | Notes |
|---|---|---|---|---|
| **Dockview** | **vanilla core** + React / Vue / Angular | MIT | very active | Docking, splitviews, **floating groups**, **popout windows**, theming. Author cites Golden Layout / VS Code as inspiration. **Chosen first adapter.** |
| **Golden Layout** | **v2 = pure vanilla TS** (v1 needed jQuery); community React wrappers | MIT | moderate | The classic; **what the real RTC used**. Real pop-out browser windows. |
| **FlexLayout** (`flexlayout-react`) | **React only** | MIT | active | By **Caplin** (finance pedigree). IDE-style tabs, border panels, floating. |
| **rc-dock** | **React only** | Apache-2.0 | moderate | VS Code-like; float panels, max/min/restore. |
| **react-mosaic** | **React only** | Apache-2.0 | lower | Simple binary-tree tiling, no float. BlueprintJS ecosystem. |
| **Lumino** (ex-**PhosphorJS**) | **vanilla TS** | BSD-3 | active | The docking engine behind **JupyterLab**. Heavy-duty, framework-agnostic; strong inspiration even if not adopted. |

## B. Dashboard grid layouts — adapter candidates / strong inspiration

Draggable, resizable tile grids (the "configurable dashboard" model). Closer to
free-float than docking-tree, with built-in reflow.

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **react-grid-layout** | **React only** | MIT | The de-facto React draggable/resizable dashboard grid. Responsive breakpoints, serializable layouts. |
| **Gridstack.js** | **vanilla** + React/Angular/Vue wrappers | MIT | Dashboard grid drag/resize; widget-style. Vanilla core ⇒ framework-swap-friendly. |
| **Muuri** | **vanilla** | MIT | Draggable, **filterable, sortable, animated** grid with **free drag** — the closest off-the-shelf thing to the CMC free-float-plus-animation UX. Maintenance has been intermittent. |

## C. Masonry / filter-sort reflow animation — inspiration for the FX adapter

The exact "isotope" effect from the linked demo (filter/sort a tile grid; items
glide to new positions). The **Metafizzy** family by David DeSandro:

| Library | Licence | Notes |
|---|---|---|
| **Isotope** | **GPLv3 or commercial** | The linked library. Filtering + sorting with animated masonry/fitRows/cellsByRow layouts. *Commercial use needs a paid licence.* |
| **Masonry** | MIT (free) | Cascading "Pinterest" grid layout, no built-in drag. The free Metafizzy lib. |
| **Packery** | **GPLv3 or commercial** | **Bin-packing** layout; draggable via Draggabilly. Gap-filling reflow. *Paid for commercial use.* |
| **Draggabilly** | MIT (free) | Metafizzy's standalone drag lib; pairs with Packery. |

> These are **inspiration**, not adapters — they animate content grids, not a
> panel/window manager. Their value here is the *reflow choreography* to imitate
> in a custom adapter (see Category F for a license-clean way to get the same
> animation).

## D. Free-floating window managers — partial adapters / inspiration

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **WinBox.js** | **vanilla** | Apache-2.0 | Lightweight floating **window manager**: modals/windows, min/max/restore, snap, resize. Closest "palette window" feel out of the box. |
| **react-rnd** | **React only** | MIT | One resizable+draggable box; a primitive you compose into a free-float manager, not a manager itself. |

## E. Drag / resize / sort primitives — building blocks for a custom engine

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **interact.js** | **vanilla** | MIT | Drag/drop/resize/gesture with **snap & restrict modifiers** — ideal for magnetic dock-zone hit-testing. Framework-agnostic ⇒ swap-safe. |
| **dnd-kit** | **React** | MIT | Modern React DnD toolkit; sensors, collision detection, accessibility. |
| **SortableJS** | vanilla + framework bindings | MIT | Reorderable lists/grids; FLIP-animated. |

## F. Animation engines — the reflow / FX layer

| Tool | Licence | Notes |
|---|---|---|
| **Motion** (ex-**Framer Motion**) | MIT | `layout` animations + `LayoutGroup` give **automatic FLIP** with spring physics — a license-clean replacement for what Isotope/Muuri animate, in a few props. Primary recommendation for the reflow. |
| **GSAP** + **Flip plugin** | free (incl. plugins, since 2025) | Purpose-built FLIP plugin; the most control over choreography if Motion isn't enough. |
| **anime.js** (v4) | MIT | Lightweight general animation engine; an alternative if not on React. |
| **FLIP technique** | — | The underlying method (First-Last-Invert-Play); all of the above implement it. Worth understanding even when using a lib. |

## G. Desktop multi-window interop platforms — beyond a layout library

If "panels" ever need to be **real OS windows across apps** (the institutional
trading-desk experience), this is a different, heavier tier — and the one the
real RTC reaches for in its desktop build:

| Platform | Licence | Notes |
|---|---|---|
| **OpenFin** | commercial | Chromium-based desktop container for finance; window management + **FDC3** interop. Real RTC has an OpenFin variant. |
| **interop.io** (merger of **Finsemble** + **Glue42**) | commercial | Desktop interop / window management for financial workstations. |
| **FDC3** (FINOS) | open standard | The interop *protocol* (intents, context) these platforms speak; relevant even without a vendor. |
| **Electron / Tauri** | MIT / Apache-2.0 | DIY route to multi-window desktop if going native without a finance vendor. |

> These sit *outside* the `LayoutPort` as scoped in ADR-002 (it manages in-page
> panels). If multi-window desktop becomes a goal, it likely warrants its own
> port (a `WorkspacePort`) rather than overloading `LayoutPort` — a future
> decision, not designed here.

## Framework-swap consequence (the React→Solid angle)

The React→Solid goal makes **vanilla-core** engines (Dockview `dockview-core`,
Golden Layout v2, Lumino, Gridstack, Muuri, WinBox, interact.js) the
portability-safe picks; the `*-react` libraries (FlexLayout, rc-dock,
react-mosaic, react-grid-layout, react-rnd, dnd-kit) are a hard React dependency
that would be replaced wholesale on a framework swap. Prefer wrapping a **vanilla
core** in the adapter and rendering panel *content* with the host framework.

## The custom free-floating engine — build blocks

The prior-art UX (free-floating panels, magnetic auto-docking like
Photoshop/Flash palettes, an isotope/masonry reflow animation) is the
**grid/free-float paradigm** — none of the docking-tree libraries (Category A)
do free-float-as-primary with animated magnetic docking. Closest single
off-the-shelf option is **Muuri** (B); **WinBox** (D) covers window chrome. But
the faithful version is a custom `FreeFloatLayoutAdapter` on primitives, behind
the same `LayoutPort`. It decomposes into three solved-ish pieces plus one
bespoke one:

| Capability | Modern building block (category) |
|---|---|
| Free-float drag / resize + dock-zone hit-testing | **interact.js** (snap/restrict modifiers) or **dnd-kit** — Category E |
| Animated masonry/isotope reflow | **Motion** `layout` + `LayoutGroup` (automatic FLIP), or **GSAP Flip** — Category F. License-clean substitute for Isotope/Packery. |
| Magnetic auto-dock / packing | **bespoke** — the only genuinely custom piece (snap-zone detection + a packing algorithm; Muuri's source is a useful reference) |

## Prior-art sidebar: how Flex did the "isotope" animation in ~2008

The animation in question (filter/sort a tile grid and watch items glide to new
positions) was, in Adobe/Apache Flex, the **"data effects"** feature: a
`TileList` (or `List`) with its **`itemsChangeEffect`** style set to a
**`DefaultTileListEffect`** (`DefaultListEffect` for plain lists). On any
dataProvider change it faded out removed items, **moved** survivors to new
positions, and faded in new ones — declaratively, in ~5 lines of MXML:

```xml
<mx:TileList dataProvider="{products}">
  <mx:itemsChangeEffect>
    <mx:DefaultTileListEffect/>
  </mx:itemsChangeEffect>
</mx:TileList>
```

It felt free because Flex did the FLIP-style position interpolation under the
hood — the exact technique Isotope/Muuri/Motion `layout` reinvented years later.
The canonical demo was Adobe's **Flexstore**. Caveat for anyone chasing live
examples: these are **Flash SWFs**, dead since Flash EOL (Dec 2020); to view them
today use YouTube screencasts, or an archive.org capture through **[Ruffle](https://ruffle.rs)**
(a Rust/WASM Flash emulator), or run the source from `apache/flex-examples`.

The takeaway for the custom adapter: the eye-catching reflow that was a built-in
declarative effect in 2008 is now `Motion`'s `layout` prop — cheap. Only the
magnetic-docking algorithm is real custom work.

## References

**A. Docking-tree panel managers**
- Dockview — https://dockview.dev
- Golden Layout — https://golden-layout.github.io/golden-layout/
- FlexLayout (Caplin) — https://github.com/caplin/FlexLayout
- rc-dock — https://github.com/ticlo/rc-dock
- react-mosaic — https://github.com/nomcopter/react-mosaic
- Lumino (ex-PhosphorJS, JupyterLab) — https://github.com/jupyterlab/lumino

**B. Dashboard grid layouts**
- react-grid-layout — https://github.com/react-grid-layout/react-grid-layout
- Gridstack.js — https://gridstackjs.com
- Muuri — https://muuri.dev

**C. Masonry / filter-sort reflow animation (Metafizzy)**
- Isotope — https://isotope.metafizzy.co · Masonry — https://masonry.desandro.com
- Packery — https://packery.metafizzy.co · Draggabilly — https://draggabilly.desandro.com

**D. Free-floating window managers**
- WinBox.js — https://nextapps-de.github.io/winbox/ · react-rnd — https://github.com/bokuweb/react-rnd

**E. Drag / resize / sort primitives**
- interact.js — https://interactjs.io · dnd-kit — https://dndkit.com · SortableJS — https://sortablejs.github.io/Sortable/

**F. Animation engines**
- Motion (ex-Framer Motion) `layout` — https://motion.dev · GSAP Flip — https://gsap.com/docs/v3/Plugins/Flip/ · anime.js — https://animejs.com

**G. Desktop multi-window interop**
- OpenFin — https://www.openfin.co · interop.io (Finsemble + Glue42) — https://interop.io · FDC3 (FINOS) — https://fdc3.finos.org
- Electron — https://www.electronjs.org · Tauri — https://tauri.app

**Prior art — Flex data effects**
- Apache Flex `DefaultTileListEffect` — https://flex.apache.org/asdoc/mx/effects/DefaultTileListEffect.html
- `apache/flex-examples` (Flexstore source) — https://github.com/apache/flex-examples · Ruffle (Flash emulator) — https://ruffle.rs
