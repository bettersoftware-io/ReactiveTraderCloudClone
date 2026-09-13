import type { Observable } from "rxjs";

import type { AnalyticsPresenter as AnalyticsPresenterApi } from "@rtc/core-api";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type PositionUpdates,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class AnalyticsPresenter implements AnalyticsPresenterApi {
  readonly position$: Observable<PositionUpdates>;

  constructor(analytics: AnalyticsPort) {
    this.position$ = new AnalyticsUseCase(analytics)
      .execute()
      .pipe(warmReplay());
  }
}
