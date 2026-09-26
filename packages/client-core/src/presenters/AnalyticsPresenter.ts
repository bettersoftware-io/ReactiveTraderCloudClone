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

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(analytics: AnalyticsPort, disposed$: Observable<unknown>) {
    this.position$ = new AnalyticsUseCase(analytics)
      .execute()
      .pipe(warmReplay(disposed$));
  }
}
