import { describe, expect, it } from "vitest";

import { MAX_DOCKED_PANELS, MAX_LIVE_PANELS } from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createTick } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";
import {
  createPanelEvent,
  dockedIds,
  FX_TICKS_SPEC,
  PANEL_SPEC,
  panelIds,
  readLatest,
  replyToTurn,
  spawnPanels,
} from "#/suites/workspaceKit";

/** `presenters.jarvisPanels` — the Jarvis desk-panel roster, folded from the
 * `panel` events of Jarvis's own turns, and each live panel's data. */
export function describeJarvisPanelsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a panel event spawns a live floating panel carrying its spec's title, rationale and viz", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1"]);
        const rows = await readLatest(h.app.presenters.jarvisPanels.panels$);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          panelId: "p1",
          title: PANEL_SPEC.title,
          rationale: PANEL_SPEC.rationale,
          status: "live",
          vizKind: "table",
          docked: false,
        });
        expect(
          (await readLatest(h.app.presenters.jarvisPanels.floatingPanels$)).map(
            (row) => {
              return row.panelId;
            },
          ),
        ).toEqual(["p1"]);
        expect(await dockedIds(h)).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("only panel events spawn: a turn of text, tool and drive events adds nothing", async () => {
      const h = makeHarness();

      try {
        await replyToTurn(h, [
          { type: "delta", text: "thinking" },
          { type: "toolEvent", tool: "get_price", status: "running" },
          { type: "command", batch: { v: 1, commands: [] } },
        ]);
        expect(await panelIds(h)).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("a second event for the same id edits in place and keeps its docked flag", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1", "p2"]);
        h.app.presenters.dockPanel("p1");
        await replyToTurn(h, [
          createPanelEvent("p1", { ...PANEL_SPEC, title: "Edited" }),
        ]);
        const rows = await readLatest(h.app.presenters.jarvisPanels.panels$);
        expect(
          rows.map((row) => {
            return [row.panelId, row.title, row.docked];
          }),
        ).toEqual([
          ["p1", "Edited", true],
          ["p2", PANEL_SPEC.title, false],
        ]);
      } finally {
        await h.teardown();
      }
    });

    it("a spawn past MAX_LIVE_PANELS evicts the OLDEST floating panel, never a docked one", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["d1"]);
        h.app.presenters.dockPanel("d1");
        const floating = Array.from({ length: MAX_LIVE_PANELS }, (_, i) => {
          return `f${i}`;
        });
        await spawnPanels(h, floating);
        expect(await panelIds(h)).toEqual(["d1", ...floating]);

        await spawnPanels(h, ["late"]);
        expect(await panelIds(h)).toEqual(["d1", ...floating.slice(1), "late"]);
      } finally {
        await h.teardown();
      }
    });

    it("the raw dismissPanel removes the panel from the roster", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["p1", "p2"]);
        h.app.presenters.jarvisPanels.dismissPanel("p1");
        expect(await panelIds(h)).toEqual(["p2"]);
      } finally {
        await h.teardown();
      }
    });

    it("restoreDockedPanel appends a docked panel; a known id is ignored; past MAX_DOCKED_PANELS it is dropped", async () => {
      const h = makeHarness();

      try {
        await spawnPanels(h, ["known"]);
        const panels = h.app.presenters.jarvisPanels;
        panels.restoreDockedPanel("known", PANEL_SPEC);
        const restored = Array.from({ length: MAX_DOCKED_PANELS }, (_, i) => {
          return `r${i}`;
        });

        for (const id of [...restored, "one-too-many"]) {
          panels.restoreDockedPanel(id, PANEL_SPEC);
        }

        await settle();
        expect(await panelIds(h)).toEqual(["known", ...restored]);
        expect(await dockedIds(h)).toEqual(restored);
      } finally {
        await h.teardown();
      }
    });

    it("panelData$ of an unknown id is null; a live fxTicks panel's data follows the price port", async () => {
      const h = makeHarness();

      try {
        const panels = h.app.presenters.jarvisPanels;
        expect(await readLatest(panels.panelData$("nobody"))).toBe(null);

        await replyToTurn(h, [createPanelEvent("ticks", FX_TICKS_SPEC)]);
        const c = collect(panels.panelData$("ticks"));
        await settle();
        h.driver.tickPrice(createTick("EURUSD", 1.1, 1));
        await settle();
        const frame = c.values.at(-1);
        c.unsubscribe();
        expect(frame).toMatchObject({ kind: "line" });
        expect(JSON.stringify(frame)).toContain("1.1");
      } finally {
        await h.teardown();
      }
    });
  });
}
