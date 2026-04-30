import type { CurrencyPair } from "../fx/currency-pair.js";
import type { ReferenceDataPort } from "../ports/reference-data-port.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currency-pair.js";
import { delay } from "./delay.js";

const INITIAL_DELAY_MS = 1_000;

export class ReferenceDataSimulator implements ReferenceDataPort {
  async *getCurrencyPairs(): AsyncIterable<readonly CurrencyPair[]> {
    await delay(INITIAL_DELAY_MS);
    yield KNOWN_CURRENCY_PAIRS;
    // No incremental updates in mock mode — generator ends after initial snapshot
  }
}
