import { describe, expect, it } from "vitest";

import { MAX_DOCKED_PANELS, MAX_LIVE_PANELS } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";
import {
  dockedIds,
  leafIds,
  panelIds,
  readLatest,
  readLayout,
  spawnPanels,
} from "#/suites/workspaceKit";

/** `presenters.dockPanel` — dock a live desk panel into the ACTIVE tab: the
 * panels roster flips it docked (owning every no-op rule) and only then does
 * that tab's layout gain its leaf; the tab is remembered at dock time. */
export function describeDockPanelContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("docks a spawned panel into the active tab: roster, tree and membership agree", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1"]);
        h.app.presenters.dockPanel("p1");
        expect(await dockedIds(h)).toEqual(["p1"]);
        expect(leafIds((await readLayout(h, "fx")).root)).toContain("p1");
        expect(
          await readLatest(h.app.presenters.dockedPanelIdsFor("fx")),
        ).toEqual(["p1"]);
      } finally {
        await h.teardown();
      }
    });

    it("refuses a static panel id, a chart-instance id, an unknown id and a repeat — tree and roster untouched", async () => {
      const h = makeHarness();

      try {
        const initial = await readLayout(h, "fx");
        const [staticId] = leafIds(initial.root);
        await spawnPanels(h, [staticId, "eq-chart:AAPL", "p1"]);
        h.app.presenters.dockPanel(staticId);
        h.app.presenters.dockPanel("eq-chart:AAPL");
        h.app.presenters.dockPanel("nobody");
        expect((await readLayout(h, "fx")).root).toEqual(initial.root);
        expect(await dockedIds(h)).toEqual([]);

        h.app.presenters.dockPanel("p1");
        const docked = await readLayout(h, "fx");
        h.app.presenters.dockPanel("p1");
        expect((await readLayout(h, "fx")).root).toEqual(docked.root);
      } finally {
        await h.teardown();
      }
    });

    it("refuses a dock past MAX_DOCKED_PANELS", async () => {
      const h = makeHarness();

      try {
        const ids = Array.from({ length: MAX_DOCKED_PANELS + 1 }, (_, i) => {
          return `p${i}`;
        });
        await spawnPanels(h, ids.slice(0, MAX_LIVE_PANELS));

        for (const id of ids.slice(0, MAX_LIVE_PANELS)) {
          h.app.presenters.dockPanel(id);
        }

        await spawnPanels(h, ids.slice(MAX_LIVE_PANELS));

        for (const id of ids.slice(MAX_LIVE_PANELS)) {
          h.app.presenters.dockPanel(id);
        }

        expect(await dockedIds(h)).toEqual(ids.slice(0, MAX_DOCKED_PANELS));
        expect(leafIds((await readLayout(h, "fx")).root)).not.toContain(
          ids[MAX_DOCKED_PANELS],
        );
      } finally {
        await h.teardown();
      }
    });

    it("a docked panel stays with the tab it was docked into, wherever the user navigates", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1"]);
        h.app.presenters.dockPanel("p1");
        h.app.presenters.workspaceNav.intents.switchTab("credit");
        await settle();
        expect(
          await readLatest(h.app.presenters.dockedPanelIdsFor("fx")),
        ).toEqual(["p1"]);
        expect(
          await readLatest(h.app.presenters.dockedPanelIdsFor("credit")),
        ).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("docks into whichever tab is active at the moment of the dock", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1"]);
        h.app.presenters.workspaceNav.intents.switchTab("equities");
        await settle();
        h.app.presenters.dockPanel("p1");
        expect(leafIds((await readLayout(h, "equities")).root)).toContain("p1");
        expect(leafIds((await readLayout(h, "fx")).root)).not.toContain("p1");
      } finally {
        await h.teardown();
      }
    });
  });
}

/** `presenters.undockPanel` — the inverse of `dockPanel`. */
export function describeUndockPanelContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("removes the leaf from the tab it was docked INTO, even with another tab active, and floats the panel again", async () => {
      const h = makeHarness();

      try {
        const initial = await readLayout(h, "fx");
        await spawnPanels(h, ["p1"]);
        h.app.presenters.dockPanel("p1");
        h.app.presenters.workspaceNav.intents.switchTab("admin");
        await settle();
        h.app.presenters.undockPanel("p1");
        expect((await readLayout(h, "fx")).root).toEqual(initial.root);
        expect(await dockedIds(h)).toEqual([]);
        expect(await panelIds(h)).toEqual(["p1"]);
      } finally {
        await h.teardown();
      }
    });

    it("an undock that overflows MAX_LIVE_PANELS evicts the OLDEST other floating panel, never the undocked one", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["d"]);
        h.app.presenters.dockPanel("d");
        const floating = Array.from({ length: MAX_LIVE_PANELS }, (_, i) => {
          return `f${i}`;
        });
        await spawnPanels(h, floating);
        h.app.presenters.undockPanel("d");
        const ids = await panelIds(h);
        expect(ids).toContain("d");
        expect(ids).not.toContain("f0");
        expect(ids).toHaveLength(MAX_LIVE_PANELS);
      } finally {
        await h.teardown();
      }
    });

    it("undocking a floating or unknown id changes nothing", async () => {
      const h = makeHarness();

      try {
        const initial = await readLayout(h, "fx");
        await spawnPanels(h, ["p1"]);
        h.app.presenters.undockPanel("p1");
        h.app.presenters.undockPanel("nobody");
        expect((await readLayout(h, "fx")).root).toEqual(initial.root);
        expect(await panelIds(h)).toEqual(["p1"]);
      } finally {
        await h.teardown();
      }
    });
  });
}

/** `presenters.dismissPanel` — the docked-safe dismissal. */
export function describeDismissPanelContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a docked panel: leaf detached from ITS tab (even when another is active), panel gone, no floating panel evicted", async () => {
      const h = makeHarness();

      try {
        const initial = await readLayout(h, "fx");
        await spawnPanels(h, ["d"]);
        h.app.presenters.dockPanel("d");
        const floating = Array.from({ length: MAX_LIVE_PANELS }, (_, i) => {
          return `f${i}`;
        });
        await spawnPanels(h, floating);
        h.app.presenters.workspaceNav.intents.switchTab("admin");
        await settle();
        h.app.presenters.dismissPanel("d");
        expect((await readLayout(h, "fx")).root).toEqual(initial.root);
        expect(await panelIds(h)).toEqual(floating);
      } finally {
        await h.teardown();
      }
    });

    it("a floating panel is simply gone", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1", "p2"]);
        h.app.presenters.dismissPanel("p1");
        expect(await panelIds(h)).toEqual(["p2"]);
      } finally {
        await h.teardown();
      }
    });
  });
}

/** `presenters.dockedPanelIdsFor` — one tab's docked membership, as the
 * Dockview bridge consumes it. */
export function describeDockedPanelIdsForContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("is sorted, and does not re-emit on a roster change that leaves the tab's membership unchanged", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["zeta", "alpha"]);
        const c = collect(h.app.presenters.dockedPanelIdsFor("fx"));
        await settle();
        dockBoth(h);
        await settle();
        const emitted = c.values.length;
        expect(c.values.at(-1)).toEqual(["alpha", "zeta"]);

        await spawnPanels(h, ["unrelated"]);
        expect(c.values.length).toBe(emitted);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}

function dockBoth(h: CoreHarness): void {
  h.app.presenters.dockPanel("zeta");
  h.app.presenters.dockPanel("alpha");
}
