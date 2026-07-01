import type { Observable } from "rxjs";

import { CurrencyPairsPresenter, createSimulatorPorts } from "@rtc/client-core";
import { type CurrencyPair, PreferencesSimulator } from "@rtc/domain";

/**
 * Phase 1 resolution proof: build the currency-pair stream entirely from the
 * framework-neutral core, off the in-memory simulator port. Renders identically
 * on RN and the web client — the whole point of the extraction.
 */
export function buildCurrencyPairsStream(): Observable<
  readonly CurrencyPair[]
> {
  const ports = createSimulatorPorts({
    preferences: new PreferencesSimulator(),
  });
  return new CurrencyPairsPresenter(ports.referenceData).pairs$;
}
