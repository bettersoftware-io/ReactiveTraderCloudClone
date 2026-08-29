import type { Observable } from "rxjs";
import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type {
  AppToInspector,
  DevtoolsErrorEvent,
  DevtoolsEvent,
  InspectorToApp,
  MachineStateEvent,
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

  it("never lets a hostile source$ throw out of registerStream while live", () => {
    const { hub, inbound$ } = harness();
    inbound$.next({ kind: "hello", v: 1 });
    expect(() => {
      hub.registerStream("hostile", throwingObservable());
    }).not.toThrow();
  });

  it("machineCreated still returns a machineId when state$ throws on subscribe while live", () => {
    const { hub, inbound$ } = harness();
    inbound$.next({ kind: "hello", v: 1 });
    let id = "";
    expect(() => {
      id = hub.machineCreated(
        "tileExecution",
        ["EURUSD"],
        throwingObservable(),
      );
    }).not.toThrow();
    expect(id).toMatch(/^m\d+$/);
  });

  it("a ping received while live resets the heartbeat clock, keeping the hub live past the original timeout", () => {
    const { hub, inbound$ } = harness();
    inbound$.next({ kind: "hello", v: 1 });

    vi.advanceTimersByTime(9_000); // just under the 10s default timeout
    inbound$.next({ kind: "ping" }); // resets lastPingAt
    vi.advanceTimersByTime(9_000); // would have timed out at 10s without the ping

    expect(hub.live).toBe(true);

    vi.advanceTimersByTime(2_000); // now 11s since the ping — over the timeout
    expect(hub.live).toBe(false);
  });

  it("never lets goLive's bulk resubscribe throw out of attachTransport when a pre-registered stream is hostile", () => {
    const { hub, inbound$ } = harness();

    // Registered while dormant: goLive()'s own resubscribe loop (not
    // registerStream's guarded path) is what calls subscribe() here, and that
    // loop has no per-entry try/catch of its own — only the outer
    // attachTransport handler does. This proves the app-facing "doesn't
    // crash" contract only; it does NOT prove the outer catch's own
    // transport.inbound report is observable — the throw happens before
    // goLive reaches its last line (arming the flush timer), so the report
    // pushed by the catch is queued forever and never flushed. See the
    // dev-intent test below for a trigger where that report IS observable.
    hub.registerStream("hostile", throwingObservable());

    expect(() => {
      inbound$.next({ kind: "hello", v: 1 });
    }).not.toThrow();

    // isLive flips true before the resubscribe loop runs, so the hub is left
    // live even though the throw interrupted its own startup — proving the
    // outer catch, not a full recovery, is what kept the app safe.
    expect(hub.live).toBe(true);

    // The same throw also means the flush timer was never armed (it's the
    // last line of goLive, never reached). A subsequent bye must still go
    // dormant cleanly with no timer to clear — proving goDormant tolerates
    // this half-started state too.
    expect(() => {
      inbound$.next({ kind: "bye" });
    }).not.toThrow();
    expect(hub.live).toBe(false);
  });

  it("reports the error through transport.inbound instead of throwing when a dev-injected intent handler throws", () => {
    const sent: AppToInspector[] = [];
    const inbound$ = new Subject<InspectorToApp>();
    const hub = new DevtoolsHub({ appId: "test-app", dev: true });
    hub.attachTransport({
      send: (m: AppToInspector): void => {
        sent.push(m);
      },
      inbound$,
      dispose: (): void => {},
    });

    inbound$.next({ kind: "hello", v: 1 }); // live, flush timer armed

    function throwingIntent(): void {
      throw new Error("boom");
    }

    const machineId = hub.machineCreated(
      "tileExecution",
      ["EURUSD"],
      new Subject<string>(),
      { submit: throwingIntent },
    );

    // intent:invoke is dispatched from inside attachTransport's try block
    // (msg.kind === "intent:invoke"), so a throwing handler is caught by the
    // SAME outer catch as goLive's resubscribe — but here the hub is already
    // live with an armed flush timer, so the report the catch pushes is
    // actually flushed and reaches `sent`.
    expect(() => {
      inbound$.next({
        kind: "intent:invoke",
        machineId,
        name: "submit",
        args: [],
      });
    }).not.toThrow();

    vi.advanceTimersByTime(40);
    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({ context: "transport.inbound" });
  });

  it("does not resubscribe an already-disposed machine when the hub goes live", () => {
    const { hub, inbound$ } = harness();
    const deadState$ = new Subject<string>();
    const aliveState$ = new Subject<string>();

    const deadId = hub.machineCreated("dead", [], deadState$);
    hub.machineDisposed(deadId); // disposed while still dormant
    const aliveId = hub.machineCreated("alive", [], aliveState$);

    inbound$.next({ kind: "hello", v: 1 });

    expect(deadState$.observed).toBe(false);
    expect(aliveState$.observed).toBe(true);
    expect(aliveId).not.toBe(deadId);
  });

  it("releases a live machine's subscription when the hub goes dormant", () => {
    const { hub, inbound$ } = harness();
    const state$ = new Subject<string>();

    inbound$.next({ kind: "hello", v: 1 });
    hub.machineCreated("tileExecution", ["EURUSD"], state$);
    expect(state$.observed).toBe(true);

    inbound$.next({ kind: "bye" });

    expect(state$.observed).toBe(false);
  });

  it("dispose() on a hub that never went live is a safe no-op", () => {
    const { hub, sent } = harness();

    expect(() => {
      hub.dispose();
    }).not.toThrow();

    expect(hub.live).toBe(false);
    expect(sent).toEqual([]); // no "bye" was ever sent — the hub was never live
  });

  it("reports a stream error via transport instead of letting it propagate", () => {
    const { hub, inbound$, sent } = harness();
    const source$ = new Subject<number>();

    hub.registerStream("prices.EURUSD", source$);
    inbound$.next({ kind: "hello", v: 1 });

    source$.error(new Error("feed dropped"));
    vi.advanceTimersByTime(40);

    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({
      context: "stream:prices.EURUSD",
      message: expect.stringContaining("feed dropped"),
    });
  });

  it("reports a machine state error via transport instead of letting it propagate", () => {
    const { hub, inbound$, sent } = harness();
    const state$ = new Subject<string>();

    inbound$.next({ kind: "hello", v: 1 });
    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);

    state$.error(new Error("machine crashed"));
    vi.advanceTimersByTime(40);

    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({
      context: `machine:${id}`,
      message: expect.stringContaining("machine crashed"),
    });
  });

  it("coalesces machine state emissions within a flush window and counts them", () => {
    const { hub, inbound$, sent } = harness();
    const state$ = new Subject<string>();

    inbound$.next({ kind: "hello", v: 1 });
    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);

    state$.next("working");
    state$.next("filled");
    state$.next("settled");
    vi.advanceTimersByTime(40);

    const batch = findLastBatch(sent);
    const stateEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "machine:state";
    }) as MachineStateEvent | undefined;

    expect(stateEvent).toMatchObject({
      machineId: id,
      state: "settled",
      coalesced: 3,
    });
  });

  it("re-hello after a flush still reports the machine's last known state from before the flush cleared it", () => {
    const { hub, inbound$, sent } = harness();
    const state$ = new Subject<string>();

    inbound$.next({ kind: "hello", v: 1 });
    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);

    state$.next("working"); // sets pendingMachineStates AND lastState/hasState
    vi.advanceTimersByTime(40); // flush clears pendingMachineStates, hasState stays true

    inbound$.next({ kind: "hello", v: 1 }); // re-hello: resend welcome + snapshot

    const snap = lastOfKind(sent, "snapshot");

    expect(snapshotMachines(snap)?.[0]).toMatchObject({
      machineId: id,
      state: "working",
    });
  });

  it("the very first snapshot reflects a machine's synchronous replay value, not just its lastState", () => {
    const { hub, sent, inbound$ } = harness();
    // A BehaviorSubject replays its current value synchronously on subscribe
    // — goLive()'s own initial subscribe pass sees it as a pending emission
    // BEFORE sendWelcomeAndSnapshot runs in that same call, unlike lastState
    // (which is only set from a later, already-flushed emission).
    const state$ = new BehaviorSubject("idle");

    const id = hub.machineCreated("tileExecution", ["EURUSD"], state$);
    inbound$.next({ kind: "hello", v: 1 });

    const snap = lastOfKind(sent, "snapshot");

    expect(snapshotMachines(snap)?.[0]).toMatchObject({
      machineId: id,
      state: "idle",
    });
  });

  it("reports the error through transport.inbound when timestamping a machine intent fails", () => {
    const { hub, inbound$, sent } = harness();

    inbound$.next({ kind: "hello", v: 1 });

    const dateNowSpy = vi.spyOn(Date, "now").mockImplementationOnce(() => {
      throw new Error("clock unavailable");
    });

    expect(() => {
      hub.machineIntent("m1", "submit", []);
    }).not.toThrow();
    dateNowSpy.mockRestore();

    vi.advanceTimersByTime(40);
    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({ context: "machineIntent" });
  });

  it("reports the error through transport.inbound when timestamping a wire event fails", () => {
    const { hub, inbound$, sent } = harness();

    inbound$.next({ kind: "hello", v: 1 });

    const dateNowSpy = vi.spyOn(Date, "now").mockImplementationOnce(() => {
      throw new Error("clock unavailable");
    });

    expect(() => {
      hub.wireIn("price_tick", { mid: 1.1 });
    }).not.toThrow();
    dateNowSpy.mockRestore();

    vi.advanceTimersByTime(40);
    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({ context: "wire" });
  });

  it("reports the error through transport.inbound when a machine's own unsubscribe throws on dispose", () => {
    const { hub, inbound$, sent } = harness();

    inbound$.next({ kind: "hello", v: 1 });
    const id = hub.machineCreated(
      "tileExecution",
      ["EURUSD"],
      subscriptionThatThrowsOnUnsubscribe(),
    );

    expect(() => {
      hub.machineDisposed(id);
    }).not.toThrow();

    vi.advanceTimersByTime(40);
    const batch = findLastBatch(sent);
    const errorEvent = batchEvents(batch)?.find((ev) => {
      return ev.kind === "devtools:error";
    }) as DevtoolsErrorEvent | undefined;

    expect(errorEvent).toMatchObject({ context: "machineDisposed" });
  });

  // The ring buffer (`this.ring`) is currently a write-only bookkeeping
  // array — nothing in this package or its consumers ever reads it back, so
  // its eviction has no observable effect through any public surface today.
  // This only proves the eviction branch runs without disturbing the actual
  // outbound batches, which remain the one real observable contract.
  it("keeps flushing correct batches once accumulated ring history exceeds a small ringBufferSize", () => {
    const sent: AppToInspector[] = [];
    const inbound$ = new Subject<InspectorToApp>();
    const hub = new DevtoolsHub({ appId: "test-app", ringBufferSize: 2 });

    hub.attachTransport({
      send: (m: AppToInspector): void => {
        sent.push(m);
      },
      inbound$,
      dispose: (): void => {},
    });

    inbound$.next({ kind: "hello", v: 1 });

    for (let i = 0; i < 5; i += 1) {
      hub.wireIn(`tick-${i}`, i);
      vi.advanceTimersByTime(40); // one flush per tick, well past ringBufferSize=2
    }

    const batch = findLastBatch(sent);
    expect(batchEvents(batch)?.[0]).toMatchObject({
      kind: "wire:in",
      msgType: "tick-4",
    });
  });

  it("never lets a throwing transport.send escape into the app during hello or flush", () => {
    const inbound$ = new Subject<InspectorToApp>();
    const hub = new DevtoolsHub({ appId: "test-app" });

    hub.attachTransport({
      send: (): void => {
        throw new Error("transport is gone");
      },
      inbound$,
      dispose: (): void => {},
    });

    expect(() => {
      inbound$.next({ kind: "hello", v: 1 }); // welcome + snapshot sends
      hub.wireIn("price_tick", { mid: 1.1 });
      vi.advanceTimersByTime(40); // the batch send
    }).not.toThrow();

    expect(hub.live).toBe(true);
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

// Same ES2022-target reasoning as findLastBatch above — no Array#findLast.
function lastOfKind(
  sent: readonly AppToInspector[],
  kind: AppToInspector["kind"],
): AppToInspector | undefined {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    if (sent[i]?.kind === kind) {
      return sent[i];
    }
  }

  return undefined;
}

/** An Observable whose subscribe() throws synchronously — simulates a hostile
 * or buggy source$/state$ to prove the tap never lets that reach the app. */
function throwingObservable(): Observable<unknown> {
  return {
    subscribe: (): never => {
      throw new Error("boom");
    },
  } as unknown as Observable<unknown>;
}

/** An Observable whose subscribe() succeeds but hands back a subscription
 * whose unsubscribe() throws — simulates a hostile state$ that only fails
 * when the hub tears it down (machineDisposed), not when it attaches. */
function subscriptionThatThrowsOnUnsubscribe(): Observable<unknown> {
  return {
    subscribe: () => {
      return {
        unsubscribe: (): never => {
          throw new Error("boom on unsubscribe");
        },
      };
    },
  } as unknown as Observable<unknown>;
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
