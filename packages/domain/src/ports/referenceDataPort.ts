import type { CurrencyPair } from "../fx/currency-pair.js";

export interface ReferenceDataPort {
  getCurrencyPairs(): AsyncIterable<readonly CurrencyPair[]>;
}
