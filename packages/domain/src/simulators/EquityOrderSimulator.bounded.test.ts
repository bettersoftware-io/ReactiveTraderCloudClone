import { lastValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaceOrderRequest } from "../ports/orderPort.js";
import { EquityOrderSimulator } from "./EquityOrderSimulator.js";

// S9 — the order book is a shared, process-lifetime store fed by every
// connection's orders. Bounded so a scripted client cannot grow it (and the
// snapshot every subscriber receives) without limit.

beforeEach(() => {
  return vi.useFakeTimers();
});

afterEach(() => {
  return vi.useRealTimers();
});

describe("EquityOrderSimulator — bounded book (S9)", () => {
  it("keeps at most maxOrders, evicting the oldest order", async () => {
    const sim = new EquityOrderSimulator({ maxOrders: 2 });

    for (const symbol of ["AAPL", "MSFT", "NVDA"]) {
      const placed = lastValueFrom(sim.place(createOrder(symbol)));
      await vi.advanceTimersByTimeAsync(FULL_LIFECYCLE_MS);
      await placed;
    }

    const book = await lastValueFrom(sim.orders());
    expect(
      book.map((o) => {
        return o.symbol;
      }),
    ).toEqual(["MSFT", "NVDA"]);
  });
});

function createOrder(symbol: string): PlaceOrderRequest {
  return { symbol, side: "buy", type: "market", qty: 10 };
}

const FULL_LIFECYCLE_MS = 2_000;
