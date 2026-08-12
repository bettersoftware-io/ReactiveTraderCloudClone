# Dockview layout engine — switchable second engine, in-house default

**Date:** 2026-08-11
**Status:** Approved design (pre-implementation)
**Realises:** [ADR-002](../../adr/ADR-002-layout-management-port.md) (first
off-the-shelf docking adapter), with one recorded deviation — see §8.

## 1. Goal and shape

Add **Dockview** (vanilla `dockview-core`) as a second, user-selectable layout
engine for both web clients, delivering the Golden-Layout-style workspace UX
the reference RTC has and the clone lacks: **drag tabs/panels to re-split and
re-order, with the resulting layout persisted and restored per workspace tab.**

Landing shape mirrors the canvas chart substrate (PR #520): a **preference
row selects the engine, the in-house engine stays the default**, and the
default path is untouched — zero golden/e2e churn for users who never flip
the switch. Dockview can be promoted to default later, as a separate decision.

Out of scope for v1 (explicitly): floating groups, pop-out OS windows,
close/reopen of panels, custom group-header actions, React Native (nothing
dockable there), and the ADR-002 thin-port refactor (§8).

## 2. Preference & selection

New domain preference, modelled verbatim on `ChartSubstrate`:

- `packages/domain/src/preferences/preferences.ts`:
  `export type LayoutEngine = "inhouse" | "dockview"`, default `"inhouse"`,
  `LAYOUT_ENGINES` list.
- `PreferencesPort`: `layoutEngine$(): Observable<LayoutEngine>` +
  `setLayoutEngine(engine: LayoutEngine): void` (replay-current, synchronous
  first emission, like every other pair).
- Wired through the full known blast radius (~10 sites): the four
  preferences adapters (2× `LocalStoragePreferencesAdapter`,
  `AsyncStoragePreferencesAdapter`, in-memory/fixture), the preferences
  contract test, the presenter that feeds the prefs modal, both bindings,
  `ui-contract` fixtures.
- Prefs modal: a **"Layout engine"** row (In-house / Dockview) in both web
  clients, placed with the existing renderer rows (next to "Chart renderer").
  RN surfaces no row; the preference still round-trips through its adapter so
  the port contract holds.

`WorkspaceEngine` (in each client's `App`) branches on the preference:
`"inhouse"` renders today's `InhouseLayoutEngine` path **unchanged**;
`"dockview"` renders the new bridge component (§4).

## 3. New package `@rtc/layout-dockview`

A DOM-touching leaf in the `@rtc/boot-splash` mould: **no `@rtc/*` imports**
(dep-cruiser rule `layout-dockview-stays-pure` + the
`tsconfig.depcruise.json` line pair — the dormant-rules trap), runtime dep
**`dockview-core` only**.

Pinned version: **`dockview-core@7.0.4`** (2026-07-22, MIT). The current
latest is 8.0.0, released 2026-08-10 — under the 24-hour dep-freshness
cooldown at design time *and* a brand-new major with no community soak; the
7→8 bump is a tracked follow-up, not part of v1.

Framework-neutral API (final shape decided at implementation; this is the
contract level):

```ts
export type DockSeedNode =
  | { kind: "split"; dir: "row" | "column";
      children: readonly DockSeedNode[]; sizes: readonly number[] }
  | { kind: "panel"; panelId: string };

export interface DockPanelHooks {
  title(panelId: string): string;
  /** Mount framework-native content into the element Dockview owns;
   * returns the disposer. */
  mount(panelId: string, element: HTMLElement): () => void;
}

export function createDockEngine(opts: {
  container: HTMLElement;
  seed: DockSeedNode;
  blob: string | null;          // restored if valid; seed on null/parse failure
  panels: DockPanelHooks;
  onLayoutChange(blob: string): void;  // debounced api.toJSON() serialisation
}): {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  dispose(): void;
};
```

Internals:

- **Seed conversion** — pure `DockSeedNode → Dockview layout` mapping
  (`fixedPx`/`initialPx`/pinned subtleties do not cross; sizes become
  proportional splits). Unit-tested in isolation.
- **Restore** — `fromJSON(JSON.parse(blob))` inside try/catch; any failure
  (stale schema, unknown panel id, corrupt JSON) falls back to the seed. A bad
  blob can never brick the workspace.
- **Serialisation** — `onDidLayoutChange` → debounce → `toJSON` →
  `onLayoutChange(blob)`. The blob is opaque above this line (ADR-002's
  persistence rule, kept).

`DockSeedNode` is deliberately the package's own type: it is structurally a
subset of `client-core`'s `LayoutNode`, so the client-side "conversion" is a
type-level identity over the shared shape, and the package stays `@rtc`-free.

## 4. Per-client bridge + persistence

Each web client adds one bridge component,
`src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` (~100 lines):

- On mount: read the blob from the `DockLayoutStore` (below), call
  `createDockEngine` with the tab's default tree
  (`createDefaultLayoutPort(tab).initial.root`) as seed, the client's
  registries as panel hooks, and a save-on-change callback. Dispose on
  unmount.
- **Content**: `mount(panelId, el)` renders the existing `appPanelRegistry`
  entry — React via `createRoot(el).render(...)` (wrapped in the app's
  providers), Solid via `render(...)`. The panel's `appHeadRegistry` head
  (filters, pills) renders as a strip above the body **inside** the panel;
  Dockview's tab shows the `PANEL_SPECS` title. Content/placement separation
  is preserved verbatim; the registries are untouched.
- Panel content stays inside `PanelErrorBoundary` semantics (React reuses the
  existing boundary; Solid its equivalent).

**Persistence** — a small `DockLayoutStore` interface in `client-core`
(`load(tab): string | null`, `save(tab, blob): void`), with a
`LocalStorageDockLayoutStore` adapter per web client (the
`LocalStorageSessionStore` precedent), key `rtc.dockLayout.v1.<tab>`, one
blob per workspace tab, composed in `buildBrowserPorts`. `PreferencesPort`
stays enum-typed; the opaque blob does not belong there.

## 5. State ownership + Jarvis mapping

In Dockview mode, **Dockview owns geometry**; the `LayoutMachine` no longer
drives the visible tree but keeps running as the **command surface**:

- The bridge subscribes to `layoutFor(tab)` state and mirrors `maximized`
  into `maximizePanel(id)` / `exitMaximize()` — so Jarvis's `layout`
  DriveCommand (and the scripted hands-free demo) still visibly
  maximizes/restores under Dockview.
- `collapse`/`expand`/`resize` intents are in-house-engine semantics and
  no-op visually in Dockview mode (documented, not mapped).
- **No reverse sync**: Dockview never writes into `LayoutState`. The app
  never parses Dockview's tree.

## 6. Styling

Dockview's chrome is themeable via CSS custom properties. One stylesheet
(living in the leaf package, shared by both clients) maps Dockview's
variables onto the HUD token palette so tabs/splitters/chrome track both
theme modes and skins. No bespoke chrome beyond variable mapping in v1.

## 7. Testing & gates

- **Unit** (`@rtc/layout-dockview`): seed conversion, blob-fallback paths,
  serialisation round-trip — the pure parts, in jsdom.
- **Contract** (`@rtc/ui-contract`, both clients): prefs-row spec mirroring
  the chart-substrate cases (row renders, selection persists, engine branch
  switches) + a Dockview-branch mount assertion (container renders when the
  preference is `"dockview"`). Per-file coverage checked, not just the ≥95%
  aggregate gates.
- **e2e** (Playwright, React + Solid): switch preference → Dockview chrome
  appears → drag a tab to re-split → reload → layout persisted → reset
  preference restores the in-house engine.
- **Visual**: prefs-modal goldens regenerate (the new row shifts the modal —
  mandatory, both buckets + x86 via the dispatch workflow). One
  `dockview-engine` workspace scenario added only if it renders
  deterministically; otherwise skipped with a note in COVERAGE-GAPS.
- **New-package gates**: knip keys, syncpack range, eslint/tsconfig paths,
  dep-cruiser pair, turbo (automatic via workspace) — the "gates cover every
  package" checklist.

## 8. Recorded deviation from ADR-002, and docs

ADR-002 sketched a thin `LayoutPort` (open/close/focus + opaque blob) hiding
all geometry. The shipped codebase instead has a **tree-shaped consumption
contract** (`LayoutPort = { initial: LayoutState }`) owned by the in-house
engine. v1 does **not** retrofit the thin port: Dockview lands as a second
engine behind the existing seam, honouring ADR-002's real invariants —
content/placement separation via the registries, opaque persistence blob,
no engine vocabulary crossing into `client-core` — while deferring the port
abstraction until a second docking adapter exists to generalise over.

Doc changes shipped with v1:

- **ADR-002**: status → Accepted; add an "as-implemented" section recording
  the deviation above and pointing here.
- **Replaceability matrix** (architecture §8): layout-engine row updated
  (in-house + Dockview, cost-to-swap, contract, tests).
- **STATUS.md**: layout-management backlog entry updated via the tracking
  skill.
