import type { Observable } from "rxjs";

import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";

export class InstrumentsUseCase {
  constructor(private readonly instruments: InstrumentPort) {}

  execute(): Observable<readonly Instrument[]> {
    return this.instruments.getInstruments();
  }
}
