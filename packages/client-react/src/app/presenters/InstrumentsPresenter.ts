import {
  type Instrument,
  type InstrumentPort,
  InstrumentsUseCase,
} from "@rtc/domain";
import { type Observable, shareReplay } from "rxjs";

export class InstrumentsPresenter {
  readonly list$: Observable<readonly Instrument[]>;
  constructor(instruments: InstrumentPort) {
    this.list$ = new InstrumentsUseCase(instruments)
      .execute()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
