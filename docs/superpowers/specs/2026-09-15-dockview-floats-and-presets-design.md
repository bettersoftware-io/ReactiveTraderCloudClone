# Dockview Floating Groups + Layout Presets (Phase 6) — Design

**Date:** 2026-09-15
**Status:** Approved (scope and every decision below confirmed by the user 2026-09-15)
**Parent spec:** [2026-09-10-dockview-native-features-design.md](2026-09-10-dockview-native-features-design.md) §3 Phase 6 — this document supersedes that outline with the decided shape.
**Prerequisite state:** Phases 1–5 shipped (#707 DnD, #715 tab stacks, #718 close/reopen + View menu, #738 chart instances, #727 pop-outs), all user-accepted. Sash carriers A and B closed (#737, #739).

## 1. Intent

Close the Dockview-native workstream with its last two capabilities, under the
parent spec's disparity doctrine (layer 1 seed / layer 2 semantic machine state
/ layer 3 Dockview-private blob):

- **6a — Floating groups.** A panel can be torn into a floating box *inside*
  the page, dragged and resized freely, and docked back home.
- **6b — Layout presets.** Named save / load / delete of a tab's whole visible
  state, plus a per-tab "Default" that restores the shipped layout.

They ship as **two plans and two PRs, 6a first**, because a preset must be able
to record and restore floats.

### Decided scope (the questions this spec answers)

| Question | Decision |
|---|---|
| Float survives reload? | **Yes** — a float is layer-3 arrangement, like a drag or a stack. (Pop-outs stay session-scoped; this is the deliberate difference.) |
| How a float is created | **Header button** (`float`, beside Phase 5's pop-out control) **and** Dockview's shift-drag gesture, kept enabled. |
| Preset scope | **Per tab** (`WorkspaceTab`), matching every existing layout store. |
| What a preset records | **Everything visible** — layer 2 (`closed`/`collapsed`/`maximized`/`instances`) *and* layer 3 (positions, sizes, stacks, floats). |
| Presets under the in-house engine | **Dockview only.** Only "Default" (= reset this tab) is offered under in-house. |

### Out of scope (deliberate, cheap to add later)

Preset rename; a "changed since loaded" dirty marker; cross-device or per-user
server storage; preset import/export; floats in the in-house engine; a preset
that spans all four tabs.

## 2. Today's ground truth (measured, not assumed)

- **Floats are already reachable and unowned.** `createDockEngine`'s
  `createDockview(...)` options (`createDockEngine.ts:270`) never set
  `disableFloatingGroups`, and dockview-core 8.3.1 calls
  `accessor.addFloatingGroup(...)` on a tab (or tab-bar void) `pointerdown`
  whenever `!options.disableFloatingGroups && event.shiftKey`. So shift-drag
  floats a group **today**, untested against pins, strips, maximize and
  instance sharing.
- **A float already persists, unscrubbed.** `withoutPopoutGroups`
  (`dockBlob.ts:487`) strips `popoutGroups` before every save; there is no
  `floatingGroups` equivalent, so `api.toJSON()`'s floats go to disk as-is.
  6a's job is to make that intentional and survivable, not to introduce it.
- **Pop-out is the shape to mirror.** `DockEngine.popoutPanel`
  (`createDockEngine.ts:240`), the `onPopoutsChange` callback fed by
  `publishPoppedPanels()`, the bridge's `data-popped` witness, and
  `PanelHeadControls`' `onPopout` slot.
- **Layer 2** lives in one preference, `workspaceLayoutV1`
  (`WorkspaceLayoutV1 { v: 1; tabs: Partial<Record<WorkspaceTab, PersistedTabLayout>> }`),
  read/written by `workspaceLayoutPersistence.ts` +
  `workspacePersistenceWriter.ts` (500 ms debounced read-modify-write).
- **Layer 3** lives per tab in `DockLayoutStore` (`core-api/src/adapters.ts:48`),
  `LocalStorageDockLayoutStore`, key `rtc-dock-layout-${tab}`;
  `DOCK_BLOB_VERSION = 2`; `migrateDockBlob` upgrades older blobs;
  `loadBlobOrSeed` falls back to `withoutDynamicNodes`, then to
  `convertSeed(...)`, and never throws.
- **A reset exists, but global.** `Presenters.resetWorkspaceLayout()`
  (`composition.ts:871`), wired to Preferences → "Reset workspace layout",
  nulls `workspaceLayoutV1`, calls each machine's `reset()`, dismisses docked
  panels and clears **every** tab's blob.
- **`LayoutIntents`:** `maximize`, `restore`, `collapse`, `expand`, `resize`,
  `insertPanel`, `removePanel`, `close`, `reopen`, `openInstance`,
  `closeInstance`, `reset`. **`LayoutState`:** `root`, `maximized`,
  `collapsed`, `closed`, `instances`.
- **View menu:** `ViewMenu.tsx` in both clients (from `HeaderChrome.tsx`), one
  flat `menuitemcheckbox` list of the active tab's static panels, no sections.

## 3. Part 6a — Floating groups

### 3.1 Engine surface (`packages/layout-dockview`)

```ts
/** Floats panelId's group as a free box inside the dock; false when refused. */
floatPanel(panelId: string): boolean;
/** Returns a floating panel to its seed-home slot. */
dockPanel(panelId: string): void;
```

- `onFloatsChange?: (panelIds: readonly string[]) => void` in
  `DockEngineOptions`, published by a `publishFloatingPanels()` twin of
  `publishPoppedPanels()`, so the bridge can style heads and drive the button
  without reading Dockview.
- Options set **explicitly** (naming the deviation, leaving the default bare):
  `floatingGroupBounds: "boundedWithinViewport"` so a float cannot be dragged
  out of reach. `disableFloatingGroups` stays unset — shift-drag is a kept
  feature, and the spec says so rather than relying on silence.
- `dockPanel` reuses Phase 3's seed-home re-add path (the one `reopen` uses),
  so a docked-back panel lands where the seed puts it.

### 3.2 Interplay rules (the core deliverable)

| Interaction | Rule |
|---|---|
| Design pin (`initialPx` rail) | Floating **suspends** the pin (live `min=max` constraints must not clamp a floating group) and keeps its record; docking home re-applies it. Same pattern as maximize's pin suspension (#738 R-series). |
| Collapse / maximize of a floating panel | Refused by the engine **and** not offered: `PanelHeadControls` hides collapse/maximize while `floating`. |
| A maximize is active | Float creation is blocked — button hidden, and the shift-drag gesture cancelled via `onWillDragGroup`. A float while a strip owns the grid has no coherent home to return to. |
| Collapsed / maximized panel, then floated | Cannot happen (previous row). No strip may hold a floating member. |
| Maximizing a *docked* panel while floats exist | Floats stay visible above the strip — they are boxes over the grid, not grid members. |
| Chart instances (#738) | A floating instance leaves the share rule: `instanceSplitOf` returns null for it and `shareSplitAmongInstances` ignores it. Docking home re-enters the share. |
| Pop-out of a floating group | Allowed; `withoutPopoutGroups` behaviour unchanged. |
| In-house engine | No projection needed — the panel renders at its seed slot; floats are layer-3 invisible. |

### 3.3 Persistence

- Floats **stay** in the saved blob. `DOCK_BLOB_VERSION` stays `2`: the field is
  additive and older blobs simply carry no floats, so no migration.
- `loadBlobOrSeed` gains one retry tier between the existing ones: full blob →
  `withoutDynamicNodes` → **`withoutFloatingGroups`** (on top of the previous
  strip) → seed. A damaged float costs you the floats, never the layout.
- Each tier must be **distinguishable in the returned `RestoredLayout`**, not
  inferred from a silent success — this is the repo's "absence reported as a
  clean reading" class, and #739's `seeded` flag is the precedent.

### 3.4 UI (both clients, moving together)

`PanelHeadControls` gains an `onFloat` slot beside `onPopout` (slots are `onX`
by the handler-naming doctrine; the concrete handlers are named for their
effect). `DockviewLayoutEngine` wires it, adds a `data-floating` witness
alongside `data-popped`, and hides collapse/maximize on a floating head.
`dockview-hud.css` styles the floating shell as in-house panel chrome (card,
38 px head, shadow, resize edges) per skin.

### 3.5 Tests and gates

- **Engine (jsdom):** the §3.2 matrix, one test per row, plus reload-restores-a-float
  and each `loadBlobOrSeed` tier asserted through its distinguishable flag.
- **Contract specs** (swap-trio, both clients): the float button's presence,
  its toggle, and the hidden collapse/maximize while floating.
- **e2e, one per client:** float → reload → still floating → dock home.
- **Visual:** the new head control changes every Dockview scenario's pixels.
  Regenerate **both** golden sets (`react/` via `update-visual-goldens.yml`
  with the `-g` pattern equal to the workflow pattern, and
  `react-local/darwin-arm64`), and read the tolerance note in
  `/rtc:visual-tolerance-audit` first: a small new control is exactly what a
  loose ratio hides. No user-shaped float joins the golden matrix.
- **Engine parity** stays green on the shared subset; in-house visual assert run
  locally before merge (the #664 lesson).

## 4. Part 6b — Layout presets

### 4.1 Storage and shape

A new port beside `DockLayoutStore` in `core-api/src/adapters.ts`:

```ts
interface LayoutPresetStore {
  list(tab: WorkspaceTab): readonly StoredLayoutPreset[];
  save(tab: WorkspaceTab, preset: StoredLayoutPreset): void;
  remove(tab: WorkspaceTab, id: string): void;
}

interface StoredLayoutPreset {
  readonly v: number;        // LAYOUT_PRESET_VERSION, starts at 1
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;  // ISO
  readonly layout: PersistedTabLayout;  // layer 2, the existing serialized shape
  readonly blob: unknown;               // layer 3, opaque, as written to DockLayoutStore
}
```

`LocalStorageLayoutPresetStore`, key `rtc-layout-presets-${tab}`. A record whose
version is unknown or whose JSON is unreadable is **surfaced, not dropped**: the
presenter reports it as `{ id, name, readable: false }` so the menu can grey it
out and offer delete. Silently discarding it would be the same failure class as
§3.3.

### 4.2 Presenter and machine

- `Presenters.layoutPresets` exposes, per tab, a `StateStream` of preset
  summaries plus commands: `saveLayoutPreset(tab, name)`,
  `loadLayoutPreset(tab, id)`, `deleteLayoutPreset(tab, id)`,
  `resetTabLayout(tab)`.
- **Save captures a LIVE engine snapshot,** not the last persisted blob:
  `DockEngine` gains `snapshotLayout(): unknown` returning exactly what its
  `onLayoutChange` write would produce, and the bridge registers it. Reading the
  debounced store instead would save a stale picture that still looks like a
  clean save.
- **Load order,** which is load-bearing: (1) close the tab's pop-outs and dock
  their panels; (2) write the preset's blob to `DockLayoutStore`; (3) apply
  layer 2 through a new intent `replaceLayout(state)`; (4) rebuild the tab's
  engine so it loads the written blob.
- **Step 4 is measured before it is designed.** #738 showed that layer-2 replay
  effects are gated on the live-engine state and only reach a second engine
  instance. The 6b plan's first task probes the rebuild path and reports; if a
  rebuild cannot be made exact, the fallback is an in-place `api.fromJSON` on
  the existing instance. Neither branch may be assumed.
- **Default** is not a stored record. It is a built-in list head, and loading it
  is `resetTabLayout(tab)`: `machine.intents.reset()` + `dockLayoutStore.clear(tab)`
  + rebuild, **for that tab only**. It works under both engines.
- `Presenters.resetWorkspaceLayout()` keeps its all-tabs scope and **must not**
  clear any preset store — asserted by a test, not by inspection.

### 4.3 Rules

`MAX_LAYOUT_PRESETS = 10` per tab. Names are trimmed, 1–40 characters,
case-insensitively unique per tab, and `"Default"` is reserved. Saving over an
existing name replaces that record after an in-menu confirm.

### 4.4 UI (both clients)

`ViewMenu` gains a **LAYOUTS** section below the existing panel list, separated
by a section head (the menu's first sections; it is a flat list today):

- `Default` row — loads the shipped layout for this tab.
- One row per saved preset — click loads; a bin button deletes after a second,
  in-menu confirm; an unreadable preset renders greyed with delete only.
- `Save current as…` — expands an inline text field with Save/Cancel inside the
  menu. No `window.prompt`; the dumb-UI rule keeps the value in the presenter.
- Under the in-house engine, only `Default` is rendered.
- Roles: `menuitem` rows in a labelled group, keyboard-reachable, with the
  existing menu's focus handling.

### 4.5 Tests and gates

- **Core:** presenter + store units — save, load, delete, the name rules, the cap,
  the unreadable record, and `resetWorkspaceLayout` leaving presets intact.
- **Contract specs** (both clients): the section's rows, the inline save field,
  both confirms, the greyed unreadable row, and the in-house-only-Default case.
- **e2e, one per client:** save → rearrange → load → reload → delete.
- **Visual:** the open View menu with a LAYOUTS section, as Dockview and
  in-house variants. The visual host seeds preset names through `AppData`
  (a new `layoutPresets` field) — seeded, never clicked, per the visual-host
  no-op-intents rule.
- **Coverage:** the ≥95% contract gates for both clients, per-file checked
  (`pnpm coverage:gaps`), not just the aggregate.

## 5. Global constraints (bind every task in both plans)

- Both web clients move together, with the swap-trio contract specs, visual
  scenarios for resting states, and e2e where interaction warrants it.
- Dumb UI: no rxjs, localStorage or fetch in `src/ui`; CSS Modules only, no
  inline styles; `#/` alias imports.
- Handler naming: concrete handlers named for their effect; `onX` only for slots.
- React Compiler by default (no hand-rolled memo) in `client-react`; Solid may
  need a per-slot memo, as #738 did.
- Nothing may degrade the in-house engine; the parity report stays green on the
  shared subset.
- `/rtc:gauntlet full` before every push; PR CI matched by `headSha`; CodeQL
  open-alert check before merge; merge with `--merge`.

## 6. Risks

- **Floats × the width machinery.** Pins, strips and the #738 instance-share
  rule are all keyed on panel ids inside a geometry a float leaves. §3.2 is the
  mitigation, and its rows are the engine test list.
- **Rebuild-on-load (§4.2 step 4).** The known trap from #738. Mitigated by
  measuring first and keeping the in-place `fromJSON` branch available.
- **Golden churn.** 6a repaints every Dockview scenario. Regenerate both sets
  deliberately, in 6a, and judge the diff against the measured noise floor.
- **Real-app acceptance is the gate that found the #738 bugs.** Both parts get a
  driven-by-me pass in the real app, then a user-acceptance pass, before merge.
