import { type Observable, shareReplay } from "rxjs";
import {
  type PositionUpdates, AnalyticsUseCase, type AnalyticsPort,
} from "@rtc/domain";

export class AnalyticsPresenter {
  readonly position$: Observable<PositionUpdates>;
  constructor(analytics: AnalyticsPort) {
    this.position$ = new AnalyticsUseCase(analytics).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
