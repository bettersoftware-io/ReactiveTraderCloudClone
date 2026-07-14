import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInMemoryDuplexPair, type Duplex } from "../channel";
import { DevtoolsHub } from "../DevtoolsHub";
import { InspectorClient } from "../InspectorClient";
import { InspectorStore } from "../InspectorStore";
import type {
  AppToInspector,
  DevtoolsEvent,
  InspectorToApp,
} from "../protocol";
import { PROTOCOL_VERSION } from "../protocol";

describe("InspectorStore", () => {
  it("populates streams+machines from snapshot; identity changes only on apply", () => {
    const store = new InspectorStore();
    const s0 = store.getSnapshot();
    expect(store.getSnapshot()).toBe(s0); // stable without an apply()

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    const s1 = store.getSnapshot();
    expect(s1).not.toBe(s0);
    expect(s1.connected).toBe(true);
    expect(s1.appId).toBe("app1");
    expect(s1.protocolMismatch).toBeNull();

    store.apply({
      kind: "snapshot",
      streams: [
        { streamId: "b", value: 2 },
        { streamId: "a", value: 1 },
      ],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
          state: null,
          disposed: false,
          createdAt: 100,
        },
      ],
    });
    const s2 = store.getSnapshot();
    expect(s2).not.toBe(s1);
    expect(store.getSnapshot()).toBe(s2); // stable until the next apply()

    expect(
      s2.streams.map((s) => {
        return s.streamId;
      }),
    ).toEqual(["a", "b"]); // sorted
    expect(s2.streams[1]).toMatchObject({
      streamId: "b",
      lastValue: 2,
      lastSeq: 0,
      totalEmissions: 0,
    });
    expect(s2.machines[0]).toMatchObject({
      machineId: "m1",
      machineKind: "tileExecution",
      disposed: false,
      transitions: 0,
    });
    expect(s2.machines[0]?.intents).toEqual([]);
  });

  it("welcome with a mismatched protocol version still applies later messages", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION + 1, appId: "app1" });
    expect(store.getSnapshot().protocolMismatch).toBe(PROTOCOL_VERSION + 1);

    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "a", value: null }],
      machines: [],
    });
    expect(store.getSnapshot().streams).toHaveLength(1);
    expect(store.getSnapshot().protocolMismatch).toBe(PROTOCOL_VERSION + 1);
  });

  it("batch stream:emission updates lastValue/lastSeq/totalEmissions (+= coalesced)", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    store.apply({
      kind: "snapshot",
      streams: [{ streamId: "prices.EURUSD", value: null }],
      machines: [],
    });

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "prices.EURUSD",
          value: 1.09,
          coalesced: 3,
          seq: 5,
          ts: 1000,
        },
      ],
    });

    let state = store.getSnapshot();
    expect(state.streams[0]).toMatchObject({
      streamId: "prices.EURUSD",
      lastValue: 1.09,
      lastSeq: 5,
      totalEmissions: 3,
    });

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "stream:emission",
          streamId: "prices.EURUSD",
          value: 1.1,
          coalesced: 2,
          seq: 6,
          ts: 1100,
        },
      ],
    });

    state = store.getSnapshot();
    expect(state.streams[0]).toMatchObject({
      streamId: "prices.EURUSD",
      lastValue: 1.1,
      lastSeq: 6,
      totalEmissions: 5,
    });
  });

  it("machine:intent appends to that machine's intents; machine:disposed flips the flag", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        {
          machineId: "m1",
          machineKind: "tileExecution",
          args: ["EURUSD"],
          state: null,
          disposed: false,
          createdAt: 10,
        },
      ],
    });

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:intent",
          machineId: "m1",
          name: "submit",
          args: [1],
          seq: 1,
          ts: 20,
        },
      ],
    });
    expect(store.getSnapshot().machines[0]?.intents).toEqual([
      { name: "submit", args: [1], ts: 20 },
    ]);

    store.apply({
      kind: "batch",
      events: [
        {
          kind: "machine:intent",
          machineId: "m1",
          name: "cancel",
          args: [],
          seq: 2,
          ts: 25,
        },
      ],
    });
    expect(store.getSnapshot().machines[0]?.intents).toEqual([
      { name: "submit", args: [1], ts: 20 },
      { name: "cancel", args: [], ts: 25 },
    ]);

    store.apply({
      kind: "batch",
      events: [{ kind: "machine:disposed", machineId: "m1", seq: 3, ts: 30 }],
    });
    expect(store.getSnapshot().machines[0]?.disposed).toBe(true);
  });

  it("caps the log at 5000 entries, dropping the oldest", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });

    const events: DevtoolsEvent[] = [];

    for (let i = 0; i < 5010; i += 1) {
      events.push({
        kind: "wire:in",
        msgType: "tick",
        payload: i,
        seq: i,
        ts: i,
      });
    }

    store.apply({ kind: "batch", events });

    const state = store.getSnapshot();
    expect(state.log).toHaveLength(5000);
    expect(state.log[0]?.seq).toBe(10); // the oldest 10 were dropped
    expect(state.log[4999]?.seq).toBe(5009);
  });

  it("bye sets connected to false", () => {
    const store = new InspectorStore();
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    expect(store.getSnapshot().connected).toBe(true);
    store.apply({ kind: "bye" });
    expect(store.getSnapshot().connected).toBe(false);
  });
});

describe("InspectorClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-sends hello every 2s until connected, then pings, then stops after dispose", () => {
    const { channel, sent, inbound$ } = fakeChannel();
    const store = new InspectorStore();
    const client = new InspectorClient(channel, store);

    client.start();
    expect(sent[0]).toEqual({ kind: "hello", v: PROTOCOL_VERSION });

    // Disconnected: each tick re-announces with hello (order-independent connect).
    vi.advanceTimersByTime(2000);
    expect(hellos(sent)).toBe(2); // initial hello + one tick
    vi.advanceTimersByTime(2000);
    expect(hellos(sent)).toBe(3);
    expect(pings(sent)).toBe(0);

    // App answers → connected → subsequent ticks become pings (the heartbeat).
    inbound$.next({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    vi.advanceTimersByTime(2000);
    expect(pings(sent)).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(pings(sent)).toBe(2);

    client.dispose();
    expect(sent.at(-1)).toEqual({ kind: "bye" });

    vi.advanceTimersByTime(4000);
    expect(pings(sent)).toBe(2); // timer cleared — no further pings
  });

  it("reverts to hello after a bye so it reconnects when the app returns", () => {
    const { channel, sent, inbound$ } = fakeChannel();
    const store = new InspectorStore();
    const client = new InspectorClient(channel, store);

    client.start();
    inbound$.next({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    vi.advanceTimersByTime(2000);
    expect(pings(sent)).toBe(1); // connected → ping

    inbound$.next({ kind: "bye" }); // app reloaded / went away
    expect(store.getSnapshot().connected).toBe(false);
    const hellosBefore = hellos(sent);
    vi.advanceTimersByTime(2000);
    expect(hellos(sent)).toBe(hellosBefore + 1); // re-announcing again
    expect(pings(sent)).toBe(1); // no new ping while disconnected
  });

  it("pipes inbound AppToInspector messages into the store", () => {
    const { channel, inbound$ } = fakeChannel();
    const store = new InspectorStore();
    const client = new InspectorClient(channel, store);

    client.start();
    inbound$.next({ kind: "welcome", v: PROTOCOL_VERSION, appId: "app1" });
    expect(store.getSnapshot().connected).toBe(true);
    expect(store.getSnapshot().appId).toBe("app1");
  });

  it("wires end-to-end: hub -> store via a real Duplex pair", () => {
    const [appSide, inspectorSide] = createInMemoryDuplexPair<
      AppToInspector,
      InspectorToApp
    >();
    const hub = new DevtoolsHub({ appId: "e2e" });
    hub.attachTransport(appSide);
    const source$ = new BehaviorSubject({ mid: 1.09 });
    hub.registerStream("priceStream.price$[EURUSD]", source$);

    const store = new InspectorStore();
    const client = new InspectorClient(inspectorSide, store);
    client.start();
    vi.advanceTimersByTime(40);

    const state = store.getSnapshot();
    expect(state.connected).toBe(true);
    expect(state.streams[0]).toMatchObject({
      streamId: "priceStream.price$[EURUSD]",
    });
  });
});

interface FakeChannel {
  channel: Duplex<InspectorToApp, AppToInspector>;
  sent: InspectorToApp[];
  inbound$: Subject<AppToInspector>;
}

function pings(sent: readonly InspectorToApp[]): number {
  return sent.filter((m) => {
    return m.kind === "ping";
  }).length;
}

function hellos(sent: readonly InspectorToApp[]): number {
  return sent.filter((m) => {
    return m.kind === "hello";
  }).length;
}

function fakeChannel(): FakeChannel {
  const sent: InspectorToApp[] = [];
  const inbound$ = new Subject<AppToInspector>();
  const channel: Duplex<InspectorToApp, AppToInspector> = {
    send: (m: InspectorToApp): void => {
      sent.push(m);
    },
    inbound$,
    dispose: (): void => {},
  };
  return { channel, sent, inbound$ };
}
