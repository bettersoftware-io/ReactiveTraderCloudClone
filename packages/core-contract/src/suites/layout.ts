import { describe, expect, it } from "vitest";

import type { LayoutNode } from "@rtc/core-api";
import {
  MAX_PANEL_INSTANCES,
  WORKSPACE_PERSIST_DEBOUNCE_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import {
  dockedIds,
  leafIds,
  readLayout,
  spawnPanels,
} from "#/suites/workspaceKit";

/** `presenters.layoutFor` — the per-tab layout singleton (tree, maximize,
 * collapse, close, chart instances), seeded from and persisted to the
 * `workspaceLayout` preference. */
export function describeLayoutForContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("is one instance per tab, and its dispose() is inert", async () => {
      const h = makeHarness();

      try {
        const layoutFor = h.app.presenters.layoutFor;
        expect(layoutFor("fx")).toBe(layoutFor("fx"));
        expect(layoutFor("fx")).not.toBe(layoutFor("credit"));

        const fx = layoutFor("fx");
        const [first] = leafIds((await readLayout(h, "fx")).root);
        fx.dispose();
        fx.intents.maximize(first);
        expect((await readLayout(h, "fx")).maximized).toBe(first);
      } finally {
        await h.teardown();
      }
    });

    it("maximize/restore; collapse is idempotent; expand", async () => {
      const h = makeHarness();

      try {
        const { intents } = h.app.presenters.layoutFor("fx");
        const [a, b] = leafIds((await readLayout(h, "fx")).root);
        intents.maximize(a);
        expect((await readLayout(h, "fx")).maximized).toBe(a);
        intents.restore();
        expect((await readLayout(h, "fx")).maximized).toBe(null);
        intents.collapse(b);
        intents.collapse(b);
        expect((await readLayout(h, "fx")).collapsed).toEqual([b]);
        intents.expand(b);
        expect((await readLayout(h, "fx")).collapsed).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("close hides a static panel but never the last visible one; a non-static id is a no-op; reopen", async () => {
      const h = makeHarness();

      try {
        const { intents } = h.app.presenters.layoutFor("fx");
        const ids = leafIds((await readLayout(h, "fx")).root);
        intents.close("not-a-panel");
        expect((await readLayout(h, "fx")).closed).toEqual([]);

        for (const id of ids) {
          intents.close(id);
        }

        expect((await readLayout(h, "fx")).closed).toEqual(ids.slice(0, -1));
        intents.reopen(ids[0]);
        expect((await readLayout(h, "fx")).closed).toEqual(ids.slice(1, -1));
      } finally {
        await h.teardown();
      }
    });

    it("openInstance dedupes and caps at MAX_PANEL_INSTANCES; closeInstance clears that id's maximize and collapse", async () => {
      const h = makeHarness();

      try {
        const { intents } = h.app.presenters.layoutFor("equities");
        const symbols = Array.from(
          { length: MAX_PANEL_INSTANCES + 1 },
          (_, i) => {
            return `S${i}`;
          },
        );
        intents.openInstance("eq-chart", "S0");

        for (const symbol of symbols) {
          intents.openInstance("eq-chart", symbol);
        }

        const opened = (await readLayout(h, "equities")).instances;
        expect(
          opened.map((instance) => {
            return instance.symbol;
          }),
        ).toEqual(symbols.slice(0, MAX_PANEL_INSTANCES));

        const id = opened[0].id;
        intents.maximize(id);
        intents.collapse(id);
        intents.closeInstance(id);
        const after = await readLayout(h, "equities");
        expect(after.instances).toHaveLength(MAX_PANEL_INSTANCES - 1);
        expect(after.maximized).toBe(null);
        expect(after.collapsed).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("resize sets the root split's sizes and clears its initialPx; an out-of-range path changes nothing", async () => {
      const h = makeHarness();

      try {
        const { intents } = h.app.presenters.layoutFor("fx");
        const initial = await readLayout(h, "fx");
        const root = initial.root as Extract<LayoutNode, SplitTag>;
        expect(root.kind).toBe("split");
        const sizes = root.children.map(() => {
          return 1 / root.children.length;
        });

        intents.resize([99], sizes);
        expect((await readLayout(h, "fx")).root).toEqual(initial.root);

        intents.resize([], sizes);
        const resized = (await readLayout(h, "fx")).root as Extract<
          LayoutNode,
          SplitTag
        >;
        expect(resized.sizes).toEqual(sizes);
        expect(resized.initialPx).toBe(undefined);
      } finally {
        await h.teardown();
      }
    });

    it("reset returns to the initial tree; replaceLayout installs the given state", async () => {
      const h = makeHarness();

      try {
        const { intents } = h.app.presenters.layoutFor("fx");
        const initial = await readLayout(h, "fx");
        const [a] = leafIds(initial.root);
        intents.maximize(a);
        const maximized = await readLayout(h, "fx");
        intents.reset();
        expect(await readLayout(h, "fx")).toEqual(initial);
        intents.replaceLayout(maximized);
        expect(await readLayout(h, "fx")).toEqual(maximized);
      } finally {
        await h.teardown();
      }
    });

    it("persists one debounced write per burst; the next session starts from it", async () => {
      await withFakeClock(async (clock) => {
        const h1 = makeHarness();
        let stored: string | null = null;

        try {
          const writes = collect(h1.app.ports.preferences.workspaceLayout$());
          const baseline = writes.values.length;
          const { intents } = h1.app.presenters.layoutFor("fx");
          const [a, b] = leafIds(
            (await readLayout(h1, "fx", clock.settle)).root,
          );

          for (let i = 0; i < 10; i += 1) {
            intents.collapse(b);
            intents.expand(b);
          }

          intents.maximize(a);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS - 100);
          intents.collapse(b);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS - 1);
          expect(writes.values.length).toBe(baseline);
          await clock.advance(1);
          expect(writes.values.length).toBe(baseline + 1);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS * 2);
          expect(writes.values.length).toBe(baseline + 1);
          writes.unsubscribe();
          stored = h1.driver.storedWorkspaceLayout();
        } finally {
          await h1.teardown();
        }

        const h2 = makeHarness({ workspaceLayout: stored });

        try {
          const fx = await readLayout(h2, "fx", clock.settle);
          const [a, b] = leafIds(fx.root);
          expect(fx.maximized).toBe(a);
          expect(fx.collapsed).toEqual([b]);
        } finally {
          await h2.teardown();
        }
      });
    });

    it("opening a tab and a rejected dock write nothing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const writes = collect(h.app.ports.preferences.workspaceLayout$());
          const baseline = writes.values.length;
          await readLayout(h, "admin", clock.settle);
          h.app.presenters.dockPanel("nobody");
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS * 2);
          expect(writes.values.length).toBe(baseline);
          writes.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a stored payload whose docked spec no longer parses is refused whole: the next session boots default, nothing docked", async () => {
      await withFakeClock(async (clock) => {
        const h1 = makeHarness();
        let stored: string | null = null;
        let initialFx: LayoutNode | null = null;

        try {
          initialFx = (await readLayout(h1, "fx", clock.settle)).root;
          await spawnPanels(h1, ["p1"], clock.settle);
          h1.app.presenters.dockPanel("p1");
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS);
          stored = h1.driver.storedWorkspaceLayout();
        } finally {
          await h1.teardown();
        }

        expect(stored).toContain('"table"');
        const corrupted = (stored ?? "").replace('"table"', '"no-such-viz"');
        const h2 = makeHarness({ workspaceLayout: corrupted });

        try {
          expect((await readLayout(h2, "fx", clock.settle)).root).toEqual(
            initialFx,
          );
          expect(await dockedIds(h2, clock.settle)).toEqual([]);
        } finally {
          await h2.teardown();
        }
      });
    });
  });
}

/** `machines.layout` — the ViewModel seam's layout factory: the SAME
 * per-tab singleton `presenters.layoutFor` returns. */
export function describeMachinesLayoutContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("returns presenters.layoutFor's instance for every tab", async () => {
      const h = makeHarness();

      try {
        for (const tab of ["fx", "credit", "equities", "admin"] as const) {
          expect(h.machines.layout(tab)).toBe(h.app.presenters.layoutFor(tab));
        }
      } finally {
        await h.teardown();
      }
    });
  });
}

interface SplitTag {
  readonly kind: "split";
}
