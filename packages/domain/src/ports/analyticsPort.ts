import type { Observable } from "rxjs";
import type { PositionUpdates } from "../analytics/position.js";

export interface AnalyticsPort {
  getAnalytics(currency: string): Observable<PositionUpdates>;
}
