# GenUI × Dockview — Docking Under Dockview + Default Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis `dockPanel`/`undockPanel` work under the Dockview engine (right-edge tile, per-engine persistence, engine-switch-lossless membership), then `DEFAULT_LAYOUT_ENGINE` flips to `"dockview"` as the strictly-final task.

**Architecture:** The docked set stays layer-2 semantic state (`JarvisPanelsMachine` + `workspaceLayoutV1`); `createDockEngine` gains `addDynamicPanel`/`removeDynamicPanel` plus construction-time reconciliation (blob owns arrangement, layer 2 owns membership); each client bridge drives them from a new per-tab docked-ids stream. Composition's dock/undock/dismiss semantics are untouched.

**Tech Stack:** TypeScript, dockview@7.0.4 (`DockviewApi.addPanel`/`removePanel`), RxJS, React 19 + SolidJS bridges, vitest jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-genui-dockview-docking-and-default-flip-design.md`

## Global Constraints

- The flip (Task 10) lands ONLY after Tasks 1–9 are green — never reorder.
- Ship as TWO PRs: Tasks 1–9 (feature), Task 10 (flip) — the flip must be one-commit revertible (spec §8).
- `MAX_DOCKED_PANELS = 4` stays exactly where it is (JarvisPanelsMachine.ts:19 + the hand-duplicate in workspaceLayoutPersistence.ts:91). The engine gets NO third copy — composition already gates.
- `360` is single-sourced: `DOCK_COLUMN_INITIAL_PX` (`packages/client-core/src/layout/dockColumn.ts:7`). `@rtc/layout-dockview` has no `@rtc/*` deps, so the value arrives via the new `DockDynamicPanel.initialPx` — never re-declared in the engine package.
- NO `rtcBlobVersion` bump (stays 2). Dynamic panels are ordinary nodes; "dynamic" is derived (not in the seed), never stored.
- Pins persist the PUBLIC card width; the engine adds `GROUP_GAP_PX` (7) at clamp time — a 360 pin clamps at 367 (createDockEngine.ts:850 convention).
- Both web clients move together: every bridge/UI change ships in React and Solid with the shared contract specs.
- Composition's dock semantics unchanged: `dockPanelIntoWorkspace`/`undockPanelFromWorkspace`/`dismissPanelFromWorkspace` (composition.ts:864–937) keep their bodies except where a task names an exact edit.
- Repo gates: Biome (`biome ci`), mandatory braces, `rtc/name-functions-by-effect` (name functions by effect, slots stay `onX`), no rxjs/localStorage in `src/ui`, dep-cruiser (`layout-dockview-stays-pure` — no new deps there).
- In-house engine must not regress (disparity doctrine): no in-house file is touched except App.tsx wiring and the lazy-load swap in Task 10.

## Plan-time findings (deviations from the spec's lettering, all verified by recon)

1. Spec §4 said "dynamic = not in `opts.panels`" — impossible: `opts.panels` is a hooks object with no id roster. The static set is derived from `opts.seed` via a newly-exported `seedPanelIds` (dockSeed.ts's private `panelIdsUnder:319`).
2. Spec §4's `DockDynamicPanelSpec { title, maximizeScope }` shrinks to `DockDynamicPanel { id, initialPx }` — title and maximizeScope already flow through the existing `DockPanelHooks` (`title()`, `maximizeScope?()`), which the bridges feed from the merged `specs`.
3. Spec §5's "engineVersion replay (#649 pattern)" is actually React's `liveEngine` state + `appliedCollapse` ref (DockviewLayoutEngine.tsx:92, :80); Solid remounts per tab and keeps a module-local `applied`. The `docked` effect follows each client's own idiom.
4. Spec §5's "Reset … verify, else extend": verified — Reset does NOT clear the blobs. `DockLayoutStore` gains `clear(tab)` (Task 3).
5. Spec §6's "(default)" marker does not exist; the flip's prefs-modal impact is the ACTIVE segment in the `prefs-open` fixture → `prefs/modal` + `prefs/content` golden re-pins.
6. New find: both App.tsx lazy-load the Dockview bridge because "the default in-house engine serves ~100% of users" — the flip inverts that premise (Task 10 swaps which engine is lazy).

---

### Task 1: Engine — `seedPanelIds`, `addDynamicPanel`, `removeDynamicPanel`

**Files:**
- Modify: `packages/layout-dockview/src/dockSeed.ts` (export `seedPanelIds` wrapping the private `panelIdsUnder:319`)
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (types near :78; methods in the return literal at :980; index.ts already `export *`)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts` (new `describe("dynamic panels")`)

**Interfaces:**
- Consumes: `api.addPanel` (`AddPanelOptions`, `position: { direction: "right" }` = AbsolutePosition → new group at the grid's right edge), `api.removePanel(panel)`, `RTC_PANEL_COMPONENT` (`"rtc-panel"`, dockSeed.ts:4), design-pin machinery (`applyDesignPins:808`, `clampTo:1562`), strip ledgers (`records:324`, `maximized:362`), `GROUP_GAP_PX = 7`.
- Produces (later tasks rely on these exact shapes):
  ```ts
  export interface DockDynamicPanel {
    readonly id: string;
    /** Rendered card width of the new right-edge group, px. Callers pass the
     * client's DOCK_COLUMN_INITIAL_PX (360) — this package has no @rtc deps. */
    readonly initialPx: number;
  }
  // on DockEngine:
  addDynamicPanel(panel: DockDynamicPanel): void;   // no-op if the id already exists
  removeDynamicPanel(panelId: string): void;        // no-op for an unknown id
  // from dockSeed.ts:
  export function seedPanelIds(root: DockSeedNode): readonly string[];
  ```

- [ ] **Step 1: Write the failing tests** (new describe at the end of `createDockEngine.test.ts`, using the existing harness: `base()`, `trackLayout()`, `lastDockviewApi()`, `waitForSize`, `dragSash` — lift `grabSash`/`dragSash` from the pins-describe scope `:1312–1328` to file scope first):

```ts
describe("dynamic panels (Jarvis docking — GenUI × Dockview)", () => {
  const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;

  it("adds a dynamic panel as a new right-edge group at its initialPx card width", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const api = lastDockviewApi();
    expect(api.getPanel("panel-dyn-1")).toBeDefined();
    // its own group — not stacked into an existing one
    expect(api.getPanel("panel-dyn-1")?.group.panels).toHaveLength(1);
    engine.dispose();
  });

  it("is idempotent — adding an existing id changes nothing", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const before = lastDockviewApi().groups.length;
    engine.addDynamicPanel(DYN);
    expect(lastDockviewApi().groups.length).toBe(before);
    engine.dispose();
  });

  it("persists the dynamic panel's pin and releases it on a sash drag", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    const container = seen.container; // adjust to harness: base() containers are tracked
    engine.addDynamicPanel(DYN);
    await waitForPins(seen, (pins) =>
      pins.some((p) => p.panelIds.length === 1 && p.panelIds[0] === "panel-dyn-1" && p.px === 360),
    );
    dragSash(attachedContainers[attachedContainers.length - 1], ".dv-horizontal");
    await waitForPins(seen, (pins) =>
      pins.every((p) => !p.panelIds.includes("panel-dyn-1")),
    );
    engine.dispose();
  });

  it("removes a dynamic panel and its group", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.removeDynamicPanel("panel-dyn-1");
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    engine.removeDynamicPanel("panel-dyn-1"); // unknown id: no-op, no throw
    engine.dispose();
  });

  it("purges the strip ledger on removal — no phantom rtcStripGeometry", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.collapsePanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", STRIP);
    engine.removeDynamicPanel("panel-dyn-1");
    await vi.waitFor(() => {
      const blob = JSON.parse(seen.blob());
      expect(JSON.stringify(blob.rtcStripGeometry ?? {})).not.toContain("panel-dyn-1");
    });
    engine.dispose();
  });

  it("a dynamic panel joins the stripDir walk — collapsing it as the column's last panel flips the column", async () => {
    // Dock, collapse the dynamic panel: it is a lone-panel column at the right
    // edge, so its strip must read against the ROW (vertical strip), exactly
    // as a static lone column does (the :649 fully-stripped-column suite).
    const seen = trackLayout();
    const strips = recordStrips();
    const engine = createDockEngine({ ...base(), ...seen.options, ...strips.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.collapsePanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", STRIP);
    expect(strips.last()["panel-dyn-1"]).toBe("vertical");
    engine.expandPanel("panel-dyn-1");
    await waitForSize(seen, "panel-dyn-1", 360); // pin-remembered width restored
    engine.dispose();
  });

  it("removing a maximize-forced strip's owner restores the survivors", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options });
    engine.addDynamicPanel(DYN);
    await waitForSize(seen, "panel-dyn-1", 360);
    const rates = baselineSize(base(), "panel-fx-rates");
    engine.maximizePanel("panel-dyn-1"); // strips every static panel
    engine.removeDynamicPanel("panel-dyn-1");
    await waitForSizeWithin(seen, "panel-fx-rates", rates, 8); // statics restored
    engine.dispose();
  });
});
```

(Adapt harness accessors precisely to the existing helpers' true signatures — `trackLayout()` returns `saves/sizeOf/pins()/blob()`; `waitForPins:1903`; `STRIP = 32:646`. The implementer reads the harness section `:1682–2117` first.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/layout-dockview test -- -t "dynamic panels"` → FAIL (`addDynamicPanel is not a function`).

- [ ] **Step 3: Implement.**
  - `dockSeed.ts`: `export function seedPanelIds(root: DockSeedNode): readonly string[] { return panelIdsUnder(root); }` (or export `panelIdsUnder` under that name).
  - `createDockEngine.ts`: add `DockDynamicPanel`; extend the `DockEngine` interface (:126) with the two methods; in the closure add:

```ts
  function insertDynamicPanel(panel: DockDynamicPanel): void {
    if (api.getPanel(panel.id) !== undefined) {
      return;
    }

    api.addPanel({
      id: panel.id,
      component: RTC_PANEL_COMPONENT,
      title: opts.panels.title(panel.id),
      position: { direction: "right" },
      initialWidth: panel.initialPx + GROUP_GAP_PX,
    });
    registerDesignPin({ panelIds: [panel.id], px: panel.initialPx, axis: "width" });
  }

  function deleteDynamicPanel(panelId: string): void {
    const panel = api.getPanel(panelId);

    if (panel === undefined) {
      return;
    }

    if (maximized?.panelId === panelId) {
      // release the whole maximize first so the forced strips restore while
      // their pre-strip sizes are still meaningful
      releaseMaximize();
    } else if (maximized !== null) {
      maximized = {
        ...maximized,
        stripped: maximized.stripped.filter((id) => {
          return id !== panelId;
        }),
      };
    }

    if (records.has(panelId)) {
      // restore surrounding geometry while the group still exists
      releaseStrip(panelId);
      records.delete(panelId); // releaseStrip bails on a gone group; belt-and-braces
    }

    api.removePanel(panel);
    settleStrips();
    settleStripFreeWorlds();
  }
```

  - `registerDesignPin` is a new helper that APPENDS one pin to `designPins` and clamps its members — read `applyDesignPins:808–856` first: if it already appends, call it with a one-element array; if it replaces the array, factor the per-pin body into `registerDesignPin` and have `applyDesignPins` loop it. Reuse `clampTo:1562` and the `DesignPinRecord` shape `:1136–1143`.
  - Adapt the exact internal function names (`releaseMaximize:643`, `releaseStrip:619`, `settleStrips:670`, `settleStripFreeWorlds:551`) — call the real closures, do not re-implement.
  - Wire into the return literal (:980): `addDynamicPanel: insertDynamicPanel, removeDynamicPanel: deleteDynamicPanel,` (implementation names state the effect; the interface keeps the spec's names).

- [ ] **Step 4: Run to green** — same filter; then the whole engine suite: `pnpm --filter @rtc/layout-dockview test`.
- [ ] **Step 5: Commit** — `feat(layout-dockview): dynamic panels — right-edge add/remove with pin + ledger hygiene`.

---

### Task 2: Engine — construction-time reconciliation + partial blob net

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`DockEngineOptions` gains `dynamicPanels?`; reconcile call between `applyDesignPins(restored.pins)` :977 and the container listener :978; scrub retry inside `loadBlobOrSeed` :1583–1619)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: Task 1's `DockDynamicPanel`, `insertDynamicPanel`, `deleteDynamicPanel`, `seedPanelIds`.
- Produces: `DockEngineOptions.dynamicPanels?: readonly DockDynamicPanel[]` — the layer-2 docked set at construction. Reconciliation rules (spec §4): blob keeps arrangement for ids in both; listed-but-absent ids are added right-edge; blob-dynamic-but-unlisted ids are removed; an unrestorable blob is retried with its dynamic leaves scrubbed before falling back to seed.

- [ ] **Step 1: Failing tests:**

```ts
describe("dynamic-panel reconciliation at construction", () => {
  const DYN = { id: "panel-dyn-1", initialPx: 360 } as const;

  it("adds a listed dynamic panel missing from a fresh (null) blob", async () => {
    const seen = trackLayout();
    const engine = createDockEngine({ ...base(), ...seen.options, dynamicPanels: [DYN] });
    await waitForSize(seen, "panel-dyn-1", 360);
    engine.dispose();
  });

  it("keeps a listed dynamic panel's dragged arrangement from the blob", async () => {
    // engine 1: add, drag the panel into the rates group, capture the blob
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options, dynamicPanels: [DYN] });
    await waitForSize(seen, "panel-dyn-1", 360);
    const api = lastDockviewApi();
    const dyn = api.getPanel("panel-dyn-1");
    const rates = api.getPanel("panel-fx-rates");
    if (!dyn || !rates) { throw new Error("fixture panels missing"); }
    dyn.api.moveTo({ group: rates.group, position: "center" }); // stack it
    await vi.waitFor(() => { expect(seen.blob()).toContain("panel-dyn-1"); });
    const blob = seen.blob();
    first.dispose();
    // engine 2: same blob + still listed → stays stacked, NOT re-added right-edge
    const reloaded = trackLayout();
    const second = createDockEngine({ ...base(), ...reloaded.options, blob, dynamicPanels: [DYN] });
    const api2 = lastDockviewApi();
    expect(api2.getPanel("panel-dyn-1")?.group.panels.length).toBe(2);
    second.dispose();
  });

  it("removes a blob's dynamic panel that layer 2 no longer lists (orphan rule)", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options, dynamicPanels: [DYN] });
    await waitForSize(seen, "panel-dyn-1", 360);
    const blob = seen.blob();
    first.dispose();
    const second = createDockEngine({ ...base(), ...trackLayout().options, blob }); // no dynamicPanels
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    // statics intact
    expect(lastDockviewApi().getPanel("panel-fx-rates")).toBeDefined();
    second.dispose();
  });

  it("scrubs an unrestorable dynamic node instead of degrading the whole tab to seed", async () => {
    // hand-corrupt ONLY the dynamic leaf in a real blob (template: twoTabGroupLayout :2020)
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options, dynamicPanels: [DYN] });
    await waitForSize(seen, "panel-dyn-1", 360);
    // capture a real geometry delta on a static panel so seed-fallback is detectable
    first.collapsePanel("panel-fx-analytics");
    await waitForSize(seen, "panel-fx-analytics", STRIP);
    const parsed = JSON.parse(seen.blob());
    parsed.panels["panel-dyn-1"] = { bogus: true }; // unrestorable node
    first.dispose();
    const reloaded = trackLayout();
    const second = createDockEngine({
      ...base(), ...reloaded.options,
      blob: JSON.stringify(parsed), dynamicPanels: [DYN],
    });
    // static arrangement survived (still stripped — NOT seed), dynamic re-added right-edge
    await waitForSize(reloaded, "panel-fx-analytics", STRIP);
    await waitForSize(reloaded, "panel-dyn-1", 360);
    second.dispose();
  });

  it("leaves a static-only blob with no dynamicPanels exactly as before", async () => {
    const seen = trackLayout();
    const first = createDockEngine({ ...base(), ...seen.options });
    const blob = seen.blob();
    first.dispose();
    const second = createDockEngine({ ...base(), ...trackLayout().options, blob });
    expect(lastDockviewApi().getPanel("panel-dyn-1")).toBeUndefined();
    second.dispose();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `dynamicPanels` unknown option / reconciliation absent.
- [ ] **Step 3: Implement.**
  - `DockEngineOptions` gains `dynamicPanels?: readonly DockDynamicPanel[];` (doc: "the layer-2 docked set at construction; arrangement for ids present in the blob is kept — membership reconciles both ways").
  - After `applyDesignPins(restored.pins);` (:977):

```ts
  reconcileDynamicPanels();

  function reconcileDynamicPanels(): void {
    const staticIds = new Set(seedPanelIds(opts.seed));
    const listed = new Map(
      (opts.dynamicPanels ?? []).map((panel) => {
        return [panel.id, panel] as const;
      }),
    );

    for (const panel of [...api.panels]) {
      if (!staticIds.has(panel.id) && !listed.has(panel.id)) {
        deleteDynamicPanel(panel.id);
      }
    }

    for (const panel of listed.values()) {
      if (api.getPanel(panel.id) === undefined) {
        insertDynamicPanel(panel);
      }
    }
  }
```

  - Partial net in `loadBlobOrSeed`: inside the existing `catch` (:1608), before falling to seed, attempt one scrubbed retry:

```ts
    } catch {
      const scrubbed = withoutDynamicNodes(opts.blob, seedPanelIds(opts.seed));

      if (scrubbed !== null) {
        try {
          const parsed = migrateDockBlob(JSON.parse(scrubbed), GROUP_GAP_PX);
          api.fromJSON(parsed as Parameters<DockviewApi["fromJSON"]>[0]);
          for (const group of api.groups) {
            group.api.locked = false;
          }
          return { pins: designPinsIn(parsed), ...stripGeometryIn(parsed) };
        } catch {
          // fall through to the seed
        }
      }
    }
```

  - `withoutDynamicNodes(blob: string, staticIds: readonly string[]): string | null` (new, `dockBlob.ts`): parse; delete `panels[id]` entries whose id is not in `staticIds`; walk `grid.root` removing those views from leaves, dropping emptied leaves and single-child-collapsing branches; return `null` when nothing was removed (so the caller falls straight to seed) or on any shape surprise. Pure function + its own unit tests in `dockBlob.test.ts` (three cases: removes one dynamic leaf; returns null for a static-only blob; returns null for garbage).
  - `applyTitles(api, opts.panels)` already runs at :226 — move it after reconciliation or re-call it, so reconciled-in panels get titles.
- [ ] **Step 4: Run to green** — full `pnpm --filter @rtc/layout-dockview test` (the interplay suites at :434–1527 must stay green untouched).
- [ ] **Step 5: Commit** — `feat(layout-dockview): construction-time dynamic-panel reconciliation + scrubbed-blob partial net`.

---

### Task 3: client-core — per-tab docked-ids stream, `DockLayoutStore.clear`, Reset clears blobs

**Files:**
- Modify: `packages/client-core/src/composition.ts` (`dockedPanelTabs` kick subject :706; `Presenters` member ~:232; reset :951)
- Modify: `packages/client-core/src/adapters/dockLayoutStore.ts` (+`clear(tab: string): void;`)
- Modify: `packages/client-core/src/adapters/InMemoryDockLayoutStore.ts` (+clear)
- Modify: `packages/client-react/src/app/adapters/LocalStorageDockLayoutStore.ts` + `packages/client-solid/src/app/adapters/LocalStorageDockLayoutStore.ts` (byte-identical twins: `clear(tab) { localStorage.removeItem(this.key(tab)); }`)
- Test: `packages/client-core/src/__tests__/composition.workspacePersistence.test.ts` (extend), adapters' existing tests

**Interfaces:**
- Consumes: `dockedPanelTabs` Map (:706), `jarvisPanelsMachine.state$`, `WORKSPACE_TABS`.
- Produces (Tasks 4–6 rely on):
  ```ts
  // on Presenters:
  dockedPanelIdsFor: (tab: WorkspaceTab) => Observable<readonly string[]>;
  // on DockLayoutStore:
  clear(tab: string): void;
  ```

- [ ] **Step 1: Failing tests** (composition test file — use its existing fake-ports harness):

```ts
it("dockedPanelIdsFor(tab) emits the id with tab attribution when a panel docks into the active tab", () => {
  // arrange a live panel via the existing panel-stream fixture, activeTab "fx"
  const seen: (readonly string[])[] = [];
  const sub = presenters.dockedPanelIdsFor("fx").subscribe((ids) => { seen.push(ids); });
  presenters.dockPanel(PANEL_ID);
  sub.unsubscribe();
  expect(seen.at(-1)).toEqual([PANEL_ID]);
  // and the OTHER tab never lists it
  let credit: readonly string[] = [];
  presenters.dockedPanelIdsFor("credit").subscribe((ids) => { credit = ids; }).unsubscribe();
  expect(credit).toEqual([]);
});

it("dockedPanelIdsFor replays current membership to a late subscriber", () => { /* dock, then subscribe, expect [PANEL_ID] first emission */ });

it("undock and dismiss both drop the id from the tab stream", () => { /* dock → undock → expect [] ; dock → dismissPanel → expect [] */ });

it("resetWorkspaceLayout clears every tab's dock blob", () => {
  const store = ports.dockLayoutStore; // the InMemory fake
  store.save("fx", "{}"); store.save("credit", "{}");
  presenters.resetWorkspaceLayout();
  expect(store.load("fx")).toBeNull();
  expect(store.load("credit")).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-core test -- composition.workspacePersistence`.
- [ ] **Step 3: Implement.**
  - Beside `dockedPanelTabs` (:706): `const dockedPanelTabsKick$ = new BehaviorSubject<void>(undefined);` — call `dockedPanelTabsKick$.next(undefined)` after EVERY mutation of the map (`set` in `dockPanelIntoWorkspace` :881 and the boot loop :722, `delete` in `detachDockedLeaf` :908, `clear` in `resetWorkspaceLayout` :965).
  - New presenter member:

```ts
  function dockedPanelIdsFor(tab: WorkspaceTab): Observable<readonly string[]> {
    return combineLatest([jarvisPanelsMachine.state$, dockedPanelTabsKick$]).pipe(
      map(([panelsState]) => {
        return panelsState.panels
          .filter((panel) => {
            return panel.docked && dockedPanelTabs.get(panel.panelId) === tab;
          })
          .map((panel) => {
            return panel.panelId;
          });
      }),
      distinctUntilChanged((prev, next) => {
        return prev.length === next.length && prev.every((id, index) => {
          return id === next[index];
        });
      }),
    );
  }
```

    (The kick makes the map-set that follows `jarvisPanelsMachine.dockPanel`'s synchronous emission visible — without it the state$ emission fires before the tab is attributed and nothing re-emits.)
  - `resetWorkspaceLayout` (:951) additionally: `for (const tab of WORKSPACE_TABS) { dockLayoutStore.clear(tab); }` where `dockLayoutStore` is the composition's `ports.dockLayoutStore ?? new InMemoryDockLayoutStore()` instance (the SAME instance exposed at :173 — reuse the local, don't construct a second).
  - Widen `DockLayoutStore` + all three implementations.
- [ ] **Step 4: Run to green** — `pnpm --filter @rtc/client-core test`, plus both clients' adapter tests: `pnpm --filter @rtc/client-react --filter @rtc/client-solid test -- DockLayoutStore`.
- [ ] **Step 5: Commit** — `feat(client-core): per-tab docked-panel stream; reset clears dock blobs (DockLayoutStore.clear)`.

---

### Task 4: Bindings — `useDockedPanelIds(tab)` in React + Solid + every fake ViewModel

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (type near :200; impl near :630 — `bind((tab: WorkspaceTab) => presenters.dockedPanelIdsFor(tab), [])`)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (type near :299; impl near :682 — per-tab `state(...)` memoized like existing parameterized reads)
- Modify: `packages/ui-contract/src/shared/harness/world.ts` (World exposes/derives docked ids per tab from its jarvis-panels subject — follow the existing `dockedPanels` derivation)
- Modify: both `tests/ui/contract/*/viewModelFromWorld.ts` (stub returning the world's docked ids; tab-agnostic like the visual fake)
- Modify: both `tests/ui/visual/*/buildFakeViewModel.ts` (`useDockedPanelIds: () => dockedPanelIdsIn(data)` — tab-agnostic by design: the fixture format has no tab attribution, matching `dockedLayoutStateFor`'s documented rule)
- Modify: `packages/client-react-native/tests/visual/fake/inert.ts` (inert stub `() => []` — RN has no dockview bridge)
- Test: bindings' existing viewmodel spec files (one new case each)

**Interfaces:**
- Consumes: Task 3's `presenters.dockedPanelIdsFor`.
- Produces: `useDockedPanelIds: (tab: WorkspaceTab) => readonly string[]` (React) / `(tab: WorkspaceTab) => Accessor<readonly string[]>` (Solid) on the ViewModel.

- [ ] **Step 1: Failing test** (react-bindings spec, mirroring the existing `useJarvisPanels` case): mount a probe component calling `useDockedPanelIds("fx")` against a fake `Presenters` whose `dockedPanelIdsFor` returns `of(["panel-x"])`; assert render output `["panel-x"]`. Solid twin likewise.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** across the seven files. Every fake implements the new member (typecheck forces the sweep — `pnpm typecheck` is the completeness gate).
- [ ] **Step 4: Run to green** — `pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings test && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(bindings): useDockedPanelIds(tab) — per-tab docked ids for the dockview bridge`.

---

### Task 5: React bridge — `docked` prop, diff effect, StrictMode replay, App wiring

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Modify: `packages/client-react/src/ui/App.tsx` (pass `docked`; DELETE the gap comment :102–107)
- Test: `packages/client-react/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.strictMode.test.tsx` (+1 case via its page object), new `DockviewLayoutEngine.docked.test.tsx` beside it

**Interfaces:**
- Consumes: Tasks 1–2 engine API; Task 4's `useDockedPanelIds`; `DOCK_COLUMN_INITIAL_PX` from `@rtc/client-core`.
- Produces: `DockviewLayoutEngineProps.docked: readonly PanelId[]` (required — both callers always have it).

- [ ] **Step 1: Failing tests.** In the new docked test (same harness style as the strictMode file — ResizeObserver stub + page object): (a) render with `docked={["panel-dyn-1"]}` and a registry containing that id → the engine holds the panel (`data-groups` grows by 1; body portal renders the registry content); (b) re-render with `docked={[]}` → panel gone; (c) strictMode file: seed `docked`, double-mount, assert the REBUILT engine holds the panel (mirror of the `:62` collapse case).
- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-react test -- DockviewLayoutEngine`.
- [ ] **Step 3: Implement.**
  - Props: `docked: readonly PanelId[];` documented "The active tab's layer-2 docked set — membership only; arrangement lives in the blob."
  - `const dockedRef = useRef(docked);` synced in the same pre-declared layout effect as `specsRef` (:97–99).
  - Engine creation (:137): add `dynamicPanels: dockedRef.current.map((panelId) => { return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX }; }),`.
  - `const appliedDocked = useRef<AppliedDocked>({ tab, ids: [] });` (type mirrors `AppliedCollapse` :350) — reset beside `appliedCollapse` at :163.
  - The diff effect, declared BETWEEN the maximize effect (:185) and the collapse effect (:195) — a dynamic panel must exist before a collapse replay can name it:

```ts
  useEffect(() => {
    const engine = liveEngine;

    if (engine === null) {
      return;
    }

    const previous =
      appliedDocked.current.tab === tab ? appliedDocked.current.ids : [];

    for (const panelId of docked) {
      if (!previous.includes(panelId)) {
        engine.addDynamicPanel({ id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX });
      }
    }

    for (const panelId of previous) {
      if (!docked.includes(panelId)) {
        engine.removeDynamicPanel(panelId);
      }
    }

    appliedDocked.current = { tab, ids: docked };
  }, [docked, tab, liveEngine]);
```

  - App.tsx: `const docked = useDockedPanelIds(tab);` (hook from `useViewModel()` at :80) → `docked={docked}` on the bridge; delete the :102–107 comment block.
- [ ] **Step 4: Run to green** — bridge tests + `pnpm --filter @rtc/client-react test`.
- [ ] **Step 5: Commit** — `feat(client-react): dockview bridge docks Jarvis panels (docked prop + diff effect + StrictMode replay)`.

---

### Task 6: Solid bridge — mirror

**Files:**
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Modify: `packages/client-solid/src/ui/App.tsx` (pass `docked={dockedIds()}` — the memo at :171 IS the per-tab-agnostic id list; switch it to Task 4's `useDockedPanelIds(props.tab)` accessor so tab attribution matches React)
- Test: new `packages/client-solid/src/ui/shell/layout/dockview/__tests__/DockviewLayoutEngine.docked.test.tsx` (Solid testing-library, mirroring the React cases minus StrictMode — Solid remounts per tab instead)

**Interfaces:**
- Consumes: same engine API; Solid props idiom (`props.docked` accessor-read inside effects; module-local `let appliedDocked: readonly PanelId[] = [];` beside `applied` :186 — no tab bookkeeping needed, the component remounts per tab).
- Produces: identical `docked: readonly PanelId[]` prop on the Solid props interface (:321).

- [ ] **Step 1: Failing tests** (add/remove mirror cases).
- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-solid test -- DockviewLayoutEngine`.
- [ ] **Step 3: Implement** — `onMount` creation gains `dynamicPanels` from `props.docked`; a `createEffect` between the maximize (:165) and collapse (:188) effects runs the same add/remove diff against `appliedDocked`. Keep the `dockedIds` memo's element-wise `equals` (:171–223) intact — the docked prop must not churn identity per emission.
- [ ] **Step 4: Run to green** — `pnpm --filter @rtc/client-solid test`.
- [ ] **Step 5: Commit** — `feat(client-solid): dockview bridge docks Jarvis panels (Solid mirror)`.

---

### Task 7: Shared contract spec — docked cases under Dockview

**Files:**
- Modify: `packages/ui-contract/src/specs/shell/layout/DockviewEngine.contract.spec.ts` (19 cases today, none docked)
- Modify: both contract hosts: `packages/client-react/tests/ui/contract/react/DockviewEngineHost.tsx` (:166 props) + `packages/client-solid/tests/ui/contract/solid/DockviewEngineHost.tsx` (add `docked?: readonly string[]` pass-through, registry entries for the docked test panel)

**Interfaces:**
- Consumes: Tasks 5–6 bridge prop; `LayoutEnginePage` helpers (`isDocked:95`, `dockedRendererTestId:130`, `undock:160`).
- Produces: three new shared `it()` cases both clients must pass:
  1. "mounts a docked desk panel's body and head as a dockview group" — host `docked: ["panel-desk-heat"]` → `isDocked("panel-desk-heat")` true, `dockedRendererTestId` resolves.
  2. "undocking removes the panel from the dock" — rerender host with `docked: []` → panel gone.
  3. "a docked panel participates in collapse" — `docked` + `collapsed: ["panel-desk-heat"]` → the strip renders (collapse-set witness `data-collapsed` includes the id).

- [ ] **Step 1: Write the three cases** in the shared spec (they fail on both clients until the hosts pass the prop).
- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-react test:ui:contract -- DockviewEngine` (and solid).
- [ ] **Step 3: Implement host pass-through** (both clients).
- [ ] **Step 4: Run to green** — both clients' contract suites + coverage gates: `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage`.
- [ ] **Step 5: Commit** — `test(ui-contract): docked-panel cases for the Dockview engine (both clients)`.

---

### Task 8: Visual twin — `layout/fx-docked-panel-dockview`

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (after :728), `fixtures.ts` (after :2633), `scenarioActions.ts` (after :65)
- No `appData.ts` edit (all fields exist), no registry edit (`App` componentKey exists)
- Goldens: regen BOTH sets for the new scenario only

**Interfaces:**
- Consumes: fixture `app-fx-docked-panel` (:2590), `layoutEngine: "dockview"` seeding, visual fake `useDockedPanelIds` (Task 4).

- [ ] **Step 1: Add the three entries:**

```ts
// scenarios.ts — beside layout/fx-docked-panel (:719)
  // Dockview twin: the same pinned-panel workspace under the Dockview engine —
  // the bridge's docked prop + the engine's right-edge dynamic group, pinned
  // pixel-for-pixel and paired into visual:engine-parity's shared subset.
  "layout/fx-docked-panel-dockview": {
    componentKey: "App",
    fixtureKey: "app-fx-docked-panel-dockview",
  },
```
```ts
// fixtures.ts — after :2633
fixtures["app-fx-docked-panel-dockview"] = makeAppData({
  ...fixtures["app-fx-docked-panel"],
  layoutEngine: "dockview",
});
```
```ts
// scenarioActions.ts — beside :65, copying the dockview twins' wait pattern (:334)
  "layout/fx-docked-panel-dockview": { fullPage: true, waitForText: "Desk P&L Heat" },
```

- [ ] **Step 2: Enforcement tests green** — `pnpm --filter @rtc/ui-contract test -- scenarios` (fixtureKey gate) + both clients' `registryCoverage.test.ts`.
- [ ] **Step 3: Generate goldens, both sets** (UPDATING-GOLDENS.md §C): local arm64 `react-local/darwin-arm64` via the client-react visual runner with `--update-snapshots -g "layout/fx-docked-panel-dockview"`; x86 `react/` via `gh workflow run "Update visual goldens" -f scenario_pattern="layout/fx-docked-panel-dockview"` on the branch (workflow commits only on non-main refs). Solid asserts, owns none.
- [ ] **Step 4: Assert both clients locally** — react + solid visual runs scoped `-g "layout/fx-docked-panel"` (both twins), then `pnpm visual:engine-parity --set react-local/darwin-arm64` — the new pair must sit inside the resting band (p50 ≈ 0.002, worst-recorded 0.016; investigate anything above ~0.02 before proceeding).
- [ ] **Step 5: Commit** — `test(visual): layout/fx-docked-panel-dockview twin + goldens (both sets)`.

---

### Task 9: e2e — dock under Dockview journey

**Files:**
- Modify: `tests/browser/playwright/jarvis.spec.ts` (new test beside :38)
- Modify: `tests/browser/page-objects/playwright/Jarvis.ts` (:334 doc only — `waitForPanelDockedLive`'s comment pins the in-house leaf shape; reword to cover both engines)

**Interfaces:**
- Consumes: `openPreferencesAndSelectLayoutEngine` (scenarios/layout.ts:81), `expectEngine` (:53), `expectDockedPanelSurvivesReload` (scenarios/jarvis.ts:212 — reused verbatim: the localStorage witness `rtc-workspace-layout-v1` and the `panel-<id>`/`jarvis-panel-undock` testids are engine-agnostic by construction).

- [ ] **Step 1: Write the test:**

```ts
  test("docks a panel under the dockview engine, survives reload docked, then unpins", async ({
    ctx,
  }) => {
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await jarvis.expectDockedPanelSurvivesReload(ctx);
    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
  });
```

  (Import the layout scenario module the way `layout.spec.ts` does; NOTE for Task 10: this test's opening switch inverts when dockview becomes the default.)
- [ ] **Step 2: Run it** — `pnpm test:e2e -- -g "docks a panel under the dockview engine"` → must pass against Tasks 1–6 (it is the integration witness, not TDD-first — the unit/contract tiers carried the failing-first burden).
- [ ] **Step 3: Full e2e** — `pnpm test:e2e`.
- [ ] **Step 4: Commit** — `test(e2e): jarvis dock journey under the dockview engine`.

**→ PR checkpoint: Tasks 1–9 ship as ONE feature PR** (gauntlet full + CI green + CodeQL check before merge, per shipping-repo-changes).

---

### Task 10: Default flip — `DEFAULT_LAYOUT_ENGINE = "dockview"` (its own PR)

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts:178–180` (constant + doc)
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts:502–526`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts:463` + `packages/client-react-native/tests/visual/fake/inert.ts:274–277` (pin the literal `"inhouse"` with a comment — RN has no dockview bridge; the web default no longer applies there)
- Modify: `packages/client-react/src/ui/App.tsx:70–77` + `packages/client-solid/src/ui/App.tsx:80–87` (lazy-load swap: Dockview eager, in-house lazy; keep both comments truthful)
- Modify: `tests/browser/playwright/layout.spec.ts` (invert `expectEngine` openers and switch targets), `tests/browser/playwright/jarvis.spec.ts` (Task 9's test drops its opening switch; the ORIGINAL dock test :38 gains none — it now runs under dockview by default, which is the point)
- Modify prose: `packages/ui-contract/src/shared/harness/world.ts:623`, `shared/mount.ts:109`, `visual/appData.ts:106` (each says `("inhouse")`)
- Modify docs: `CLAUDE.md:116`; `docs/adr/ADR-002-layout-management-port.md:6,9,32,786` + a new "As implemented (2026-09): default flipped" bullet; `docs/STATUS.md:25` + move this round's 🔴 entry per tracking-workstream-status; `docs/architecture/06-package-dependencies.md:128`; `docs/architecture/08-replaceability-matrix.md:26`; `packages/layout-dockview/README.md:185` (keyboardNavigation cost note — premise now "always-on")
- Goldens: re-pin `prefs/modal` + `prefs/content` (the active segment flips), both sets

**Interfaces:**
- Consumes: everything above green on main.
- Produces: `DEFAULT_LAYOUT_ENGINE: LayoutEngine = "dockview"`.

- [ ] **Step 1: Flip the contract test FIRST (failing):** in `PreferencesPortContract.ts` — rename :502 to `"defaults layoutEngine to dockview and round-trips a write"`; the round-trip write becomes `port.setLayoutEngine("inhouse")` with expectations `"inhouse"` (a default-valued write proves nothing); :521's `seen` expectation becomes `[DEFAULT_LAYOUT_ENGINE, "inhouse"]`; :524's seeded read seeds `{ layoutEngine: "inhouse" }`. Run `pnpm --filter @rtc/domain test` → FAIL (default still inhouse).
- [ ] **Step 2: Flip the constant** (preferences.ts:180 → `"dockview"`; doc comment: users who pick `"inhouse"` keep that choice). Run domain + both clients' adapter contract tests → PASS.
- [ ] **Step 3: RN pinning** — replace the two RN `DEFAULT_LAYOUT_ENGINE` reads with the literal `"inhouse"` + comment; run `pnpm --filter @rtc/client-react-native test`.
- [ ] **Step 4: Lazy-load swap** — React: `lazy(() => import(...InhouseLayoutEngine...))`, Dockview becomes a static import (and vice-versa comment rewrite); Solid mirror. The `Suspense fallback={null}` moves to the in-house branch. Run both clients' unit suites.
- [ ] **Step 5: e2e inversion** — layout.spec.ts openers `expectEngine(ctx, "dockview")`, switches target `"inhouse"` and back; jarvis.spec.ts Task-9 test drops its opening switch (rename it "…under the default dockview engine…"), keep the closing `openPreferencesAndSelectLayoutEngine(ctx, "inhouse")` removed too. Run `pnpm test:e2e`.
- [ ] **Step 6: prose + docs sweep** — the eleven files listed above; then `pnpm check:doc-links`.
- [ ] **Step 7: Golden re-pins** — regen `prefs/modal` + `prefs/content` both sets (`-g "prefs/"` locally arm64; workflow dispatch scenario_pattern `prefs/` for x86); assert react + solid visual locally scoped to `prefs/`.
- [ ] **Step 8: Full gauntlet** — `/rtc:gauntlet full` equivalent; fix anything red.
- [ ] **Step 9: Commit + PR** — `feat(domain)!: default layout engine flips to dockview` (single commit for the flip PR where practical; body lists the sweep). Merge only after CI green + CodeQL check; this PR is the designed one-commit revert point.

---

## Verification tail (after Task 10 merges)

- Post-merge `visual.yml` green (the twins and prefs re-pins are the risk surface).
- `pnpm visual:engine-parity` report unchanged on the shared subset.
- STATUS.md: this round's entry moves out of 🔴 (delete on completion); Dockview entry's "Still pending under Dockview: Jarvis-docked panels are in-house-only" line is deleted by Task 10's sweep.
- Concurrent-workstream note: ping the Dockview-native features session (spec 2026-09-10) — their Phase 1 DnD audit now inherits dynamic panels as drag subjects, and their Phase 4 generalises `addDynamicPanel`.
