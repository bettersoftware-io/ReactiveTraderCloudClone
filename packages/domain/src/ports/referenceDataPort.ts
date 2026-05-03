import type { Observable } from "rxjs";
import type { CurrencyPair } from "../fx/currencyPair.js";

export interface ReferenceDataPort {
  getCurrencyPairs(): Observable<readonly CurrencyPair[]>;
}
