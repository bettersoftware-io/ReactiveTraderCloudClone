import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type {
  AppToInspector,
  DevtoolsEvent,
  InspectorToApp,
  SnapshotMachine,
} from "../protocol";

describe("DevtoolsHub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is dormant until hello: no subscription on registered sources", () => {
    const { hub, sent, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("a.b$", source$);
    expect(source$.observed).toBe(false);
    source$.next(1); // no inspector — must cost nothing, buffer nothing
    expect(sent).toEqual([]);
    inbound$.next({ kind: "hello", v: 1 });
    expect(source$.observed).toBe(true);
    expect(sent[0]).toMatchObject({ kind: "welcome", appId: "test-app" });
    expect(sent[1]).toMatchObject({ kind: "snapshot" });
  });

  it("coalesces per-stream within a flush window and counts emissions", () => {
    const { hub, sent, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("prices.EURUSD", source$);
    inbound$.next({ kind: "hello", v: 1 });
    source$.next(1);
    source$.next(2);
    source$.next(3);
    vi.advanceTimersByTime(40); // past one 33ms flush
    const batch = findLastBatch(sent);
    expect(batch).toBeDefined();
    const ev = batchEvents(batch)?.[0];
    expect(ev).toMatchObject({
      kind: "stream:emission",
      streamId: "prices.EURUSD",
      value: 3,
      coalesced: 3,
    });
  });

  it("snapshot includes machines created while dormant, with warm state", () => {
    const { hub, sent, inbound$ } = harness();
    const state$ = new Subject<string>();
    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);
    inbound$.next({ kind: "hello", v: 1 });
    const snap = sent.find((m) => {
      return m.kind === "snapshot";
    });
    expect(snapshotMachines(snap)?.[0]).toMatchObject({
      machineId: id,
      machineKind: "tileExecution",
      disposed: false,
    });
  });

  it("goes dormant on bye and on heartbeat timeout", () => {
    const { hub, inbound$ } = harness();
    const source$ = new Subject<number>();
    hub.registerStream("s", source$);
    inbound$.next({ kind: "hello", v: 1 });
    expect(hub.live).toBe(true);
    inbound$.next({ kind: "bye" });
    expect(hub.live).toBe(false);
    expect(source$.observed).toBe(false);
    inbound$.next({ kind: "hello", v: 1 });
    vi.advanceTimersByTime(10_100); // no pings → timeout
    expect(hub.live).toBe(false);
  });

  it("intent and wire events are dropped while dormant, queued while live", () => {
    const { hub, sent, inbound$ } = harness();
    hub.wireOut("subscribe_prices", { symbol: "EURUSD" });
    expect(sent).toEqual([]);
    inbound$.next({ kind: "hello", v: 1 });
    hub.wireIn("price_tick", { mid: 1.1 });
    vi.advanceTimersByTime(40);
    const batch = findLastBatch(sent);
    expect(batchEvents(batch)?.[0]).toMatchObject({
      kind: "wire:in",
      msgType: "price_tick",
    });
  });
});

interface Harness {
  hub: DevtoolsHub;
  sent: AppToInspector[];
  inbound$: Subject<InspectorToApp>;
}

// Array.prototype.findLast requires an ES2023 lib target; this repo's tsconfig
// targets ES2022, so walk from the tail instead of relying on the newer method.
function findLastBatch(
  sent: readonly AppToInspector[],
): AppToInspector | undefined {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    if (sent[i]?.kind === "batch") {
      return sent[i];
    }
  }

  return undefined;
}

function batchEvents(
  msg: AppToInspector | undefined,
): readonly DevtoolsEvent[] | undefined {
  if (msg?.kind !== "batch") {
    return undefined;
  }

  return msg.events;
}

function snapshotMachines(
  msg: AppToInspector | undefined,
): readonly SnapshotMachine[] | undefined {
  if (msg?.kind !== "snapshot") {
    return undefined;
  }

  return msg.machines;
}

function harness(): Harness {
  const sent: AppToInspector[] = [];
  const inbound$ = new Subject<InspectorToApp>();
  const hub = new DevtoolsHub({ appId: "test-app" });
  hub.attachTransport({
    send: (m: AppToInspector): void => {
      sent.push(m);
    },
    inbound$,
    dispose: (): void => {},
  });
  return { hub, sent, inbound$ };
}
