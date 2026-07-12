import type { Observable } from "rxjs";

import {
  type Instrument,
  type InstrumentPort,
  InstrumentsUseCase,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class InstrumentsPresenter {
  readonly list$: Observable<readonly Instrument[]>;

  constructor(instruments: InstrumentPort) {
    this.list$ = new InstrumentsUseCase(instruments)
      .execute()
      .pipe(warmReplay());
  }
}
