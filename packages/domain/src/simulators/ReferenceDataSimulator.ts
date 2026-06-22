import { type Observable, of } from "rxjs";
import { delay } from "rxjs/operators";

import type { CurrencyPair } from "../fx/currencyPair.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";

const INITIAL_DELAY_MS = 1_000;

export class ReferenceDataSimulator implements ReferenceDataPort {
  getCurrencyPairs(): Observable<readonly CurrencyPair[]> {
    return of(KNOWN_CURRENCY_PAIRS).pipe(delay(INITIAL_DELAY_MS));
  }
}
