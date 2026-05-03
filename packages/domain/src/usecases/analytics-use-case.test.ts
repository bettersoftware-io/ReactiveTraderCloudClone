import { describe, it, expect } from "vitest";
import { AnalyticsUseCase } from "./analytics-use-case.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";
import type { PositionUpdates } from "../analytics/position.js";

function stubAnalytics(updates: PositionUpdates[]): { port: AnalyticsPort; lastCurrency: { current: string | null } } {
  const lastCurrency = { current: null as string | null };
  const port: AnalyticsPort = {
    async *getAnalytics(currency) {
      lastCurrency.current = currency;
      for (const u of updates) yield u;
    },
  };
  return { port, lastCurrency };
}

function buildUpdate(): PositionUpdates {
  return {
    currentPositions: [],
    history: [],
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("AnalyticsUseCase", () => {
  it("calls the port with the default base currency 'USD'", async () => {
    const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
    const useCase = new AnalyticsUseCase(port);

    await collect(useCase.execute());

    expect(lastCurrency.current).toBe("USD");
  });

  it("uses an explicit base currency when provided", async () => {
    const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
    const useCase = new AnalyticsUseCase(port, "EUR");

    await collect(useCase.execute());

    expect(lastCurrency.current).toBe("EUR");
  });

  it("yields every update from the port unchanged", async () => {
    const updates = [buildUpdate(), buildUpdate(), buildUpdate()];
    const { port } = stubAnalytics(updates);
    const useCase = new AnalyticsUseCase(port);

    const results = await collect(useCase.execute());

    expect(results).toHaveLength(3);
  });
});
