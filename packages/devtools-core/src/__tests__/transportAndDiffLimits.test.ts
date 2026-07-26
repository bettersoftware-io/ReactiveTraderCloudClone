import { describe, expect, it, vi } from "vitest";

import { createInMemoryDuplexPair } from "../channel";
import { diffSerialized } from "../diff";
import type { InspectorState } from "../InspectorStore";
import { projectSnapshot } from "../projectSnapshot";
import { WsRelayDuplex } from "../WsRelayDuplex";

// Caps, teardown and environment guards. Each is a bound that only shows up
// under conditions the happy-path suite never creates — a 5,000-key diff, a
// send after dispose, a runtime with no WebSocket.

describe("diffSerialized — bounds", () => {
  it("stops emitting entries at the cap instead of walking a huge object", () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};

    for (let i = 0; i < 500; i++) {
      before[`k${i}`] = i;
      after[`k${i}`] = i + 1;
    }

    // MAX_DIFF_ENTRIES is 200. Without the cap the panel would receive 500
    // entries per tick from a state tree that changes wholesale.
    expect(diffSerialized(before, after).length).toBeLessThanOrEqual(200);
  });

  it("reports array elements dropped off the end as removed", () => {
    const entries = diffSerialized([1, 2, 3], [1]);
    const removed = entries.filter((e) => {
      return e.kind === "removed";
    });

    expect(removed).toHaveLength(2);
  });
});

describe("createInMemoryDuplexPair — teardown", () => {
  it("drops sends made after dispose rather than delivering them", () => {
    const [a, b] = createInMemoryDuplexPair<string, string>();
    const received = vi.fn();

    b.inbound$.subscribe(received);
    a.send("before");

    expect(received).toHaveBeenCalledTimes(1);

    a.dispose();
    b.dispose();
    a.send("after");
    b.send("also after");

    // A duplex that keeps delivering post-dispose is a leak: the panel would
    // go on receiving frames from a session the app considers closed.
    expect(received).toHaveBeenCalledTimes(1);
  });
});

describe("projectSnapshot", () => {
  it("carries each stream's last value into the snapshot", () => {
    const state = {
      connected: true,
      dev: false,
      appId: "rtc",
      protocolMismatch: null,
      streams: [{ streamId: "prices", lastValue: { bid: 1 } }],
      machines: [
        {
          machineId: "m1",
          machineKind: "orderTicket",
          args: ["AAPL"],
          lastState: { status: "idle" },
        },
      ],
      log: [],
    } as unknown as InspectorState;

    const snapshot = projectSnapshot(state) as ProjectedSnapshot;

    // A recording must open from a complete state, so an empty streams
    // projection would produce a replay that starts blank.
    expect(snapshot.streams).toEqual([
      { streamId: "prices", value: { bid: 1 } },
    ]);
    expect(snapshot.machines).toHaveLength(1);
    expect(snapshot.machines[0]).toMatchObject({
      machineId: "m1",
      machineKind: "orderTicket",
    });
  });
});

describe("WsRelayDuplex — environment guard", () => {
  it("fails with a named error when the runtime has no WebSocket", () => {
    vi.stubGlobal("WebSocket", undefined);

    // RN and older embedders reach this. Without the guard the failure is a
    // bare `Ctor is not a constructor` from inside the transport.
    expect(() => {
      return new WsRelayDuplex("ws://localhost:8790", "app");
    }).toThrow(/no global WebSocket/);

    vi.unstubAllGlobals();
  });
});

interface ProjectedStream {
  streamId: string;
  value: unknown;
}

interface ProjectedMachine {
  machineId: string;
  machineKind: string;
}

interface ProjectedSnapshot {
  streams: readonly ProjectedStream[];
  machines: readonly ProjectedMachine[];
}
