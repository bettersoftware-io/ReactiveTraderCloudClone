import { AppShell } from "@ui-contract/components";
import type { World } from "@ui-contract/harness/world";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { LayoutPresetEntry, StoredLayoutPreset } from "@rtc/client-core";
import {
  createDefaultLayoutPort,
  LAYOUT_PRESET_VERSION,
  MAX_LAYOUT_PRESETS,
  serializeLayoutPresetList,
  UNREADABLE_LIST_ID,
} from "@rtc/client-core";

/**
 * The View menu's LAYOUTS section (Phase 6b saved layouts) — the ONE
 * user-facing surface over `Presenters.layoutPresets`, driven through the real
 * `App` shell on a World that owns the REAL `createLayoutPresets` controller
 * (see each framework's `viewModelFromWorld`'s `getLayoutPresets`).
 *
 * Every rule under test here lives in the controller, never in the section:
 * the cap, the name rules, the reserved `Default`, the unreadable-record
 * sidelining. The section's own contract is what this file pins — which rows
 * exist, in what order, which of them the user can actually press, and which
 * message a refused save shows.
 *
 * WHY THE DOCKVIEW BLOCKS MOUNT THE APP SHELL (not `DockviewEngineHost`): a
 * save needs a registered snapshot source, and `App.tsx` is where the live
 * engine's `snapshotLayout` reaches the controller (`onSnapshotSourceChange`
 * ← `useRegisterLayoutSnapshot()`). Unwire that one prop and `save` answers
 * `unavailable`: the "Morning" row never appears and the section shows
 * "Layouts need the Dockview engine" instead — which is exactly why the save
 * cases assert `layoutMessage()` is null as well as asserting the row. A
 * standalone bridge host would make those cases pass while proving nothing.
 */

afterEach(() => {
  cleanupMounted();
});

describe("View menu LAYOUTS section (Dockview engine)", () => {
  it("lists Default, then the saved presets in stored order, then the save opener", async () => {
    const app = mountWith(
      createDockviewWorld(createStoredList(["Morning", "Evening"])),
      AppShell,
    );
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();

    expect(app.viewMenu.hasLayoutsSection()).toBe(true);
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      "Evening",
      SAVE_OPENER_LABEL,
    ]);
    expect(app.viewMenu.layoutRowIds()).toEqual(["p0", "p1"]);
  });

  it("saves the current layout under a typed name, adding its row", async () => {
    const app = mountWith(createDockviewWorld(), AppShell);
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();
    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Morning");
    await app.viewMenu.confirmSaveLayout();

    // No message at all — a save that fell back to `unavailable` (no snapshot
    // source registered) would show one instead of adding the row.
    expect(app.viewMenu.layoutMessage()).toBeNull();
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      SAVE_OPENER_LABEL,
    ]);
    // A saved name leaves the form closed, so the next save starts clean.
    expect(app.viewMenu.hasLayoutNameField()).toBe(false);
  });

  it("saves on Enter and abandons the draft on Escape", async () => {
    const app = mountWith(createDockviewWorld(), AppShell);
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();
    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Evening");
    await app.viewMenu.cancelLayoutWithEscape();

    expect(app.viewMenu.hasLayoutNameField()).toBe(false);
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);

    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Evening");
    await app.viewMenu.saveLayoutWithEnter();

    expect(app.viewMenu.layoutMessage()).toBeNull();
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Evening",
      SAVE_OPENER_LABEL,
    ]);
  });

  it("refuses an empty, over-long or reserved name with a message and no new row", async () => {
    const app = mountWith(createDockviewWorld(), AppShell);
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();
    await app.viewMenu.openSaveLayout();

    await app.viewMenu.typeLayoutName("   ");
    await app.viewMenu.confirmSaveLayout();
    expect(app.viewMenu.layoutMessage()).toBe("Enter a name");
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);

    await app.viewMenu.typeLayoutName("x".repeat(41));
    await app.viewMenu.confirmSaveLayout();
    expect(app.viewMenu.layoutMessage()).toBe("40 characters at most");
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);

    await app.viewMenu.typeLayoutName("default");
    await app.viewMenu.confirmSaveLayout();
    expect(app.viewMenu.layoutMessage()).toBe("“Default” is reserved");
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);

    await app.viewMenu.cancelSaveLayout();
    expect(app.viewMenu.hasLayoutNameField()).toBe(false);
  });

  it("offers a replace confirm for a name already taken, and overwrites that one record", async () => {
    const app = mountWith(createDockviewWorld(), AppShell);
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();
    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Morning");
    await app.viewMenu.confirmSaveLayout();
    const [morningId] = app.viewMenu.layoutRowIds();

    // Make the LIVE layout differ from what "Morning" holds, so the replace
    // has something to prove: a record left untouched would restore the
    // un-maximized tree this first save captured.
    await app.viewMenu.toggle();
    app.dockviewLayout.clickMaximize("fx-rates");
    expect(app.maximizedPanelId()).toBe("fx-rates");

    await app.viewMenu.toggle();
    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Morning");
    await app.viewMenu.confirmSaveLayout();

    // `exists`: nothing written yet, no second row, no refusal message.
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      SAVE_OPENER_LABEL,
    ]);
    expect(app.viewMenu.layoutMessage()).toBeNull();

    await app.viewMenu.confirmReplaceLayout();

    // Still exactly one Morning — a replace keeps the id and the position.
    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      SAVE_OPENER_LABEL,
    ]);
    expect(app.viewMenu.layoutRowIds()).toEqual([morningId]);

    // The stored record is the NEWER layout: restore, then load it back.
    await app.viewMenu.toggle();
    app.dockviewLayout.clickMaximize("fx-rates");
    expect(app.maximizedPanelId()).toBe("");

    await app.viewMenu.toggle();
    await app.viewMenu.loadLayout(morningId);

    expect(app.viewMenu.isOpen()).toBe(false);
    expect(app.maximizedPanelId()).toBe("fx-rates");
  });

  it("deletes only on the second click, and a cancel keeps the row", async () => {
    const app = mountWith(
      createDockviewWorld(createStoredList(["Morning"])),
      AppShell,
    );
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();
    await app.viewMenu.requestDeleteLayout("p0");

    // The bin alone deletes nothing — the row is still listed.
    expect(app.viewMenu.layoutRowIds()).toEqual(["p0"]);

    await app.viewMenu.cancelDeleteLayout("p0");
    expect(app.viewMenu.layoutRowIds()).toEqual(["p0"]);

    await app.viewMenu.requestDeleteLayout("p0");
    await app.viewMenu.confirmDeleteLayout("p0");

    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);
  });

  it("greys out an unreadable record, loads nothing from it, and still deletes it", async () => {
    const app = mountWith(
      createDockviewWorld(createListWithUnreadableRecord()),
      AppShell,
    );
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();

    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      "Unreadable layout",
      SAVE_OPENER_LABEL,
    ]);
    expect(app.viewMenu.isLayoutRowDisabled(UNREADABLE_RECORD_ID)).toBe(true);
    expect(app.viewMenu.isLayoutRowDisabled("p0")).toBe(false);

    await app.viewMenu.loadLayout(UNREADABLE_RECORD_ID);

    // A load closes the menu; this one never ran at all.
    expect(app.viewMenu.isOpen()).toBe(true);
    expect(app.viewMenu.layoutRowIds()).toEqual(["p0", UNREADABLE_RECORD_ID]);

    await app.viewMenu.requestDeleteLayout(UNREADABLE_RECORD_ID);
    await app.viewMenu.confirmDeleteLayout(UNREADABLE_RECORD_ID);

    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Morning",
      SAVE_OPENER_LABEL,
    ]);
  });

  it("keeps the save opener at the cap and reports the cap when it is pressed", async () => {
    const app = mountWith(
      createDockviewWorld(createFullStoredList()),
      AppShell,
    );
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();

    // The UI never counts: the opener is offered, and the CONTROLLER refuses.
    expect(app.viewMenu.layoutRowIds()).toHaveLength(MAX_LAYOUT_PRESETS);
    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("One more");
    await app.viewMenu.confirmSaveLayout();

    expect(app.viewMenu.layoutMessage()).toBe(
      "10 layouts at most — delete one first",
    );
    expect(app.viewMenu.layoutRowIds()).toHaveLength(MAX_LAYOUT_PRESETS);
  });

  it("refuses to save over a wholly unreadable stored list, which the user can delete", async () => {
    const app = mountWith(
      createDockviewWorld("}{ not a layout list"),
      AppShell,
    );
    await app.dockviewLayout.waitForGroups(FX_GROUP_COUNT);

    await app.viewMenu.toggle();

    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      "Unreadable saved layouts",
      SAVE_OPENER_LABEL,
    ]);

    await app.viewMenu.openSaveLayout();
    await app.viewMenu.typeLayoutName("Morning");
    await app.viewMenu.confirmSaveLayout();

    expect(app.viewMenu.layoutMessage()).toBe(
      "Delete the unreadable entry first",
    );

    await app.viewMenu.requestDeleteLayout(UNREADABLE_LIST_ID);
    await app.viewMenu.confirmDeleteLayout(UNREADABLE_LIST_ID);

    expect(app.viewMenu.layoutRowLabels()).toEqual([
      "Default",
      SAVE_OPENER_LABEL,
    ]);
  });
});

describe("View menu LAYOUTS section (in-house engine)", () => {
  it("offers Default only — no preset rows, no save opener", async () => {
    const world = createWorldWithPresets(createStoredList(["Morning"]));
    const app = mountWith(world, AppShell);

    await app.viewMenu.toggle();

    expect(app.viewMenu.hasLayoutsSection()).toBe(true);
    expect(app.viewMenu.layoutRowLabels()).toEqual(["Default"]);
  });

  it("Default puts the tab's own layout back, reopening a closed panel", async () => {
    const app = mountWith(createWorld({}), AppShell);

    await app.viewMenu.toggle();
    await app.viewMenu.toggleRow("fx-analytics");
    expect(app.layout.panelExists("fx-analytics")).toBe(false);

    await app.viewMenu.loadDefaultLayout();

    expect(app.viewMenu.isOpen()).toBe(false);
    expect(app.layout.panelExists("fx-analytics")).toBe(true);
  });
});

/** A Dockview World, optionally with a raw stored preset list seeded under
 * "fx" (the tab the shell opens on). Seeded BEFORE the mount, like every other
 * Dockview case in this tier. */
function createDockviewWorld(presetsSeed = ""): World {
  const world = createWorldWithPresets(presetsSeed);
  world.layoutEngine.next("dockview");
  return world;
}

/** `createWorld` with a seeded fx layout-preset list — the 25th positional
 * parameter, reached past every earlier seed (see `harness/world.ts`;
 * `mount()`'s `MountOptions` stops at the 24th, so this seed needs
 * `createWorld` + `mountWith`). An empty string seeds nothing: the store keeps
 * a per-tab record only for the tabs present in the seed object. */
function createWorldWithPresets(presetsSeed: string): World {
  return createWorld(
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    presetsSeed === "" ? {} : { fx: presetsSeed },
  );
}

/** `names` as one tab's stored list, ids `p0`…`pN` — written through the REAL
 * codec, never hand-rolled JSON, so a seed can never drift from what the
 * controller writes. */
function createStoredList(names: readonly string[]): string {
  return serializeLayoutPresetList(
    names.map((name, index) => {
      return { readable: true, preset: createStoredPreset(name, `p${index}`) };
    }),
  );
}

/** One readable record plus one the codec must sideline: a v99 element, which
 * no version of the parser will ever accept. Seeded raw on purpose — a typed
 * seed cannot express an unreadable record. */
function createListWithUnreadableRecord(): string {
  const unreadable: LayoutPresetEntry = {
    readable: false,
    id: UNREADABLE_RECORD_ID,
    name: "Unreadable layout",
    raw: { v: 99, id: UNREADABLE_RECORD_ID },
  };

  return serializeLayoutPresetList([
    { readable: true, preset: createStoredPreset("Morning", "p0") },
    unreadable,
  ]);
}

/** A list already at `MAX_LAYOUT_PRESETS`, so the next save is refused. */
function createFullStoredList(): string {
  return createStoredList(
    Array.from({ length: MAX_LAYOUT_PRESETS }, (_unused, index) => {
      return `Preset ${index}`;
    }),
  );
}

function createStoredPreset(name: string, id: string): StoredLayoutPreset {
  return {
    v: LAYOUT_PRESET_VERSION,
    id,
    name,
    savedAt: SEEDED_SAVED_AT,
    blob: SEEDED_BLOB,
    layout: { layout: createDefaultLayoutPort("fx").initial, docked: [] },
  };
}

/** The opener's label, spelled once — every row-list assertion ends with it. */
const SAVE_OPENER_LABEL = "Save current as…";

/** The fx tab's default seed is four leaves, so the mounted Dockview engine
 * settles at four groups; every Dockview case waits for that before touching
 * the menu, so the engine has registered its snapshot source. */
const FX_GROUP_COUNT = 4;

const UNREADABLE_RECORD_ID = "ancient";

const SEEDED_SAVED_AT = "2026-09-19T09:00:00.000Z";

/** A stand-in for a dockview serialization: seeded records are listed and
 * deleted here, never loaded, so its shape is never read. */
const SEEDED_BLOB = JSON.stringify({ grid: { root: "seeded" } });
