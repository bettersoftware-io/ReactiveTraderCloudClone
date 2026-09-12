import type { Observable } from "rxjs";

import type { InstrumentsPresenter as InstrumentsPresenterApi } from "@rtc/core-api";
import {
  type Instrument,
  type InstrumentPort,
  InstrumentsUseCase,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class InstrumentsPresenter implements InstrumentsPresenterApi {
  readonly list$: Observable<readonly Instrument[]>;

  constructor(instruments: InstrumentPort) {
    this.list$ = new InstrumentsUseCase(instruments)
      .execute()
      .pipe(warmReplay());
  }
}
