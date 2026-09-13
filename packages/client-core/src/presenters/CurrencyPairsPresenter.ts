import type { Observable } from "rxjs";

import type { CurrencyPairsPresenter as CurrencyPairsPresenterApi } from "@rtc/core-api";
import {
  type CurrencyPair,
  CurrencyPairsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class CurrencyPairsPresenter implements CurrencyPairsPresenterApi {
  readonly pairs$: Observable<readonly CurrencyPair[]>;

  constructor(referenceData: ReferenceDataPort) {
    this.pairs$ = new CurrencyPairsUseCase(referenceData)
      .execute()
      .pipe(warmReplay());
  }
}
