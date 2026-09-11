# Dockview DnD Phase 1 (audit → bless) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dockview's native tab drag-and-drop a *supported* feature of the dockview engine by fixing the three audit findings (S1 strip-drop swallow, S2 stale pins after membership dissolution, S3 Element-keyed ledger staleness) and pinning the behaviour with engine + e2e tests.

**Architecture:** All engine work lands in `@rtc/layout-dockview`'s `createDockEngine.ts` (plus a small blob-scrub helper in `dockBlob.ts`); nothing changes in either client's source — DnD is dockview-native and already reaches the clients through the existing bridges. The doctrine (spec §2) applies: arrangement stays blob-private (layer 3), so the in-house engine needs **no** change and **no** projection work; resting geometry must not move (no golden re-pin).

**Tech Stack:** dockview@7.0.4 (pinned), vitest/jsdom for engine tests, Playwright page objects in the `tests` workspace for e2e.

**Spec:** [../specs/2026-09-10-dockview-native-features-design.md](../specs/2026-09-10-dockview-native-features-design.md) — Phase 1. Audit findings 2026-09-11 (S1/S2/S3, allowed-drop policy) are restated inline per task.

## Global Constraints

- `dockview@7.0.4` stays pinned; **no new dependencies** anywhere.
- Both web clients move together — but this phase deliberately touches neither client's `src/` (engine + tests + docs only). The e2e scenario runs against both clients via the shared `tests/browser` suite.
- Gap-0 invariants hold: model = card + 7, integer models, `clampTo` = constrain+set with **no** measure-back correction loops (do not reintroduce `setRendered`-style double passes).
- Resting geometry is untouched: **no golden PNG changes**; the pre-merge task measures this (full visual assert, both engines).
- Repo rules: Biome zero-findings/no disables, mandatory braces, `#/` subpath aliases, named interfaces (no inline cast types), handler-naming by effect, newspaper order.
- Blob compatibility: a legacy blob (with or without `rtcBlobVersion`) must keep loading; anything malformed keeps falling back to seed.
- **Allowed-drop policy (audit §2, the product decision this plan implements):** bless the four edge-split zones + centre-stack on expanded groups and intra-group tab reordering; a **stripped group must reject drops entirely**; strips/maximize-forced strips keep offering no drag *source* (already true via their hidden header).
- **Stack-collapse policy (recorded, not built):** collapsing a member of a tab stack ejects it permanently — expand does **not** re-stack it. Deliberate YAGNI; revisit only if product asks.

## Verified dockview 7.0.4 facts the tasks rely on

- `DockviewGroupPanelLocked = boolean | 'no-drop-target'` (`dockview-core/dist/cjs/dockview/dockviewGroupPanelModel.d.ts:100`). Settable at runtime via the group's api (`dockviewGroupPanelApi.d.ts:93-94`, `get/set locked`).
- `locked === 'no-drop-target'` makes `handleDropEvent` return before any drop processing (`dockviewGroupPanelModel.js:1354`) — exactly the S1 rejection we need — and toggles the class `dv-locked-groupview` on the group container (`:351`), which jsdom can witness.
- **`locked` serialises**: `DockviewGroupPanelModel.toJSON()` emits `locked` whenever it is not `false` (`dockviewGroupPanelModel.js:1037-1039`), and `fromJSON` restores it (`dockviewComponent.js:1946`). Lock state here is *derived* from strip membership, so the blob must never carry it: Task 2 scrubs it at serialize and normalises after load.

---

### Task 1: Stripped groups reject drops (S1, engine half)

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (recordStrip ~line 372, releaseStrip ~line 532, `SizableGroupApi` ~line 1101)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `records: Map<string, StripRecord>`, `recordStrip(panelId): boolean`, `releaseStrip(panelId): (() => void) | null`, `groupOf(panelId): SizableGroup | undefined`.
- Produces: `SizableGroupApi` gains `locked: DockLockState` (`type DockLockState = boolean | "no-drop-target"`); the invariant *locked ⇔ recorded as a strip* that Tasks 2 and 6 rely on. The DOM witness is the `dv-locked-groupview` class on the group element.

- [ ] **Step 1: Write the failing test**

In `createDockEngine.test.ts`, inside the existing collapse/expand describe (reuse the existing `base()` seed and `waitForBranchSize`/`STRIP` helpers exactly as the neighbouring tests do):

```ts
it("marks a stripped group as no-drop-target and lifts it on expand", async () => {
  const engine = createDockEngine(base());
  const group = (): Element => {
    const found = container.querySelector('[data-dock-strip="true"]')
      ? container.querySelector(".dv-locked-groupview")
      : null;

    return found ?? container;
  };

  engine.collapsePanel("fx-blotter");
  await waitForBranchSize(track, "fx-blotter", STRIP);
  expect(container.querySelectorAll(".dv-locked-groupview")).toHaveLength(1);

  engine.expandPanel("fx-blotter");
  await waitForSizeAbove(track, "fx-blotter", STRIP);
  expect(container.querySelectorAll(".dv-locked-groupview")).toHaveLength(0);
  engine.dispose();
});

it("locks every maximize-forced strip and unlocks them all on exit", async () => {
  const engine = createDockEngine(base());

  engine.maximizePanel("fx-rates");
  await waitForBranchSize(track, "fx-blotter", STRIP);
  expect(
    container.querySelectorAll(".dv-locked-groupview").length,
  ).toBeGreaterThanOrEqual(2);

  engine.exitMaximize();
  await waitForSizeAbove(track, "fx-blotter", STRIP);
  expect(container.querySelectorAll(".dv-locked-groupview")).toHaveLength(0);
  engine.dispose();
});
```

Adapt `container`/`track` and the wait helpers to the file's actual fixture names (they exist under slightly different local names per describe — copy the neighbouring test's setup verbatim). If no `waitForSizeAbove` helper exists, assert via the existing post-expand size wait the neighbouring expand tests use.

- [ ] **Step 2: Run to verify both fail**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run -t "no-drop-target" src/createDockEngine.test.ts` (and `-t "unlocks them all"`)
Expected: FAIL — `dv-locked-groupview` count is 0 after collapse (nothing sets `locked` yet).

- [ ] **Step 3: Implement**

In `createDockEngine.ts`:

(a) Add to the narrowed group api (next to `setConstraints`, ~line 1101):

```ts
/** dockview's per-group drop acceptance: `'no-drop-target'` makes the
 * group's handleDropEvent bail before showing any overlay — the S1
 * strip-drop rejection. Derived from strip membership, NEVER persisted
 * (see serializeLayout's scrub). */
type DockLockState = boolean | "no-drop-target";

interface SizableGroupApi {
  readonly width: number;
  readonly height: number;
  locked: DockLockState;
  setSize(event: GroupSizeEvent): void;
  setConstraints(constraints: GroupConstraints): void;
}
```

(b) In `recordStrip`, immediately after `records.set(panelId, {...})`:

```ts
    // A bar has no visible header and its content is hidden — a drop into
    // it would swallow the dropped panel (audit S1). Reject drops for the
    // strip's whole lifetime; releaseStrip lifts this.
    group.api.locked = "no-drop-target";
```

(c) In `releaseStrip`, immediately after `records.delete(panelId)`:

```ts
    group.api.locked = false;
```

- [ ] **Step 4: Run the two tests — PASS; then the whole package**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all green (the lock is invisible to every sizing assertion).

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "feat(layout-dockview): stripped groups reject drops (audit S1)"
```

---

### Task 2: The blob never carries lock state (S1, persistence half)

**Files:**
- Modify: `packages/layout-dockview/src/dockBlob.ts` (new exported helper), `packages/layout-dockview/src/createDockEngine.ts` (`serializeLayout` ~line 227, `loadBlobOrSeed` ~line 1418)
- Test: `packages/layout-dockview/src/dockBlob.test.ts`, `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: Task 1's lock invariant; `migrateDockBlob(parsed, gap)`'s walk idiom (`migrateNode`) and its `UnverifiedGridNode`/`UnverifiedGrid`/`UnverifiedBlob` interfaces.
- Produces: `withoutLockMarks(serialized: unknown): unknown` exported from `dockBlob.ts` — strips `locked` from every leaf node's `data` in a serialized grid; `serializeLayout` calls it; `loadBlobOrSeed` normalises `group.api.locked = false` on every group after `fromJSON`.

- [ ] **Step 1: Write the failing tests**

In `dockBlob.test.ts` (mirror the migration tests' hand-built blob idiom already in the file):

```ts
describe("withoutLockMarks (derived lock state never persists)", () => {
  it("strips locked from every leaf's data and leaves the rest untouched", () => {
    const serialized = {
      grid: {
        root: {
          type: "branch",
          data: [
            {
              type: "leaf",
              size: 367,
              data: { id: "g1", views: ["a"], activeView: "a", locked: "no-drop-target" },
            },
            {
              type: "branch",
              data: [
                {
                  type: "leaf",
                  size: 200,
                  data: { id: "g2", views: ["b"], activeView: "b", locked: true },
                },
              ],
            },
          ],
        },
      },
      panels: {},
    };

    const scrubbed = withoutLockMarks(serialized) as typeof serialized;
    const first = scrubbed.grid.root.data[0] as { data: Record<string, unknown> };
    const nested = (scrubbed.grid.root.data[1] as { data: unknown[] }).data[0] as {
      data: Record<string, unknown>;
    };

    expect("locked" in first.data).toBe(false);
    expect("locked" in nested.data).toBe(false);
    expect(first.data.views).toEqual(["a"]);
  });

  it("passes malformed input through unchanged", () => {
    expect(withoutLockMarks(null)).toBe(null);
    expect(withoutLockMarks("nope")).toBe("nope");
  });
});
```

In `createDockEngine.test.ts`, next to the existing sidecar tests:

```ts
it("serialises a stripped layout without any locked mark in the blob", async () => {
  // collapse → wait for the bar → flush the save (as the sidecar tests do)
  // then:
  expect(JSON.stringify(JSON.parse(seen.blob()))).not.toContain('"locked"');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: FAIL — `withoutLockMarks` is not defined; the blob test FAILS because Task 1 now serialises `locked: "no-drop-target"` for the bar's group.

- [ ] **Step 3: Implement**

In `dockBlob.ts` (newspaper order — near `migrateDockBlob`, reusing its unverified interfaces):

```ts
/** Removes every leaf's `locked` mark from a serialized grid. Lock state is
 * DERIVED (a group is locked iff it currently renders as a strip — audit
 * S1), so persisting it would let a blob re-impose a stale lock on a layout
 * whose layer-2 collapse state changed while this engine was not looking.
 * The load path normalises to unlocked and the strip replay re-derives. */
export function withoutLockMarks(serialized: unknown): unknown {
  if (typeof serialized !== "object" || serialized === null) {
    return serialized;
  }

  const blob = serialized as UnverifiedBlob;
  const grid = blob.grid;

  if (typeof grid !== "object" || grid === null) {
    return serialized;
  }

  return {
    ...blob,
    grid: { ...grid, root: nodeWithoutLock((grid as UnverifiedGrid).root) },
  };
}

function nodeWithoutLock(node: unknown): unknown {
  if (typeof node !== "object" || node === null) {
    return node;
  }

  const { type, data } = node as UnverifiedGridNode;

  if (type === "branch" && Array.isArray(data)) {
    return { ...node, data: data.map(nodeWithoutLock) };
  }

  if (type === "leaf" && typeof data === "object" && data !== null) {
    const { locked: _dropped, ...rest } = data as Record<string, unknown>;

    return { ...node, data: rest };
  }

  return node;
}
```

In `createDockEngine.ts` `serializeLayout`, wrap the grid:

```ts
    opts.onLayoutChange(
      JSON.stringify({
        ...(withoutLockMarks(api.toJSON()) as ReturnType<DockviewApi["toJSON"]>),
        rtcBlobVersion: DOCK_BLOB_VERSION,
        rtcDesignPins: intactDesignPins(),
        ...(stripGeometry === undefined
          ? {}
          : { rtcStripGeometry: stripGeometry }),
      }),
    );
```

In `loadBlobOrSeed`, immediately after the blob-path `api.fromJSON(...)` (belt-and-braces for legacy/hand-edited blobs that DO carry `locked` — dockview restores it, `dockviewComponent.js:1946`):

```ts
      // Lock state is derived (strip membership), never trusted from a
      // blob: normalise, then the bridge's collapse replay re-locks bars.
      for (const group of api.groups) {
        group.api.locked = false;
      }
```

Import `withoutLockMarks` alongside the existing `migrateDockBlob` import.

- [ ] **Step 4: Run the whole package — PASS**

Run: `pnpm --filter @rtc/layout-dockview test`

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/dockBlob.ts packages/layout-dockview/src/dockBlob.test.ts packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "feat(layout-dockview): scrub derived lock state at serialize, normalise on load (audit S1)"
```

---

### Task 3: Structure-aware pin intactness + immediate release (S2)

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`intactDesignPins` ~line 814, the `onDidLayoutChange` listener ~line 291, new module-level helpers near `panelsExactlyFill` ~line 1051)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `panelsExactlyFill(panelIds, groupOf): boolean`, `declaringSplitOf(element, axis): Element | null`, `DesignPinRecord { pin, members, ownerSplit }`, `axisOf(group, orientation): GroupAxis`, `SPLIT_SELECTOR`.
- Produces: module-level `pinStillShaped(record: DesignPinRecord, groupOf): boolean` and `railViewOf(element: Element, owner: Element): Element | null`; `intactDesignPins()` now uses `pinStillShaped` and runs on every layout change (not only at serialize).

**Why `panelsExactlyFill` alone is not enough (the audit's S2, root-caused):** after `fx-analytics` is dragged out of the pinned rail into a new group, *both* resulting groups still hold only pinned panels, so the exact-fill check passes **vacuously** and the pin survives with its clamps. The missing invariant is *structural*: the pinned panels must still share one rail — one direct child view of the pin's declaring split.

- [ ] **Step 1: Write the failing test**

Next to the existing "design-width pins" describe (reuse its `railPinnedBase()` fixture and `RAIL_PIN`):

```ts
it("dissolves a pin and releases its clamps when a member is dragged to its own rail", async () => {
  const seen = trackLayout();
  const engine = createDockEngine({ ...railPinnedBase(), ...seen.options });
  const analytics = api().getPanel("fx-analytics");
  const rates = api().getPanel("fx-rates");

  if (analytics === undefined || rates === undefined) {
    throw new Error("fixture panels missing");
  }

  // The drop operation IS moveTo (audit-verified): eject analytics out of
  // the pinned rail to the far side of the rates group.
  analytics.api.moveTo({ group: rates.group, position: "left" });
  await flushSave(seen);

  const positions = api().getPanel("fx-positions");

  if (positions === undefined) {
    throw new Error("fx-positions missing");
  }

  // Clamps released: the rail groups are no longer pinned min=max.
  expect(positions.group.minimumWidth).not.toBe(positions.group.maximumWidth);
  expect(analytics.group.minimumWidth).not.toBe(analytics.group.maximumWidth);
  // And the blob no longer persists the pin.
  expect(seen.pins()).toEqual([]);
  engine.dispose();
});
```

Adapt `api()`/`flushSave` to the describe's actual accessors: the #656 tests already reach the dockview api and flush the debounced save — copy their idiom verbatim (`trackLayout` exposes `pins()` and `blob()`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rtc/layout-dockview exec vitest run -t "dragged to its own rail" src/createDockEngine.test.ts`
Expected: FAIL — `seen.pins()` still contains `RAIL_PIN` (vacuous exact-fill), and min === max on at least one group.

- [ ] **Step 3: Implement**

Module level, directly under `panelsExactlyFill`:

```ts
/** The direct child view of `owner` (a split-view container) that holds
 * `element` — the "rail" a pinned panel lives in. Null when `element` is
 * not under `owner` at all. */
function railViewOf(element: Element, owner: Element): Element | null {
  let view: Element | null = element.closest(VIEW_SELECTOR);

  while (
    view !== null &&
    (view.parentElement?.closest(SPLIT_SELECTOR) ?? null) !== owner
  ) {
    view = view.parentElement?.closest(VIEW_SELECTOR) ?? null;
  }

  return view;
}

/** True while a pin still describes reality: its panels exactly fill their
 * groups AND those groups still share ONE rail (one direct child view of
 * the pin's declaring split). Exact-fill alone passes VACUOUSLY after a
 * drag ejects a member into its own group — both fragments then hold only
 * pinned panels (audit S2) — so the rail identity is the real invariant. */
function pinStillShaped(
  record: DesignPinRecord,
  groupOf: (panelId: string) => SizableGroup | undefined,
): boolean {
  if (!panelsExactlyFill(record.pin.panelIds, groupOf)) {
    return false;
  }

  const first = groupOf(record.pin.panelIds[0] ?? "");

  if (first === undefined) {
    return false;
  }

  const owner = declaringSplitOf(first.element, record.pin.axis);

  if (owner === null) {
    return false;
  }

  const rail = railViewOf(first.element, owner);

  if (rail === null) {
    return false;
  }

  return record.pin.panelIds.every((panelId) => {
    const group = groupOf(panelId);

    return group !== undefined && railViewOf(group.element, owner) === rail;
  });
}
```

Add next to `SPLIT_SELECTOR` (~line 1146):

```ts
const VIEW_SELECTOR = ".dv-view";
```

In `intactDesignPins`, replace the condition only:

```ts
      if (pinStillShaped(record, groupOf)) {
```

In the `onDidLayoutChange` listener (~line 291), before the debounce block:

```ts
  const changeSub = api.onDidLayoutChange(() => {
    // Pins are validated on EVERY layout change, not just at save time: a
    // drop that dissolves a rail must release its min=max clamps NOW, or
    // the next resize distributes against a phantom pin for up to
    // debounceMs (audit S2). The returned list is the persistence filter's
    // concern; here only the release side effect matters.
    intactDesignPins();

    if (timer !== null) {
```

- [ ] **Step 4: Run the package — PASS, including every existing pin test**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all green — the #656 suite (persist/release/legacy/dissolution) must not regress; `pinStillShaped` is strictly stronger than the old check, and the existing group-membership-dissolution test now exercises the structural leg too.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "fix(layout-dockview): pins dissolve structurally on drag-out, clamps release immediately (audit S2)"
```

---

### Task 4: Membership-keyed flip ledger (S3, `flippedSplits`)

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`flippedSplits` ~line 322, `settleStrips` passes 2 and 4 ~lines 608-678, `stripGeometrySidecar` ~line 261, new `splitForFlipKey` helper)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `flipKeyOf(split, stripped): string`, `flipKeyFor(panelIds): string` (JSON of the sorted ids — engine-internal, parseable), `records`, `groupOf`, `firstGroupIn`, `orientationAgainst`, `axisOf`.
- Produces: `flippedSplits: Map<string, number>` (key = `flipKeyOf`); `splitForFlipKey(key: string): Element | null` inside `create()`.

- [ ] **Step 1: Write the failing test**

```ts
it("restores a flipped column whose split element was rebuilt by a drop", async () => {
  const seen = trackLayout();
  const engine = createDockEngine({ ...base(), ...seen.options });

  // Fully strip the rates/blotter column → it flips.
  engine.collapsePanel("fx-rates");
  engine.collapsePanel("fx-blotter");
  await waitForBranchSize(seen, "fx-rates", STRIP);

  // A drop elsewhere restructures splits (audit A3: moveTo reuses GROUP
  // elements but REBUILDS split containers): move a third panel to the far
  // edge and back, forcing dockview to rebuild the tree around the column.
  const analytics = api().getPanel("fx-analytics");
  const rates = api().getPanel("fx-rates");

  if (analytics === undefined || rates === undefined) {
    throw new Error("fixture panels missing");
  }

  analytics.api.moveTo({ group: rates.group, position: "bottom" });
  analytics.api.moveTo({ group: originalGroupOf("fx-analytics"), position: "center" });

  // First expand must still put the column's remembered width back — under
  // Element keying the rebuilt split has no ledger entry and the width is
  // lost (audit S3).
  engine.expandPanel("fx-blotter");
  await waitForBranchSize(seen, "fx-blotter", columnBefore);
  engine.dispose();
});
```

Adapt the fixture plumbing (`originalGroupOf`, `columnBefore` via `baselineBranchSize(base(), "fx-rates")`) from the existing "fully-stripped column" tests — the assertion shape (`waitForBranchSize(…, columnBefore)`) is exactly theirs. If the double-`moveTo` proves not to rebuild the split in jsdom, replace it with the stronger restructure the audit used (`position: "left"` on the ROOT-level group, then back) and keep the assertion identical.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — timeout waiting for `columnBefore` (the rebuilt split's flip entry is orphaned; the column width never comes back).

- [ ] **Step 3: Implement**

(a) Re-declare the ledger (comment updated):

```ts
  // A split whose every group is a strip reclaims along its PARENT's axis
  // (the in-house `stripDir`): its size on that axis is remembered while it
  // is flipped, and restored the moment one of its strips expands. Keyed by
  // the SORTED STRIPPED PANEL IDS (flipKeyOf) rather than the split
  // Element: a drop rebuilds split containers even when groups survive
  // (audit S3), and membership is the identity that means "same column".
  const flippedSplits = new Map<string, number>();
```

(b) Pass 2 (~line 610) — the key is already computed there; use it for both membership test and set:

```ts
    for (const split of nowFlipped) {
      const key = flipKeyOf(split, stripped);

      if (!flippedSplits.has(key)) {
        const witness = firstStrippedGroupIn(split, stripped, groupOf);

        if (witness !== undefined) {
          const seededSize = seededFlipSizes.get(key);
          seededFlipSizes.delete(key);

          flippedSplits.set(
            key,
            seededSize ??
              axisOf(witness, opposite(orientationAgainst(split))).size(),
          );
        }
      }
    }
```

(c) Pass 4 (~line 667) — resolve the CURRENT element for each stored key; a key that resolves to nothing (its panels left the dock entirely) is dropped:

```ts
    const nowFlippedKeys = new Set(
      [...nowFlipped].map((split) => {
        return flipKeyOf(split, stripped);
      }),
    );

    for (const [key, size] of [...flippedSplits]) {
      if (nowFlippedKeys.has(key)) {
        continue;
      }

      flippedSplits.delete(key);
      const split = splitForFlipKey(key);

      if (split !== null) {
        const witness = firstGroupIn(split, api.groups);

        if (witness !== undefined) {
          axisOf(witness, opposite(orientationAgainst(split))).set(size);
        }
      }
    }
```

(d) New helper inside `create()` (near `groupOf`):

```ts
  /** The split currently holding the panels a flip entry is keyed by —
   * resolved fresh because drops rebuild split Elements (audit S3). Null
   * when none of the key's panels remain in the dock. */
  function splitForFlipKey(key: string): Element | null {
    const panelIds = JSON.parse(key) as readonly string[];

    for (const panelId of panelIds) {
      const split =
        groupOf(panelId)?.element.closest(SPLIT_SELECTOR) ?? null;

      if (split !== null) {
        return split;
      }
    }

    return null;
  }
```

(e) `stripGeometrySidecar` (~line 274) — the key already IS the sorted stripped ids; keep only ids still stripped:

```ts
    const flips: PersistedFlip[] = [];

    for (const [key, size] of flippedSplits) {
      const panelIds = (JSON.parse(key) as readonly string[]).filter(
        (panelId) => {
          return records.has(panelId);
        },
      );

      if (panelIds.length > 0) {
        flips.push({ panelIds, size });
      }
    }
```

- [ ] **Step 4: Run the package — PASS**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all green — every existing flip/reload/sidecar test keeps passing (the sidecar wire format is unchanged: same sorted ids, same sizes).

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "fix(layout-dockview): flip ledger keyed by stripped membership, not split Elements (audit S3)"
```

---

### Task 5: Membership-keyed world ledger (S3, `preStripWorlds`)

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (`preStripWorlds` ~line 318, `worldAround` ~line 421, `settleStripFreeWorlds` ~line 488, `holdsStrip` ~line 512, new `worldKeyOf`)
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `directMembersOf(split): readonly SizableGroup[]`, `flipKeyFor`, Task 4's `splitForFlipKey` resolution idea (worlds resolve their split the same way).
- Produces: `preStripWorlds: Map<string, Map<string, number>>` keyed by `worldKeyOf`; `worldKeyOf(split: Element): string`. **Semantic sharpening:** a world whose split's membership CHANGED (a panel dropped in or out) is *void*, not stale — the put-back skips it. That is the correct behaviour the audit asked for: never re-assert a world over members it never described.

- [ ] **Step 1: Write the failing test**

```ts
it("voids a pre-strip world when a drop changes the split's membership", async () => {
  const seen = trackLayout();
  const engine = createDockEngine({ ...base(), ...seen.options });

  engine.collapsePanel("fx-rates");
  await waitForBranchSize(seen, "fx-rates", STRIP);

  // Membership change while the world is live: drop analytics INTO the
  // rates/blotter column as a new sibling.
  const analytics = api().getPanel("fx-analytics");
  const blotter = api().getPanel("fx-blotter");

  if (analytics === undefined || blotter === undefined) {
    throw new Error("fixture panels missing");
  }

  analytics.api.moveTo({ group: blotter.group, position: "bottom" });
  const newcomerHeight = analytics.group.api.height;

  engine.expandPanel("fx-rates");
  await waitForSizeAbove(seen, "fx-rates", STRIP);

  // The stale world (captured before the drop, ignorant of analytics) must
  // NOT be re-asserted over the new arrangement: the newcomer keeps the
  // size the drop gave it (±1 for dockview's distribution).
  expect(Math.abs(analytics.group.api.height - newcomerHeight)).toBeLessThanOrEqual(1);
  engine.dispose();
});
```

Same adaptation rule as Task 4 for fixture accessors and wait helpers.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — the Element-keyed world survives (groups are reused, and if the split element also survives this particular move, the put-back shoves the newcomer to a size from a world that never contained it). If the current code happens to pass because the split was rebuilt (entry orphaned harmlessly), STOP and check: the test must construct the *reused-split* case — use `position: "bottom"` on a group already inside the column, which extends the existing split in place. Verify by logging `preStripWorlds.size` before/after via a temporary probe, then remove the probe.

- [ ] **Step 3: Implement**

(a) Re-declare the ledger and add the key helper (comment updated accordingly):

```ts
  const preStripWorlds = new Map<string, Map<string, number>>();
```

```ts
  /** The identity of a split for the world ledger: ALL its direct members'
   * panel ids, sorted. A drop that adds or removes a member changes the
   * key, which VOIDS the old world — it describes an arrangement that no
   * longer exists, and re-asserting it over the new membership is exactly
   * the wrong-members put-back the audit flagged (S3). */
  function worldKeyOf(split: Element): string {
    const panelIds: string[] = [];

    for (const member of directMembersOf(split)) {
      for (const heldPanel of member.panels) {
        panelIds.push(heldPanel.id);
      }
    }

    return flipKeyFor(panelIds);
  }
```

(b) `worldAround` — swap the Element key for the string key:

```ts
    const key = worldKeyOf(split);
    const known = preStripWorlds.get(key);

    if (known !== undefined) {
      return known;
    }
```

…and at the end: `preStripWorlds.set(key, world);`

(c) `settleStripFreeWorlds` — resolve each entry's current split from its own panel ids and void it on membership drift:

```ts
  function settleStripFreeWorlds(): void {
    for (const [key, world] of [...preStripWorlds]) {
      const split = splitForWorldKey(world);

      if (split === null || worldKeyOf(split) !== key) {
        // Membership changed (or the panels left entirely): this world
        // describes a defunct arrangement — void it, never re-assert it.
        preStripWorlds.delete(key);
        continue;
      }

      if (holdsStrip(split)) {
        continue;
      }

      preStripWorlds.delete(key);
      const along = orientationAgainst(split);
      const members = directMembersOf(split);

      for (const member of members.slice(0, -1)) {
        const owned = world.get(member.panels[0]?.id ?? "");
        const axis = axisOf(member, along);

        if (owned !== undefined && Math.abs(axis.size() - owned) > 0.5) {
          axis.set(owned);
        }
      }
    }
  }

  /** The split currently holding a world's members — any of the world's
   * panel ids resolves it (they all lived in one split at capture). */
  function splitForWorldKey(
    world: ReadonlyMap<string, number>,
  ): Element | null {
    for (const panelId of world.keys()) {
      const split =
        groupOf(panelId)?.element.closest(SPLIT_SELECTOR) ?? null;

      if (split !== null) {
        return split;
      }
    }

    return null;
  }
```

(`holdsStrip` keeps its Element signature — it is now always called with a freshly resolved split.)

- [ ] **Step 4: Run the package — PASS**

Run: `pnpm --filter @rtc/layout-dockview test`
Expected: all green — in particular the #673 collapse-order suite and the #670 composed reload test, whose worlds' membership never changes and so behave identically.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/src/createDockEngine.ts packages/layout-dockview/src/createDockEngine.test.ts
git commit -m "fix(layout-dockview): world ledger keyed by membership; drifted worlds void, never re-asserted (audit S3)"
```

---

### Task 6: e2e — edge-split drag, strip-drop rejection, reload persistence (both clients)

**Files:**
- Modify: `tests/browser/page-objects/contracts/Layout.ts`, `tests/browser/page-objects/playwright/Layout.ts`, `tests/browser/scenarios/layout.ts`, `tests/browser/playwright/layout.spec.ts` (and the solid twin spec if the suite splits per client — follow how the existing centre-stack dock scenario is wired; the scenario layer is shared).

**Interfaces:**
- Consumes: the existing `LayoutPO` (`dragDockTabOnto`, `waitDockGroupCount`, `waitEngine`), `TESTIDS.layout.dockTab(panelId)`, the drag-gesture idiom (multi-step `mouse.move` — a single jump never promotes to a native drag), the `.dv-content-container` ancestor rule for drop coordinates, and the collapse controls the existing layout scenarios drive.
- Produces: `LayoutPO.dragDockTabToEdge(panelId, targetTestId, edge)`.

- [ ] **Step 1: Extend the contract**

In `contracts/Layout.ts`, after `dragDockTabOnto`:

```ts
  /** Drags panel `panelId`'s dockview tab to the `edge` band of the panel
   * holding `targetTestId`, splitting a NEW group at that edge (dockview
   * reads the drop point against the whole group body: an edge band is a
   * split, only the centre is a merge — see dragDockTabOnto). Dockview-
   * engine only. */
  dragDockTabToEdge(
    panelId: string,
    targetTestId: string,
    edge: "left" | "right" | "top" | "bottom",
  ): Promise<void>;
```

- [ ] **Step 2: Implement the playwright PO**

In `playwright/Layout.ts`, mirror `dragDockTabOnto`'s locator + gesture exactly, changing only the destination point:

```ts
  async dragDockTabToEdge(
    panelId: string,
    targetTestId: string,
    edge: "left" | "right" | "top" | "bottom",
  ): Promise<void> {
    const tab = this.engineRoot()
      .locator(DOCK_TAB)
      .filter({ has: this.page.getByTestId(TESTIDS.layout.dockTab(panelId)) });
    const target = this.page
      .getByTestId(targetTestId)
      .locator(
        "xpath=ancestor::*[contains(concat(' ', @class, ' '), ' dv-content-container ')]",
      )
      .first();
    const srcBox = await tab.boundingBox();
    const dstBox = await target.boundingBox();

    if (srcBox === null || dstBox === null) {
      throw new Error(
        `dragDockTabToEdge: missing bounding box for tab ${JSON.stringify(panelId)} or drop target ${JSON.stringify(targetTestId)}`,
      );
    }

    // 12% in from the chosen edge: inside dockview's edge band (an edge
    // drop splits; the centre merges), outside its outermost snap margin.
    const inset = 0.12;
    const dstX =
      edge === "left"
        ? dstBox.x + dstBox.width * inset
        : edge === "right"
          ? dstBox.x + dstBox.width * (1 - inset)
          : dstBox.x + dstBox.width / 2;
    const dstY =
      edge === "top"
        ? dstBox.y + dstBox.height * inset
        : edge === "bottom"
          ? dstBox.y + dstBox.height * (1 - inset)
          : dstBox.y + dstBox.height / 2;

    await this.page.mouse.move(
      srcBox.x + srcBox.width / 2,
      srcBox.y + srcBox.height / 2,
    );
    await this.page.mouse.down();
    await this.page.mouse.move(dstX, dstY, { steps: 12 });
    await this.page.mouse.up();
  }
```

- [ ] **Step 3: Scenarios**

In `scenarios/layout.ts`, next to the existing dock-merge scenario (reuse its engine-switch preamble and group-count helpers; testids from the same table it uses):

```ts
/** Drags the Blotter tab to the LEFT edge band of the Live Rates panel:
 * an EDGE drop splits a new group there (group count grows by one),
 * unlike the centre-drop merge above. Dockview-engine only. */
export async function splitBlotterLeftOfLiveRates(ctx: Ctx): Promise<void> {
  await ctx.po.layout.dragDockTabToEdge(
    "fx-blotter",
    TESTIDS.liveRates.tile("EURUSD"),
    "left",
  );
}

/** Dropping onto a COLLAPSED panel's bar must be rejected (the strip is
 * locked as a drop target — a swallow-proof bar): the drag completes with
 * the group count unchanged. */
export async function dragOntoCollapsedPanelIsRejected(
  ctx: Ctx,
  groupsBefore: number,
): Promise<void> {
  await ctx.po.layout.dragDockTabOnto("fx-blotter", TESTIDS.layout.panel("fx-analytics"));
  await waitDockGroups(ctx, groupsBefore, 5);
}
```

Adapt the exact `Ctx` type name, the group-count helper (`waitDockGroups` exists at ~line 62 as seen), and the testid accessors to the file's real ones — every referenced name must come from the file itself, not invented.

- [ ] **Step 4: Spec wiring**

In `playwright/layout.spec.ts`, extend the existing dockview describe (after the centre-stack test, reusing its login + engine-switch setup):

- edge-split: baseline group count → `splitBlotterLeftOfLiveRates` → `waitDockGroupCount(baseline + 1)` → **reload the page** (the suite's existing reload idiom) → `waitEngine("dockview")` → `waitDockGroupCount(baseline + 1)` — persistence witnessed.
- strip rejection: collapse `fx-analytics` via the scenario the layout suite already drives → read group count → `dragOntoCollapsedPanelIsRejected(ctx, count)` → expand again and assert the panel restores (the bar still works after the rejected drop).

- [ ] **Step 5: Run the layout e2e against BOTH clients**

Run: `pnpm test:e2e -- --grep layout` (or the suite's per-suite runner form — `tests/scripts` run-all forwards `-g`; use whatever `tests/README.md` documents for a single-suite run) — first against react, then the solid run the runner performs.
Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/page-objects/contracts/Layout.ts tests/browser/page-objects/playwright/Layout.ts tests/browser/scenarios/layout.ts tests/browser/playwright/layout.spec.ts
git commit -m "test(e2e): dockview edge-split drag, strip-drop rejection, reload persistence"
```

---

### Task 7: Docs — DnD policy recorded

**Files:**
- Modify: `packages/layout-dockview/README.md`, `docs/adr/ADR-002-layout-management-port.md`, `docs/STATUS.md`

- [ ] **Step 1: README** — new section "Drag-and-drop policy" after the design-widths section: the blessed drop set (four edge splits + centre-stack on expanded groups, intra-group reorder), the strip lock (`no-drop-target`, derived, never persisted), pin dissolution semantics (a drag out of a pinned rail dissolves the pin and releases its clamps immediately — the DnD analogue of the sash release), the membership-keyed ledgers, and the stack-collapse policy note (collapse ejects permanently; re-stack-on-expand deliberately not built).
- [ ] **Step 2: ADR-002** — one sentence + pointer in the "Dockview-native feature era" section: "Phase 1 (DnD bless) shipped: drops blessed per the plan; strips reject drops; pins dissolve structurally; ledgers keyed by membership."
- [ ] **Step 3: STATUS.md** — the Dockview-native entry's Phase 1 clause becomes "Phase 1 (DnD) BUILT — PR #NNN"; bump `**Last updated:**`.
- [ ] **Step 4: Verify links** — Run: `pnpm check:doc-links` → all OK.
- [ ] **Step 5: Commit**

```bash
git add packages/layout-dockview/README.md docs/adr/ADR-002-layout-management-port.md docs/STATUS.md
git commit -m "docs: dockview DnD policy — blessed drops, strip lock, pin dissolution, ledger keying"
```

---

### Task 8: Pre-merge measurement (the #664 lesson) + gates

- [ ] **Step 1:** `pnpm --filter @rtc/layout-dockview test` — full engine suite green.
- [ ] **Step 2:** Full local visual assert over EVERY scenario, both engines, react client (worktree recipe: build the client dep graph, start the visual host by direct binary path, run the playwright assert with NO `-g`). Expected: **zero failures** — this phase moves no resting pixel. Any failure is a stop-the-line finding, not a re-pin.
- [ ] **Step 3:** Solid visual assert `-g dockview` (same host recipe, port 3300) — zero failures.
- [ ] **Step 4:** `/rtc:gauntlet` fast tier — all 19 green (biome ci, eslint, css, actionlint, doc-links, drift checks, knip, dep-graph, grep gates…).
- [ ] **Step 5:** `pnpm typecheck` filtered to layout-dockview + the tests workspace.
- [ ] **Step 6:** Ship per shipping-repo-changes: push, PR (one reviewable unit: engine fixes + e2e + docs), CI loop on headSha, CodeQL check, Rule-3 triage, `gh pr merge --merge`, ancestor check, worktree cleanup.

---

## Self-review

- **Spec coverage:** Phase 1's audit rows all map: S1 → Tasks 1-2 (+ e2e assertion in 6), S2 → Task 3, S3 → Tasks 4-5, allowed-drop policy + persistence e2e → Task 6, doctrine/docs → Task 7, no-golden-move + gates → Task 8. The audit's "drop-settle glide slow-mo check" is folded into Task 6 Step 5 (watch the edge-split test's trace if it flakes; the audit saw snapping, which is acceptable — drags don't glide by design).
- **Placeholder scan:** every code step carries real code; the four "adapt to the file's actual fixture names" notes are deliberate — the test file's local helper names vary per describe and the implementer must copy the neighbouring idiom rather than trust this document's guess. No TBDs.
- **Type consistency:** `DockLockState` (Tasks 1-2), `pinStillShaped`/`railViewOf`/`VIEW_SELECTOR` (Task 3), `splitForFlipKey` (Task 4, reused conceptually in Task 5's `splitForWorldKey`), `worldKeyOf` (Task 5), `dragDockTabToEdge` (Task 6) — each defined before use, names match across tasks.
- **Known risk, called out:** Task 4/5's jsdom restructure simulation depends on how dockview rebuilds splits under `moveTo` in jsdom; both tasks carry an explicit Step-2 branch for the "wrong variant" case so the implementer verifies the failure mode before implementing.
