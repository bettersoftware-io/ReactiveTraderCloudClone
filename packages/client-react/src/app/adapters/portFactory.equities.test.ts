import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSimulatorPorts } from "./portFactory";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSimulatorPorts — equities ports", () => {
  it("exposes marketData/orders/positions wired together", async () => {
    vi.useFakeTimers();
    const ports = createSimulatorPorts();
    expect(ports.marketData).toBeDefined();
    expect(ports.orders).toBeDefined();
    expect(ports.positions).toBeDefined();

    const watchlist = await firstValueFrom(ports.marketData.watchlist());
    expect(watchlist.length).toBeGreaterThan(0);

    const updates = lastValueFrom(
      ports.orders
        .place({ symbol: "AAPL", side: "buy", type: "market", qty: 100 })
        .pipe(toArray()),
    );
    await vi.advanceTimersByTimeAsync(2000);
    const lifecycle = await updates;
    expect(lifecycle[lifecycle.length - 1]?.status).toBe("filled");

    const positions = await firstValueFrom(ports.positions.positions());
    const aapl = positions.find((p) => {
      return p.symbol === "AAPL";
    });
    expect(aapl?.qty).toBe(100);
  });
});
