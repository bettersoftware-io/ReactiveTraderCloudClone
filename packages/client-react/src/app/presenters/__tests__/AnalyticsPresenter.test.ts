import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AnalyticsPort, PositionUpdates } from "@rtc/domain";

import { AnalyticsPresenter } from "../AnalyticsPresenter";

describe("AnalyticsPresenter", () => {
  it("exposes analytics for the configured base currency", async () => {
    const updates: PositionUpdates = { currentPositions: [], history: [] };
    const port: AnalyticsPort = { getAnalytics: () => of(updates) };
    const presenter = new AnalyticsPresenter(port);
    expect(await firstValueFrom(presenter.position$)).toBe(updates);
  });
});
