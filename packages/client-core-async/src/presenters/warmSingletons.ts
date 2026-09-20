import type {
  AnalyticsPresenter,
  CurrencyPairsPresenter,
  DealersPresenter,
  InstrumentsPresenter,
} from "@rtc/core-api";
import {
  type AnalyticsPort,
  AnalyticsUseCase,
  CurrencyPairsUseCase,
  type DealerPort,
  DealersUseCase,
  type InstrumentPort,
  InstrumentsUseCase,
  type ReferenceDataPort,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** The currency-pair roster: replay-current and kept warm for the session —
 * the port is subscribed on the first subscriber and released only when
 * `lifetime` aborts (`app.dispose()`), the RxJS core's `warmReplay()`. The
 * port method is called ONCE, here. */
export function createCurrencyPairsPresenter(
  referenceData: ReferenceDataPort,
  lifetime: AbortSignal,
): CurrencyPairsPresenter {
  const source = new CurrencyPairsUseCase(referenceData).execute();

  return { pairs$: topicToStream(topicFromObservable(source, lifetime)) };
}

/** The analytics position stream — same warm-singleton shape. */
export function createAnalyticsPresenter(
  analytics: AnalyticsPort,
  lifetime: AbortSignal,
): AnalyticsPresenter {
  const source = new AnalyticsUseCase(analytics).execute();

  return { position$: topicToStream(topicFromObservable(source, lifetime)) };
}

/** The credit dealer roster — the same retained-singleton shape. */
export function createDealersPresenter(
  dealers: DealerPort,
  lifetime: AbortSignal,
): DealersPresenter {
  const source = new DealersUseCase(dealers).execute();

  return { list$: topicToStream(topicFromObservable(source, lifetime)) };
}

/** The credit instrument roster — the same retained-singleton shape. */
export function createInstrumentsPresenter(
  instruments: InstrumentPort,
  lifetime: AbortSignal,
): InstrumentsPresenter {
  const source = new InstrumentsUseCase(instruments).execute();

  return { list$: topicToStream(topicFromObservable(source, lifetime)) };
}
