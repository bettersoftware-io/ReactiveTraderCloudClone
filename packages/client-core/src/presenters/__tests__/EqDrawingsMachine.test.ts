import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EqDrawing } from "../EqDrawingsMachine";
import { createEqDrawingsMachine } from "../EqDrawingsMachine";

describe("EqDrawingsMachine", () => {
  it("starts with tool 'cursor', no drawings, and no selection", async () => {
    const m = createEqDrawingsMachine();
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({ tool: "cursor", drawings: {}, selectedId: null });
    m.dispose();
  });

  it("setTool(tool) sets the tool AND clears a prior selection", async () => {
    const m = createEqDrawingsMachine();
    m.intents.addDrawing("AAPL", trendline("t1"));
    let state = await firstValueFrom(m.state$);
    expect(state.selectedId).toBe("t1");

    m.intents.setTool("trendline");
    state = await firstValueFrom(m.state$);
    expect(state.tool).toBe("trendline");
    expect(state.selectedId).toBeNull();
    m.dispose();
  });

  it("addDrawing(sym, drawing) appends, selects it, and reverts tool to 'cursor'", async () => {
    const m = createEqDrawingsMachine();
    m.intents.setTool("trendline");
    const t1 = trendline("t1");
    m.intents.addDrawing("AAPL", t1);
    const state = await firstValueFrom(m.state$);
    expect(state.drawings.AAPL).toEqual([t1]);
    expect(state.selectedId).toBe("t1");
    expect(state.tool).toBe("cursor");
    m.dispose();
  });

  it("keeps each symbol's drawing list isolated from every other symbol", async () => {
    const m = createEqDrawingsMachine();
    const t1 = trendline("t1");
    const t2 = trendline("t2");
    m.intents.addDrawing("AAPL", t1);
    m.intents.addDrawing("TSLA", t2);
    const state = await firstValueFrom(m.state$);
    expect(state.drawings.AAPL).toEqual([t1]);
    expect(state.drawings.TSLA).toEqual([t2]);
    m.dispose();
  });

  it("selectDrawing(id) selects; selectDrawing(null) deselects", async () => {
    const m = createEqDrawingsMachine();
    m.intents.addDrawing("AAPL", trendline("t1"));
    m.intents.selectDrawing(null);
    let state = await firstValueFrom(m.state$);
    expect(state.selectedId).toBeNull();

    m.intents.selectDrawing("t1");
    state = await firstValueFrom(m.state$);
    expect(state.selectedId).toBe("t1");
    m.dispose();
  });

  it("deleteSelected(sym) removes the selected drawing from that symbol and clears the selection", async () => {
    const m = createEqDrawingsMachine();
    const t1 = trendline("t1");
    const t2 = trendline("t2");
    m.intents.addDrawing("AAPL", t1);
    m.intents.addDrawing("AAPL", t2);
    // t2 is now selected (the most recently added).
    m.intents.deleteSelected("AAPL");
    const state = await firstValueFrom(m.state$);
    expect(state.drawings.AAPL).toEqual([t1]);
    expect(state.selectedId).toBeNull();
    m.dispose();
  });

  it("deleteSelected(sym) is a no-op when selectedId is null", async () => {
    const m = createEqDrawingsMachine();
    const t1 = trendline("t1");
    m.intents.addDrawing("AAPL", t1);
    m.intents.selectDrawing(null);
    m.intents.deleteSelected("AAPL");
    const state = await firstValueFrom(m.state$);
    expect(state.drawings.AAPL).toEqual([t1]);
    expect(state.selectedId).toBeNull();
    m.dispose();
  });

  it("deleteSelected(sym) is a no-op when the selection belongs to no drawing of that symbol", async () => {
    const m = createEqDrawingsMachine();
    const t1 = trendline("t1");
    const t2 = trendline("t2");
    m.intents.addDrawing("AAPL", t1);
    m.intents.addDrawing("TSLA", t2);
    // t2 (TSLA) is selected; deleting against AAPL must not touch it.
    m.intents.deleteSelected("AAPL");
    const state = await firstValueFrom(m.state$);
    expect(state.drawings.AAPL).toEqual([t1]);
    expect(state.drawings.TSLA).toEqual([t2]);
    expect(state.selectedId).toBe("t2");
    m.dispose();
  });

  it("shiftAnchors(sym, by) shifts BOTH anchors of every trendline for that symbol only, leaving hlines and other symbols untouched", async () => {
    const m = createEqDrawingsMachine();
    const t1 = trendline("t1");
    const h1 = hline("h1", 150);
    const otherSymTrendline = trendline("t2");
    m.intents.addDrawing("AAPL", t1);
    m.intents.addDrawing("AAPL", h1);
    m.intents.addDrawing("TSLA", otherSymTrendline);

    m.intents.shiftAnchors("AAPL", 30);
    const state = await firstValueFrom(m.state$);

    expect(state.drawings.AAPL).toEqual([
      {
        ...t1,
        a: { ...t1.a, index: t1.a.index + 30 },
        b: { ...t1.b, index: t1.b.index + 30 },
      },
      h1,
    ]);
    expect(state.drawings.TSLA).toEqual([otherSymTrendline]);
    m.dispose();
  });

  it("dispose() completes without error; intents after dispose are inert", async () => {
    const m = createEqDrawingsMachine();
    m.intents.addDrawing("AAPL", trendline("t1"));

    let last = await firstValueFrom(m.state$);
    // Keep our own live subscription so the shared state stream doesn't drop
    // its accumulated value once dispose() tears down the machine's internal
    // warm subscription (the same refCount lesson EqWorkspaceMachine's doc
    // comment cites).
    const sub = m.state$.subscribe((s) => {
      last = s;
    });

    expect(() => {
      m.dispose();
    }).not.toThrow();

    const beforeIntents = last;

    expect(() => {
      m.intents.setTool("trendline");
      m.intents.addDrawing("TSLA", trendline("t2"));
      m.intents.selectDrawing(null);
      m.intents.deleteSelected("AAPL");
      m.intents.shiftAnchors("AAPL", 5);
    }).not.toThrow();

    expect(last).toEqual(beforeIntents);
    sub.unsubscribe();
  });
});

// A named tag (rather than an inline `{ kind: "trendline" }` literal) so
// `Extract<EqDrawing, ...>` never takes an inline object type argument — the
// repo's `no-restricted-syntax` bans that even inside a type alias (see
// JarvisMachine.ts's ConfirmRequestTag for the precedent).
interface TrendlineTag {
  readonly kind: "trendline";
}
type Trendline = Extract<EqDrawing, TrendlineTag>;

function trendline(id: string): Trendline {
  return {
    id,
    kind: "trendline",
    a: { index: 10, price: 100 },
    b: { index: 20, price: 110 },
  };
}

function hline(id: string, price: number): EqDrawing {
  return { id, kind: "hline", price };
}
