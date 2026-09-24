import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "@rtc/core-api";
import { WORKSPACE_PERSIST_DEBOUNCE_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { WORKSPACE_TABS } from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";
import {
  dockedIds,
  leafIds,
  panelIds,
  readLatest,
  readLayout,
  spawnPanels,
} from "#/suites/workspaceKit";

const SEEDED_BLOBS: Partial<Record<WorkspaceTab, string>> = {
  fx: "fx-blob",
  credit: "credit-blob",
  equities: "equities-blob",
  admin: "admin-blob",
};

/** `presenters.resetWorkspaceLayout` — discard the whole persisted
 * workspace. */
export function describeResetWorkspaceLayoutContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("clears the preference, resets every created layout, dismisses docked panels only, clears every dock blob, and bumps the reset counter LAST", async () => {
      const h = makeHarness({ dockLayouts: SEEDED_BLOBS });

      try {
        const initialFx = await readLayout(h, "fx");
        const initialCredit = await readLayout(h, "credit");
        await spawnPanels(h, ["d", "f"]);
        h.app.presenters.dockPanel("d");
        h.app.presenters
          .layoutFor("credit")
          .intents.maximize(leafIds(initialCredit.root)[0]);
        h.app.ports.preferences.setWorkspaceLayout("stale");

        let seenAtBump: readonly (string | null)[] = [];
        const resets = collect(h.app.presenters.workspaceLayoutResets$);
        await settle();
        const sub = h.app.presenters.workspaceLayoutResets$.subscribe(() => {
          seenAtBump = [
            ...WORKSPACE_TABS.map((tab) => {
              return h.driver.dockLayout(tab);
            }),
            h.driver.storedWorkspaceLayout(),
          ];
        });
        await settle();
        const before = resets.values.at(-1) ?? -1;

        h.app.presenters.resetWorkspaceLayout();
        await settle();

        expect(h.driver.storedWorkspaceLayout()).toBe(null);
        expect(await readLayout(h, "fx")).toEqual(initialFx);
        expect(await readLayout(h, "credit")).toEqual(initialCredit);
        expect(await panelIds(h)).toEqual(["f"]);
        expect(await dockedIds(h)).toEqual([]);

        for (const tab of WORKSPACE_TABS) {
          expect(h.driver.dockLayout(tab)).toBe(null);
        }

        expect(resets.values.at(-1)).toBe(before + 1);
        expect(
          resets.values.filter((v) => {
            return v === before + 1;
          }),
        ).toHaveLength(1);
        expect(seenAtBump).toEqual([null, null, null, null, null]);
        sub.unsubscribe();
        resets.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a tab first opened AFTER the reset starts from its default tree, not the pre-reset stored one", async () => {
      await withFakeClock(async (clock) => {
        const h1 = makeHarness();
        let stored: string | null = null;

        try {
          const [a] = leafIds(
            (await readLayout(h1, "admin", clock.settle)).root,
          );
          h1.app.presenters.layoutFor("admin").intents.maximize(a);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS);
          stored = h1.driver.storedWorkspaceLayout();
        } finally {
          await h1.teardown();
        }

        expect(stored).toContain('"maximized":"admin-dashboard"');
        const h2 = makeHarness({ workspaceLayout: stored });

        try {
          h2.app.presenters.resetWorkspaceLayout();
          expect((await readLayout(h2, "admin", clock.settle)).maximized).toBe(
            null,
          );
        } finally {
          await h2.teardown();
        }
      });
    });

    it("dock, reset, dock again: the second dock lands and is persisted", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await spawnPanels(h, ["p1"], clock.settle);
          h.app.presenters.dockPanel("p1");
          h.app.presenters.resetWorkspaceLayout();
          await spawnPanels(h, ["p2"], clock.settle);
          h.app.presenters.dockPanel("p2");
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS);
          expect(await dockedIds(h, clock.settle)).toEqual(["p2"]);
          expect(
            await readLatest(
              h.app.presenters.dockedPanelIdsFor("fx"),
              clock.settle,
            ),
          ).toEqual(["p2"]);
          expect(h.driver.storedWorkspaceLayout()).toContain('"p2"');
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

/** `presenters.workspaceLayoutResets$` — the rebuild-the-live-engine
 * counter. */
export function describeWorkspaceLayoutResetsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("replays 0 to a late subscriber, then bumps once per reset, preset load and resetTab", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        expect(await readLatest(h.app.presenters.workspaceLayoutResets$)).toBe(
          0,
        );
        const presets = h.app.presenters.layoutPresets;
        presets.registerSnapshotSource("fx", () => {
          return "blob";
        });
        const saved = presets.save("fx", "Mine");
        const c = collect(h.app.presenters.workspaceLayoutResets$);
        await settle();

        h.app.presenters.resetWorkspaceLayout();
        expect(saved.status).toBe("saved");

        if (saved.status === "saved") {
          presets.load("fx", saved.id);
        }

        presets.resetTab("fx");
        await settle();
        expect(c.values).toEqual([0, 1, 2, 3]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

/** `presenters.dockLayoutStore` — the Dockview blob store: the supplied port
 * when there is one, else the core's own in-memory fallback. */
export function describeDockLayoutStoreContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("round-trips save/load/clear per tab, tabs independent (the core's own fallback)", async () => {
      const h = makeHarness();

      try {
        const store = h.app.presenters.dockLayoutStore;
        expect(store.load("fx")).toBe(null);
        store.save("fx", "a");
        store.save("credit", "b");
        store.clear("fx");
        expect(store.load("fx")).toBe(null);
        expect(store.load("credit")).toBe("b");
      } finally {
        await h.teardown();
      }
    });

    it("is the SAME store the reset clears and a preset load writes", async () => {
      const h = makeHarness({ layoutPresets: {} });

      try {
        const store = h.app.presenters.dockLayoutStore;
        const presets = h.app.presenters.layoutPresets;
        presets.registerSnapshotSource("fx", () => {
          return "preset-blob";
        });
        const saved = presets.save("fx", "Mine");
        store.save("fx", "live");

        if (saved.status === "saved") {
          presets.load("fx", saved.id);
        }

        expect(store.load("fx")).toBe("preset-blob");
        h.app.presenters.resetWorkspaceLayout();
        expect(store.load("fx")).toBe(null);
      } finally {
        await h.teardown();
      }
    });
  });
}
