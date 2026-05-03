import type { PositionUpdates } from "../analytics/position.js";

export interface AnalyticsPort {
  getAnalytics(currency: string): AsyncIterable<PositionUpdates>;
}
