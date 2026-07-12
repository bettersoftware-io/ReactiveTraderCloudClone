import type { Observable } from "rxjs";

import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type PositionUpdates,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class AnalyticsPresenter {
  readonly position$: Observable<PositionUpdates>;

  constructor(analytics: AnalyticsPort) {
    this.position$ = new AnalyticsUseCase(analytics)
      .execute()
      .pipe(warmReplay());
  }
}
