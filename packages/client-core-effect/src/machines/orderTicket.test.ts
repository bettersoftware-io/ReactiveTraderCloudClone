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

  it("a failing place() is reported out of band and leaves the ticket submitting", async () => {
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
    // A ref has no error channel: the cause is rethrown on a macrotask,
    // which the advance below surfaces (the `staleFlag` idiom).
    await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow("venue down");
    // The state stays where the failure found it, and no subscriber was
    // errored — the difference from the blotter's own `place()` stream.
    expect(seen.at(-1)).toEqual({ phase: "submitting" });
    expect(errors).toEqual([]);
    m.dispose();
  });

  it("a superseded run's port subscription is released and its late update ignored", async () => {
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
    // second is live.
    expect(scripted.open()).toBe(1);
    expect(scripted.requests().at(-1)?.qty).toBe(2);

    superseded?.next(createOrder("filled"));
    await settle();
    expect(seen.at(-1)).toEqual({ phase: "submitting" });
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
