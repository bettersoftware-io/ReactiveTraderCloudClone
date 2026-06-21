import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type PositionUpdates,
} from "@rtc/domain";
import { type Observable, shareReplay } from "rxjs";

export class AnalyticsPresenter {
  readonly position$: Observable<PositionUpdates>;
  constructor(analytics: AnalyticsPort) {
    this.position$ = new AnalyticsUseCase(analytics)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
