import type { CurrencyPair } from "../fx/currencyPair.js";

export interface ReferenceDataPort {
  getCurrencyPairs(): AsyncIterable<readonly CurrencyPair[]>;
}
