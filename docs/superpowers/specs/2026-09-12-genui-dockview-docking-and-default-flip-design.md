# GenUI × Dockview — Jarvis Docking Under the Dockview Engine + Default Flip

**Date:** 2026-09-12
**Status:** Approved (design sections approved by the user 2026-09-12)
**Prerequisite state:** GenUI L3 shipped on the in-house engine (PR #532);
Dockview↔in-house parity complete and all engine residuals retired
(PRs #534→#676, ADR-002); the Dockview-native features spec's disparity
doctrine approved
([2026-09-10-dockview-native-features-design.md](2026-09-10-dockview-native-features-design.md)).

## 1. Intent

Two deliverables, strictly ordered:

1. **Jarvis docked panels work under the Dockview engine** — `dockPanel` /
   `undockPanel` drive commands, the panel-head dock/undock/close controls,
   and per-engine workspace persistence all behave under Dockview as they do
   in-house.
2. **`DEFAULT_LAYOUT_ENGINE` flips `"inhouse"` → `"dockview"`** as the
   round's closing task — never before deliverable 1 is green, because
   flipping first would turn the AI's `dockPanel` command into a silent
   no-op for every default user.

## 2. Decisions taken at brainstorm (2026-09-11/12)

- **Own round, shared doctrine.** This round ships independently of the
  concurrent Dockview-native features workstream, but designs to its
  three-layer disparity doctrine. Its Phase 4 (dynamic panel instances)
  later generalises over the engine API this round adds; its Phase 1 DnD
  audit inherits dynamic panels as drag subjects.
- **Flip timing: final task of this round**, with its own doc/test sweep.
- **Placement: right-edge tile** (mirrors the in-house L3 rule). A Jarvis
  tab-stack placement and a model-chosen position parameter are documented
  future rounds (§9), not built here.
- **Mechanism: layer-2 membership + engine-side reconciliation**
  (approach A). The docked set stays in `JarvisPanelsMachine` +
  `workspaceLayoutV1`; arrangement is engine-private.

## 3. Doctrine fit

Per the disparity doctrine's three layers:

| Layer | This round's content |
|---|---|
| 1. Seed tree | unchanged — static per-tab defaults |
| 2. Semantic state | the **docked set** (panelId → tab), already persisted in `workspaceLayoutV1`; both engines honour it |
| 3. Geometry/arrangement | where a docked panel sits: in-house dock column vs Dockview blob node — projected, never converted |

Dock under Dockview → membership lands in `workspaceLayoutV1` (as today)
*and* arrangement lands in the blob. Switch to in-house → the panel is
docked there too, in the in-house dock column. Switch back → the dragged
Dockview arrangement returns intact. Lossy on screen, lossless on disk.

## 4. Engine API (`@rtc/layout-dockview`)

`DockEngine` gains two methods beside `collapsePanel`/`maximizePanel`:

```ts
/** Insert a panel that is not part of the seed tree. A new group is added
 * at the RIGHT EDGE of the grid, initial width 360 (the in-house
 * DOCK_COLUMN_INITIAL_PX), held as a design-pin-style min=max constraint
 * released on the first sash drag in that split. */
addDynamicPanel(panelId: string, spec: DockDynamicPanelSpec): void;
/** Remove a dynamic panel. A panel stacked into a shared group leaves the
 * group; the group survives if other tabs remain. */
removeDynamicPanel(panelId: string): void;
```

`DockDynamicPanelSpec` carries `title` and `maximizeScope` (the same fields
the static `PanelSpec` feeds the engine today). Dynamic panels are ordinary
Dockview nodes — the blob serialises them with no format change and **no
`rtcBlobVersion` bump**; "dynamic" is derived at restore time as "not in
`opts.panels`", never stored.

**Restore-time reconciliation** (inside `createDockEngine`, after blob
restore and intent replay):

1. The blob owns **arrangement**: a dynamic panel present in both the blob
   and the layer-2 docked set keeps its blob position (a user drag
   survives reload).
2. The layer-2 set owns **membership**: a docked id absent from the blob is
   added at the right edge; a dynamic id in the blob absent from layer 2 is
   removed (the same orphan rule the L3 in-house parser applies).
3. A blob whose dynamic node cannot be restored degrades to **dropping that
   panel** (it re-enters via rule 2 at the right edge), never the whole
   tab — extending the existing fall-back-to-seed net.

Interplay obligations (each an engine jsdom test, §7): a dynamic panel can
be collapsed, expanded, maximized (`maximizeScope` honoured), participates
in the `stripDir` walk and `preStripWorlds`, and its removal while stripped
or maximized restores the surrounding geometry exactly as a static panel's
expand/restore would.

## 5. Bridges & composition

**Bridges (both clients).** `DockviewLayoutEngineProps` (and the Solid
mirror) gain `docked: readonly PanelId[]` — the **active tab's** docked ids,
from the same layer-2 source the in-house tree reads — beside
`maximized`/`collapsed`. A diff effect calls
`addDynamicPanel`/`removeDynamicPanel`; the StrictMode `engineVersion`
replay re-pushes `docked` exactly as it re-pushes the collapse set (#649
pattern). Content, head, and controls mount through the existing
`MountedSlot` portal path — App already passes the merged
registry/specs/headRegistry to the Dockview branch (the L3 round threaded
them; the in-code comment marking this gap is deleted by this round).

**Composition: untouched semantics.** `dockPanelIntoWorkspace` /
`undockPanelFromWorkspace` / `dismissPanelFromWorkspace` keep doing exactly
what they do today (machine flag + in-house tree op + persistence writer)
regardless of the active engine — that is what keeps membership
engine-neutral. `MAX_DOCKED_PANELS = 4`, the `STATIC_WORKSPACE_PANEL_IDS`
guard, the four `DriveCommand` skip reasons, and persona text are all
unchanged. The only composition-side addition allowed: exposing the active
tab's docked ids as a stream if the bridges cannot already derive them from
the existing `dockedPanelIds$` + tab context.

**Reset.** "Reset workspace layout" must clear **both** stores — the
`workspaceLayoutV1` preference (shipped) and the per-tab Dockview blobs.
Verify whether the shipped reset already clears the blobs; if not, extend it
in this round.

## 6. Default flip (closing task)

- `DEFAULT_LAYOUT_ENGINE: LayoutEngine = "dockview"` in
  `packages/domain/src/preferences/preferences.ts`; the
  `PreferencesPortContract` "defaults layoutEngine" case updates with it.
- Preferences-modal copy: the "(default)" marker moves to Dockview in both
  clients; goldens re-pinned for the prefs-modal scenarios that show it.
- **Blast-radius sweep** (the #541 lesson — grep for *implicit-default
  premises*, not just the constant): CLAUDE.md, ADR-002, STATUS.md,
  architecture docs, and the `layout-dockview` package description all say
  "default in-house" today; every statement flips or is rephrased.
- **e2e** then runs Dockview by default. The engine-switch journey inverts
  (default → switch to **in-house** → drag-dock equivalent → reload →
  revert), still proving runtime swappability.
- **Visual matrix: unchanged.** Scenarios seed the engine explicitly per
  twin; nothing reads the default. The engine-parity report's shared subset
  is unaffected by the flip itself.
- **Deployed users:** a stored `layoutEngine` preference is respected
  (users who chose in-house stay there); only users without one see the
  change. Nothing is deleted — the in-house arrangement in
  `workspaceLayoutV1` stays for whenever they switch back. The in-house
  engine remains fully supported (the disparity doctrine requires it).

## 7. Testing & gates

- **Engine (jsdom, `packages/layout-dockview`):** add/remove placement +
  the 360px pin + pin release on drag; the three reconciliation rules;
  unknown/corrupt dynamic blob node tolerance; interplay matrix (dynamic ×
  collapse / maximize / strips / pins / fully-stripped column); the
  `engineVersion`-replay re-push.
- **Contract (`DockviewEngine.contract.spec.ts`, both clients):** docked
  panel mounts body/head under Dockview; undock removes it; dock survives
  an engine rebuild.
- **Visual:** `layout/fx-docked-panel-dockview` — the twin of the shipped
  L3 scenario, seeded through `AppData` (engine + docked panel), following
  the 5-edit recipe with both golden sets regenerated; it joins the
  engine-parity shared subset.
- **e2e:** one journey — dock via Jarvis → reload → panel persists → undock
  — under the Dockview engine (pre-flip: seeded; post-flip: the default).
- The usual full gauntlet per PR; the four ≥95% coverage gates unaffected
  by design (new bridge code lands with its specs).

## 8. Risks & coordination

- **Concurrent-session collision** in `createDockEngine.ts` and the bridges
  (the Dockview-native features session's Phase 1 audit reads the same
  files). Mitigation: land the engine-API PR small and early; both specs
  cross-reference; their DnD audit must treat dynamic panels as first-class
  drag subjects.
- **Sidecar keying:** `rtcStripGeometry` / `rtcDesignPins` key on panelIds;
  dynamic panel ids are freeform Jarvis-minted ids — verify no assumption
  anywhere that a blob panelId is a member of the static `PanelId` union.
- **Solid remount residual:** the accepted L3 membership-change remount in
  the Solid tab applies to the layer-2 set, not the engine — unchanged by
  this round; re-disclose at review rather than re-litigate.
- **Flip is one-commit revertible:** the constant + copy + doc sweep land
  as the round's own final PR so a bad soak reverts cleanly without
  touching the docking feature.

## 9. Future rounds (documented, not built)

- **Jarvis tab-stack placement** — all docked Jarvis panels as tabs in one
  right-edge group; sensible only after the Dockview-native features
  workstream's Phase 2 ships stacked-tab chrome.
- **Model-chosen placement** — a position parameter on the `dockPanel`
  drive command (grows the drive vocabulary + persona; wants demonstrated
  need first).
- The **5th `DriveCommand` skip reason** for static-id dock collisions
  stays on the STATUS backlog, unchanged by this round.

## 10. Prior art

- GenUI L3: [2026-08-11-genui-l3-pinned-panels-design.md](2026-08-11-genui-l3-pinned-panels-design.md)
- Dockview engine: [2026-08-11-dockview-layout-engine-design.md](2026-08-11-dockview-layout-engine-design.md)
- Disparity doctrine: [2026-09-10-dockview-native-features-design.md](2026-09-10-dockview-native-features-design.md)
- ADR: [../../adr/ADR-002-layout-management-port.md](../../adr/ADR-002-layout-management-port.md)
