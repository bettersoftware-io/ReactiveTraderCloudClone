import { describe, expect, it } from "vitest";

import type { EqDrawingsState } from "@rtc/core-api";

import { createEqDrawingsMachine } from "#/machines/eqDrawings";

describe("createEqDrawingsMachine", () => {
  it("starts on the cursor with no drawings and no selection, warm — a set with zero subscribers is what a fresh subscription sees", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);

    machine.intents.setTool("trendline");
    expect(machine.state$.getValue()).toMatchObject({ tool: "trendline" });

    const seen: unknown[] = [];
    const sub = machine.state$.subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([
      { tool: "trendline", drawings: {}, selectedId: null },
    ]);
    sub.unsubscribe();
    machine.dispose();
  });

  // A late `getValue()` is not a witness here: after `dispose()` releases the
  // keep-warm, a COLD `getValue()` returns the construction-time default
  // whether or not the guarded intent actually ran — deleting the `!disposed`
  // check would leave that assertion green. Subscribing FIRST and keeping
  // the subscription alive (so the underlying store subscription survives
  // `warm.release()` at refCount > 0) means a write the guard failed to
  // block would reach `seen` — the array growing past its dispose-time
  // length is the only thing that actually proves the guard ran.
  it("an intent after dispose() is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);
    const seen: EqDrawingsState[] = [];
    const sub = machine.state$.subscribe((v) => {
      seen.push(v);
    });
    machine.dispose();

    machine.intents.setTool("hline");
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  it("lifetime.abort() disposes the machine — a later intent is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqDrawingsMachine(lifetime.signal);
    const seen: EqDrawingsState[] = [];
    const sub = machine.state$.subscribe((v) => {
      seen.push(v);
    });
    lifetime.abort();

    machine.intents.setTool("hline");
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });
});
