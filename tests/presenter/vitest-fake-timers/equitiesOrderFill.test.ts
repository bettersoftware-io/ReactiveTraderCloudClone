import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPresenterApp } from "../scenarios/_buildApp";

afterEach(() => {
  return vi.useRealTimers();
});

describe("equities order → fill (real simulator stack)", () => {
  it("placing a market buy fills and produces a position with matching P&L", async () => {
    vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });

    const { app } = buildPresenterApp();

    // Place via the orders presenter — same path the OrderTicketMachine uses.
    const lifecycle = lastValueFrom(
      app.presenters.ordersBlotter
        .place({ symbol: "AAPL", side: "buy", type: "market", qty: 100 })
        .pipe(toArray()),
    );

    // Walk the full new → working → partiallyFilled → filled lifecycle (FILL_MS=1500 < 2000).
    await vi.advanceTimersByTimeAsync(2000);
    const updates = await lifecycle;

    expect(
      updates.map((o) => {
        return o.status;
      }),
    ).toContain("filled");

    const positions = await firstValueFrom(app.presenters.positions.positions$);
    const aapl = positions.find((p) => {
      return p.symbol === "AAPL";
    });
    expect(aapl?.qty).toBe(100);
    expect(aapl?.unrealisedPnl).toBeCloseTo(
      aapl ? aapl.qty * (aapl.markPrice - aapl.avgPrice) : 0,
      6,
    );
  });
});
