import { describe, expect, it } from "vitest";

import { InspectorStore } from "../InspectorStore";
import type {
  DevtoolsEvent,
  SnapshotMachine,
  SnapshotStream,
} from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

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
    expect(
      machines.some((m) => {
        return m.machineId === "m0";
      }),
    ).toBe(false);
    expect(
      machines.some((m) => {
        return m.machineId === "m599";
      }),
    ).toBe(true);
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
      store.getSnapshot().machines.some((m) => {
        return m.machineId === "live";
      }),
    ).toBe(true);
  });

  it("caps machines/streams loaded from a snapshot that follows churn", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });

    // Churn a prior session's worth of streams + disposed machines directly
    // (not via snapshot) so the row caches are already populated the way a
    // long-running inspector session would be before a reconnect delivers a
    // fresh snapshot (each inspector re-attach / app-reload re-hello).
    for (let i = 0; i < 50; i++) {
      store.apply({
        kind: "batch",
        events: [
          createEvent("stream:registered", { streamId: `churn-s${i}` }, i),
        ],
      });
      store.apply({
        kind: "batch",
        events: [
          createEvent(
            "machine:created",
            { machineId: `churn-m${i}`, machineKind: "notional", args: [] },
            i,
          ),
        ],
      });
      store.apply({
        kind: "batch",
        events: [
          createEvent(
            "machine:disposed",
            { machineId: `churn-m${i}` },
            1000 + i,
          ),
        ],
      });
    }

    // The snapshot itself carries more streams (cap is 2000) and disposed
    // machines (cap is 500) than the caps allow — e.g. a busy app between
    // reconnects.
    const streams = createSnapshotStreams(2500);
    const machines = createSnapshotMachines(600);

    store.apply({ kind: "snapshot", streams, machines });

    const snapshot = store.getSnapshot();

    expect(snapshot.streams.length).toBe(2000);
    expect(snapshot.machines.length).toBe(500);
    // Oldest entries in the oversized snapshot are the ones evicted; newest
    // retained.
    expect(
      snapshot.streams.some((s) => {
        return s.streamId === "s0";
      }),
    ).toBe(false);
    expect(
      snapshot.streams.some((s) => {
        return s.streamId === "s2499";
      }),
    ).toBe(true);
    expect(
      snapshot.machines.some((m) => {
        return m.machineId === "m0";
      }),
    ).toBe(false);
    expect(
      snapshot.machines.some((m) => {
        return m.machineId === "m599";
      }),
    ).toBe(true);
  });
});

function createSnapshotStreams(count: number): SnapshotStream[] {
  const streams: SnapshotStream[] = [];

  for (let i = 0; i < count; i++) {
    streams.push({ streamId: `s${i}`, value: null });
  }

  return streams;
}

function createSnapshotMachines(count: number): SnapshotMachine[] {
  const machines: SnapshotMachine[] = [];

  for (let i = 0; i < count; i++) {
    machines.push({
      machineId: `m${i}`,
      machineKind: "notional",
      args: [],
      state: null,
      disposed: true,
      createdAt: i,
    });
  }

  return machines;
}

function createEvent(
  kind: string,
  extra: Record<string, unknown>,
  seq: number,
): DevtoolsEvent {
  return { kind, seq, ts: seq, ...extra } as unknown as DevtoolsEvent;
}
