import { type Observable } from "rxjs";
import type { AnalyticsPort } from "../ports/analyticsPort.js";
import type { PositionUpdates } from "../analytics/position.js";

const DEFAULT_BASE_CURRENCY = "USD";

export class AnalyticsUseCase {
  constructor(
    private readonly analytics: AnalyticsPort,
    private readonly baseCurrency: string = DEFAULT_BASE_CURRENCY,
  ) {}

  execute(): Observable<PositionUpdates> {
    return this.analytics.getAnalytics(this.baseCurrency);
  }
}
