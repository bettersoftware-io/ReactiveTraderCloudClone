import { type Observable, shareReplay } from "rxjs";

import {
  type CurrencyPair,
  CurrencyPairsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

export class CurrencyPairsPresenter {
  readonly pairs$: Observable<readonly CurrencyPair[]>;

  constructor(referenceData: ReferenceDataPort) {
    this.pairs$ = new CurrencyPairsUseCase(referenceData)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
