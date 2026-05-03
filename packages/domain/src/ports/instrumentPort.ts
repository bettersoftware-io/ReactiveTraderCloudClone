import type { Instrument } from "../credit/instrument.js";

export interface InstrumentPort {
  subscribe(): AsyncIterable<readonly Instrument[]>;
}
