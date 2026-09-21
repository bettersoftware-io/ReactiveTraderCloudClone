import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DockLayoutStore,
  LayoutPresetStore,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  Machine,
} from "@rtc/core-api";

import { InMemoryDockLayoutStore } from "#/adapters/InMemoryDockLayoutStore";
import { InMemoryLayoutPresetStore } from "#/adapters/InMemoryLayoutPresetStore";
import { createLayoutPresets } from "#/layout/createLayoutPresets";
import type { WorkspaceTab } from "#/layout/defaultLayoutPort";
import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
import { dockedLeafIds } from "#/layout/dockColumn";
import type { LayoutState } from "#/layout/layoutPort";
import type { StoredLayoutPreset } from "#/layout/layoutPresetCodec";
import {
  LAYOUT_PRESET_VERSION,
  MAX_LAYOUT_PRESETS,
  parseLayoutPresetList,
  UNREADABLE_LIST_ID,
} from "#/layout/layoutPresetCodec";
import type { LayoutIntents } from "#/presenters/LayoutMachine";
import { createLayoutMachine } from "#/presenters/LayoutMachine";

describe("createLayoutPresets — presetsFor", () => {
  it("emits the stored list's summaries on subscribe", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });

    expect(summariesNow(harness, "fx")).toEqual([
      { id: "p1", name: "Wide", savedAt: SAVED_AT, readable: true },
    ]);
  });

  it("emits an empty list for a tab with nothing stored", () => {
    const harness = createHarness();

    expect(summariesNow(harness, "fx")).toEqual([]);
  });

  it("re-emits to an already-subscribed reader when a later save lands", () => {
    const harness = createHarness();
    harness.presets.registerSnapshotSource("fx", () => {
      return BLOB;
    });

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });

    harness.presets.save("fx", "Wide");
    sub.unsubscribe();

    expect(seen.at(0)).toEqual([]);
    expect(seen.at(-1)?.map(nameOf)).toEqual(["Wide"]);
  });

  it("keeps each tab's list independent", () => {
    const harness = createHarness({
      seeded: {
        fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })],
        credit: [createStoredPreset("credit", { id: "p2", name: "Board" })],
      },
    });

    expect(summariesNow(harness, "fx").map(nameOf)).toEqual(["Wide"]);
    expect(summariesNow(harness, "credit").map(nameOf)).toEqual(["Board"]);
  });

  it("marks an unreadable element unreadable with a null savedAt", () => {
    const harness = createHarness();
    harness.store.save("fx", JSON.stringify([{ v: 99, id: "ancient" }]));

    expect(summariesNow(harness, "fx")).toEqual([
      {
        id: "ancient",
        name: "Unreadable layout",
        savedAt: null,
        readable: false,
      },
    ]);
  });
});

describe("createLayoutPresets — save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SAVED_AT));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses with unavailable when no snapshot source is registered, without writing", () => {
    const harness = createHarness();

    expect(harness.presets.save("fx", "Wide")).toEqual({
      status: "unavailable",
    });
    expect(harness.store.load("fx")).toBeNull();
  });

  it("refuses with unavailable for a tab whose source was unregistered", () => {
    const harness = createHarness();
    harness.presets.registerSnapshotSource("fx", () => {
      return BLOB;
    });
    harness.presets.registerSnapshotSource("fx", null);

    expect(harness.presets.save("fx", "Wide")).toEqual({
      status: "unavailable",
    });
  });

  it("refuses with unavailable for a DIFFERENT tab than the one registered", () => {
    const harness = createHarness();
    harness.presets.registerSnapshotSource("fx", () => {
      return BLOB;
    });

    expect(harness.presets.save("credit", "Wide")).toEqual({
      status: "unavailable",
    });
  });

  it("refuses an empty, over-long or reserved name — name rules before the store is read", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    expect(harness.presets.save("fx", "   ")).toEqual({
      status: "invalid",
      problem: "empty",
    });
    expect(harness.presets.save("fx", "x".repeat(41))).toEqual({
      status: "invalid",
      problem: "too-long",
    });
    expect(harness.presets.save("fx", "default")).toEqual({
      status: "invalid",
      problem: "reserved",
    });
    expect(harness.store.load("fx")).toBeNull();
  });

  // The three cases below pin the ORDER of the guards, which the
  // one-failure-at-a-time cases above cannot: each combines two failing
  // conditions and names which one must win.
  it("reports unavailable, not invalid, when BOTH the source is missing and the name is bad", () => {
    const harness = createHarness();

    expect(harness.presets.save("fx", "")).toEqual({ status: "unavailable" });
  });

  it("reports invalid, not store-unreadable, when BOTH the name is bad and the list is unreadable", () => {
    const harness = createHarness();
    registerSource(harness, "fx");
    harness.store.save("fx", "{ not an array");

    expect(harness.presets.save("fx", "")).toEqual({
      status: "invalid",
      problem: "empty",
    });
  });

  it("reports exists, not full, when the list is at the cap AND the name matches", () => {
    const harness = createHarness({ seeded: { fx: createFullList("fx") } });
    registerSource(harness, "fx");

    expect(harness.presets.save("fx", "preset 7")).toEqual({
      status: "exists",
      id: "seeded-7",
    });
  });

  it("refuses with store-unreadable when the whole stored list is unreadable", () => {
    const harness = createHarness();
    registerSource(harness, "fx");
    harness.store.save("fx", "{ not an array");

    expect(harness.presets.save("fx", "Wide")).toEqual({
      status: "store-unreadable",
    });
    expect(harness.store.load("fx")).toBe("{ not an array");
  });

  // Both localStorage adapters swallow a throwing `setItem` on purpose
  // ("best-effort persistence"), and the port cannot report it back (ruling
  // P1 keeps `save` returning void), so with storage blocked or full the
  // store ACCEPTS the write and keeps nothing. Before the controller re-read
  // the store to check, `save` answered `saved` here: the form closed, no row
  // appeared, and the user was told nothing.
  it("reports storage-failed when the store swallows the write", () => {
    const harness = createHarness({ store: createSwallowingPresetStore() });
    registerSource(harness, "fx");

    expect(harness.presets.save("fx", "Wide")).toEqual({
      status: "storage-failed",
    });
  });

  it("publishes no phantom row when the store swallows the write", () => {
    const harness = createHarness({ store: createSwallowingPresetStore() });
    registerSource(harness, "fx");

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });

    harness.presets.save("fx", "Wide");
    sub.unsubscribe();

    // Every emission, not just the last: a row published and then withdrawn
    // would still have flickered into the menu.
    expect(seen.flat().map(idOfSummary)).toEqual([]);
  });

  it("reports exists (with the matching id) for a case-insensitive name match", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });
    registerSource(harness, "fx");

    expect(harness.presets.save("fx", "  wIdE  ")).toEqual({
      status: "exists",
      id: "p1",
    });
    expect(presetsIn(harness, "fx")).toHaveLength(1);
  });

  it("reports exists for a name match on an UNREADABLE entry", () => {
    const harness = createHarness();
    registerSource(harness, "fx");
    harness.store.save(
      "fx",
      JSON.stringify([{ v: 99, id: "old-1", name: "Wide" }]),
    );

    expect(harness.presets.save("fx", "Wide")).toEqual({
      status: "exists",
      id: "old-1",
    });
  });

  // The two halves of the match crossed: case-insensitivity is pinned above on
  // a READABLE entry and the unreadable match on an EXACT name, so neither
  // case would notice a match that lower-cased only the readable half — though
  // both run through the one `entryNamed` comparison.
  it("reports exists for a case-insensitive name match on an UNREADABLE entry", () => {
    const harness = createHarness();
    registerSource(harness, "fx");
    harness.store.save(
      "fx",
      JSON.stringify([{ v: 99, id: "old-1", name: "Wide" }]),
    );

    expect(harness.presets.save("fx", "  wIdE  ")).toEqual({
      status: "exists",
      id: "old-1",
    });
    expect(presetsIn(harness, "fx")).toEqual([]);
  });

  it("reports full at the cap when the name is new", () => {
    const harness = createHarness({ seeded: { fx: createFullList("fx") } });
    registerSource(harness, "fx");

    expect(harness.presets.save("fx", "One more")).toEqual({ status: "full" });
    expect(presetsIn(harness, "fx")).toHaveLength(MAX_LAYOUT_PRESETS);
  });

  it("still replaces at the cap — full only guards an APPEND", () => {
    const harness = createHarness({ seeded: { fx: createFullList("fx") } });
    registerSource(harness, "fx");

    const result = harness.presets.save("fx", "Preset 3", { replace: true });

    expect(result).toEqual({ status: "saved", id: "seeded-3" });
    expect(presetsIn(harness, "fx")).toHaveLength(MAX_LAYOUT_PRESETS);
  });

  it("writes a version-1 record carrying the live blob, the clock and the current layout", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    const result = harness.presets.save("fx", "  Wide  ");

    expect(result.status).toBe("saved");
    const stored = presetsIn(harness, "fx");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.v).toBe(LAYOUT_PRESET_VERSION);
    expect(stored[0]?.name).toBe("Wide");
    expect(stored[0]?.savedAt).toBe(SAVED_AT);
    expect(stored[0]?.blob).toBe(BLOB);
    expect(stored[0]?.layout.docked).toEqual([]);
    expect(stored[0]?.layout.layout.root).toEqual(
      createDefaultLayoutPort("fx").initial.root,
    );
  });

  it("returns the id it wrote", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    const result = harness.presets.save("fx", "Wide");

    expect(result).toEqual({
      status: "saved",
      id: presetsIn(harness, "fx")[0]?.id,
    });
  });

  it("re-emits the list after the write", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });
    harness.presets.save("fx", "Wide");
    sub.unsubscribe();

    expect(seen.at(-1)).toEqual([
      {
        id: presetsIn(harness, "fx")[0]?.id,
        name: "Wide",
        savedAt: SAVED_AT,
        readable: true,
      },
    ]);
  });

  it("appends a new record after the existing ones", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });
    registerSource(harness, "fx");

    harness.presets.save("fx", "Narrow");

    expect(presetsIn(harness, "fx").map(nameOf)).toEqual(["Wide", "Narrow"]);
  });

  it("a replace keeps the existing id AND its list position", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide" }),
          createStoredPreset("fx", { id: "p2", name: "Narrow", blob: "old" }),
          createStoredPreset("fx", { id: "p3", name: "Tall" }),
        ],
      },
    });
    registerSource(harness, "fx");

    const result = harness.presets.save("fx", "narrow", { replace: true });

    expect(result).toEqual({ status: "saved", id: "p2" });
    const stored = presetsIn(harness, "fx");
    expect(stored.map(nameOf)).toEqual(["Wide", "narrow", "Tall"]);
    expect(stored[1]?.id).toBe("p2");
    expect(stored[1]?.blob).toBe(BLOB);
  });

  // The codec mints an unreadable row's id from its list POSITION when the
  // stored id is a duplicate (`unreadable-<index>`, first-wins). Adopting that
  // id for the replacement would tie a real preset's identity to where it sits
  // and collide with the next downgrade at the same index — so the replacement
  // takes a fresh id, and keeps only the position.
  it("a replace over an UNREADABLE row mints a fresh id and keeps the position", () => {
    const harness = createHarness();
    registerSource(harness, "fx");
    harness.store.save("fx", createListWithDuplicateIds("fx"));
    expect(summariesNow(harness, "fx").map(idOfSummary)).toEqual([
      "p1",
      "unreadable-1",
      "p2",
    ]);

    const result = harness.presets.save("fx", "Narrow", { replace: true });

    expect(result.status).toBe("saved");
    const stored = presetsIn(harness, "fx");
    expect(stored.map(nameOf)).toEqual(["Wide", "Narrow", "Tall"]);
    const replaced = stored[1];
    expect(replaced?.id).not.toBe("unreadable-1");
    // Not just "not that one id": nothing position-derived at all, since the
    // next downgrade at index 1 would mint the same shape again.
    expect(replaced?.id).not.toMatch(/^unreadable-/);
    expect(replaced?.blob).toBe(BLOB);
    // The row the user sees stayed put, and no row was added or dropped.
    expect(summariesNow(harness, "fx").map(idOfSummary)).toEqual([
      "p1",
      replaced?.id,
      "p2",
    ]);
  });

  it("mints distinct ids for two saves inside the SAME millisecond", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    harness.presets.save("fx", "Wide");
    harness.presets.save("fx", "Narrow");

    const [first, second] = presetsIn(harness, "fx");
    expect(first?.id).not.toBe(second?.id);
  });

  it("skips an id already taken by a stored entry", () => {
    const takenId = `p${Date.now().toString(36)}0`;
    const harness = createHarness({
      seeded: {
        fx: [createStoredPreset("fx", { id: takenId, name: "Squatter" })],
      },
    });
    registerSource(harness, "fx");

    const result = harness.presets.save("fx", "Wide");

    expect(result.status).toBe("saved");
    expect(presetsIn(harness, "fx")[1]?.id).not.toBe(takenId);
    expect(presetsIn(harness, "fx").map(nameOf)).toEqual(["Squatter", "Wide"]);
  });

  it("strips a docked Jarvis leaf through the reducer — the dock column collapses back", () => {
    const harness = createHarness({ docked: { fx: ["jarvis-1"] } });
    registerSource(harness, "fx");
    harness.layoutFor("fx").intents.insertPanel("jarvis-1");
    expect(dockedLeavesOf(harness.stateNow("fx"), "fx")).toEqual(["jarvis-1"]);

    harness.presets.save("fx", "Wide");

    const stored = presetsIn(harness, "fx")[0];
    expect(dockedLeavesOf(stored?.layout.layout, "fx")).toEqual([]);
    expect(stored?.layout.layout.root).toEqual(
      createDefaultLayoutPort("fx").initial.root,
    );
    expect(stored?.layout.docked).toEqual([]);
  });

  it("drops a maximized/collapsed entry that named the stripped docked panel", () => {
    const harness = createHarness({ docked: { fx: ["jarvis-1"] } });
    registerSource(harness, "fx");
    const intents = harness.layoutFor("fx").intents;
    intents.insertPanel("jarvis-1");
    intents.maximize("jarvis-1");
    intents.collapse("fx-rates");

    harness.presets.save("fx", "Wide");

    const stored = presetsIn(harness, "fx")[0];
    expect(stored?.layout.layout.maximized).toBeNull();
    expect(stored?.layout.layout.collapsed).toEqual(["fx-rates"]);
  });

  it("leaves the LIVE machine untouched — the stripping machine is a scratch one", () => {
    const harness = createHarness({ docked: { fx: ["jarvis-1"] } });
    registerSource(harness, "fx");
    const intents = harness.layoutFor("fx").intents;
    intents.insertPanel("jarvis-1");
    intents.maximize("jarvis-1");

    harness.presets.save("fx", "Wide");

    expect(dockedLeavesOf(harness.stateNow("fx"), "fx")).toEqual(["jarvis-1"]);
    expect(harness.stateNow("fx").maximized).toBe("jarvis-1");
  });

  it("records chart instances — they are ordinary layer-2 state (ruling P2)", () => {
    const harness = createHarness();
    registerSource(harness, "equities");
    harness.layoutFor("equities").intents.openInstance("eq-chart", "AAPL");

    harness.presets.save("equities", "Charted");

    expect(presetsIn(harness, "equities")[0]?.layout.layout.instances).toEqual([
      { id: "eq-chart:AAPL", kind: "eq-chart", symbol: "AAPL" },
    ]);
  });

  it("never reads the dock-layout store", () => {
    const harness = createHarness();
    registerSource(harness, "fx");

    harness.presets.save("fx", "Wide");

    expect(harness.dockLoads).toEqual([]);
  });
});

describe("createLayoutPresets — load", () => {
  it("refuses an unknown id, touching nothing", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });

    expect(harness.presets.load("fx", "nope")).toBe(false);
    expect(harness.events).toEqual([]);
    expect(harness.dockWrites).toEqual([]);
  });

  it("refuses an unreadable id, touching nothing", () => {
    const harness = createHarness();
    harness.store.save("fx", JSON.stringify([{ v: 99, id: "ancient" }]));

    expect(harness.presets.load("fx", "ancient")).toBe(false);
    expect(harness.events).toEqual([]);
    expect(harness.dockWrites).toEqual([]);
  });

  it("writes the blob, replaces layer 2, then bumps the rebuild — in that order, synchronously", () => {
    const preset = createStoredPreset("fx", {
      id: "p1",
      name: "Wide",
      blob: "preset-blob",
      layout: createMaximizedLayout("fx"),
    });
    const harness = createHarness({ seeded: { fx: [preset] } });

    expect(harness.presets.load("fx", "p1")).toBe(true);

    expect(harness.events).toEqual([
      "dockSave:fx",
      "replaceLayout:fx",
      "rebuild",
    ]);
    expect(harness.dockWrites).toEqual([{ tab: "fx", blob: "preset-blob" }]);
    expect(harness.stateNow("fx").maximized).toBe("fx-rates");
  });

  it("re-inserts whatever is docked NOW, between the replace and the rebuild", () => {
    const preset = createStoredPreset("fx", { id: "p1", name: "Wide" });
    const harness = createHarness({
      seeded: { fx: [preset] },
      docked: { fx: ["jarvis-1"] },
    });

    expect(harness.presets.load("fx", "p1")).toBe(true);

    expect(harness.events).toEqual([
      "dockSave:fx",
      "replaceLayout:fx",
      "insertPanel:jarvis-1",
      "rebuild",
    ]);
    expect(dockedLeavesOf(harness.stateNow("fx"), "fx")).toEqual(["jarvis-1"]);
    expect(harness.dockedIdsNow("fx")).toEqual(["jarvis-1"]);
  });

  it("writes the preset blob EXACTLY ONCE — the whole write sequence, not just the last value", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide", blob: "blob-1" }),
        ],
      },
    });
    harness.dockStore.save("fx", "pre-load-blob");

    harness.presets.load("fx", "p1");

    expect(harness.dockWrites).toEqual([
      { tab: "fx", blob: "pre-load-blob" },
      { tab: "fx", blob: "blob-1" },
    ]);
  });

  it("touches no other tab", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });
    harness.dockStore.save("credit", "credit-blob");
    harness.layoutFor("credit").intents.maximize("credit-rfqs");

    harness.presets.load("fx", "p1");

    expect(harness.blobOf("credit")).toBe("credit-blob");
    expect(harness.stateNow("credit").maximized).toBe("credit-rfqs");
  });

  it("leaves the preset list untouched", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });
    const before = harness.store.load("fx");

    harness.presets.load("fx", "p1");

    expect(harness.store.load("fx")).toBe(before);
  });
});

describe("createLayoutPresets — remove", () => {
  it("drops a readable entry and keeps the others", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide" }),
          createStoredPreset("fx", { id: "p2", name: "Narrow" }),
        ],
      },
    });

    harness.presets.remove("fx", "p1");

    expect(presetsIn(harness, "fx").map(nameOf)).toEqual(["Narrow"]);
  });

  it("drops an unreadable ELEMENT while preserving the other raw values verbatim", () => {
    const harness = createHarness();
    harness.store.save(
      "fx",
      JSON.stringify([
        { v: 99, id: "old-1", name: "Ancient" },
        { v: 99, id: "old-2", name: "Also ancient" },
      ]),
    );

    harness.presets.remove("fx", "old-1");

    expect(harness.store.load("fx")).toBe(
      JSON.stringify([{ v: 99, id: "old-2", name: "Also ancient" }]),
    );
  });

  it("clears the whole key for the whole-list sentinel — the sentinel never serializes back out", () => {
    const harness = createHarness();
    harness.store.save("fx", "{ not an array");

    harness.presets.remove("fx", UNREADABLE_LIST_ID);

    expect(harness.store.load("fx")).toBeNull();
  });

  it("re-emits after a removal", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });
    harness.presets.remove("fx", "p1");
    sub.unsubscribe();

    expect(seen.at(-1)).toEqual([]);
  });

  it("re-emits after clearing the sentinel", () => {
    const harness = createHarness();
    harness.store.save("fx", "{ not an array");

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });
    harness.presets.remove("fx", UNREADABLE_LIST_ID);
    sub.unsubscribe();

    expect(seen.at(0)?.map(idOfSummary)).toEqual([UNREADABLE_LIST_ID]);
    expect(seen.at(-1)).toEqual([]);
  });

  // Content, not bytes: a rewrite goes back out through the codec, which
  // normalizes a split node's key ORDER (children before sizes). The rewrite
  // is lossless, so the assertion is over the parsed records.
  it("leaves an unknown id's list content exactly as it was", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide" }),
          createStoredPreset("fx", { id: "p2", name: "Narrow" }),
        ],
      },
    });
    const before = presetsIn(harness, "fx");

    harness.presets.remove("fx", "nope");

    expect(presetsIn(harness, "fx")).toEqual(before);
  });

  // The sibling case above is over the parsed CONTENT, which a full rewrite
  // also satisfies. This one is over the BYTES: an unknown id must not reach
  // the store at all, so the stored string keeps the exact normalization it
  // had — a rewrite would re-emit it through the codec (which reorders a split
  // node's keys) and spend a storage write for a no-op.
  it("writes nothing at all for an unknown id — the stored bytes are untouched", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide" }),
          createStoredPreset("fx", { id: "p2", name: "Narrow" }),
        ],
      },
    });
    const before = harness.store.load("fx");

    harness.presets.remove("fx", "nope");

    expect(harness.store.load("fx")).toBe(before);
  });

  // The other side of that no-write: the summaries subject is the ONLY thing
  // the UI reads, so the unknown-id path still has to republish. Without it a
  // row another writer already deleted stays listed forever and the bin does
  // nothing at all — and since a surviving row is exactly how `writeList` says
  // "the delete did not happen", the two would be indistinguishable.
  it("re-emits the store's list for an unknown id, clearing a row another writer deleted", () => {
    const harness = createHarness({
      seeded: {
        fx: [
          createStoredPreset("fx", { id: "p1", name: "Wide" }),
          createStoredPreset("fx", { id: "p2", name: "Narrow" }),
        ],
      },
    });

    const seen: (readonly LayoutPresetSummary[])[] = [];
    const sub = harness.presets.presetsFor("fx").subscribe((summaries) => {
      seen.push(summaries);
    });
    // Another writer rewrote the list behind this controller's back: the
    // subject still carries `p1`, the store no longer does.
    harness.store.save(
      "fx",
      JSON.stringify([createStoredPreset("fx", { id: "p2", name: "Narrow" })]),
    );

    harness.presets.remove("fx", "p1");
    sub.unsubscribe();

    expect(seen.at(0)?.map(nameOf)).toEqual(["Wide", "Narrow"]);
    expect(seen.at(-1)?.map(nameOf)).toEqual(["Narrow"]);
    expect(seen).toHaveLength(2);
  });

  it("never rebuilds the live engine", () => {
    const harness = createHarness({
      seeded: { fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })] },
    });

    harness.presets.remove("fx", "p1");

    expect(harness.events).toEqual([]);
  });
});

describe("createLayoutPresets — resetTab", () => {
  it("clears the tab's blob, resets layer 2, then bumps the rebuild", () => {
    const harness = createHarness();
    harness.dockStore.save("fx", "old-blob");
    harness.layoutFor("fx").intents.maximize("fx-rates");
    harness.clearEvents();

    harness.presets.resetTab("fx");

    expect(harness.events).toEqual(["dockClear:fx", "reset:fx", "rebuild"]);
    expect(harness.blobOf("fx")).toBeNull();
    expect(harness.stateNow("fx")).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
  });

  it("re-inserts whatever is docked NOW, so the reset rearranges without destroying content", () => {
    const harness = createHarness({ docked: { fx: ["jarvis-1"] } });
    harness.layoutFor("fx").intents.insertPanel("jarvis-1");
    harness.clearEvents();

    harness.presets.resetTab("fx");

    expect(harness.events).toEqual([
      "dockClear:fx",
      "reset:fx",
      "insertPanel:jarvis-1",
      "rebuild",
    ]);
    expect(dockedLeavesOf(harness.stateNow("fx"), "fx")).toEqual(["jarvis-1"]);
  });

  it("leaves another tab's machine and stored blob untouched", () => {
    const harness = createHarness();
    harness.dockStore.save("credit", "credit-blob");
    harness.layoutFor("credit").intents.maximize("credit-rfqs");

    harness.presets.resetTab("fx");

    expect(harness.blobOf("credit")).toBe("credit-blob");
    expect(harness.stateNow("credit").maximized).toBe("credit-rfqs");
  });

  it("leaves every preset store key untouched", () => {
    const harness = createHarness({
      seeded: {
        fx: [createStoredPreset("fx", { id: "p1", name: "Wide" })],
        credit: [createStoredPreset("credit", { id: "p2", name: "Board" })],
      },
    });
    const fxBefore = harness.store.load("fx");
    const creditBefore = harness.store.load("credit");

    harness.presets.resetTab("fx");

    expect(harness.store.load("fx")).toBe(fxBefore);
    expect(harness.store.load("credit")).toBe(creditBefore);
  });
});

describe("createLayoutPresets — registerSnapshotSource", () => {
  it("uses the LATEST registered source for the tab", () => {
    const harness = createHarness();
    harness.presets.registerSnapshotSource("fx", () => {
      return "first";
    });
    harness.presets.registerSnapshotSource("fx", () => {
      return "second";
    });

    harness.presets.save("fx", "Wide");

    expect(presetsIn(harness, "fx")[0]?.blob).toBe("second");
  });

  it("calls the source at SAVE time, not at registration time", () => {
    const harness = createHarness();
    let blob = "before";
    harness.presets.registerSnapshotSource("fx", () => {
      return blob;
    });
    blob = "after";

    harness.presets.save("fx", "Wide");

    expect(presetsIn(harness, "fx")[0]?.blob).toBe("after");
  });
});

/** The controller over the real codec, the real reducer and the two in-memory
 * stores — only the two composition reads (`layoutStateNow`,
 * `dockedPanelIdsNow`) and the rebuild signal are stand-ins, and each is the
 * same shape composition supplies. Every intent the controller dispatches and
 * every dock-store touch is appended to `events`, so a test can assert the
 * ORDER of a whole operation rather than only its end state. */
function createHarness(options?: HarnessOptions): PresetsHarness {
  const events: string[] = [];
  const dockWrites: DockWrite[] = [];
  const dockLoads: string[] = [];
  const store = options?.store ?? new InMemoryLayoutPresetStore();
  const backingDockStore = new InMemoryDockLayoutStore();
  const states = new Map<WorkspaceTab, LayoutState>();
  const machines = new Map<WorkspaceTab, Machine<LayoutState, LayoutIntents>>();
  const docked = options?.docked ?? {};

  for (const [tab, presets] of Object.entries(options?.seeded ?? {})) {
    store.save(tab, JSON.stringify(presets));
  }

  const dockLayoutStore: DockLayoutStore = {
    load: (tab: string) => {
      dockLoads.push(tab);
      return backingDockStore.load(tab);
    },
    save: (tab: string, blob: string) => {
      events.push(`dockSave:${tab}`);
      dockWrites.push({ tab, blob });
      backingDockStore.save(tab, blob);
    },
    clear: (tab: string) => {
      events.push(`dockClear:${tab}`);
      backingDockStore.clear(tab);
    },
  };

  function layoutFor(tab: WorkspaceTab): Machine<LayoutState, LayoutIntents> {
    const existing = machines.get(tab);

    if (existing) {
      return existing;
    }

    const machine = createLayoutMachine(createDefaultLayoutPort(tab));
    machine.state$.subscribe((state) => {
      states.set(tab, state);
    });

    const handle: Machine<LayoutState, LayoutIntents> = {
      state$: machine.state$,
      intents: {
        ...machine.intents,
        replaceLayout: (state: LayoutState) => {
          events.push(`replaceLayout:${tab}`);
          machine.intents.replaceLayout(state);
        },
        insertPanel: (panelId: string) => {
          events.push(`insertPanel:${panelId}`);
          machine.intents.insertPanel(panelId);
        },
        reset: () => {
          events.push(`reset:${tab}`);
          machine.intents.reset();
        },
      },
      dispose: machine.dispose,
    };

    machines.set(tab, handle);
    return handle;
  }

  function stateNow(tab: WorkspaceTab): LayoutState {
    layoutFor(tab);
    const state = states.get(tab);

    if (state === undefined) {
      throw new Error(`no layout state recorded for ${tab}`);
    }

    return state;
  }

  function dockedIdsNow(tab: WorkspaceTab): readonly string[] {
    return docked[tab] ?? [];
  }

  const presets = createLayoutPresets({
    store,
    dockLayoutStore,
    layoutFor,
    layoutStateNow: stateNow,
    dockedPanelIdsNow: dockedIdsNow,
    rebuildLiveEngine: () => {
      events.push("rebuild");
    },
    now: () => {
      return SAVED_AT;
    },
  });

  return {
    presets,
    store,
    dockStore: dockLayoutStore,
    blobOf: (tab: WorkspaceTab) => {
      return backingDockStore.load(tab);
    },
    layoutFor,
    stateNow,
    dockedIdsNow,
    events,
    clearEvents: () => {
      events.length = 0;
    },
    dockWrites,
    dockLoads,
  };
}

interface HarnessOptions {
  /** Readable records to seed each tab's stored list with. */
  readonly seeded?: Partial<
    Record<WorkspaceTab, readonly StoredLayoutPreset[]>
  >;
  /** A stand-in for the real store — the swallowing one below. Defaults to
   * `InMemoryLayoutPresetStore`, which always keeps what it is given, so
   * `seeded` is only meaningful with the default. */
  readonly store?: LayoutPresetStore;
  /** What `dockedPanelIdsNow` reports per tab (composition's docked
   * membership). */
  readonly docked?: Partial<Record<WorkspaceTab, readonly string[]>>;
}

interface DockWrite {
  readonly tab: string;
  readonly blob: string;
}

interface PresetsHarness {
  readonly presets: LayoutPresetsPresenter;
  /** Port-typed, not `InMemoryLayoutPresetStore` — a case may swap in the
   * swallowing store below. */
  readonly store: LayoutPresetStore;
  /** The RECORDING dock store the controller was handed — a test writes
   * through it so its own setup writes appear in `dockWrites` too. */
  readonly dockStore: DockLayoutStore;
  /** Reads the stored blob WITHOUT recording a load. */
  readonly blobOf: (tab: WorkspaceTab) => string | null;
  readonly layoutFor: (
    tab: WorkspaceTab,
  ) => Machine<LayoutState, LayoutIntents>;
  readonly stateNow: (tab: WorkspaceTab) => LayoutState;
  readonly dockedIdsNow: (tab: WorkspaceTab) => readonly string[];
  /** Every dock-store touch and layout intent the controller dispatched, in
   * order. */
  readonly events: readonly string[];
  /** Drops everything logged so far, so a case asserts the ORDER of the
   * operation under test rather than of its own setup. */
  readonly clearEvents: () => void;
  /** Every dock-store WRITE, in order — a load is judged by the whole
   * sequence, never by the store's final value. */
  readonly dockWrites: readonly DockWrite[];
  readonly dockLoads: readonly string[];
}

/** A store that ACCEPTS every write and keeps nothing — exactly what the two
 * localStorage adapters do when `setItem` throws (private mode, disabled site
 * data, quota exhausted): they catch and no-op, because ruling P1's port has
 * no way to say "that didn't land". Reads stay empty, so the controller's
 * post-write re-read sees the write is absent. */
function createSwallowingPresetStore(): LayoutPresetStore {
  return {
    load: (): string | null => {
      return null;
    },
    save: (): void => {
      // Swallowed, like the adapters' own `catch { /* best-effort */ }`.
    },
    clear: (): void => {
      // Swallowed for the same reason.
    },
  };
}

function registerSource(harness: PresetsHarness, tab: WorkspaceTab): void {
  harness.presets.registerSnapshotSource(tab, () => {
    return BLOB;
  });
}

function summariesNow(
  harness: PresetsHarness,
  tab: WorkspaceTab,
): readonly LayoutPresetSummary[] {
  let summaries: readonly LayoutPresetSummary[] = [];
  harness.presets
    .presetsFor(tab)
    .subscribe((emitted) => {
      summaries = emitted;
    })
    .unsubscribe();
  return summaries;
}

/** The READABLE records currently in `tab`'s stored list, read back through
 * the real codec. */
function presetsIn(
  harness: PresetsHarness,
  tab: WorkspaceTab,
): readonly StoredLayoutPreset[] {
  return parseLayoutPresetList(tab, harness.store.load(tab)).entries.flatMap(
    (entry) => {
      return entry.readable ? [entry.preset] : [];
    },
  );
}

/** The tree-foreign (docked) leaf ids of `state`, against `tab`'s DEFAULT
 * static roster — the same measure `composition.workspacePersistence.test.ts`
 * uses, since an insert/remove round trip renormalizes sibling fractions. */
function dockedLeavesOf(
  state: LayoutState | undefined,
  tab: WorkspaceTab,
): readonly string[] {
  if (state === undefined) {
    throw new Error("no layout state to measure");
  }

  return dockedLeafIds(
    state.root,
    dockedLeafIds(createDefaultLayoutPort(tab).initial.root, []),
  );
}

function nameOf(preset: StoredLayoutPreset | LayoutPresetSummary): string {
  return preset.name;
}

function idOfSummary(summary: LayoutPresetSummary): string {
  return summary.id;
}

function createStoredPreset(
  tab: WorkspaceTab,
  overrides: StoredPresetOverrides,
): StoredLayoutPreset {
  return {
    v: LAYOUT_PRESET_VERSION,
    id: overrides.id,
    name: overrides.name,
    savedAt: SAVED_AT,
    blob: overrides.blob ?? BLOB,
    layout: overrides.layout ?? {
      layout: createDefaultLayoutPort(tab).initial,
      docked: [],
    },
  };
}

interface StoredPresetOverrides {
  readonly id: string;
  readonly name: string;
  readonly blob?: string;
  readonly layout?: StoredLayoutPreset["layout"];
}

/** A stored layout distinguishable from the default at a glance — so a load
 * that silently kept the pre-load state cannot pass. */
function createMaximizedLayout(
  tab: WorkspaceTab,
): StoredLayoutPreset["layout"] {
  return {
    layout: { ...createDefaultLayoutPort(tab).initial, maximized: "fx-rates" },
    docked: [],
  };
}

/** Three records whose MIDDLE one repeats the first's id — the codec resolves
 * duplicates first-wins, so that middle element is downgraded to unreadable
 * and handed the position-derived id `unreadable-1` while keeping its stored
 * name. Raw JSON on purpose: a typed list cannot express a duplicate id, since
 * `serializeLayoutPresetList` would re-emit the downgraded element's `raw`. */
function createListWithDuplicateIds(tab: WorkspaceTab): string {
  return JSON.stringify([
    createStoredPreset(tab, { id: "p1", name: "Wide" }),
    createStoredPreset(tab, { id: "p1", name: "Narrow", blob: "old" }),
    createStoredPreset(tab, { id: "p2", name: "Tall" }),
  ]);
}

/** `MAX_LAYOUT_PRESETS` readable records, ids `seeded-0`…`seeded-9`. */
function createFullList(tab: WorkspaceTab): readonly StoredLayoutPreset[] {
  return Array.from({ length: MAX_LAYOUT_PRESETS }, (_unused, index) => {
    return createStoredPreset(tab, {
      id: `seeded-${index}`,
      name: `Preset ${index}`,
    });
  });
}

const SAVED_AT = "2026-09-20T10:00:00.000Z";
const BLOB = JSON.stringify({ grid: { root: "live" } });
