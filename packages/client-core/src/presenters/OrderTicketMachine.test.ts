import type { StateObservable } from "@rx-state/core";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EquityOrder } from "@rtc/domain";

import { createOrderTicketMachine } from "./OrderTicketMachine";

afterEach(() => {
  return vi.useRealTimers();
});

describe("OrderTicketMachine", () => {
  it("starts editing with the default symbol and no error", () => {
    const m = createOrderTicketMachine({
      place: () => {
        return new Subject<EquityOrder>();
      },
      defaultSymbol: "AAPL",
    });
    const s = peek(m.state$);
    expect(s.phase).toBe("editing");

    if (s.phase === "editing") {
      expect(s.form.symbol).toBe("AAPL");
      expect(s.form.side).toBe("buy");
      expect(s.error).toBeNull();
    }

    m.dispose();
  });

  it("rejects submit when qty <= 0 with a validation error", () => {
    const m = createOrderTicketMachine({
      place: () => {
        return new Subject<EquityOrder>();
      },
      defaultSymbol: "AAPL",
    });
    m.intents.setQty(0);
    m.intents.submit();
    const s = peek(m.state$);
    expect(s.phase).toBe("editing");
    if (s.phase === "editing") expect(s.error).toMatch(/quantity/i);
    m.dispose();
  });

  it("walks submitting → working → partiallyFilled → filled from the place() stream", () => {
    const place$ = new Subject<EquityOrder>();

    function order(
      status: EquityOrder["status"],
      filledQty: number,
    ): EquityOrder {
      return {
        id: "o1",
        symbol: "AAPL",
        side: "buy",
        type: "market",
        qty: 10,
        status,
        filledQty,
        createdAt: 0,
      };
    }

    const m = createOrderTicketMachine({
      place: () => {
        return place$;
      },
      defaultSymbol: "AAPL",
    });
    m.intents.setQty(10);
    m.intents.submit();
    expect(peek(m.state$).phase).toBe("submitting");
    place$.next(order("working", 0));
    expect(peek(m.state$).phase).toBe("working");
    place$.next(order("partiallyFilled", 5));
    expect(peek(m.state$).phase).toBe("partiallyFilled");
    place$.next(order("filled", 10));
    expect(peek(m.state$).phase).toBe("filled");
    m.dispose();
  });
});

/** Unwrap current value; throws if the machine is not warm (StatePromise). */
function peek<T>(obs: StateObservable<T>): T {
  const v = obs.getValue();
  if (v instanceof Promise) throw new Error("state$ not initialized");
  return v;
}
