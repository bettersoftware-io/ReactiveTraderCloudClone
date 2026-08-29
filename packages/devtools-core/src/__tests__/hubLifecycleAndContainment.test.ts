import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import type { AppToInspector, InspectorToApp } from "../protocol";

// Two properties the rest of the suite assumes but never exercises:
//
//   1. DORMANCY IS REVERSIBLE. `hello` wakes the hub, `bye` puts it back to
//      sleep, and a second `hello` (a reloaded panel) must resend welcome +
//      snapshot rather than leaving the panel staring at a blank inspector.
//   2. EVERY PUBLIC ENTRY POINT CONTAINS ITS OWN FAILURE. The hub is called
//      from inside the app's hot paths; a throw escaping any of these would
//      take down the thing it is supposed to be observing.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DevtoolsHub — dormancy is reversible", () => {
  it("stops subscribing after bye, and resumes on a later hello", () => {
    const { hub, inbound$ } = harness();
    const source$ = new Subject<number>();

    hub.registerStream("prices$", source$);
    inbound$.next({ kind: "hello", v: 1 });

    expect(source$.observed).toBe(true);

    inbound$.next({ kind: "bye" });

    // Going dormant must actually release the source — otherwise "dormant
    // until an inspector attaches" is only true of the first attach.
    expect(source$.observed).toBe(false);

    inbound$.next({ kind: "hello", v: 1 });

    expect(source$.observed).toBe(true);
  });

  it("resends welcome and snapshot when an already-live panel re-hellos", () => {
    const { sent, inbound$ } = harness();

    inbound$.next({ kind: "hello", v: 1 });
    const afterFirst = sent.length;

    // A reloaded panel re-hellos on an already-live hub. Without the re-hello
    // branch it would receive nothing and render an empty inspector against a
    // running app.
    inbound$.next({ kind: "hello", v: 1 });

    expect(sent.slice(afterFirst)[0]).toMatchObject({ kind: "welcome" });
    expect(sent.slice(afterFirst)[1]).toMatchObject({ kind: "snapshot" });
  });

  it("ignores a duplicate registerStream for the same id", () => {
    const { hub, inbound$ } = harness();
    const first$ = new Subject<number>();
    const second$ = new Subject<number>();

    hub.registerStream("dupe$", first$);
    hub.registerStream("dupe$", second$);
    inbound$.next({ kind: "hello", v: 1 });

    // Second registration is dropped — re-registering would double-subscribe
    // and double-count emissions for one logical stream.
    expect(first$.observed).toBe(true);
    expect(second$.observed).toBe(false);
  });
});

describe("DevtoolsHub — failures stay inside the hub", () => {
  it("survives a transport that throws on inbound", () => {
    const { hub, inbound$ } = harness();

    // A malformed frame must not propagate out of the subscription.
    expect(() => {
      inbound$.next({ kind: "intent" } as unknown as InspectorToApp);
    }).not.toThrow();

    expect(hub).toBeDefined();
  });

  it("survives machineIntent and machineDisposed for an unknown machine", () => {
    const { hub, inbound$ } = harness();

    inbound$.next({ kind: "hello", v: 1 });

    expect(() => {
      hub.machineIntent("never-created", "submit", []);
    }).not.toThrow();

    expect(() => {
      hub.machineDisposed("never-created");
    }).not.toThrow();
  });

  it("ignores a repeated dispose for the same machine", () => {
    const { hub, inbound$ } = harness();
    const state$ = new Subject<unknown>();

    inbound$.next({ kind: "hello", v: 1 });
    const id = hub.machineCreated("orderTicket", ["AAPL"], state$, {});

    hub.machineDisposed(id);

    expect(() => {
      hub.machineDisposed(id);
    }).not.toThrow();
  });

  it("survives wireIn/wireOut carrying an unserialisable payload", () => {
    const { hub, inbound$ } = harness();
    const circular: Record<string, unknown> = {};

    circular.self = circular;
    inbound$.next({ kind: "hello", v: 1 });

    expect(() => {
      hub.wireIn("stream.price", circular);
      hub.wireOut("client.subscribe", circular);
    }).not.toThrow();
  });
});

describe("DevtoolsHub — disposed-machine retention", () => {
  const MAX_DISPOSED_RETAINED = 500;

  it("evicts the oldest disposed machines past the retention cap", () => {
    const { hub, sent, inbound$ } = harness();

    inbound$.next({ kind: "hello", v: 1 });

    // Create and dispose one past MAX_DISPOSED_RETAINED so the eviction path
    // actually runs. Without eviction a long session leaks one retained entry
    // per machine ever made.
    const ids: string[] = [];

    for (let i = 0; i < MAX_DISPOSED_RETAINED + 1; i++) {
      ids.push(hub.machineCreated(`m${i}`, [], new Subject<unknown>(), {}));
    }

    expect(() => {
      for (const id of ids) {
        hub.machineDisposed(id);
      }
    }).not.toThrow();

    // Force a fresh snapshot to see which machines the hub still retains.
    inbound$.next({ kind: "bye" });
    inbound$.next({ kind: "hello", v: 1 });

    const snap = sent[sent.length - 1];
    const retainedIds =
      snap?.kind === "snapshot"
        ? snap.machines.map((m) => {
            return m.machineId;
          })
        : [];

    const oldestId = ids[0];
    const secondOldestId = ids[1];

    if (oldestId === undefined || secondOldestId === undefined) {
      throw new Error("expected at least two machine ids");
    }

    // The very first disposed machine was evicted from the retention map...
    expect(retainedIds).not.toContain(oldestId);
    // ...but the cap keeps exactly MAX_DISPOSED_RETAINED of the rest.
    expect(retainedIds).toContain(secondOldestId);
    expect(retainedIds).toHaveLength(MAX_DISPOSED_RETAINED);
  });
});

interface Harness {
  hub: DevtoolsHub;
  sent: AppToInspector[];
  inbound$: Subject<InspectorToApp>;
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
