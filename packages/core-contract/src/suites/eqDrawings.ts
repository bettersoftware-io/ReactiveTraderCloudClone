import { describe, expect, it } from "vitest";

import type { EqDrawing } from "@rtc/core-api";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const TREND: EqDrawing = {
  id: "t1",
  kind: "trendline",
  a: { index: 10, price: 100 },
  b: { index: 20, price: 110 },
};
const LEVEL: EqDrawing = { id: "h1", kind: "hline", price: 105 };

export function describeEqDrawingsContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts on the cursor with no drawings and no selection — synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.eqDrawings.state$);
        expect(c.values).toEqual([
          { tool: "cursor", drawings: {}, selectedId: null },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("addDrawing appends per symbol, selects the new drawing and returns to the cursor; setTool drops the selection", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.setTool("trendline");
        await settle();
        expect(c.values.at(-1)).toMatchObject({ tool: "trendline" });
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        m.intents.addDrawing("MSFT", { ...LEVEL, id: "h2" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          tool: "cursor",
          drawings: { AAPL: [TREND, LEVEL], MSFT: [{ ...LEVEL, id: "h2" }] },
          selectedId: "h2",
        });
        m.intents.setTool("hline");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          tool: "hline",
          selectedId: null,
        });
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("updateDrawing replaces in place and ignores an unknown id; deleteSelected removes only a selected drawing of THAT symbol", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        const moved: EqDrawing = { id: "t1", kind: "hline", price: 99 };
        m.intents.updateDrawing("AAPL", moved);
        m.intents.updateDrawing("AAPL", { ...LEVEL, id: "ghost" });
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved, LEVEL] });
        expect(c.values.at(-1)?.selectedId).toBe("h1");
        m.intents.deleteSelected("MSFT");
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved, LEVEL] });
        m.intents.deleteSelected("AAPL");
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          drawings: { AAPL: [moved] },
          selectedId: null,
        });
        m.intents.deleteSelected("AAPL");
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({ AAPL: [moved] });
        m.intents.selectDrawing("t1");
        await settle();
        expect(c.values.at(-1)?.selectedId).toBe("t1");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("shiftAnchors moves both anchors of that symbol's trendlines and nothing else", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        const c = collect(m.state$);
        m.intents.addDrawing("AAPL", TREND);
        m.intents.addDrawing("AAPL", LEVEL);
        m.intents.addDrawing("MSFT", { ...TREND, id: "t2" });
        m.intents.shiftAnchors("AAPL", 300);
        m.intents.shiftAnchors("TSLA", 300);
        await settle();
        expect(c.values.at(-1)?.drawings).toEqual({
          AAPL: [
            {
              ...TREND,
              a: { index: 310, price: 100 },
              b: { index: 320, price: 110 },
            },
            LEVEL,
          ],
          MSFT: [{ ...TREND, id: "t2" }],
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("is warm with nobody watching: a change made with zero subscribers is what getValue() reads and what the next subscriber hears first", async () => {
      const h = makeHarness();

      try {
        const m = h.app.presenters.eqDrawings;
        m.intents.setTool("hline");
        await settle();
        expect(m.state$.getValue()).toMatchObject({ tool: "hline" });
        const c = collect(m.state$);
        expect(c.values).toEqual([
          { tool: "hline", drawings: {}, selectedId: null },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
