import { firstValueFrom, from, lastValueFrom, type Observable, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import type { PositionUpdates } from "../analytics/position.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";
import { AnalyticsUseCase } from "./AnalyticsUseCase.js";

interface LastCurrencyRef {
  current: string | null;
}

interface StubAnalytics {
  port: AnalyticsPort;
  lastCurrency: LastCurrencyRef;
}

function stubAnalytics(updates: PositionUpdates[]): StubAnalytics {
  const lastCurrency = { current: null as string | null };
  const port: AnalyticsPort = {
    getAnalytics(currency: string): Observable<PositionUpdates> {
      lastCurrency.current = currency;
      return from(updates);
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

describe("AnalyticsUseCase", () => {
  it("calls the port with the default base currency 'USD'", async () => {
    const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
    const useCase = new AnalyticsUseCase(port);

    await firstValueFrom(useCase.execute());

    expect(lastCurrency.current).toBe("USD");
  });

  it("uses an explicit base currency when provided", async () => {
    const { port, lastCurrency } = stubAnalytics([buildUpdate()]);
    const useCase = new AnalyticsUseCase(port, "EUR");

    await firstValueFrom(useCase.execute());

    expect(lastCurrency.current).toBe("EUR");
  });

  it("emits every update from the port unchanged", async () => {
    const updates = [buildUpdate(), buildUpdate(), buildUpdate()];
    const { port } = stubAnalytics(updates);
    const useCase = new AnalyticsUseCase(port);

    const results = await lastValueFrom(useCase.execute().pipe(toArray()));

    expect(results).toHaveLength(3);
  });

  it("supports a single emission via of()", async () => {
    const update = buildUpdate();
    const port: AnalyticsPort = {
      getAnalytics: () => {
        return of(update);
      },
    };
    const useCase = new AnalyticsUseCase(port);

    const result = await firstValueFrom(useCase.execute());

    expect(result).toBe(update);
  });
});
