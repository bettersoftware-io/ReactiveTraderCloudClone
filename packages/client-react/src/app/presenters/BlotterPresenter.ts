import { type BlotterPort, type Trade, TradeBlotterUseCase } from "@rtc/domain";
import { type Observable, shareReplay } from "rxjs";

export class BlotterPresenter {
  readonly trades$: Observable<readonly Trade[]>;
  constructor(blotter: BlotterPort) {
    this.trades$ = new TradeBlotterUseCase(blotter)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
