import { type Observable, of } from "rxjs";

import type { PositionUpdates } from "../analytics/position.js";
import { describeAnalyticsPortContract } from "../ports/__contracts__/AnalyticsPortContract.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";

// eslint-disable-next-line rtc/class-filename-match -- small local AnalyticsPort stub; file is named after the system under test
class SingleEntryAnalyticsStub implements AnalyticsPort {
  getAnalytics(_currency: string): Observable<PositionUpdates> {
    return of({
      currentPositions: [],
      history: [{ timestamp: new Date().toISOString(), usdPnl: 0 }],
    });
  }
}

describeAnalyticsPortContract("SingleEntryAnalyticsStub", () => {
  const port = new SingleEntryAnalyticsStub();
  return {
    port,
    driver: { emitAnalytics: async () => {} },
    teardown: () => {},
  };
});
