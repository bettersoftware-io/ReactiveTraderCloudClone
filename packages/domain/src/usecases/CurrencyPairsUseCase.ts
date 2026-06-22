import type { Observable } from "rxjs";

import type { CurrencyPair } from "../fx/currencyPair.js";
import type { ReferenceDataPort } from "../ports/referenceDataPort.js";

export class CurrencyPairsUseCase {
  constructor(private readonly referenceData: ReferenceDataPort) {}
  execute(): Observable<readonly CurrencyPair[]> {
    return this.referenceData.getCurrencyPairs();
  }
}
