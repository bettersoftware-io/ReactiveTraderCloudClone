# ADR-002: Layout / panel / window management as a swappable port

**Status:** Proposed (exploratory — records the intended direction and the
research behind it; no adapter is implemented yet).

> Sibling decision record. ADR-001 lives co-located with its concern at
> `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`. This
> ADR is cross-cutting (it constrains the UI shell *and* a future custom
> rendering engine), so it lives under `docs/adr/`.

## Context

The reference ReactiveTraderCloud uses **Golden Layout** to manage its
workspace: draggable, dockable, resizable panels with pop-out-to-OS-window
support. Our clone currently renders a fixed tab/grid shell
(`packages/client-react/src/ui/shell/layout/Workspace.tsx`). We want to replace
that with a real layout/panel/window-management system **and** to keep that
system fully decoupled from the application — a swappable "plugin", in the same
spirit as every other outer-layer technology here (see
[architecture.md §8 Replaceability Matrix](../architecture.md#8-replaceability-matrix)).

Two goals, explicitly:

1. **Swap the layout library wholesale** without touching application code —
   pick Dockview today, swap to Golden Layout / FlexLayout / something else
   later, by changing only one adapter.
2. **Eventually implement a fully custom free-floating layout** (absolute-
   positioned panels, magnetic auto-docking, an eye-catching masonry/isotope
   reflow animation — a deliberate conceptual experiment) that satisfies the
   *same* contract the off-the-shelf adapter does.

This is the layout analogue of the React→SolidJS goal: the value is in the
**cost-of-change being bounded**, guaranteed by a contract and tests rather than
by discipline alone.

## Decision

Treat layout/panel/window management as a **Frameworks & Drivers (outer-layer)
concern behind a port**, exactly like the WebSocket transport. The UI shell
depends on a `LayoutPort` (a thin, app-vocabulary contract); concrete layout
engines are **adapters** selected at the Composition Root.

```mermaid
graph TB
    subgraph App["Application / UI shell (layout-engine-agnostic)"]
        Shell["Workspace shell"]
        Registry["Panel registry<br/>panelId → content renderer"]
    end
    Port["LayoutPort<br/>(app-vocabulary contract)"]
    subgraph Adapters["Layout adapters (outer layer, swappable)"]
        Dockview["DockviewLayoutAdapter<br/>(docking-tree)"]
        Golden["GoldenLayoutAdapter<br/>(docking-tree, future)"]
        Float["FreeFloatLayoutAdapter<br/>(custom FX engine, future)"]
    end
    Prefs["PreferencesPort<br/>(existing — persists opaque layout blob)"]

    Shell --> Port
    Shell --> Registry
    Dockview -.implements.-> Port
    Golden -.implements.-> Port
    Float -.implements.-> Port
    Dockview --> Prefs
    Golden --> Prefs
    Float --> Prefs
```

**Current pick:** **Dockview** as the first adapter — best-maintained,
multi-framework (vanilla core + React/Vue/Angular), and it already supports
floating groups and pop-out windows. It is a *choice*, not a *commitment*.

### The honest tension — this is harder than a transport port

The repo's **"Don't Over-Abstract"** principle
([architecture.md §1.2](../architecture.md#12-architectural-principles)) applies
with force here. A WebSocket is trivial to wrap; a layout engine is not, because
a layout engine is a **rendering concern tightly coupled to the view framework**
— it owns *where and how* panels mount, not just data that flows through. Wrapping
it behind a fat, feature-complete port would produce a leaky facade that fights
each engine's grain.

So the contract is deliberately **thin and expressed in application vocabulary**
(panels, visibility, focus, persistence), never in any engine's vocabulary
(no docking trees, no split nodes, no group ids). Where an engine has bespoke
capabilities the app doesn't need to orchestrate, we let the adapter own them
rather than hoisting them into the port.

### Core design: separate *panel content* from *panel placement*

The single most important decoupling — and the thing that makes both the
library-swap and the custom-engine goals achievable:

- **The app owns panel *content*.** A **panel registry** maps a stable
  `panelId` (e.g. `"fx-blotter"`, `"credit-rfq"`) to a framework-native content
  renderer. This mirrors the existing visual-test `registry.tsx` /
  `scenarios.ts` pattern — dumb content, addressed by id.
- **The adapter owns panel *placement and chrome*.** Geometry, tabs, splits,
  drag, float, animation — all internal to the adapter. The app never sees them.

The app says "panel `fx-blotter` should be open and focused"; the adapter decides
*where* that is. The app references panels only by id, never by any engine type.

### Sketch of the `LayoutPort` contract (illustrative, not final)

```ts
// App vocabulary only. No Dockview/Golden/Solid/React types cross this line.
interface LayoutPort {
  // content is supplied out-of-band via the panel registry (panelId → renderer)
  openPanel(panelId: string, opts?: { focus?: boolean }): void
  closePanel(panelId: string): void
  focusPanel(panelId: string): void
  isOpen(panelId: string): boolean

  // persistence: the engine's layout is OPAQUE to the app — a blob it round-trips
  serialize(): string
  restore(blob: string): void

  // events the shell may react to (kept minimal)
  changes(): Observable<LayoutSnapshot>   // RxJS, consistent with the rest of the app
}
```

- **Persistence is opaque.** Each adapter serializes *its own* layout to a
  string the app treats as a blob and stores through the **existing
  `PreferencesPort`** (`LocalStoragePreferencesAdapter` +
  `preferences.contract.test.ts`). The app never parses it; swapping engines just
  means old blobs are ignored/migrated by the new adapter.
- **`changes()` returns an `Observable`** to stay consistent with the repo's
  single boundary stream type — but note the UI-layer rule still holds: the shell
  consumes it through a hook bridge, never importing `rxjs` directly
  ([architecture.md §1.3](../architecture.md#13-layered-architecture--terminology)).

### The portability trap to avoid

> **Do not model the port after Dockview's docking tree.** If the contract leaks
> a tree-of-splits mental model, the future free-floating adapter (which has no
> tree — it has free coordinates and magnetic snap zones) cannot satisfy it.

The contract above is expressed as *panel lifecycle + opaque persistence*
precisely so that a docking-tree engine **and** a free-float engine can both
honour it. That constraint is the whole reason this is an ADR and not just
"add Dockview."

## Solution landscape (research, June 2026)

The space splits into **three paradigms**, and the `LayoutPort` is designed so an
adapter from any of them can satisfy it:

- **Docking-tree** — panels live in a tree of splits/stacks/tabs; floating is a
  secondary mode (Category A). This is the trading-workspace default.
- **Grid / free-float + animation** — tiles or free windows that drag, reflow,
  and animate (Categories B–D). The home of the "isotope" reflow and the CMC-era
  free-float UX.
- **Desktop multi-window interop** — beyond a single browser tab; real OS windows
  and cross-app messaging (Category G). Real RTC ships an OpenFin variant.

Categories E (drag/resize primitives) and F (animation engines) are the
**building blocks** for a custom adapter rather than adapters themselves.

Licensing is called out where it bites (several finance-relevant libs are
commercial or GPL-or-pay). **Verify licences before adopting — they change.**

### A. Docking-tree panel managers — primary adapter candidates

| Library | Framework | Licence | Maintenance | Notes |
|---|---|---|---|---|
| **Dockview** | **vanilla core** + React / Vue / Angular | MIT | very active | Docking, splitviews, **floating groups**, **popout windows**, theming. Author cites Golden Layout / VS Code as inspiration. **Chosen first adapter.** |
| **Golden Layout** | **v2 = pure vanilla TS** (v1 needed jQuery); community React wrappers | MIT | moderate | The classic; **what the real RTC used**. Real pop-out browser windows. |
| **FlexLayout** (`flexlayout-react`) | **React only** | MIT | active | By **Caplin** (finance pedigree). IDE-style tabs, border panels, floating. |
| **rc-dock** | **React only** | Apache-2.0 | moderate | VS Code-like; float panels, max/min/restore. |
| **react-mosaic** | **React only** | Apache-2.0 | lower | Simple binary-tree tiling, no float. BlueprintJS ecosystem. |
| **Lumino** (ex-**PhosphorJS**) | **vanilla TS** | BSD-3 | active | The docking engine behind **JupyterLab**. Heavy-duty, framework-agnostic; strong inspiration even if not adopted. |

### B. Dashboard grid layouts — adapter candidates / strong inspiration

Draggable, resizable tile grids (the "configurable dashboard" model). Closer to
free-float than docking-tree, with built-in reflow.

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **react-grid-layout** | **React only** | MIT | The de-facto React draggable/resizable dashboard grid. Responsive breakpoints, serializable layouts. |
| **Gridstack.js** | **vanilla** + React/Angular/Vue wrappers | MIT | Dashboard grid drag/resize; widget-style. Vanilla core ⇒ framework-swap-friendly. |
| **Muuri** | **vanilla** | MIT | Draggable, **filterable, sortable, animated** grid with **free drag** — the closest off-the-shelf thing to the CMC free-float-plus-animation UX. Maintenance has been intermittent. |

### C. Masonry / filter-sort reflow animation — inspiration for the FX adapter

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

### D. Free-floating window managers — partial adapters / inspiration

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **WinBox.js** | **vanilla** | Apache-2.0 | Lightweight floating **window manager**: modals/windows, min/max/restore, snap, resize. Closest "palette window" feel out of the box. |
| **react-rnd** | **React only** | MIT | One resizable+draggable box; a primitive you compose into a free-float manager, not a manager itself. |

### E. Drag / resize / sort primitives — building blocks for a custom engine

| Library | Framework | Licence | Notes |
|---|---|---|---|
| **interact.js** | **vanilla** | MIT | Drag/drop/resize/gesture with **snap & restrict modifiers** — ideal for magnetic dock-zone hit-testing. Framework-agnostic ⇒ swap-safe. |
| **dnd-kit** | **React** | MIT | Modern React DnD toolkit; sensors, collision detection, accessibility. |
| **SortableJS** | vanilla + framework bindings | MIT | Reorderable lists/grids; FLIP-animated. |

### F. Animation engines — the reflow / FX layer

| Tool | Licence | Notes |
|---|---|---|
| **Motion** (ex-**Framer Motion**) | MIT | `layout` animations + `LayoutGroup` give **automatic FLIP** with spring physics — a license-clean replacement for what Isotope/Muuri animate, in a few props. Primary recommendation for the reflow. |
| **GSAP** + **Flip plugin** | free (incl. plugins, since 2025) | Purpose-built FLIP plugin; the most control over choreography if Motion isn't enough. |
| **anime.js** (v4) | MIT | Lightweight general animation engine; an alternative if not on React. |
| **FLIP technique** | — | The underlying method (First-Last-Invert-Play); all of the above implement it. Worth understanding even when using a lib. |

### G. Desktop multi-window interop platforms — beyond a layout library

If "panels" ever need to be **real OS windows across apps** (the institutional
trading-desk experience), this is a different, heavier tier — and the one the
real RTC reaches for in its desktop build:

| Platform | Licence | Notes |
|---|---|---|
| **OpenFin** | commercial | Chromium-based desktop container for finance; window management + **FDC3** interop. Real RTC has an OpenFin variant. |
| **interop.io** (merger of **Finsemble** + **Glue42**) | commercial | Desktop interop / window management for financial workstations. |
| **FDC3** (FINOS) | open standard | The interop *protocol* (intents, context) these platforms speak; relevant even without a vendor. |
| **Electron / Tauri** | MIT / Apache-2.0 | DIY route to multi-window desktop if going native without a finance vendor. |

> These sit *outside* the `LayoutPort` as currently scoped (it manages in-page
> panels). If multi-window desktop becomes a goal, it likely warrants its own
> port (a `WorkspacePort`) rather than overloading `LayoutPort` — flagged as a
> future decision, not designed here.

**Framework-swap consequence (matters here):** the React→Solid goal makes
**vanilla-core** engines (Dockview `dockview-core`, Golden Layout v2, Lumino,
Gridstack, Muuri, WinBox, interact.js) the portability-safe picks; the `*-react`
libraries (FlexLayout, rc-dock, react-mosaic, react-grid-layout, react-rnd,
dnd-kit) are a hard React dependency that would be replaced wholesale on a
framework swap. Prefer wrapping a **vanilla core** in the adapter and rendering
panel *content* with the host framework.

## The custom free-floating engine (future adapter)

The prior-art UX (a Macromedia/Adobe Flex-era system: free-floating panels,
magnetic auto-docking like Photoshop/Flash palettes, and an isotope/masonry
reflow animation) is the **grid/free-float paradigm** — none of the docking-tree
libraries (Category A) do free-float-as-primary with animated magnetic docking.
The closest single off-the-shelf option is **Muuri** (Category B); **WinBox**
(Category D) covers the window-chrome feel. But the faithful version is a custom
`FreeFloatLayoutAdapter` built on primitives, satisfying the same `LayoutPort`.
It decomposes into three solved-ish pieces plus one bespoke one:

| Capability | Modern building block (category) |
|---|---|
| Free-float drag / resize + dock-zone hit-testing | **interact.js** (snap/restrict modifiers) or **dnd-kit** — Category E |
| Animated masonry/isotope reflow | **Motion** `layout` + `LayoutGroup` (automatic FLIP), or **GSAP Flip** — Category F. License-clean substitute for Isotope/Packery. |
| Magnetic auto-dock / packing | **bespoke** — the only genuinely custom piece (snap-zone detection + a packing algorithm; Muuri's source is a useful reference) |

### Prior-art sidebar: how Flex did the "isotope" animation in ~2008

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

## Replaceability matrix row (to fold into architecture.md §8 when adopted)

| Component | Currently | Cost to replace | Contract that must hold | Tests that verify |
|---|---|---|---|---|
| **Layout / panel manager** | (none yet → Dockview) | ~1 dev-week per adapter | `LayoutPort` (panel lifecycle + opaque persistence); panel content addressed by stable id | `LayoutPort` contract tests (parameterised over adapters) + visual goldens for panel *content* |

## Test strategy

- **`LayoutPort` contract tests**, parameterised over every adapter (Dockview,
  future Golden/free-float) — the same mechanism as the transport
  [port contract tests](../architecture.md#94-port-contract-tests). This is what
  makes "swap the layout engine" low-cost: the contract is encoded and all
  adapters must pass it.
- **Visual goldens** ([ADR-001](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md))
  screenshot panel *content*, which is engine-agnostic by design — but note an
  engine swap changes panel *geometry/chrome*, so full-workspace shots are
  expected to diff across adapters; scope golden coverage to panel content, not
  the surrounding layout chrome.
- **Behavioural specs** address panels by role/testid, so they should survive a
  layout-engine swap unchanged (same guarantee as the UI-framework swap).

## Open questions (to resolve before building an adapter)

1. **Does the shell need a tree/group concept at all**, or is "set of open
   panels + focus + opaque blob" sufficient? (Leaning: keep the port that thin;
   let adapters own structure.)
2. **Pop-out OS windows** (Golden Layout / Dockview feature, and a real RTC
   capability): does the port expose `popout(panelId)`, or is it adapter-internal
   chrome the app never commands? Affects how thin the port can stay.
3. **Layout-state migration** across engine swaps: ignore old blobs, or define a
   neutral interchange format? (Leaning: ignore + re-seed defaults; a neutral
   format would re-introduce the docking-tree leak we are avoiding.)
4. **Where the registry lives** relative to the existing visual `registry.tsx` —
   reuse/extend it or keep separate.

## Alternatives considered

- **Bake Dockview directly into `Workspace.tsx`.** Rejected — exactly the
  third-party lock-in the architecture exists to prevent, and it would block the
  custom free-float experiment.
- **Use a docking library's own persistence as application state.** Rejected —
  leaks the engine's tree model into the app and breaks the swap guarantee;
  persistence stays an opaque blob behind `PreferencesPort`.
- **A fat, feature-complete `LayoutPort`** mirroring Dockview's API. Rejected —
  violates "Don't Over-Abstract" and makes the free-float adapter impossible to
  fit. The port stays thin and app-shaped.

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

**Repo cross-refs**
- [architecture.md §1.2 principles](../architecture.md#12-architectural-principles),
  [§8 Replaceability Matrix](../architecture.md#8-replaceability-matrix),
  [ADR-001 visual-diff tooling](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md)
