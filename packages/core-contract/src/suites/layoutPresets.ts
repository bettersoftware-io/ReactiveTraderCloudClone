import { describe, expect, it } from "vitest";

import { MAX_LAYOUT_PRESETS } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";
import {
  leafIds,
  readLatest,
  readLayout,
  spawnPanels,
} from "#/suites/workspaceKit";

/** `presenters.layoutPresets` — the View menu's saved layouts: per-tab save
 * / load / remove over `AppPorts.layoutPresetStore`, the built-in Default
 * (`resetTab`), and the live-engine snapshot registry. */
export function describeLayoutPresetsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("save needs a snapshot source, and validates the name: empty, too long, reserved", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const presets = h.app.presenters.layoutPresets;
        expect(presets.save("fx", "Mine")).toEqual({ status: "unavailable" });
        registerBlob(h, "blob");
        expect(presets.save("fx", "   ")).toEqual({
          status: "invalid",
          problem: "empty",
        });
        expect(presets.save("fx", "x".repeat(200))).toEqual({
          status: "invalid",
          problem: "too-long",
        });
        expect(presets.save("fx", "default")).toEqual({
          status: "invalid",
          problem: "reserved",
        });
      } finally {
        await h.teardown();
      }
    });

    it("a case-insensitive name clash answers exists; replace keeps the id; a new name past MAX_LAYOUT_PRESETS is full", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const presets = h.app.presenters.layoutPresets;
        registerBlob(h, "blob");
        const first = presets.save("fx", "Mine");
        expect(first.status).toBe("saved");
        const id = first.status === "saved" ? first.id : "";
        expect(presets.save("fx", "MINE")).toEqual({ status: "exists", id });
        expect(presets.save("fx", "MINE", { replace: true })).toEqual({
          status: "saved",
          id,
        });

        for (let i = 1; i < MAX_LAYOUT_PRESETS; i += 1) {
          expect(presets.save("fx", `Preset ${i}`).status).toBe("saved");
        }

        expect(presets.save("fx", "One more")).toEqual({ status: "full" });
      } finally {
        await h.teardown();
      }
    });

    it("storage-failed when the store keeps nothing; store-unreadable when the stored list is garbage", async () => {
      const dropping = makeHarness({ presetStoreDropsWrites: true });

      try {
        registerBlob(dropping, "blob");
        expect(
          dropping.app.presenters.layoutPresets.save("fx", "Mine"),
        ).toEqual({ status: "storage-failed" });
      } finally {
        await dropping.teardown();
      }

      const garbage = makeHarness({ layoutPresets: { fx: "not json" } });

      try {
        registerBlob(garbage, "blob");
        expect(garbage.app.presenters.layoutPresets.save("fx", "Mine")).toEqual(
          { status: "store-unreadable" },
        );
      } finally {
        await garbage.teardown();
      }
    });

    it("presetsFor replays the current list and follows each write", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const presets = h.app.presenters.layoutPresets;
        expect(await readLatest(presets.presetsFor("fx"))).toEqual([]);
        const c = collect(presets.presetsFor("fx"));
        await settle();
        registerBlob(h, "blob");
        presets.save("fx", "Mine");
        await settle();
        expect(
          c.values.at(-1)?.map((row) => {
            return [row.name, row.readable];
          }),
        ).toEqual([["Mine", true]]);
        c.unsubscribe();
        expect(await readLatest(presets.presetsFor("credit"))).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("a saved layout carries no docked leaves; load writes its blob, replaces the layout and re-inserts the panels docked NOW", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const presets = h.app.presenters.layoutPresets;
        const layout = h.app.presenters.layoutFor("fx");
        const initial = await readLayout(h, "fx");
        const [a] = leafIds(initial.root);
        await spawnPanels(h, ["old", "new"]);
        h.app.presenters.dockPanel("old");
        layout.intents.maximize(a);
        registerBlob(h, "saved-blob");
        const saved = presets.save("fx", "Mine");
        const id = saved.status === "saved" ? saved.id : "";

        h.app.presenters.undockPanel("old");
        h.app.presenters.dockPanel("new");
        layout.intents.restore();
        expect(presets.load("fx", id)).toBe(true);

        const loaded = await readLayout(h, "fx");
        expect(loaded.maximized).toBe(a);
        expect(leafIds(loaded.root)).toContain("new");
        expect(leafIds(loaded.root)).not.toContain("old");
        expect(h.app.presenters.dockLayoutStore.load("fx")).toBe("saved-blob");
        expect(presets.load("fx", "no-such-id")).toBe(false);
      } finally {
        await h.teardown();
      }
    });

    it("load and resetTab write the dock blob BEFORE bumping the reset counter", async () => {
      const h = makeHarness({ layoutPresets: {}, dockLayouts: { fx: "live" } });

      try {
        const presets = h.app.presenters.layoutPresets;
        registerBlob(h, "saved-blob");
        const saved = presets.save("fx", "Mine");
        const blobsAtBump: (string | null)[] = [];
        const c = collect(h.app.presenters.workspaceLayoutResets$);
        await settle();
        const sub = h.app.presenters.workspaceLayoutResets$.subscribe(() => {
          blobsAtBump.push(h.driver.dockLayout("fx"));
        });
        await settle();
        blobsAtBump.length = 0;

        presets.load("fx", saved.status === "saved" ? saved.id : "");
        await settle();
        presets.resetTab("fx");
        await settle();
        expect(blobsAtBump).toEqual(["saved-blob", null]);
        sub.unsubscribe();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("resetTab clears the tab's blob and resets its layout, keeping its docked leaves", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const initial = await readLayout(h, "fx");
        await spawnPanels(h, ["p1"]);
        h.app.presenters.dockPanel("p1");
        h.app.presenters
          .layoutFor("fx")
          .intents.maximize(leafIds(initial.root)[0]);
        h.app.presenters.dockLayoutStore.save("fx", "live");
        h.app.presenters.layoutPresets.resetTab("fx");
        const after = await readLayout(h, "fx");
        expect(after.maximized).toBe(null);
        expect(leafIds(after.root)).toContain("p1");
        expect(h.app.presenters.dockLayoutStore.load("fx")).toBe(null);
      } finally {
        await h.teardown();
      }
    });

    it("remove drops one preset; removing the unreadable-list row clears the whole list", async () => {
      const h = makeHarness({ layoutPresets: { credit: "not json" } });

      try {
        const presets = h.app.presenters.layoutPresets;
        registerBlob(h, "blob");
        const saved = presets.save("fx", "Mine");
        presets.remove("fx", saved.status === "saved" ? saved.id : "");
        expect(await readLatest(presets.presetsFor("fx"))).toEqual([]);

        const [row] = await readLatest(presets.presetsFor("credit"));
        expect(row.readable).toBe(false);
        presets.remove("credit", row.id);
        expect(h.driver.presetList("credit")).toBe(null);
        expect(await readLatest(presets.presetsFor("credit"))).toEqual([]);
      } finally {
        await h.teardown();
      }
    });
  });
}

function registerBlob(h: CoreHarness, blob: string): void {
  h.app.presenters.layoutPresets.registerSnapshotSource("fx", () => {
    return blob;
  });
}
