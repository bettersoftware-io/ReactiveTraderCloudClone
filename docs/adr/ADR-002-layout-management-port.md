# ADR-002: Layout / panel / window management as a swappable port

**Status:** Superseded in part (2026-08-11). This ADR's two goals split: the
**decoupling** goal shipped, but on a different shape than the one designed
here — an **in-house split-tree engine** (`LayoutMachine` +
`InhouseLayoutEngine`) is the default and the system of record, not a
`LayoutPort` in front of a third-party library. Dockview *did* subsequently
ship (2026-08-11, PR #534) — as a **switchable second engine** behind the
`LayoutEngine` preference (`"inhouse" | "dockview"`, default in-house),
packaged as `@rtc/layout-dockview` with a per-client bridge — but again
without the sketched `LayoutPort`: the engine branch lives inside
`WorkspaceEngine`, and the thin-port refactor stays deferred. See
[What actually shipped](#what-actually-shipped) and
[As implemented (2026-08)](#as-implemented-2026-08) below for the honest
account, and [Superseded / still-true index](#superseded--still-true-index)
for exactly which parts of the original text below still hold.

> Sibling decision record. ADR-001 lives co-located with its concern at
> `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`. This
> ADR is cross-cutting (it constrains the UI shell *and* a future custom
> rendering engine), so it lives under `docs/adr/`.

## Superseded / still-true index

| Original section | Status |
|---|---|
| Context (Golden Layout / Dockview framing, `Workspace.tsx`) | **Superseded** — `Workspace.tsx` was deleted; see [What actually shipped](#what-actually-shipped) |
| Decision (`LayoutPort` behind app vocabulary) | **Superseded** — no such port exists; the real seam is the machine + engine-view pair, see below |
| "The honest tension" / "Don't Over-Abstract" reasoning | **Still true**, and is exactly why no port got built — see below |
| Sketch of the `LayoutPort` contract | **Never built** — kept verbatim for the historical record; Dockview shipped *without* it, see [As implemented](#as-implemented-2026-08) |
| "The portability trap to avoid" | **Still true advice**, now scoped to a *hypothetical future* port rather than the shipped code |
| Dockview as "the chosen first adapter" | **Shipped, but re-framed** — a switchable *second* engine behind the `LayoutEngine` preference (default in-house), not a replacement and not behind a `LayoutPort`; see [Dockview: re-costed](#dockview-re-costed-as-an-alternative-engine-2026-08-11) then [As implemented](#as-implemented-2026-08) |
| Solution landscape / research note | **Still true** — the survey is reference material for any future engine swap, in-house or not |
| The custom free-floating engine (future adapter) | **Still future**, unchanged — now targets the machine seam instead of `LayoutPort` |
| Replaceability matrix row | **Rewritten** — see below |
| Test strategy | **Rewritten** — describes what actually verifies the shipped engine |
| Open questions | **Resolved** — see below |
| Alternatives considered | **Extended** — one new alternative (2026-08-11) |

## What actually shipped

The in-house engine **is** the layout system today, not a placeholder waiting
on a `LayoutPort` adapter. `packages/client-react/src/ui/shell/layout/Workspace.tsx`
— the "fixed tab/grid shell" this ADR originally set out to replace — no
longer exists (removed rendering `InhouseLayoutEngine` from `App.tsx`
instead). What's there now, per
[architecture.md §17.2](../architecture/17-web-client-up-close.md#172-the-layout-system)
and [§10.11](../architecture/10-key-design-decisions.md#1011-continuous-ui-without-fighting-the-framework):

- **The data** — `LayoutState`/`LayoutNode` (`packages/client-core/src/layout/layoutPort.ts`):
  a tree of splits and panel-id leaves, app-vocabulary only (no engine types).
- **The machine** — `createLayoutMachine`
  (`packages/client-core/src/presenters/LayoutMachine.ts`), one framework-free
  instance per workspace tab, folding five intents (`maximize`/`restore`/
  `collapse`/`expand`/`resize`, plus this round's `dockPanel`/`undockPanel`/
  `reset`) through an RxJS `scan` reducer into a `state$` stream.
- **The registries** — `panelRegistry.ts` / `appPanelRegistry.tsx` /
  `appHeadRegistry.tsx` (per client, React and Solid), mapping a stable
  `panelId` to a content renderer — precisely the "panel registry" concept
  this ADR called for, just not gated behind a port interface.
- **The engine-view** — `InhouseLayoutEngine.tsx` (+ its Solid twin), the
  *one* framework-coupled component in each client shell: it renders
  `LayoutState` + the registries into DOM (splits, drag handles, maximize/
  collapse chrome, docked columns). Its own doc comment names itself "the
  ONE framework-coupled spot in the app."
- **Persistence** — an opaque `workspaceLayoutV1` string preference (see
  [Persistence: the ADR's goal, a different mechanism](#persistence-the-adrs-goal-a-different-mechanism)).

This is not a port-and-adapters seam over a pluggable engine — it is the
engine, with exactly one file per client that a framework swap has to
re-implement (proven twice already: React→RN reused `client-core` verbatim,
and the SolidJS port re-implemented only `InhouseLayoutEngine.tsx` + its
CSS-module twin, byte-identical, to reach full visual parity).

## Context

The reference ReactiveTraderCloud uses **Golden Layout** to manage its
workspace: draggable, dockable, resizable panels with pop-out-to-OS-window
support. When this ADR was written, our clone rendered a fixed tab/grid shell
(`packages/client-react/src/ui/shell/layout/Workspace.tsx`, since deleted —
see [What actually shipped](#what-actually-shipped)). The stated goal was to
replace that shell with a real layout/panel/window-management system **and**
to keep that system fully decoupled from the application — a swappable
"plugin", in the same spirit as every other outer-layer technology here (see
[architecture.md §8 Replaceability Matrix](../architecture/08-replaceability-matrix.md#8-replaceability-matrix)).
The decoupling goal held; the mechanism below is not the one that shipped.

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

## Decision (as originally proposed — not what shipped)

This section is preserved verbatim as the historical proposal. It was never
built; [What actually shipped](#what-actually-shipped) above and
[The real swap seam](#the-real-swap-seam-what-shipped-instead) below describe
what did.

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
([architecture.md §1.2](../architecture/01-overview.md#12-architectural-principles)) applies
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
  ([architecture.md §1.3](../architecture/01-overview.md#13-layered-architecture--terminology)).

### The portability trap to avoid

> **Do not model the port after Dockview's docking tree.** If the contract leaks
> a tree-of-splits mental model, the future free-floating adapter (which has no
> tree — it has free coordinates and magnetic snap zones) cannot satisfy it.

This warning is still live, just rescoped: the shipped `LayoutState` **is** a
tree-of-splits (there was never a port to leak it through — the tree IS the
app-level type). The warning now applies only if a future `LayoutPort` gets
built to make the tree swappable for something tree-shaped (Dockview) *and*
something non-tree-shaped (free-float) at once — see
[The custom free-floating engine](#the-custom-free-floating-engine-future-adapter)
below, which still targets that same non-tree case. The original contract
above was expressed as *panel lifecycle + opaque persistence* precisely so
that a docking-tree engine **and** a free-float engine could both honour it —
that constraint is the whole reason this was an ADR and not just "add
Dockview," and it is the same reasoning behind rejecting a premature
`LayoutPort` today (see [Alternatives considered](#alternatives-considered)).

## The real swap seam (what shipped instead)

No `LayoutPort` interface exists — not even now that a second engine has
actually been built. Dockview shipped later the same day (see
[Dockview: re-costed](#dockview-re-costed-as-an-alternative-engine-2026-08-11)
for the costing that preceded it and [As implemented](#as-implemented-2026-08)
for what landed), and it plugged into *this* seam rather than motivating a
port: the engine choice is a branch inside `WorkspaceEngine`, reading the
same `LayoutState`/registries. The seam that makes a swap tractable is
smaller and more concrete than the port sketched above:

- **The machine is engine-agnostic already.** `LayoutMachine.ts` and
  `JarvisPanelsMachine.ts` (`packages/client-core`) know nothing about DOM,
  React, or Solid — the same property the original `LayoutPort` design was
  chasing, just achieved by keeping the state/reducer framework-free rather
  than by wrapping a third-party engine.
- **The engine-view is the one file a swap touches.** `InhouseLayoutEngine.tsx`
  (+ CSS module) per client is where a genuinely different engine — Dockview,
  Golden Layout, or the custom free-float experiment — plugs in, reading
  the same `LayoutState`/registries the current renderer does. This is a
  *smaller* footprint than the original port design (one file vs. an adapter
  package per engine), because there is no port interface to also satisfy.
  Dockview is the worked example: it added a sibling
  `dockview/DockviewLayoutEngine.tsx` per client (plus the `@rtc/layout-dockview`
  package that confines the library itself) and a preference-driven branch
  between the two — no port, no adapter interface.
- **The cost of an actual engine swap is therefore the honest cost of
  rewriting that one file per client** to a different rendering strategy,
  not "implement `LayoutPort`" — which is exactly why the
  [Dockview re-costing](#dockview-re-costed-as-an-alternative-engine-2026-08-11)
  below counts capability parity, not adapter LOC.

## Persistence: the ADR's goal, a different mechanism

The original design's persistence goal — "the engine's layout is OPAQUE to
the app, a blob it round-trips through the existing `PreferencesPort`" — is
exactly what shipped in the 2026-08-11 GenUI L3 round, without a `LayoutPort`:

- `PreferencesPort` gained one new opaque string member,
  `workspaceLayout$(): Observable<string | null>` /
  `setWorkspaceLayout(value: string | null): void`
  (`packages/domain/src/ports/preferencesPort.ts`) — the repo's first
  optional-string preference, storage-guarded to `typeof value === "string"`,
  with real validation left to the client-core parser rather than the
  storage adapter.
- The app never inspects the string's shape at the UI layer: it is written by
  a lazy debounced writer (`packages/client-core/src/layout/
  workspacePersistenceWriter.ts`, registering each tab's `LayoutMachine`
  `state$` as it is created, so a never-opened tab never forces eager
  creation) and read back by a parser
  (`packages/client-core/src/layout/workspaceLayoutPersistence.ts`) that
  reconciles the tree against the docked-panel list, enforces
  `MAX_DOCKED_PANELS` (4, global) and a depth bound, and falls back to
  defaults on anything corrupt, truncated, or version-mismatched.
- So the ADR's persistence *goal* — opaque, engine-agnostic, routed through
  `PreferencesPort` — held exactly as designed. What it turned out not to
  need was a `LayoutPort` in front of it: the "engine" whose layout gets
  serialized is the one and only in-house engine, so there is no adapter
  boundary for the blob to be opaque *across*, only a version boundary
  (`workspaceLayoutV1`) to be opaque *through*.

## Dockview: re-costed as an alternative engine (2026-08-11)

This ADR originally named Dockview "the chosen first adapter." A 2026-08-11
exploration (recorded in
[the GenUI L3 spec's opening](../superpowers/specs/2026-08-11-genui-l3-pinned-panels-design.md#2-decisions-settled-during-brainstorm-2026-08-11))
found that framing stale: it predates the in-house engine described above,
which by 2026-08-11 had grown ~2.9k lines across both clients plus ~1k in
`client-core`. Migrating to Dockview via a thin port would not be "add a
missing feature" — it would mean **losing** six capabilities the in-house
engine has grown that a generic docking library either doesn't offer or
would need bespoke work to replicate, while the round on the table (L3:
docking + full workspace persistence) needed **none** of Dockview's actual
differentiators (user drag-rearrange, tabs, pop-out OS windows):

1. **Nearest-column maximize scoping** — `maximizeScope: "nearest-column"`,
   four rail panels maximizing within their own column rather than the whole
   dock.
2. **Collapse-to-strip** — panels collapse to a strip rather than close when
   a sibling maximizes.
3. **Px-rail sizing overrides** — `initialPx`/`fixedPx` per-child literal-px
   panel widths layered on top of fractional `sizes`.
4. **The drive-command surface** — Jarvis's `dockPanel`/`undockPanel`/
   maximize/collapse vocabulary, wired straight into `LayoutIntents`.
5. **The static-panel-id roster gate** — the persona's tool descriptions and
   `MATRIX_EXCLUDE` gates key off the closed, hand-built `PANEL_SPECS` id set.
6. **Full per-tab layout + docked-panel persistence** — the
   `workspaceLayoutV1` opaque preference this round added (see
   [Persistence](#persistence-the-adrs-goal-a-different-mechanism) above).

On top of the capability loss, a Dockview *migration* would fork the entire
`app/*` visual golden family (panel geometry/chrome is engine-owned, so every
workspace screenshot changes shape) — real cost, not free re-plumbing.
**Dockview was therefore not adopted as a replacement**, and the in-house
engine remains the default.

**What happened next (same day).** A separate round took the other branch of
this costing: rather than migrate, it shipped Dockview as a **switchable
second engine** behind a `LayoutEngine` preference defaulting to
`"inhouse"` — see [As implemented (2026-08)](#as-implemented-2026-08). That
choice keeps every number above intact rather than contradicting them: no
capability is lost (the six live on in the in-house engine, which every user
still gets by default), and the `app/*` golden family never forked, because
the dockview engine is shot by its own dedicated `shell/layout-dockview`
scenario instead of re-shooting the workspace family. The six capabilities
remain **unimplemented on Dockview**; opting into that engine trades them for
Dockview's own differentiators (user drag-rearrange, tabs), which is exactly
the trade the preference exists to let a user make. The custom free-float
engine below is unaffected either way; it was always scoped as a from-scratch
build, not a Dockview alternative.

## As implemented (2026-08)

Dockview shipped as a **switchable second engine** — but **behind the
existing tree-shaped layout seam, not the sketched thin `LayoutPort`**, and
**alongside** the in-house engine rather than replacing it. The port above
stays a design target; building it now, with the engine choice expressible
as a two-branch conditional, would be guessing at the shape a third engine
(the future free-float one) actually needs. Concretely:

- **A `LayoutEngine` preference** (`"inhouse" | "dockview"`,
  `packages/domain/src/preferences/preferences.ts`) selects between the
  in-house split-tree engine described in
  [What actually shipped](#what-actually-shipped) and Dockview, branched in
  `WorkspaceEngine` and surfaced as a "Layout engine" row in both clients'
  preferences modal. Defaults to `"inhouse"`, so the shipped behaviour —
  including the six capabilities counted in the
  [re-costing](#dockview-re-costed-as-an-alternative-engine-2026-08-11) —
  is unchanged unless a user opts in.
- **Content/placement separation held**, exactly as designed above — panel
  *content* is still addressed by stable id through the existing
  `appPanelRegistry`/`appHeadRegistry`; the new `@rtc/layout-dockview`
  package owns placement, chrome, drag, split, and float entirely
  internally. A per-client `DockviewLayoutEngine.tsx` bridge portal-mounts
  registry content into Dockview's panels so the `ViewModel`/`FxView`/
  `CreditView` React/Solid contexts keep flowing through unchanged.
- **Persistence stayed opaque**, per the ADR's design, but through a new
  narrow port rather than the existing `PreferencesPort`: `DockLayoutStore`
  (an optional `AppPorts` member) round-trips Dockview's serialized layout
  blob through a `localStorage` adapter keyed `rtc-dock-layout-<tab>` per
  client, with an in-memory default in composition. The app never parses
  the blob — the same guarantee the ADR asked for, just not funnelled
  through `PreferencesPort` itself.
- **`dockview` (the supported vanilla-JS entry point that wraps the
  internal `dockview-core`, per the package's own README) is confined to
  `@rtc/layout-dockview`** by two dependency-cruiser rules
  (`layout-dockview-stays-pure`, `dockview-only-in-layout-dockview`) — the
  engine stays swappable by replacing one package, which is the property
  this ADR exists to buy. The
  package exports `createDockEngine` (seed-tree → `SerializedDockview`
  conversion, `api.layout()` called before `restore()` so proportions hold,
  opaque-blob restore with a seed fallback, debounced serialisation, a
  dispose-time final flush, a maximize bridge mirrored from Jarvis/the
  layout state machine, and a close-button-free tab renderer — no close
  affordance in v1 scope) plus `dockview-hud.css`, which restyles Dockview's
  chrome as the in-house panel chrome (see the chrome-parity bullet below).
- **Collapse/expand, added 2026-08-14.** Of the five intents, `maximize`,
  `restore`, `collapse` and `expand` are now bridged, and `resize` needed no
  bridge at all: it is the in-house sash-drag callback, whereas under Dockview
  the user drags Dockview's own sashes, which already persist through
  `onDidLayoutChange`. Collapse is the one intent Dockview cannot be *asked*
  to perform — `setCollapsed`/`isCollapsed` exist in dockview-core but only
  for **edge** groups (shell-docked sidebars), not the grid groups the
  workspace uses. So the engine emulates it exactly as dockview's own edge
  groups do: remember the group's pre-collapse width **and** constraints,
  clamp both to the 38px strip (constraints first, or a sibling resize
  re-widens it), and restore the remembered values on expand. The
  panel-vs-group mismatch is resolved rather than papered over — in-house
  `collapsed` names a *panel*, Dockview sizes a *group*, and a group can hold
  several panels as tabs, so a shared-group panel is **ejected into its own
  group first**. This is a live example of the asymmetry noted below: the
  bridge is where an engine's missing capability gets emulated, which is
  precisely the knowledge a premature `LayoutPort` would have had to encode
  before it was known.
- **Chrome parity, added 2026-08-28 (PR #587).** The first cut only mapped colour
  tokens onto Dockview, so switching engines changed the *design*: no 10px
  inset or 7px gutters, flat groups instead of bordered cards, Dockview's own
  28px tab bar stacked as a second header above the app's head strip, no
  collapse/maximize controls, the 360px design rail rendered as a 27%
  fraction, and a panel body with no scroll container. The fix makes
  Dockview's tab bar *be* the in-house header rather than imitate it:
  `createDockEngine` grew two optional hooks beside `mount` — `mountTab`
  (the panel's tab element, Dockview's drag surface) and `mountActions`
  (the group's right-hand actions slot, remounted for whichever panel is
  active) — and each client bridge portals the **same** `PanelHead` pieces
  its in-house engine renders (`PanelHeadSlot`, `PanelHeadControls`,
  `PanelStrip`, extracted from `InhouseLayoutEngine` into one shared
  component + stylesheet per client) into them. The theme carries
  `gap: 7` (the in-house handle track), the bridge root the 10px inset,
  `dockview-hud.css` the card border/radius/shadow, the 38px head and the
  2×30px sash grip; the seed converter honours `initialPx`/`fixedPx`
  (gap-compensated, since Dockview shaves `gap × (n − 1) / n` off every
  child at render time — and, because it also *serialises* those shaved
  sizes, the persisted blob is compensated the same way so a save/load
  cycle restores exactly instead of drifting a pixel or two per reload); collapse clamps along the axis the group's
  siblings run on (a 38px column beside side-by-side siblings, a 32px bar
  under stacked ones) and reports the orientation so the bridge renders the
  matching in-house restore strip with the group header hidden. One React
  bridge bug surfaced with it: `WorkspaceEngine` rebuilds `specs`/
  `registry` every render, and the engine effect listed `specs` as a dep —
  so every layout-state change rebuilt Dockview from the blob, losing the
  pre-collapse geometry (a strip "restored" to Dockview's 100px default
  minimum). The engine now lives for the tab. **Deliberate residuals:**
  maximize stays Dockview-native (the group fills the whole dock; in-house
  scopes a rail panel's maximize to its column and strips the siblings),
  and Jarvis-docked panels remain an in-house-engine feature (the Dockview
  seed is the static default tree).
- **What did NOT land**: the `LayoutPort` interface itself. The engine
  branch lives inside the pre-existing `WorkspaceEngine` (in-house vs.
  Dockview), not behind a new port boundary each engine implements
  symmetrically. Extracting the thin `LayoutPort` sketched above is
  deferred until a **third** engine (Golden Layout, or the future
  free-float one) exists to generalise the contract from — two engines
  whose asymmetry is this large (see the six capabilities the in-house one
  has and Dockview does not) are not enough evidence to fix an interface
  shape, and guessing now risks the exact "leaky facade" this ADR warns
  against.
- **Verification**: a shared `DockviewEngine.contract.spec.ts` (10 cases,
  run against both clients — head slot and title inside the tab, controls
  dispatching the machine intents, the strip and its orientation), 38
  package-level unit tests in `@rtc/layout-dockview` (hooks, pixel pins,
  gap compensation, axis-aware collapse), a Playwright e2e journey (switch
  engine → drag-dock by the panel's own header → reload persists → revert),
  and a `shell/layout-dockview` visual scenario (10-combo matrix) alongside
  re-pinned preferences-modal goldens — plus, since 2026-08-29 (PR #590), whole-app
  goldens under Dockview for every workspace (`app/fx-dockview`,
  `app/credit-dockview`, `app/equities-dockview`, `app/admin-dockview`)
  beside their in-house siblings, which is what makes the chrome parity
  above a pixel-pinned property rather than a claim. Adding them found a
  crash shipped with the first cut: dockview's `fromJSON` rejects a leaf
  root, and the single-panel Admin tab seeds exactly that — the converter
  now wraps a lone panel in a one-child branch.
- **Skin-proof card fill and a painted first frame, added 2026-08-29 (PR #PRNUM).**
  Comparing those goldens against their in-house siblings showed the panel
  *bodies* diverging in every skin, catastrophically in the four 3D ones
  (holo3d / terminal3d, dark and light: ~35% of pixels in the light pair).
  Two causes, both in how the card is painted. Dockview's base sheet applies
  its `--dv-group-view-background-color` / `--dv-tabs-and-actions-container-
  background-color` variables through `background-color:`, and the 3D skins'
  `--panel` / `--panel-head` tokens are `linear-gradient(…)` *images* — not
  `<color>`s — so the declaration was invalid at computed-value time and the
  card painted nothing; `dockview-hud.css` now paints the card and head
  itself through the `background` shorthand (which takes an image, as the
  in-house `.panel` / `.panelHeader` do) and routes only plain-colour
  surface tokens into the `--dv-*` variables. And Dockview paints its *root*
  with the group colour too, where the in-house `.engine` is transparent —
  tinting the gutters and compositing a translucent skin's card fill twice
  under every body; the root is now transparent. A stylesheet-text unit test
  pins both mechanics (jsdom cannot model invalid-at-computed-value custom
  properties). The same comparison exposed a *capture* defect: the x86
  `classic-dark` / `classic-light` `app/fx-dockview` goldens were a blank
  workspace. The React bridge created Dockview in a passive `useEffect`, so
  its first frame was an empty workspace; Playwright's screenshot stabiliser
  accepts two identical consecutive frames, and the classic skins — the only
  ones with no ambient animation keeping frames changing — handed the slower
  x86 runner two blank frames before the engine mounted. React's tier then
  passed against its own blank golden while Solid (whose `onMount` runs
  before paint) failed, which is how it surfaced. The React bridge now
  creates the engine in a `useLayoutEffect` — the synchronous state flush
  commits the slot portals before paint, so the first frame shows the
  panels as the in-house engine's synchronous render and the Solid bridge
  already did — and `app/fx-dockview` waits for portalled body text before
  capturing, as its three tab-switching siblings already did. What remains
  between the two engines' goldens after this round is sub-pixel geometry,
  not design: measured at 1920×1080 on the FX seed, every Dockview edge
  lands on a half pixel (Live Rates ends at 709.5 vs 708.56 in-house, the
  rail starts at 1550.5 vs 1550) because dockview rounds each restored view
  size to an integer (`gridview.js` `fromJSON`, `splitview.js` `layout()`)
  and then renders `size − gap × (n − 1) / n` — 3.5px for the 7px gap — and
  Chrome snaps `.5` up. That is ≤1px per edge and 0.3–3.5% of pixels
  (highest on the position-sensitive equities chart), and it cannot be
  seeded away: the integer model is dockview's, not the seed's. The exact
  route, if it is ever wanted, is a gap-0 model with the 7px gutter emulated
  as a trailing inset on every non-last view — integer edges that snap like
  the in-house engine's — which would replace the gap-compensation logic
  above (seed share, serialise-time `compensateGap`, collapse shortfall)
  rather than extend it.
- **See also:** the implementation spec and plan —
  [superpowers/specs/2026-08-11-dockview-layout-engine-design.md](../superpowers/specs/2026-08-11-dockview-layout-engine-design.md)
  and [superpowers/plans/2026-08-11-dockview-layout-engine.md](../superpowers/plans/2026-08-11-dockview-layout-engine.md).

## Solution landscape (shortlist)

The full survey — seven categories, ~25 libraries, framework + licence per row,
the custom free-float build blocks, and the Flex `DefaultTileListEffect`
prior-art — lives in
[research/2026-06-22-layout-management-landscape.md](../research/2026-06-22-layout-management-landscape.md).
The decision-relevant summary (still useful reference material for a future
engine swap, whether or not it is ever built behind a formal `LayoutPort`):

The space splits into **three paradigms** — the original design reasoned
about them via a `LayoutPort` that was never built, but the paradigm split
itself is unaffected:

- **Docking-tree** (Dockview, Golden Layout, FlexLayout, rc-dock, react-mosaic,
  Lumino) — the trading-workspace default; **the chosen first adapter (Dockview)
  is here.**
- **Grid / free-float + animation** (react-grid-layout, Gridstack, Muuri; the
  Isotope/Packery/Masonry reflow family; WinBox / react-rnd float windows) — home
  of the "isotope" reflow and the CMC-era free-float UX; the basis for the future
  custom adapter.
- **Desktop multi-window interop** (OpenFin, interop.io, FDC3, Electron/Tauri) —
  real OS windows across apps; real RTC ships an OpenFin variant. Likely a
  separate `WorkspacePort`, **outside** `LayoutPort`'s scope (see research note).

**Decision-shaping takeaways:**

- **Prefer a vanilla core.** The React→Solid goal makes vanilla-core engines
  (Dockview `dockview-core`, Golden Layout v2, Lumino, Gridstack, Muuri, WinBox,
  interact.js) swap-safe; `*-react` libraries are a hard React dependency. Wrap
  the vanilla core; render panel *content* with the host framework.
- **Watch the licences.** Most candidates are MIT/Apache/BSD, but **Isotope and
  Packery are GPL-or-commercial** — which is exactly why the custom free-float
  adapter should get the reflow from **Motion** `layout` / **GSAP Flip**
  (license-clean FLIP), not from Isotope.

## The custom free-floating engine (future adapter)

The prior-art UX (free-floating panels, magnetic auto-docking like
Photoshop/Flash palettes, an isotope/masonry reflow animation — the
Macromedia/Adobe Flex `DefaultTileListEffect` lineage) is the grid/free-float
paradigm; no docking-tree library does it — this is still a genuinely future,
from-scratch experiment, unaffected by the Dockview re-costing above. The
faithful version is a custom engine on primitives, targeting the same seam
`InhouseLayoutEngine.tsx` occupies today (not a `LayoutPort`, since none
exists — see [The real swap seam](#the-real-swap-seam-what-shipped-instead)):
**interact.js/dnd-kit** for drag + snap-zone hit-testing, **Motion `layout`** (or
GSAP Flip) for the reflow, and a **bespoke** magnetic-dock/packing algorithm (the
only genuinely custom piece — Muuri's source is a useful reference). Full
build-block table and the Flex prior-art sidebar are in the
[research note](../research/2026-06-22-layout-management-landscape.md#the-custom-free-floating-engine--build-blocks).

## Replaceability matrix row

Supersedes the original row (which described a `LayoutPort` that was never
built). The shape below matches the actual shipped seam — `WorkspaceEngine`'s
engine branch + the registries + `DockLayoutStore`, with no thin `LayoutPort`
in play — and is folded into
[architecture.md §8](../architecture/08-replaceability-matrix.md#8-replaceability-matrix);
see that table for the canonical cost/contract/verification wording.

| Component | Currently | Cost to replace | Contract that must hold | Tests that verify |
|---|---|---|---|---|
| **Layout / panel manager** | In-house split-tree engine (`LayoutMachine` + `InhouseLayoutEngine`, the default) + Dockview (`@rtc/layout-dockview`, opt-in via the `LayoutEngine` preference); a custom free-float engine remains a recorded alternative, not built | ~1 dev-week per client per engine — measured once (Dockview): a sibling engine-view file over the same `LayoutState`/registries, plus a library-confining package; *replacing* the in-house engine rather than adding beside it would additionally cost reimplementing the six capabilities in [Dockview: re-costed](#dockview-re-costed-as-an-alternative-engine-2026-08-11) + a full `app/*` golden regen | Engine branch in `WorkspaceEngine` over `LayoutState`/`LayoutIntents` (machine surface, `client-core`) + `panelId → renderer` registries + `DockLayoutStore` (opaque per-tab blob); panel content addressed by stable id, same as originally designed | `LayoutMachine`/`JarvisPanelsMachine` unit tests (`TestScheduler`) + `@rtc/ui-contract` behavioural specs incl. the shared `DockviewEngine.contract.spec.ts` (swap-trio, both clients) + `@rtc/layout-dockview` unit tests + e2e journey (switch engine → drag-dock → reload persists → revert) + visual goldens for panel content, `layout/fx-docked-panel`, and `shell/layout-dockview` |

## Test strategy

What actually verifies the shipped engine (supersedes the port-contract-test
plan below, which assumed adapters that were never built):

- **`client-core` unit tests** (`TestScheduler`) pin `LayoutMachine`'s five
  original intents plus this round's `dockPanel`/`undockPanel`/`reset`
  reducer behaviour, and the `workspaceLayoutPersistence` parser's
  round-trip + corrupt/truncated/version-mismatch fallback — this is the
  closest analogue to the originally-planned `LayoutPort` contract tests,
  just against the one real machine instead of a parameterised adapter set.
- **`@rtc/ui-contract` behavioural specs** (the swap-trio, shared verbatim by
  both clients) address panels by role/testid, so they already demonstrate
  the same swap-survival guarantee a `LayoutPort` contract test would have —
  proven directly by the SolidJS port, which passes every layout-touching
  spec unchanged.
- **Visual goldens** ([ADR-001](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md))
  cover panel content *and* the engine's own chrome (splits, docked column,
  maximize/collapse), since there is currently only one engine to shoot —
  the original plan's engine-agnostic scoping becomes relevant again only if
  a second engine actually ships.
- **E2e** (`tests/`, Gherkin, both clients) drives dock → reload → rehydrate
  as the strongest persistence witness, the same guarantee the original
  design assigned to behavioural specs generally.

## Open questions — resolved

The original four questions assumed a `LayoutPort` would get built. It still
hasn't been — not even now that a second engine ships (see
[As implemented](#as-implemented-2026-08)) — so they resolve against the real
seam rather than by a port design choice:

1. ~~Does the shell need a tree/group concept at all?~~ **Moot** — the
   shipped `LayoutState` *is* a tree; there is no port to keep thin, and
   Dockview consumes that tree as a seed rather than replacing it.
2. ~~Pop-out OS windows: port-exposed or adapter-internal?~~ **Deferred** —
   out of scope for the in-house engine (recorded in the L3 spec's
   out-of-scope list), and out of scope for the shipped Dockview engine too
   (v1 ships without a close affordance, let alone pop-out). Revisit only
   when a round actually needs it.
3. ~~Layout-state migration across engine swaps?~~ **Answered** — *ignore
   and re-seed*, as the original leaning guessed. The two engines persist
   through two independent stores that never read each other's blobs:
   `workspaceLayoutV1` (the in-house tree + docked panels, through
   `PreferencesPort`) and `DockLayoutStore` (`rtc-dock-layout-<tab>`,
   Dockview's own serialized blob). Switching engines re-seeds from
   defaults rather than translating, so no neutral interchange format was
   needed — and `workspaceLayoutV1` establishes the versioned-opaque-string
   pattern (parsed defensively, falling back to defaults on any mismatch)
   for whenever a breaking schema change does need one.
4. ~~Where does the registry live?~~ **Resolved** — `panelRegistry.ts` /
   `appPanelRegistry.tsx` / `appHeadRegistry.tsx` per client, extended (not
   replaced) to accept dynamic Jarvis-authored entries alongside the static
   roster, threaded as props rather than a module default. *Both* engines
   read those same registries; the Dockview bridge portal-mounts their
   output into its panels.

## Alternatives considered

- **Bake Dockview directly into `Workspace.tsx`.** Rejected — exactly the
  third-party lock-in the architecture exists to prevent, and it would block the
  custom free-float experiment. (`Workspace.tsx` itself is gone now, replaced
  by `InhouseLayoutEngine`, so this alternative is doubly moot.) This one
  held on shipping: Dockview's library surface is confined to
  `@rtc/layout-dockview` by two dependency-cruiser rules, and the app-side
  bridge speaks only registries + an opaque blob.
- **Use a docking library's own persistence as application state.** Rejected —
  leaks the engine's tree model into the app and breaks the swap guarantee;
  persistence stays an opaque blob behind `PreferencesPort` — this held, and
  is exactly what `workspaceLayoutV1` does.
- **A fat, feature-complete `LayoutPort`** mirroring Dockview's API. Rejected —
  violates "Don't Over-Abstract" and makes the free-float adapter impossible to
  fit.
- **(2026-08-11) Build a thin `LayoutPort` in front of the shipped in-house
  engine, purely for future-proofing.** Rejected — there was nothing to be
  polymorphic *over* with a single engine; a port with one implementation is
  exactly the "wrapping a WebSocket that will never be swapped" anti-pattern
  the "Don't Over-Abstract" principle warns against.
- **(2026-08-11, revisited) Extract the `LayoutPort` now that Dockview
  ships as a second engine.** Still rejected, for a narrower reason than
  above: the two engines are deliberately *asymmetric* (six capabilities
  exist only in-house), so a port generalised over them would either encode
  the in-house engine's vocabulary — the leaky facade this ADR warns
  against — or shrink to the two-branch conditional `WorkspaceEngine`
  already is. Revisit when a **third** engine forces a real contract.

## References

- **GenUI L3 spec (2026-08-11)** — the round that triggered this rewrite and
  the Dockview re-costing:
  [superpowers/specs/2026-08-11-genui-l3-pinned-panels-design.md](../superpowers/specs/2026-08-11-genui-l3-pinned-panels-design.md)
- **Dockview engine spec + plan (2026-08-11)** — the round that shipped
  Dockview as the switchable second engine:
  [superpowers/specs/2026-08-11-dockview-layout-engine-design.md](../superpowers/specs/2026-08-11-dockview-layout-engine-design.md),
  [superpowers/plans/2026-08-11-dockview-layout-engine.md](../superpowers/plans/2026-08-11-dockview-layout-engine.md)
- **The shipped engine, mechanism-level:**
  [architecture.md §17.2 The Layout System](../architecture/17-web-client-up-close.md#172-the-layout-system),
  [§10.11 Continuous UI without fighting the framework](../architecture/10-key-design-decisions.md#1011-continuous-ui-without-fighting-the-framework)
- **Full solution catalogue (all libraries + licences + external links):**
  [research/2026-06-22-layout-management-landscape.md](../research/2026-06-22-layout-management-landscape.md)
- Repo cross-refs:
  [architecture.md §1.2 principles](../architecture/01-overview.md#12-architectural-principles),
  [§8 Replaceability Matrix](../architecture/08-replaceability-matrix.md#8-replaceability-matrix),
  [ADR-001 visual-diff tooling](../../packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md)
