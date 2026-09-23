import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

/** `presenters.workspaceNav` — the app's active workspace tab, a singleton
 * machine retained for the session. */
export function describeWorkspaceNavContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("opens on fx, synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.workspaceNav.state$);
        expect(c.values).toEqual([{ activeTab: "fx" }]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("switchTab moves the active tab; switching to the tab already active emits nothing", async () => {
      const h = makeHarness();

      try {
        const nav = h.app.presenters.workspaceNav;
        const c = collect(nav.state$);
        nav.intents.switchTab("credit");
        await settle();
        nav.intents.switchTab("credit");
        await settle();
        nav.intents.switchTab("equities");
        await settle();
        expect(c.values).toEqual([
          { activeTab: "fx" },
          { activeTab: "credit" },
          { activeTab: "equities" },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("keeps the active tab across a full unsubscribe: a late subscriber opens on it", async () => {
      const h = makeHarness();

      try {
        const nav = h.app.presenters.workspaceNav;
        const first = collect(nav.state$);
        nav.intents.switchTab("admin");
        await settle();
        first.unsubscribe();
        const late = collect(nav.state$);
        expect(late.values.at(0)).toEqual({ activeTab: "admin" });
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
