import type { AnalyticsPort } from "../ports/analytics-port.js";
import type { PositionUpdates } from "../analytics/position.js";

const DEFAULT_BASE_CURRENCY = "USD";

export class AnalyticsUseCase {
  constructor(
    private readonly analytics: AnalyticsPort,
    private readonly baseCurrency: string = DEFAULT_BASE_CURRENCY,
  ) {}

  async *execute(): AsyncIterable<PositionUpdates> {
    yield* this.analytics.getAnalytics(this.baseCurrency);
  }
}
