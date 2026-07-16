import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type { DevtoolsEvent } from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

function createEvent(
  kind: string,
  extra: Record<string, unknown>,
  seq: number,
): DevtoolsEvent {
  return { kind, seq, ts: seq, ...extra } as unknown as DevtoolsEvent;
}

describe("InspectorStore registry caps", () => {
  it("evicts the oldest disposed machines beyond the cap", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    // Create + dispose 600 machines (cap is 500).
    for (let i = 0; i < 600; i++) {
      store.apply({
        kind: "batch",
        events: [
          createEvent(
            "machine:created",
            { machineId: `m${i}`, machineKind: "notional", args: [] },
            i,
          ),
        ],
      });
      store.apply({
        kind: "batch",
        events: [
          createEvent("machine:disposed", { machineId: `m${i}` }, 1000 + i),
        ],
      });
    }

    const machines = store.getSnapshot().machines;
    expect(machines.length).toBe(500);
    // Oldest (m0..m99) evicted; newest retained.
    expect(machines.some((m) => m.machineId === "m0")).toBe(false);
    expect(machines.some((m) => m.machineId === "m599")).toBe(true);
  });

  it("keeps live machines regardless of the disposed cap", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    store.apply({
      kind: "batch",
      events: [
        createEvent(
          "machine:created",
          { machineId: "live", machineKind: "notional", args: [] },
          0,
        ),
      ],
    });
    for (let i = 0; i < 600; i++) {
      store.apply({
        kind: "batch",
        events: [
          createEvent(
            "machine:created",
            { machineId: `d${i}`, machineKind: "notional", args: [] },
            i,
          ),
        ],
      });
      store.apply({
        kind: "batch",
        events: [
          createEvent("machine:disposed", { machineId: `d${i}` }, 1000 + i),
        ],
      });
    }

    expect(
      store.getSnapshot().machines.some((m) => m.machineId === "live"),
    ).toBe(true);
  });
});
