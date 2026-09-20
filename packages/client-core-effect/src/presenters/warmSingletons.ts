import type { AnalyticsPresenter, CurrencyPairsPresenter } from "@rtc/core-api";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  CurrencyPairsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** The currency-pair roster: a RETAINED mirror — the period that the first
 * subscriber opens is never ended by an unsubscribe, only by the host scope
 * (`app.dispose()`): the RxJS core's `warmReplay()`. Port called ONCE. */
export function createCurrencyPairsPresenter(
  host: EffectHost,
  referenceData: ReferenceDataPort,
): CurrencyPairsPresenter {
  const source = new CurrencyPairsUseCase(referenceData).execute();

  return { pairs$: mirrorPortAsIs(host, source, { retain: true }) };
}

/** The analytics position stream — the same retained-mirror shape. */
export function createAnalyticsPresenter(
  host: EffectHost,
  analytics: AnalyticsPort,
): AnalyticsPresenter {
  const source = new AnalyticsUseCase(analytics).execute();

  return { position$: mirrorPortAsIs(host, source, { retain: true }) };
}
