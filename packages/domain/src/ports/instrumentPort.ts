import type { Observable } from "rxjs";
import type { Instrument } from "../credit/instrument.js";

export interface InstrumentPort {
  getInstruments(): Observable<readonly Instrument[]>;
}
