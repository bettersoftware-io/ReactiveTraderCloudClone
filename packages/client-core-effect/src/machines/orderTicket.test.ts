import { Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderTicketState } from "@rtc/core-api";
import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

import { createOrderTicketMachine } from "#/machines/orderTicket";

describe("orderTicket machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a failing place() lands on rejected, errors no subscriber, and reports nothing out of band", async () => {
    const lifecycle = new Subject<EquityOrder>();
    const m = createOrderTicketMachine({
      defaultSymbol: "AAPL",
      place: () => {
        return lifecycle;
      },
    });
    const seen: OrderTicketState[] = [];
    const errors: unknown[] = [];
    m.state$.subscribe({
      next: (state: OrderTicketState) => {
        seen.push(state);
      },
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    m.intents.setQty(1);
    m.intents.submit();
    await settle();
    expect(seen.at(-1)).toEqual({ phase: "submitting" });

    lifecycle.error(new Error("venue down"));
    // Caught inside the build: the slot has no failed build to rethrow on
    // a macrotask, which is where the old "stays submitting" reported it.
    await expect(vi.advanceTimersByTimeAsync(0)).resolves.toBeDefined();
    expect(seen.at(-1)).toEqual({ phase: "rejected", reason: "venue down" });
    expect(errors).toEqual([]);
    m.dispose();
  });

  it("a superseding submit RELEASES the first place() and the second's updates land", async () => {
    // What this pins is the RELEASE, not the run token. Once the first
    // lifecycle Observable has been torn down its Subject has no observers,
    // so a late `next` on it is swallowed by rxjs before `run.guarded` is
    // ever consulted — removing every `guarded` from the machine leaves
    // this case green. The token itself is witnessed directly in
    // `machines/runSlot.test.ts`, where a `Run`'s `write`/`guarded` are
    // driven after the slot has moved on; a machine-level witness is not
    // constructible, because the interrupt replaces the resumed effect
    // rather than letting the superseded body run one more step.
    const scripted = createScriptedPlace();
    const m = createOrderTicketMachine({
      defaultSymbol: "AAPL",
      place: scripted.place,
    });
    const seen: OrderTicketState[] = [];
    m.state$.subscribe((state: OrderTicketState) => {
      seen.push(state);
    });
    m.intents.setQty(1);
    m.intents.submit();
    await settle();
    expect(scripted.open()).toBe(1);
    const superseded = scripted.oldest();

    m.intents.setQty(2);
    m.intents.submit();
    await settle();
    // The first run was interrupted, so its port call is gone and only the
    // second is live — one open subscription, carrying the second request.
    expect(scripted.open()).toBe(1);
    expect(scripted.requests().at(-1)?.qty).toBe(2);
    expect(superseded?.observed).toBe(false);

    // The SECOND run's updates are the ones that land.
    scripted.oldest()?.next(createOrder("working"));
    await settle();
    expect(seen.at(-1)).toMatchObject({ phase: "working" });
    m.dispose();
  });

  it("dispose() closes the detached scope: the order in flight is withdrawn and a later submit places nothing", async () => {
    const scripted = createScriptedPlace();
    const m = createOrderTicketMachine({
      defaultSymbol: "AAPL",
      place: scripted.place,
    });
    m.state$.subscribe(() => {}).unsubscribe();
    m.intents.setQty(1);
    m.intents.submit();
    await settle();
    expect(scripted.open()).toBe(1);
    m.dispose();
    await settle();
    expect(scripted.open()).toBe(0);
    m.intents.submit();
    m.intents.setQty(9);
    await settle();
    expect(scripted.requests()).toHaveLength(1);
    // A fresh subscription is never left silent, whatever the value is.
    const fresh: OrderTicketState[] = [];
    m.state$.subscribe((state: OrderTicketState) => {
      fresh.push(state);
    });
    expect(fresh).toHaveLength(1);
  });
});

/** An `OrderPort.place` double whose open lifecycle subscriptions and
 * subscribed requests are both observable — the release witness for the run
 * slot's interrupt. */
interface ScriptedPlace {
  place: (req: PlaceOrderRequest) => Observable<EquityOrder>;
  requests: () => readonly PlaceOrderRequest[];
  open: () => number;
  oldest: () => Subject<EquityOrder> | undefined;
}

function createScriptedPlace(): ScriptedPlace {
  const live: Subject<EquityOrder>[] = [];
  const requests: PlaceOrderRequest[] = [];

  return {
    place: (req: PlaceOrderRequest) => {
      return new Observable<EquityOrder>((subscriber) => {
        requests.push(req);
        const lifecycle = new Subject<EquityOrder>();
        live.push(lifecycle);
        const inner = lifecycle.subscribe(subscriber);

        return () => {
          inner.unsubscribe();
          const at = live.indexOf(lifecycle);

          if (at >= 0) {
            live.splice(at, 1);
          }
        };
      });
    },
    requests: () => {
      return requests;
    },
    open: () => {
      return live.length;
    },
    oldest: () => {
      return live[0];
    },
  };
}

function createOrder(status: EquityOrder["status"]): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 1,
    status,
    filledQty: status === "filled" ? 1 : 0,
    createdAt: 0,
  };
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}
