import { describe, expect, it } from "vitest";

import { createEqDrawingsMachine } from "#/machines/eqDrawings";

describe("createEqDrawingsMachine", () => {
  it("starts on the cursor with no drawings and no selection, warm — a set with zero subscribers is what a fresh subscription sees", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);

    machine.intents.setTool("trendline");
    expect(machine.state$.getValue()).toMatchObject({ tool: "trendline" });

    const seen: unknown[] = [];
    machine.state$.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([
      { tool: "trendline", drawings: {}, selectedId: null },
    ]);
    machine.dispose();
  });

  it("an intent after dispose() is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);
    machine.dispose();

    const before = machine.state$.getValue();
    machine.intents.setTool("hline");
    expect(machine.state$.getValue()).toBe(before);
  });

  it("lifetime.abort() disposes the machine — a later intent is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);
    lifetime.abort();

    const before = machine.state$.getValue();
    machine.intents.setTool("hline");
    expect(machine.state$.getValue()).toBe(before);
  });
});
