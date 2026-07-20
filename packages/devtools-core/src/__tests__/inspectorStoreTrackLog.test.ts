import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type { AppToInspector } from "../protocol";

describe("InspectorStore trackLog option", () => {
  it("keeps streams and machines identical but the log empty when trackLog is false", () => {
    const logged = new InspectorStore({ coalesce: false });
    const unlogged = new InspectorStore({ coalesce: false, trackLog: false });

    for (const msg of messages()) {
      logged.apply(msg);
      unlogged.apply(msg);
    }

    expect(unlogged.getSnapshot().streams).toEqual(
      logged.getSnapshot().streams,
    );
    expect(unlogged.getSnapshot().machines).toEqual(
      logged.getSnapshot().machines,
    );
    expect(logged.getSnapshot().log.length).toBeGreaterThan(0);
    expect(unlogged.getSnapshot().log).toEqual([]);
  });

  it("clone() propagates trackLog: false", () => {
    const unlogged = new InspectorStore({ coalesce: false, trackLog: false });

    for (const msg of messages()) {
      unlogged.apply(msg);
    }

    const copy = unlogged.clone();
    copy.apply(batch(9, "fx.price$", 42));

    expect(copy.getSnapshot().log).toEqual([]);
    expect(copy.getSnapshot().streams.length).toBeGreaterThan(0);
  });
});

function batch(seq: number, streamId: string, value: number): AppToInspector {
  return {
    kind: "batch",
    events: [
      {
        kind: "stream:emission",
        seq,
        ts: 1000 + seq,
        streamId,
        value,
        coalesced: 1,
      },
    ],
  };
}

function messages(): AppToInspector[] {
  return [
    { kind: "welcome", v: 2, appId: "test-app" },
    { kind: "snapshot", streams: [], machines: [] },
    batch(1, "fx.price$", 1),
    batch(2, "fx.price$", 2),
    {
      kind: "batch",
      events: [
        {
          kind: "machine:created",
          seq: 3,
          ts: 1003,
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
        },
        {
          kind: "machine:state",
          seq: 4,
          ts: 1004,
          machineId: "m1",
          state: "idle",
          coalesced: 1,
        },
      ],
    },
  ];
}
